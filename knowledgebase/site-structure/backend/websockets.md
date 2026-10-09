# Backend WebSockets

> Detailed reference for WebSocket servers in `backend/src/websockets/`.

## Servers

### Bridge Server — `/mt5-bridge`

Created by `createBridgeServer(server, onMessage, onConnect?, onClose?, allowedOrigin?)`.

**Purpose:** MT5 EA connects here to receive pending orders/commands from the backend.

**Connection flow:**
1. EA connects via WebSocket upgrade to `/mt5-bridge`
2. `onConnect(ws)` fires — backend adds WS to `store.mt5BridgeClients`
3. Backend broadcasts `{ type: "connection", isBridgeConnected: true }` to dashboards
4. Server sends ping every 15s to keep connection alive
5. On close/error, `onClose(ws)` fires — removes from set, broadcasts disconnect

**Message flow from backend to EA:**
- When a trade is opened: `{ action: "BUY"|"SELL", symbol, volume, sl, tp, ticket }`
- When a trade is closed: `{ action: "CLOSE_ALL", symbol, volume, sl: 0, tp: 0, ticket }`
- Pending commands stored in `store.pendingBridgeOrders` and `store.pendingEaCommand`

**EA receives commands via `/api/ea/tick` response:**
```json
{
  "pendingAction": "BUY" | "SELL" | "CLOSE_ALL" | "NONE",
  "pendingLot": 0.1,
  "pendingSL": 150,
  "pendingTP": 300
}
```

**Supported client messages:**
- `request_history` — requests candle history for a symbol

### Dashboard Server — `/ws/live`, `/ws`, `/live-feed`

Created by `createDashboardServer(server, sendInit, onMessage, onConnect?, onClose?, allowedOrigin?)`.

**Purpose:** Frontend/dashboard connects here for real-time state synchronization.

**Connection flow:**
1. Client connects via WebSocket upgrade to `/ws/live` (or `/ws`, `/live-feed`)
2. `onConnect(ws)` fires — backend adds WS to `store.webDashboardClients`
3. Server immediately sends init message: `{ type: "init", payload: <FullStatusPayload> }`
4. Server handles incoming messages via `onMessage(ws, rawMsg)`

**Message types from backend to client:**

| Type | Trigger | Payload |
|------|---------|---------|
| `init` | On connect | Full `FullStatusPayload` |
| `tick` | EA tick update | `symbol`, `activeSymbol`, `tick`, `currentPrice`, `connection`, `candles`, `stats`, `symbolStates` |
| `trades` | Trade open/close | `trades`, `stats` |
| `log` | New system log | `log` |
| `config` | Settings change | `config` |
| `connection` | Bridge connect/disconnect | `isBridgeConnected` |
| `webrequest_test` | WebRequest status change | `testState` |
| `ai_strategy` | AI strategy updated | `aiSynthesizedStrategy` |
| `pong` | Ping response | `clientTime`, `serverTime` |

**Message types from client to backend:**

| Type | Source | Description |
|------|---------|-------------|
| `ping` | Frontend | Latency measurement — responds with `pong` |
| `toggle_trade` | TradePanel | Toggles `tradeConfig.isActive` |
| `close_all` | TradePanel | Closes all OPEN positions |
| `reset_stats` | TradePanel | Clears trade history |
| `request_history` | Charts | Requests candle history for a symbol |

**`request_history` response:**
```json
{
  "type": "history_response",
  "payload": {
    "symbol": "Step Index",
    "candles": [...],
    "count": 1000,
    "from": null,
    "to": null
  }
}
```

## Reconnection

- Frontend auto-reconnects with 2500ms delay on close/error
- Backend does not reconnect; EA is expected to maintain persistent connection
- Bridge pings EA every 15s; if no response, connection is dropped

## Connection State Tracking

`backend/src/index.ts` maintains:
- `store.mt5BridgeClients: Set<WebSocket>` — all connected EA bridge clients
- `store.webDashboardClients: Set<WebSocket>` — all connected dashboard clients

Connection state changes are broadcast to dashboards via `broadcastToDashboards()`.
