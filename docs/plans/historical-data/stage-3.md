# Historical Data Plan — Stage 3: EA Historical Data Support

## Status: ✅ DONE — WebSocket handlers implemented in index.ts

## What Was Implemented

### 1. WebSocket `request_history` / `history_response` Handlers

**Bridge server (`/mt5-bridge`):**
- Handles `request_history` messages from EA
- Queries `scalarAiDb.getCandles(symbol, undefined, undefined, 1000)`
- Responds with `history_response` containing candles array

**Dashboard server (`/ws/live`, `/ws`, `/live-feed`):**
- Handles `request_history` messages from frontend
- Queries `scalarAiDb.getCandles(symbol, from, to, limit)`
- Responds with `history_response` containing candles array with `from`/`to` timestamps

### 2. EA Generator History Support

**File:** `backend/src/services/ea-generator.ts`
- Generated EA includes `SyncWithWebApp()` polling every 3 seconds
- EA receives pending commands via `/api/ea/tick` response
- Backend stores historical candles via `POST /api/update-market` (bulk) and `POST /api/market/bulk-candles`

### 3. Backend Routes for Historical Data

- `POST /api/update-market` — accepts bulk candles from EA
- `POST /api/market/bulk-candles` — explicit bulk candle ingestion endpoint
- `GET /api/market/candles` — queries `market_candles` table with symbol/from/to/limit
- `GET /api/market/observations` — queries `observations` table with filters

## What Remains

- EA does not push historical candles on connection (`PushHistoricalCandles` not in generated EA)
- Frontend does not automatically load historical candles on symbol change
- No `HistoryPanel.tsx` component for UI-based history browsing

## Critical Fragility Warnings

### EA GENERATOR CHANGES BREAK THE EA

1. **MQL5 code is generated, not edited directly**: The EA code in `backend/src/services/ea-generator.ts` is a template string. Any change affects ALL generated EA files.

2. **EA must be re-downloaded after generator changes**: Users must re-download the EA via `/api/ea/download` for changes to take effect.

3. **CopyRates limitations**: MT5's `CopyRates()` can only copy from the current chart's timeframe and symbol. Cross-symbol or cross-timeframe history requests require changing the chart context in the EA.

4. **WebRequest rate limiting**: Sending 1000 candles via individual WebRequest calls will be slow. Consider batching or using `CopyTicks` for bulk data.

## Verification

- [x] WebSocket `request_history` works on bridge server
- [x] WebSocket `request_history` works on dashboard server
- [x] Backend stores candles in `market_candles` table
- [x] `GET /api/market/candles` returns correct data
- [x] `GET /api/market/observations` returns correct data
- [x] `POST /api/market/bulk-candles` ingests bulk data
