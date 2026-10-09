# Historical Data Plan — Stage 4: Backend History Routes & WebSocket

## Status: ✅ DONE

## What Was Implemented

### 1. `GET /api/market/candles`

**File:** `backend/src/routes/market.ts:146`
- Queries `scalarAiDb.getCandles(symbol, from, to, limit)`
- Returns `{ symbol, candles, count, from, to }`
- Supports query params: `symbol`, `from`, `to`, `limit` (max 10000)

### 2. `GET /api/market/observations`

**File:** `backend/src/routes/market.ts:182`
- Queries `scalarAiDb.getObservations(symbol, from, to, limit)`
- Returns `{ symbol, observations, count }`
- Supports query params: `symbol`, `from`, `to`, `direction`, `minVelocity`, `limit`

### 3. `POST /api/market/bulk-candles`

**File:** `backend/src/routes/market.ts:68`
- Accepts bulk candle ingestion from EA
- Calls `ingestBulkCandles(symbol, candles, metadata)`
- Returns `{ status, count, symbol, message }`

### 4. WebSocket `request_history` / `history_response`

**Bridge server (`/mt5-bridge`):**
- Handles `request_history` from EA
- Responds with `history_response` containing up to 1000 candles

**Dashboard server (`/ws/live`):**
- Handles `request_history` from frontend
- Responds with `history_response` containing filtered candles with `from`/`to`

### 5. MCP Tools

- `get_market_candles` — exists in `mcp_server.ts:388`
- `get_market_observations` — exists in `mcp_server.ts:402`
- `backtest_strategy_with_history` — exists in `mcp_server.ts:431`

## What Remains

- Frontend does not automatically load historical candles on symbol change
- No `HistoryPanel.tsx` component for UI-based history browsing
- No date range picker or CSV export

## Critical Fragility Warnings

### NEW ROUTES MUST NOT BREAK EXISTING CONTRACTS

1. **New routes must not conflict with existing routes**: `/api/market/candles` and `/api/market/observations` must not shadow or conflict with existing `/api/market/history`.

2. **WebSocket message types must be added, not changed**: Adding `request_history` and `history_response` is safe. Renaming or removing existing message types (`tick`, `trades`, `init`, etc.) breaks the frontend.

3. **Frontend must be updated to handle new messages**: `frontend/src/hooks/useWebSocket.ts` must have new callback options for `request_history` and `history_response`. `frontend/src/App.tsx` must handle these messages.

4. **EA must understand new messages**: If you add WebSocket messages for the EA bridge (`/mt5-bridge`), update `backend/src/services/ea-generator.ts` to handle them.

## Verification

- [x] Routes return correct data
- [x] WebSocket history requests work
- [x] Data stored in `market_candles` table
- [ ] Frontend can request and display history (not implemented yet)
- [x] Existing routes still work
