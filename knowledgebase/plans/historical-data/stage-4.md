# Historical Data Plan — Stage 4: Backend History Routes & WebSocket

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
