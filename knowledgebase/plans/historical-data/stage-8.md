# Historical Data Plan — Stage 8: Frontend Chart & Historical Data Display

## Status: ⚠️ PARTIALLY IMPLEMENTED — Backend history support complete; frontend UI incomplete

## What Exists

### Backend History Infrastructure

- `GET /api/market/candles` — returns OHLC candles with symbol/from/to/limit
- `GET /api/market/observations` — returns AI observations with filters
- `POST /api/market/bulk-candles` — ingests bulk historical candles
- WebSocket `request_history`/`history_response` — implemented in `index.ts` for both bridge and dashboard servers
- `market_candles` table — stores minute-aligned candles with indefinite retention
- `ObservationsService` — stores and queries individual market observations

### Frontend Chart Components

**`frontend/src/components/charts/CandlestickChart/CandlestickChart.tsx`**:
- Renders SVG candlestick chart using lightweight-charts
- Expects `candles` prop with `{ time, open, high, low, close }` shape
- Time axis uses inline `new Date(candle.time)` formatting

**`frontend/src/hooks/useChartData.ts`**:
- Manages candle state
- Falls back to ticks if no candles available
- Does NOT load historical candles from API

**`frontend/src/hooks/useWebSocket.ts`**:
- Handles WebSocket messages: `init`, `tick`, `trades`, `config`, `connection`, `log`
- Does NOT handle `request_history` or `history_response` messages

## What's Missing

1. **No `HistoryPanel.tsx`** — no UI component for browsing historical data
2. **No date range picker** — no UI for selecting time ranges
3. **No CSV export** — no functionality to export data
4. **`useChartData` doesn't load historical candles** — only uses in-memory candles from WebSocket
5. **`useWebSocket` doesn't handle history messages** — `request_history`/`history_response` not wired
6. **No retention policy selector in frontend** — backend has `db-retention` endpoints but no UI

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
5. Add `HistoryPanel.tsx` component to `frontend/src/components/settings/`
6. Add date range picker and CSV export button
7. Add retention policy settings UI
8. Test with:
   - No historical data (empty database)
   - Partial historical data (some candles)
   - Full historical data + live data
   - Symbol switching with history
9. Verify chart renders correctly in all scenarios

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
