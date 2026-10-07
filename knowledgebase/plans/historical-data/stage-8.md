# Historical Data Plan — Stage 8: Frontend Chart & Historical Data Display

## Status: ❌ NOT DONE — Final integration phase

## Objective

Ensure the frontend chart can display historical candle data, load history on demand, and maintain backward compatibility with live data. This phase must NOT break the existing chart or site functionality.

## Current Frontend State

### Existing Chart Components

**`frontend/src/components/charts/CandlestickChart/CandlestickChart.tsx`**:
- Renders SVG candlestick chart
- Uses `lightweight-charts` for time axis
- Expects `candles` prop with `{ time, open, high, low, close }` shape
- Time axis uses inline `new Date(candle.time)` formatting
- **Does NOT handle historical data loading**
- **Does NOT handle WebSocket history messages**

**`frontend/src/hooks/useChartData.ts`**:
- Manages candle state
- Falls back to ticks if no candles available
- **Does NOT load historical candles from API**
- **Does NOT merge historical + live candles**

**`frontend/src/hooks/useWebSocket.ts`**:
- Handles WebSocket messages: `init`, `tick`, `trades`, `config`, `connection`, `log`
- **Does NOT handle `request_history` or `history_response` messages**

**`frontend/src/App.tsx`**:
- Initializes WebSocket on mount
- Passes candle data to `CandlestickChart`
- **Does NOT load historical data on startup**
- **Does NOT have UI for history requests**

## Required Changes

### 1. Update `useChartData.ts` for Historical Candle Loading

**Current behavior:**
- Uses candles from `AppState` (in-memory, max 200)
- Falls back to ticks if no candles

**Required behavior:**
- On mount, load historical candles from `/api/market/candles`
- Merge historical candles with live candles
- Deduplicate by timestamp
- Maintain max candle limit (e.g., 2000 candles in memory)

**Implementation:**
```typescript
export function useChartData(symbol: string, ws: WebSocket | null) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Load historical candles on symbol change
  useEffect(() => {
    if (!symbol) return;
    
    setLoading(true);
    fetch(`/api/market/candles?symbol=${encodeURIComponent(symbol)}&limit=1000`)
      .then(res => res.json())
      .then(data => {
        setCandles(data.candles || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load historical candles:", err);
        setLoading(false);
      });
  }, [symbol]);
  
  // Handle live candle updates from WebSocket
  useEffect(() => {
    if (!ws) return;
    
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data);
      
      if (msg.type === "tick" || msg.type === "init") {
        const newCandles = msg.payload.candles || [];
        setCandles(prev => mergeCandles(prev, newCandles).slice(-2000));
      }
      
      if (msg.type === "history_response") {
        const historicalCandles = msg.payload.candles || [];
        setCandles(prev => mergeCandles(prev, historicalCandles).slice(-2000));
      }
    };
    
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [ws]);
  
  return { candles, loading };
}
```

### 2. Update `CandlestickChart.tsx` for Historical Data

**Current behavior:**
- Renders candles directly from prop
- No loading state
- No empty state message

**Required behavior:**
- Show loading spinner while historical data loads
- Show empty state message if no candles available
- Maintain correct time axis with historical data
- **CRITICAL: Do NOT break existing live candle rendering**

**Implementation:**
```typescript
interface CandlestickChartProps {
  candles: Candle[];
  loading?: boolean;
  currentPrice?: number;
  symbol?: string;
}

export function CandlestickChart({ candles, loading, currentPrice, symbol }: CandlestickChartProps) {
  if (loading) {
    return <div className="chart-loading">Loading historical data...</div>;
  }
  
  if (!candles.length) {
    return <div className="chart-empty">No candle data available</div>;
  }
  
  // Existing rendering logic — DO NOT CHANGE
  return (
    <div className="chart-container">
      <LightweightCharts
        data={candles}
        // ... existing props
      />
    </div>
  );
}
```

### 3. Update `useWebSocket.ts` for History Messages

**Add message handlers:**
```typescript
interface UseWebSocketOptions {
  // ... existing options
  onHistoryResponse?: (data: { symbol: string; candles: Candle[]; count: number }) => void;
  onHistoryRequest?: (request: { symbol: string; from: number; to: number; limit: number }) => void;
}

export function useWebSocket(url: string, options: UseWebSocketOptions) {
  // ... existing code
  
  const handleMessage = (event: MessageEvent) => {
    const msg = JSON.parse(event.data);
    
    // ... existing handlers
    
    if (msg.type === "history_response") {
      options.onHistoryResponse?.(msg.payload);
    }
    
    if (msg.type === "request_history") {
      options.onHistoryRequest?.(msg.payload);
    }
  };
}
```

### 4. Add History Loading UI (Optional)

**Add to `App.tsx` or a new component:**

```typescript
function HistoryLoader({ symbol, onHistoryLoaded }: { symbol: string; onHistoryLoaded: () => void }) {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  
  const loadHistory = async () => {
    setLoading(true);
    const from = new Date();
    from.setDate(from.getDate() - days);
    
    try {
      const res = await fetch(`/api/market/candles?symbol=${symbol}&from=${from.toISOString()}&limit=5000`);
      const data = await res.json();
      
      // Send to chart via WebSocket
      ws.send(JSON.stringify({
        type: "history_response",
        payload: data
      }));
      
      onHistoryLoaded();
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="history-loader">
      <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
        <option value={1}>1 day</option>
        <option value={7}>7 days</option>
        <option value={30}>30 days</option>
      </select>
      <button onClick={loadHistory} disabled={loading}>
        {loading ? "Loading..." : "Load History"}
      </button>
    </div>
  );
}
```

## Critical Fragility Warnings

### DO NOT BREAK THE CHART OR SITE

1. **Backward compatibility is mandatory**: The chart must continue to work with live candle data from WebSocket `tick` messages. Historical data loading must be additive, not replacing existing functionality.

2. **Candle merging must be timestamp-based**: When merging historical and live candles, use `time` as the unique key. Duplicates must be overwritten by newer data.

3. **Candle limit must be enforced**: Memory usage grows with candle count. Limit to 2000 candles in memory, dropping oldest when exceeded.

4. **Time axis must remain consistent**: `lightweight-charts` expects consistent time format. Historical candles must use the same `time` format as live candles (epoch seconds UTC).

5. **Loading states must be graceful**: If historical data fails to load, the chart should still display live data. Show a warning, not an error.

6. **WebSocket message handlers must be additive**: Adding `history_response` handler must not break existing `tick`, `init`, `trades` handlers.

## Implementation Steps

1. Update `frontend/src/hooks/useChartData.ts` to load historical candles on mount
2. Update `frontend/src/hooks/useChartData.ts` to merge historical + live candles
3. Update `frontend/src/hooks/useWebSocket.ts` with `history_response` handler
4. Update `frontend/src/components/charts/CandlestickChart/CandlestickChart.tsx` with loading state
5. Add `HistoryLoader` component to `App.tsx`
6. Test with:
   - No historical data (empty database)
   - Partial historical data (some candles)
   - Full historical data + live data
   - Symbol switching with history
7. Verify chart renders correctly in all scenarios

## Verification

- [ ] Chart loads historical candles on mount
- [ ] Historical candles merge correctly with live candles
- [ ] No duplicate candles after merge
- [ ] Loading state shows while history loads
- [ ] Empty state shows if no candles available
- [ ] Chart continues to work if history load fails
- [ ] Symbol switching loads new symbol's history
- [ ] Memory usage stays bounded (max 2000 candles)
- [ ] Time axis displays correct timestamps
- [ ] Existing live data functionality unchanged
