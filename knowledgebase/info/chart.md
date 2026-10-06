# Chart History — MT5 Candlestick Fix & Current Issues

## 1. Original Problem

The chart was displaying as **"thin long lines with a thick short line inside it"** instead of proper MT5 M1 candlesticks.

**Root cause:** The backend was pushing every raw tick into the frontend's tick array, and the frontend was drawing each tick as its own candle. Since most ticks had `open === close === price`, every candle collapsed into a thin wick plus a tiny body.

## 2. How I Determined What MT5's Chart Should Look Like

You described the visual mismatch directly during a live session: *"it seems like for every tick, it has one thin long line and a thick short line within it, its not moving properly... it should be a proper candle-stick graph"* and referenced how it *"should behave the same way like the one in mt5"*.

From MT5, the expected behavior is:
- Each candle represents **one minute** of OHLC data (M1 timeframe)
- Candle body shows open-to-close range
- Wicks show high-to-low range
- Candle width is consistent
- Colors indicate direction (bullish/bearish)
- As time progresses, new candles appear on the right and older candles scroll left

## 3. Exact Code/File Changes Made

### Backend: `backend/src/services/market-ingestion.ts`

Added `aggregateTickIntoCandle()` to group raw ticks into 1-minute OHLC candles:

```typescript
export function aggregateTickIntoCandle(state: SymbolStateEntry, targetPrice: number): void {
  const now = Date.now();
  const currentBucket = Math.floor(now / 60000);
  const candles = state.candles || [];

  if (candles.length === 0) {
    state.candles = [{
      time: now,
      open: targetPrice,
      high: targetPrice,
      low: targetPrice,
      close: targetPrice,
      volume: null,
      direction: "flat",
      minuteBucket: currentBucket,
    }];
    return;
  }

  const lastCandle = candles[candles.length - 1];
  if (lastCandle.minuteBucket === currentBucket) {
    lastCandle.high = Math.max(lastCandle.high, targetPrice);
    lastCandle.low = Math.min(lastCandle.low, targetPrice);
    lastCandle.close = targetPrice;
  } else {
    candles.push({
      time: now,
      open: targetPrice,
      high: targetPrice,
      low: targetPrice,
      close: targetPrice,
      volume: null,
      direction: "flat",
      minuteBucket: currentBucket,
    });
    if (candles.length > 200) candles.shift();
  }
}
```

### Backend: `backend/src/index.ts` (later `backend/src/services/app-store.ts`)

Replaced global singletons with per-symbol state management:

```typescript
// Before (globals):
let tickHistory: Tick[] = [];
let currentPrice = 0;
let marketTelemetryData: any[] = [];
let eaConnection: EAConnectionDetails = { ... };

// After (per-symbol):
const symbolStates = createSymbolStates("Step Index");

export function getSymbolState(symbolStates: SymbolStates, symbol?: string): SymbolStateEntry {
  const targetSymbol = (symbol && symbol.trim()) || symbolStates.activeSymbol || "";
  if (!targetSymbol) {
    if (symbolStates.map.size > 0) {
      const first = symbolStates.map.keys().next().value;
      if (first) return symbolStates.map.get(first)!;
    }
    return createBlankSymbolState("");
  }
  if (!symbolStates.map.has(targetSymbol)) {
    symbolStates.map.set(targetSymbol, createBlankSymbolState(targetSymbol));
  }
  return symbolStates.map.get(targetSymbol)!;
}
```

Updated `updateMarket()` to use per-symbol state:

```typescript
function updateMarket(data: UpdateMarketPayload, clientIp?: string) {
  const result = updateMarketState(symbolStates, data);
  const state = result.symbol;
  const symbol = data.symbol || symbolStates.activeSymbol || "Step Index";

  // ... early return for duplicate ticks ...

  aggregateTickIntoCandle(getSymbolState(symbolStates, symbolStates.activeSymbol), targetPrice);

  // ... broadcast includes candles ...
  broadcastToDashboards({
    type: "tick",
    symbol,
    tick: state.ticks[state.ticks.length - 1],
    currentPrice: state.currentPrice,
    connection: state.connection,
    candles: state.candles.slice(-100),
    stats: getFullStatusPayload().stats,
  });
}
```

### Frontend: `frontend/src/hooks/useChartData.ts`

Updated to prefer candle data over raw ticks:

```typescript
export function useChartData(
  candles: CandleData[],
  history: Tick[],
  maxVisibleCandles: number = 80
): ChartData {
  return useMemo(() => {
    const candleData: CandleData[] =
      candles.length > 0
        ? candles
        : history.map((t) => ({
            time: t.time,
            open: t.open !== undefined ? t.open : t.price,
            high: t.high !== undefined ? t.high : t.price,
            low: t.low !== undefined ? t.low : t.price,
            close: t.close !== undefined ? t.close : t.price,
          }));

    const displayCandles = candleData.slice(-maxVisibleCandles);
    // ... min/max calculation ...
    return { candleData, displayCandles, minPrice, maxPrice, priceRange };
  }, [candles, history, maxVisibleCandles]);
}
```

### Frontend: `frontend/src/components/charts/CandlestickChart.tsx`

Enhanced rendering with MT5-style visuals:

```typescript
const candleWidth = 8;
const gap = 2;
const step = candleWidth + gap;
const maxCandles = Math.floor((width - 2 * padding) / step);
const visibleCandles = displayCandles.slice(-maxCandles);

{visibleCandles.map((candle, idx) => {
  const x = width - padding - (visibleCandles.length - 1 - idx) * step - candleWidth / 2;
  const y_high = padding + (1 - (highPrice - minPrice) / priceRange) * (height - 2 * padding);
  const y_low = padding + (1 - (lowPrice - minPrice) / priceRange) * (height - 2 * padding);
  const bodyY = Math.min(y_open, y_close);
  const bodyHeight = Math.max(1.5, Math.abs(y_open - y_close));

  // Wick
  <line x1={x} y1={y_high} x2={x} y2={y_low} stroke={strokeColor} strokeWidth="1" />
  // Body
  <rect x={x - candleWidth/2} y={bodyY} width={candleWidth} height={bodyHeight}
        fill={isBullish ? bullishColor : bearishColor} stroke={strokeColor} strokeWidth="1" />
})}
```

### Frontend: `frontend/src/components/dashboard/PriceChart.tsx`

Updated header to use dynamic `activeSymbol`:

```tsx
<span className="text-xs font-bold text-slate-200 flex items-center gap-2 font-mono">
  <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
  LIVE {activeSymbol || "SYMBOL"} STREAM (M1)
</span>
```

## 4. How It Was Verified

- Backend `npx tsc --noEmit` — passes clean
- Frontend `npx tsc --noEmit` — passes clean
- Frontend `vite build` — completes successfully (1674 modules transformed, no JSX errors)
- Dev server confirmed running and serving dashboard
- `/api/status` returns proper candle data with OHLC fields
- WebSocket `init` message includes `candles` array with OHLC data
- Chart renders proper candlesticks with bodies and wicks

## 5. Current Issue: Chart Stuck in One Position

### Symptoms
- Ticks and candlesticks appear stuck in one position instead of expanding/moving
- Chart does not scroll to show new candles
- Price movement is not reflected visually

### Root Cause Analysis

**Primary suspect: Early return in `backend/src/services/app-store.ts` `updateMarket()`**

```typescript
if (state.ticks.length > 0 && Math.abs(targetPrice - state.currentPrice) < 0.0001 && state.telemetry.length > 0) {
  const lastTel = state.telemetry[state.telemetry.length - 1];
  const newVelocity = data.velocity !== undefined ? Number(data.velocity) : lastTel.velocity;
  if (Math.abs(newVelocity - lastTel.velocity) < 0.00001 && data.buyLocked === lastTel.buyLocked && data.sellLocked === lastTel.sellLocked) {
    return;  // ❌ Broadcast skipped!
  }
}
```

**The problem:**
1. `updateMarketState()` is called FIRST, which already:
   - Creates/updates the tick record
   - Updates telemetry
   - Calls `aggregateTickIntoCandle()` → updates/creates candle
   - Updates connection fields

2. THEN the early return check happens. If price/velocity/locks haven't changed, the function returns **WITHOUT broadcasting**.

3. Result: Backend has updated candle data, but frontend never receives the update. Frontend's `candles` state becomes stale.

**Why this causes "stuck" behavior:**
- Backend candle array grows/updates internally
- Frontend `candles` state stays frozen at last broadcast value
- Chart renders from stale data → appears stuck

### Contributing Factors

1. **Redundant `aggregateTickIntoCandle` calls**
   - Called inside `updateMarketState()` AND again in `app-store.ts`'s `updateMarket()`
   - This is redundant but not the root cause

2. **Frontend fallback to tick-based candles**
   - In `useChartData.ts`: if `candles` is empty, falls back to mapping raw `history` ticks to candles
   - Each tick becomes a candle with `open === close === price` → thin line appearance
   - If backend stops broadcasting candles, frontend silently falls back to tick-based rendering

3. **Empty array truthiness in WebSocket handler**
   - Frontend checks `if (msg.candles)` before updating
   - Empty array `[]` is truthy in JS, so this is fine
   - But if backend sends `candles: undefined`, update is skipped

### Exact Files Involved

| File | Issue |
|------|-------|
| `backend/src/services/app-store.ts` | Early return prevents broadcast (line 164-170) |
| `backend/src/services/market-ingestion.ts` | `updateMarketState` updates candles before early return check |
| `frontend/src/hooks/useChartData.ts` | Falls back to tick-based candles if `candles` is empty |
| `frontend/src/components/charts/CandlestickChart.tsx` | Renders from `displayCandles` which comes from `candles` state |
| `frontend/src/App.tsx` | `onTick` handler only updates `candles` if `msg.candles` is truthy |

## 6. Recommended Fix

Move the broadcast BEFORE the early return, or remove the early return for candle updates:

```typescript
updateMarket(data: UpdateMarketPayload, clientIp?: string): void {
  const result = updateMarketState(this.symbolStates, { ...data, symbol });
  const state = result.symbol;

  // ... symbol switch logging ...

  const rawPrice = data.price !== undefined ? Number(data.price) : (data.close !== undefined ? Number(data.close) : state.currentPrice);
  if (!isFinite(rawPrice) || rawPrice <= 0) {
    return;
  }
  const targetPrice = rawPrice;

  // ALWAYS broadcast current state, even for "duplicate" ticks
  this.broadcastToDashboards({
    type: "tick",
    symbol,
    activeSymbol: this.activeSymbol,
    tick: state.ticks[state.ticks.length - 1],
    currentPrice: state.currentPrice,
    connection: state.connection,
    candles: state.candles.slice(-100),
    stats: this.getFullStatusPayload().stats,
    symbolStates: Array.from(this.symbolStates.map.entries()).map(([sKey, sState]) => ({
      symbol: sKey,
      connection: sState.connection,
      currentPrice: sState.currentPrice,
      tickCount: sState.ticks.length,
    })),
  });

  // Early return AFTER broadcast for duplicate ticks
  if (state.ticks.length > 0 && Math.abs(targetPrice - state.currentPrice) < 0.0001 && state.telemetry.length > 0) {
    const lastTel = state.telemetry[state.telemetry.length - 1];
    const newVelocity = data.velocity !== undefined ? Number(data.velocity) : lastTel.velocity;
    if (Math.abs(newVelocity - lastTel.velocity) < 0.00001 && data.buyLocked === lastTel.buyLocked && data.sellLocked === lastTel.sellLocked) {
      return;
    }
  }

  // ... rest of function (AI updates, etc) ...
}
```

## 7. Git History of Chart-Related Changes

| Commit | Change |
|--------|--------|
| `91f8e5e` | Initial tick persistence and EA integration |
| `6f2ed6f` | Created `CandlestickChart.tsx` with MT5-style rendering |
| `05e633d` | Extracted `AppStore` class, moved `updateMarket` into `app-store.ts` |
| `2eef91b` | Added multi-symbol support, `symbolStates` Map |
| `e8480b4` | Type safety improvements, extracted `AppShell` and `useElapsedTimer` |

## 8. What Could Cause the Chart to Change Again

1. **Modifying `updateMarket` early return logic** — any change to the duplicate-tick filter affects broadcast frequency
2. **Changing `aggregateTickIntoCandle`** — modifying minute bucket logic or candle limits affects chart data
3. **Frontend WebSocket handler changes** — modifying `onTick` in `App.tsx` or `useWebSocket.ts` affects how candles are received
4. **`useChartData` fallback behavior** — if `candles` becomes empty, fallback to tick-based rendering changes appearance
5. **EA route auth changes** — if EA endpoints gain auth requirements, ticks stop flowing entirely
6. **Git operations during compaction** — file changes can be lost/unstaged during interrupted sessions
