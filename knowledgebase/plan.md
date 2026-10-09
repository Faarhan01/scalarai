# Step Index EA — Kilo Integration Plan

## 1. Goal

Enable Kilo to observe, analyze, and control the locally running ScalarAI stack
with minimal friction and no mandatory infrastructure changes.

## 2. Current State

The project exposes a local HTTP API on `http://localhost:3000` and an MCP endpoint at `POST /mcp`.

### REST API

- `GET  /api/status` — full server state, trades, logs, config, connection info
- `GET  /api/ai-study-feed` — AI knowledge base, synthesized strategy, telemetry stream
- `GET  /api/health` — health check
- `GET  /api/strategies` — list strategies
- `GET  /api/strategies/:id` — get strategy by ID
- `POST /api/strategies` — create strategy
- `GET  /api/ea/download` — download generated MQ5 EA file
- `GET  /api/ea/generator-source` — download generated Node.js bridge source
- `GET  /api/ea/template` — download MT5 chart template
- `POST /api/ea/tick` — EA heartbeat / tick endpoint
- `POST /api/update-market` — live market telemetry stream
- `GET  /api/market/history` — market history
- `GET  /poll` — bridge polling for pending trades
- `GET  /get-pending-trades` — bridge polling alias
- `GET  /api/get-pending-trades` — bridge polling alias
- `POST /api/settings` — update strategy, lot size, TP/SL, trading mode, AI toggle
- `GET  /api/settings` — fetch current settings
- `POST /api/toggle-trade` — start/stop automated execution
- `POST /api/reset-stats` — clear trade history
- `POST /api/status/switch-symbol` — switch active symbol
- `POST /api/test-webrequest/trigger` — trigger WebRequest verification
- `GET  /api/test-webrequest/status` — check WebRequest verification status
- `POST /api/test-webrequest/report` — report WebRequest verification result
- `GET  /api/settings/db-retention` — get DB retention settings
- `POST /api/settings/db-retention` — update DB retention settings

### MCP Endpoint

- `POST /mcp` — MCP JSON-RPC 2.0 endpoint
  - Always requires `Authorization: Bearer <SCALARAI_MCP_API_KEY>`
  - Exposes tools for status, strategies, trades, logs, DB queries, settings, trading controls
  - Note: Unlike other routes, the MCP route requires auth even if `SCALARAI_MCP_API_KEY` is unset (it will reject requests with empty/missing key)

### WebSockets

- `WS /mt5-bridge` — MT5 bridge signaling
- `WS /ws/live` — dashboard live feed
- `WS /ws` — dashboard live feed alias
- `WS /live-feed` — dashboard live feed alias

## 3. Recommended Architecture

### 3.1 Direct REST API Interaction

Kilo interacts with the running server directly via HTTP:

- **Read state**: `GET http://localhost:3000/api/status`
- **Read AI feed**: `GET http://localhost:3000/api/ai-study-feed`
- **Modify config**: `POST /api/settings` with JSON body
- **Start/stop**: `POST /api/toggle-trade` with `{ "isActive": true/false }`
- **Reset stats**: `POST /api/reset-stats`
- **Switch symbol**: `POST /api/status/switch-symbol` with `{ "symbol": "Step Index" }`

### 3.2 MCP Interaction (optional)

If Kilo supports MCP, it can use the `/mcp` endpoint with Bearer token auth.

Tools available:
- `get_system_status`
- `get_ai_knowledge_base`
- `get_ai_strategy`
- `list_strategies`
- `create_strategy`
- `update_strategy`
- `delete_strategy`
- `activate_strategy`
- `backtest_strategy`
- `query_db`
- `update_trading_settings`
- `toggle_automated_trading`
- `get_trade_history`
- `get_system_logs`
- `place_validated_trade`
- `close_trade`
- `reset_stats`

### 3.3 WebSocket Monitoring (optional)

Connect to `ws://localhost:3000/ws/live` for real-time updates:
- `trades_update` — trade list changes
- `config` — config updates
- `connection` — connection state changes
- `webrequest_test` — WebRequest test status
- `ping`/`pong` — latency measurement

## 4. Implementation Steps

### Step 1 — Verify local server is running

```bash
curl http://localhost:3000/api/health
```

### Step 2 — Configure MCP key (if using MCP)

Set `SCALARAI_MCP_API_KEY` in `.env` and restart the server.

### Step 3 — Kilo read loop

Kilo can poll `/api/status` and `/api/ai-study-feed` on a short interval, or use WebSocket for push updates.

### Step 4 — Analysis and action

With the REST API and/or MCP, Kilo can:

- **Analyze**: read `/api/ai-study-feed` for knowledge base and strategy state
- **Improve strategy**: create/update strategies via `/api/strategies` or MCP
- **Modify settings**: `POST /api/settings` with new TP/SL/lot/mode
- **Control execution**: `POST /api/toggle-trade`
- **Review trades**: read trades array from `/api/status`
- **Audit logs**: read logs array from `/api/status`

## 5. Security Considerations

- All API calls are localhost-only by default
- The server binds to `0.0.0.0:3000`; if exposed externally, restrict access
- **MCP route (`POST /mcp`) always requires Bearer auth** — it rejects requests with empty/missing keys
- **Other routes use optional auth** — if `SCALARAI_MCP_API_KEY` is set, protected routes require `Authorization: Bearer <key>`; if unset, all non-MCP routes are open
- The EA generator and bridge do not use Bearer auth. They rely on the `/api/ea/tick` endpoint being accessible.
- GitHub OAuth tokens are no longer stored in `.env.example`
- The monitoring daemon writes to `%TEMP%`, which is user-writable only

## 6. Decision

**Use direct REST API calls for local monitoring and control.**
MCP is available for structured tool access if needed.
