# Chart History — MT5 Candlestick Fix & Current Implementation

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
    if (lastCandle.close > lastCandle.open) {
      lastCandle.direction = "up";
    } else if (lastCandle.close < lastCandle.open) {
      lastCandle.direction = "down";
    } else {
      lastCandle.direction = "flat";
    }
  } else {
    const openPrice = lastCandle.close;
    const direction = targetPrice > openPrice ? "up" : targetPrice < openPrice ? "down" : "flat";
    candles.push({
      time: now,
      open: openPrice,
      high: targetPrice,
      low: targetPrice,
      close: targetPrice,
      volume: null,
      direction,
      minuteBucket: currentBucket,
    });
    if (candles.length > 200) candles.shift();
  }
}
```

### Backend: `backend/src/services/app-store.ts`

Replaced global singletons with per-symbol state management and removed duplicate early return that prevented broadcast:

```typescript
updateMarket(data: UpdateMarketPayload, clientIp?: string): void {
  const symbol = (data.symbol && data.symbol.trim()) || this.activeSymbol || "Step Index";
  if (!this.activeSymbol || this.activeSymbol === "") {
    this.activeSymbol = symbol;
  }
  const result = updateMarketState(this.symbolStates, { ...data, symbol });
  const state = result.symbol;

  if (result.switched) {
    this.addLog("SERVER", "INFO", `Active market symbol updated to: ${this.symbolStates.activeSymbol}`);
  }

  const rawPrice = data.price !== undefined ? Number(data.price) : (data.close !== undefined ? Number(data.close) : state.currentPrice);
  if (!isFinite(rawPrice) || rawPrice <= 0) {
    return;
  }
  const targetPrice = rawPrice;

  const numVelocity = data.velocity !== undefined ? Number(data.velocity) : 0;
  if (!isFinite(numVelocity)) return;

  const isBuyLocked = data.buyLocked !== undefined ? Boolean(data.buyLocked) : false;
  const isSellLocked = data.sellLocked !== undefined ? Boolean(data.sellLocked) : false;
  this.latestBuyLockedFromEa = isBuyLocked;
  this.latestSellLockedFromEa = isSellLocked;

  const absVelocity = Math.abs(numVelocity);
  this.aiKnowledgeBase.totalObservations += 1;
  const obs = this.aiKnowledgeBase.totalObservations;
  this.aiKnowledgeBase.globalAverageSpeed = Number((((obs - 1) * this.aiKnowledgeBase.globalAverageSpeed + absVelocity) / obs).toFixed(4));
  if (absVelocity > this.aiKnowledgeBase.peakVelocityRegistered) {
    this.aiKnowledgeBase.peakVelocityRegistered = Number(absVelocity.toFixed(4));
  }
  if (obs % 25 === 0) {
    persistAiKnowledge(this.aiKnowledgeBase);
  }

  if (!state.connection.isEaConnected) {
    this.addLog("EA", "SUCCESS", `${symbol} MT5 Expert Advisor linked! Real-time velocity baseline metric: ${numVelocity.toFixed(4)} pt/s.`);
  }
  // ... broadcast with updated candles
}
```

### Frontend: `frontend/src/hooks/useChartData.ts`

Updated to prefer candle data over raw ticks and enforce minimum price range:

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
    let minPrice = displayCandles.length > 0 ? displayCandles[0].low : 0;
    let maxPrice = displayCandles.length > 0 ? displayCandles[0].high : 0;
    for (let i = 1; i < displayCandles.length; i++) {
      if (displayCandles[i].low < minPrice) minPrice = displayCandles[i].low;
      if (displayCandles[i].high > maxPrice) maxPrice = displayCandles[i].high;
    }
    let priceRange = maxPrice - minPrice || 1.0;
    const minRange = 1.5;
    if (priceRange < minRange) {
      const center = (maxPrice + minPrice) / 2;
      minPrice = center - minRange / 2;
      maxPrice = center + minRange / 2;
      priceRange = minRange;
    }
    const paddingPrice = priceRange * 0.05;
    minPrice -= paddingPrice;
    maxPrice += paddingPrice;

    return { candleData, displayCandles, minPrice, maxPrice, priceRange };
  }, [candles, history, maxVisibleCandles]);
}
```

### Frontend: `frontend/src/components/charts/CandlestickChart/`

Reorganized into a dedicated subfolder with standardized constants:

```
frontend/src/components/charts/CandlestickChart/
├── index.ts                      # barrel export
├── types.ts                      # CandlestickChartProps, PriceTick
├── constants.ts                  # all chart dimensions, colors, spacing
└── CandlestickChart.tsx          # actual component
```

Key visual improvements:
- Right-side price axis with 5 labeled ticks
- Time axis at bottom with HH:MM labels
- Grid lines for price levels
- Current price dashed line
- Standard green/red filled candles
- Thinner wicks (1px)
- Last-price tracker dot

### Backend: `backend/src/utils/time.ts`

Created centralized timestamp utility:

```typescript
export function toIso8601(date: Date): string
export function toEpochMs(date: Date): number
export function fromEpochMs(epochMs: number): Date
export function formatTime(epochMs: number): string
export function formatDateTime(epochMs: number): string
export function getMinuteBucket(epochMs: number): number
export function getHourBucket(epochMs: number): number
export function isSameMinute(a: number, b: number): boolean
export function timeAgo(epochMs: number): string
export function nowEpochMs(): number
export function nowIso8601(): string
```

## 4. How It Was Verified

- Backend `npx tsc --noEmit` — passes clean
- Frontend `npx tsc --noEmit` — passes clean
- Frontend `vite build` — completes successfully
- Dev server confirmed running and serving dashboard
- `/api/status` returns proper candle data with OHLC fields
- WebSocket `init` message includes `candles` array with OHLC data
- Chart renders proper candlesticks with bodies and wicks
- Candle direction now correctly shows `up`/`down`/`flat`

## 5. Current Implementation Status

### Completed
- ✅ Backend candle aggregation (`aggregateTickIntoCandle`)
- ✅ Per-symbol state management (`symbolStates`)
- ✅ Duplicate tick early return fixed (broadcast always happens)
- ✅ Frontend candle rendering with proper MT5-style visuals
- ✅ Time axis and price axis
- ✅ Centralized time utility (`backend/src/utils/time.ts`)
- ✅ Chart component standardized in dedicated subfolder

### Not Yet Implemented
See `knowledgebase/plans/historical-data/` for:
- Stage 2: Enhanced database schema (`market_candles`, `observations`, `backtest_results`, `strategy_templates`)
- Stage 3: EA historical data support (CopyRates lookback, CopyTicks)
- Stage 4: Backend history routes & WebSocket messages
- Stage 5: Observations service & AI insights
- Stage 6: Enhanced MCP tools for historical data
- Stage 7: Strategy creation & backtesting

## 6. Remaining Issues / Future Work

1. **Historical data from MT5** — EA cannot yet respond to history requests
2. **Observations storage** — AI observations not yet stored with timestamps in dedicated table
3. **Backtesting** — No backtest engine using historical data
4. **Strategy creation from observations** — No workflow to create strategies from AI patterns
5. **MCP historical tools** — No MCP tools to request MT5 history on demand

See `knowledgebase/plans/historical-data/` for detailed implementation stages.
