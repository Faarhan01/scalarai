# Backend Routes

> Detailed reference for all Express route modules in `backend/src/routes/`.

## Registration Pattern

All routes receive store methods/getters as callbacks from `backend/src/index.ts`:

```ts
registerEaRoutes(app, getStatus, getConfig, onTick, getPendingEaCommand, apiKey);
registerMarketRoutes(app, updateMarket, getConfig, apiKey);
registerStatusRoute(app, getStatus, switchSymbol, getPendingOrders, apiKey);
registerSettingsRoutes(app, updateSettings, getSettings, getWebRequestTest, triggerTest, reportTest, apiKey);
registerTradeRoutes(app, toggleTrade, resetStats, apiKey);
registerAiRoutes(app, getAiStudyData);
registerMcpRoute(app, store.buildMcpContext(), apiKey);
registerHealthRoutes(app);
registerStrategyRoutes(app);
```

If `apiKey` is unset/empty, middleware falls back to a no-op pass-through.

## Route Files

### `ai.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/ai-study-feed` | No | Returns AI knowledge base, synthesized strategy, candle stream, average velocity, calibration status |

Response shape: `AiStudyFeedPayload`

### `ea.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/ea/download` | No | Downloads generated `StepIndex_AI_Scalper_EA.mq5` file |
| GET | `/api/ea/generator-source` | No | Returns MQL5 source code as plain text |
| GET | `/api/ea/template` | No | Returns Step Index chart template `.tpl` |
| POST | `/api/ea/tick` | Optional | Receives EA tick data, account info, returns pending commands |

`POST /api/ea/tick` request body fields:
- `account` (string, required) — MT5 account login
- `symbol` (string, optional, default `Step Index`)
- `digits` (number, optional)
- `tickSize` (number, optional)
- `price` / `close` (number)
- `velocity` (number)
- `buyLocked` / `sellLocked` (boolean)
- `broker`, `balance`, `description`, `session`, `margin`, `leverage`, `swapLong`, `swapShort`, `profitCalcMode`

Response includes current config + `pendingAction`, `pendingLot`, `pendingSL`, `pendingTP`.

### `health.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Health check: status, timestamp, uptime, memory usage |

### `market.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/update-market` | Optional | Alternate tick endpoint used by EA broadcast |
| GET | `/api/market/history` | No | Tick history with optional `symbol`, `from`, `to`, `limit` query params (max 5000) |

`POST /api/update-market` validates price/symbol, calls `updateMarket()`, returns current config snapshot.

### `mcp.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/mcp` | **Required** | MCP JSON-RPC 2.0 handler |

Always requires Bearer auth regardless of `SCALARAI_MCP_API_KEY`. See `mcp.md` for tool list.

### `settings.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/settings` | No | Returns current trade config + `triggerWebRequestTest` flag |
| POST | `/api/settings` | Optional | Validates and updates trade config |
| POST | `/api/test-webrequest/trigger` | No | Triggers WebRequest verification probe |
| GET | `/api/test-webrequest/status` | No | Returns WebRequest test state + suggested URL |
| POST | `/api/test-webrequest/report` | No | EA reports WebRequest test result |
| GET | `/api/settings/db-retention` | No | Returns tick/log retention settings |
| POST | `/api/settings/db-retention` | No | Updates retention settings |

`POST /api/settings` validates:
- `selectedStrategy` — must be valid `StrategyMode`
- `tradingMode` — must be `Scalping` or `Swing`
- `lotSize` — positive number
- `takeProfitPoints`, `stopLossPoints`, `trailingStopPoints` — non-negative numbers
- `maxTrades` — positive integer
- `useTrailingStop`, `isAiModeEnabled` — booleans

### `status.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/status` | No | Full status payload: config, connection, trades, logs, stats, AI strategy, symbol states |
| POST | `/api/status/switch-symbol` | Optional | Switches active symbol |
| GET | `/poll` | No | Polling endpoint: returns and clears pending bridge orders |
| GET | `/get-pending-trades` | No | Same as `/poll` |
| GET | `/api/get-pending-trades` | No | Same as `/poll` |

`GET /api/status` returns `FullStatusPayload`.

### `strategies.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/strategies` | No | Lists built-in templates + custom strategies with performance |
| GET | `/api/strategies/:id` | No | Returns single strategy by template ID or custom ID |
| POST | `/api/strategies` | No | Creates strategy from template or custom definition |

`POST /api/strategies` accepts:
- `templateId` + optional `overrides` — creates from template via `createStrategyFromTemplate()`
- `name`, `mode`, `rules` — creates custom strategy

### `trades.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/toggle-trade` | Optional | Toggles trading active/inactive |
| POST | `/api/reset-stats` | Optional | Resets all trade history and stats |

## Fallback Route

`backend/src/index.ts` registers a catch-all for API routes:

```ts
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});
```
