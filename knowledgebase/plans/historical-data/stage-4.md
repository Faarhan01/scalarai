# Historical Data Plan — Stage 4: Backend History Routes & WebSocket

## Status: ❌ NOT DONE — Depends on stage 2 (schema)

## Objective

Add backend routes and WebSocket handlers for historical data queries and EA history requests.

## Current State

### Existing Routes (Partial)

**`backend/src/routes/market.ts`**:
- `POST /api/update-market` — ✅ exists, accepts tick/candle data
- `GET /api/market/history` — ✅ exists but has SQL bug (see below)

**`backend/src/websockets/bridge.ts`**:
- WebSocket server at `/mt5-bridge` — ✅ exists
- Handles ping/pong — ✅ exists
- **Missing:** history request/response handlers

## Required New Routes

### 1. `GET /api/market/candles`

Query OHLC candles from `market_candles` table.

**Query params:**
- `symbol` (required): Symbol name
- `from` (optional): Start timestamp (epoch ms or ISO 8601)
- `to` (optional): End timestamp (epoch ms or ISO 8601)
- `limit` (optional): Max candles to return (default 1000, max 10000)

**Response:**
```json
{
  "symbol": "Step Index",
  "candles": [
    {
      "time": 1727740800000,
      "open": 1234.56,
      "high": 1235.00,
      "low": 1234.00,
      "close": 1234.80,
      "volume": 1234,
      "direction": "up"
    }
  ],
  "count": 1000,
  "from": "2026-10-01T00:00:00Z",
  "to": "2026-10-07T00:00:00Z"
}
```

**Implementation:**
```typescript
export function registerMarketRoutes(app: Application, updateMarket: ..., apiKey?: string) {
  // ... existing routes ...
  
  app.get("/api/market/candles", (req: Request, res: Response) => {
    const symbol = req.query.symbol as string || "Step Index";
    const from = req.query.from ? new Date(req.query.from as string).getTime() : undefined;
    const to = req.query.to ? new Date(req.query.to as string).getTime() : undefined;
    const limit = Math.min(Number(req.query.limit) || 1000, 10000);
    
    const candles = scalarAiDb.getCandles(symbol, from, to, limit);
    res.json({ symbol, candles, count: candles.length, from, to });
  });
}
```

### 2. `GET /api/market/observations`

Query AI observations with filters.

**Query params:**
- `symbol` (optional): Symbol name
- `from` (optional): Start timestamp
- `to` (optional): End timestamp
- `direction` (optional): Filter by direction (`up`, `down`, `flat`)
- `minVelocity` (optional): Minimum velocity filter
- `limit` (optional): Max observations (default 500, max 5000)

**Response:**
```json
{
  "symbol": "Step Index",
  "observations": [
    {
      "id": "obs_123",
      "timestamp": 1727740800000,
      "direction": "up",
      "velocity": 0.45,
      "price": 1234.56,
      "tags": ["high_velocity", "morning_session"],
      "metadata": {}
    }
  ],
  "count": 500
}
```

### 3. `POST /api/ea/request-history`

Request historical data from EA (fallback if EA push fails).

**Request:**
```json
{
  "symbol": "Step Index",
  "timeframe": "M1",
  "count": 1000
}
```

**Implementation:**
- Store request in `pending_ea_commands` table or in-memory queue
- EA polls this endpoint via `SyncWithWebApp()`
- EA responds with `POST /api/update-market` containing historical data

## WebSocket Messages

### `request_history` (frontend → backend)

```json
{
  "type": "request_history",
  "payload": {
    "symbol": "Step Index",
    "from": 1727740800000,
    "to": 1727827200000,
    "limit": 5000
  }
}
```

**Handler:**
- Backend queries `market_candles` table
- Responds with `history_response` message

### `history_response` (backend → frontend)

```json
{
  "type": "history_response",
  "payload": {
    "symbol": "Step Index",
    "candles": [...],
    "count": 5000,
    "from": 1727740800000,
    "to": 1727827200000
  }
}
```

## Critical Bug Fix: `/api/market/history` SQL Bug

**Current buggy code:**
```sql
SELECT * FROM market_ticks WHERE time >= ? AND time <= ? AND (SELECT symbol FROM ea_connections WHERE id = 1) = ?
```

**Problem:** Compares against `ea_connections.symbol` instead of the requested symbol parameter.

**Fix:**
```sql
SELECT * FROM market_ticks WHERE symbol = ? AND time >= ? AND time <= ? ORDER BY time ASC
```

## Implementation Steps

1. Fix SQL bug in `backend/src/routes/market.ts:GET /api/market/history`
2. Add `GET /api/market/candles` route
3. Add `GET /api/market/observations` route
4. Add `POST /api/ea/request-history` route (optional, for EA pull)
5. Add WebSocket `request_history` / `history_response` handlers in `bridge.ts`
6. Add WebSocket `request_history` / `history_response` handlers in `dashboard.ts`
7. Update `frontend/src/hooks/useWebSocket.ts` with history message handlers
8. Verify with tests

## Critical Fragility Warnings

### NEW ROUTES MUST NOT BREAK EXISTING CONTRACTS

1. **New routes must not conflict with existing routes**: `/api/market/candles` and `/api/market/observations` must not shadow or conflict with existing `/api/market/history`.

2. **WebSocket message types must be added, not changed**: Adding `request_history` and `history_response` is safe. Renaming or removing existing message types (`tick`, `trades`, `init`, etc.) breaks the frontend.

3. **Frontend must be updated to handle new messages**: `frontend/src/hooks/useWebSocket.ts` must have new callback options for `request_history` and `history_response`. `frontend/src/App.tsx` must handle these messages.

4. **EA must understand new messages**: If you add WebSocket messages for the EA bridge (`/mt5-bridge`), update `backend/src/services/ea-generator.ts` to handle them.

## Verification

- [ ] Routes return correct data
- [ ] WebSocket history requests work
- [ ] Data stored in `market_candles` table
- [ ] Frontend can request and display history
- [ ] Existing routes still work
