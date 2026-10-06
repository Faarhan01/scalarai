# Historical Data Plan — Stage 4: Backend History Routes & WebSocket

## Status: ❌ NOT DONE

## Objective

Add backend routes and WebSocket messages for historical data requests.

## New Routes

### `POST /api/ea/request-history`
```json
{
  "symbol": "Step Index",
  "timeframe": "M1",
  "count": 1000,
  "type": "candles"
}
```

### `GET /api/market/candles`
```
Query params: symbol, from, to, limit
Returns: { symbol, candles: [], count, from, to }
```

### `GET /api/market/observations`
```
Query params: symbol, from, to, direction, minVelocity, limit
Returns: { symbol, observations: [], count }
```

## WebSocket Messages

### `request_history`
```json
{
  "type": "request_history",
  "payload": {
    "symbol": "Step Index",
    "timeframe": "M1",
    "count": 1000,
    "type": "candles"
  }
}
```

### `history_response`
```json
{
  "type": "history_response",
  "payload": {
    "symbol": "Step Index",
    "candles": [...],
    "count": 1000
  }
}
```

## Critical Fragility Warnings

### NEW ROUTES MUST NOT BREAK EXISTING CONTRACTS

1. **New routes must not conflict with existing routes**: `/api/market/candles` and `/api/market/observations` must not shadow or conflict with existing `/api/market/history`.

2. **WebSocket message types must be added, not changed**: Adding `request_history` and `history_response` is safe. Renaming or removing existing message types (`tick`, `trades`, `init`, etc.) breaks the frontend.

3. **Frontend must be updated to handle new messages**: `frontend/src/hooks/useWebSocket.ts` must have new callback options for `request_history` and `history_response`. `frontend/src/App.tsx` must handle these messages.

4. **EA must understand new messages**: If you add WebSocket messages for the EA bridge (`/mt5-bridge`), update `backend/src/services/ea-generator.ts` to handle them.

## Implementation Steps

1. Update `backend/src/routes/market.ts` with new routes
2. Update `backend/src/websockets/bridge.ts` with history message handlers
3. Update `backend/src/services/market-ingestion.ts` to store historical candles
4. Update `backend/src/db/repository.ts` with new query methods
5. Verify with tests and manual WebSocket testing

## Verification

- Routes return correct data
- WebSocket history requests work
- Data stored in `market_candles` table
- Frontend can request and display history
