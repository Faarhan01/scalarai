# Backend Site Structure

> Source of truth for `backend/src/`. Do not refactor based on `knowledgebase/plans/backend/stage-*.md` alone; this file reflects the actual committed code at HEAD.

## Tree

```
backend/src/
├── index.ts                       # Express bootstrap only (202 lines)
├── mcp_server.ts                  # MCP JSON-RPC 2.0 handler + tool registry
├── types/
│   └── index.ts                   # Shared backend interfaces/types
├── routes/
│   ├── ai.ts                      # GET /api/ai-study-feed
│   ├── ea.ts                      # GET /api/ea/download, /api/ea/generator-source, /api/ea/template
│   │                               # POST /api/ea/tick, POST /api/update-market
│   ├── health.ts                  # GET /api/health
│   ├── market.ts                  # POST /api/update-market (bulk candles), GET /api/market/history
│   ├── mcp.ts                     # POST /mcp, GET /mcp (server info)
│   ├── settings.ts                # GET/POST /api/settings, /api/test-webrequest/*
│   │                               # GET/POST /api/settings/db-retention
│   ├── status.ts                  # GET /api/status, POST /api/status/switch-symbol
│   │                               # GET /poll, GET /get-pending-trades, GET /api/get-pending-trades
│   ├── strategies.ts              # GET/POST /api/strategies, GET /api/strategies/:id
│   └── trades.ts                  # POST /api/toggle-trade, POST /api/reset-stats
├── websockets/
│   ├── bridge.ts                  # WS /mt5-bridge — onMessage, onConnect, onClose
│   └── dashboard.ts               # WS /ws/live, /ws, /live-feed — onMessage, onConnect, onClose
├── services/
│   ├── app-store.ts               # AppStore class — ALL state + business logic (720 lines)
│   ├── defaults.ts                # Factories: getDefaultTradeConfig, getDefaultAiKnowledgeBase, etc.
│   ├── ea-generator.ts            # generateMql5Code(), validateAppUrl() (internal)
│   ├── knowledge.ts               # updateKnowledgeBaseFromTelemetry(), formatKnowledgeBase()
│   ├── market-ingestion.ts        # SymbolStates, createSymbolStates, createBlankSymbolState,
│   │                               # getSymbolState, updateMarket, aggregateTickIntoCandle
│   ├── observations.ts            # ObservationsService — store, query, insights for market observations
│   ├── state-persistence.ts       # loadStateFromDb, persistTrade, persistLog, persistAiKnowledge, etc.
│   ├── strategy.ts                # evaluateStrategy, buildContext, StrategyContext, indicator math
│   ├── strategy-backtest.ts       # BacktestEngine, BacktestResult, BacktestTrade interfaces
│   ├── strategy-research.ts       # analyzeMarket, analyzeStrategyPerformance, suggestStrategyOptimizations
│   ├── strategy-templates.ts      # STRATEGY_TEMPLATES array, StrategyTemplate interface
│   ├── trade-execution.ts         # evaluateSimulatedStrategy, openSimulatedPosition, closeSimulatedPosition
│   │                               # AppCallbacks interface, TradeState interface
│   └── trading-machine.ts         # xstate machines: tradingMachine, bridgeMachine, calibrationMachine
├── middleware/
│   ├── auth.ts                    # requireApiKey(expectedApiKey?) — passes if empty/missing
│   ├── cors.ts                    # Reflects request Origin, credentials allowed
│   ├── error.ts                   # Centralized error handler
│   ├── logger.ts                  # HTTP request/response logging
│   └── rateLimit.ts               # In-memory sliding-window rate limiter (default 3600 req/min, exempts streaming paths)
├── utils/
│   ├── auth.ts                    # validateBearerToken() helper
│   ├── index.ts                   # Re-exports validators
│   ├── ip.ts                      # normalizeIp() — strips ::ffff: prefix
│   ├── time.ts                    # Date/time utilities: toIso8601, formatTime, timeAgo, parseTimestamp, parseLimit
│   ├── response.ts                # ApiResponse<T>, jsonSuccess(), jsonError() — NOT empty
│   └── validators.ts              # isValidStrategyMode, isValidTradingMode, isValidTradeType
└── db/
    ├── index.ts                   # openDb(), migrate(), exports scalarAiDb singleton
    ├── migrate.ts                 # Schema migration + seedDefaults + migrateJsonData
    ├── repository.ts              # ScalarAiDb — all SQL queries
    └── schema.sql                 # CREATE TABLE statements
```

## Key Facts

### `index.ts` — Thin Bootstrap (202 lines)

- Does NOT contain business logic
- Creates a single `AppStore` instance
- Loads state from DB via `store.loadFromDb()`
- Registers all routes, passing store methods/getters
- Creates Vite dev server or static file serving
- Creates WebSocket servers with connect/disconnect handlers
- Background intervals: analysis worker (5 min), DB cleanup (1 hour)

### `AppStore` class — `services/app-store.ts` (720 lines)

Single source of truth for all application state and mutations. Fields are `private`; access is via getters.

**State fields:**
- `tradeConfig`, `tradesList`, `systemLogs`, `aiKnowledgeBase`, `aiSynthesizedStrategy`
- `lastStrategySignal`, `symbolStates`, `activeSymbol`, `lastProcessedTelemetryIndex`
- `nextTicket: { value: number }`
- `latestBuyLockedFromEa`, `latestSellLockedFromEa`
- `pendingBridgeOrders: BridgeOrder[]`, `pendingEaCommand: { action, lot, sl, tp } | null`
- `mt5BridgeClients: Set<WebSocket>`, `webDashboardClients: Set<WebSocket>`
- `webRequestTest: { status, lastTested, error, details, triggerTest }`
- `tradingState`, `bridgeState`, `calibrationState` — xstate machines
- `observationsService: ObservationsService`

**Key getters:**
- `config: TradeConfig`
- `trades: readonly TradeRecord[]`
- `logs: readonly SystemLog[]`
- `getAiKnowledgeBase()`, `getAiSynthesizedStrategy()`, `getStrategySignal()`
- `getSymbolStates()`, `getActiveSymbol()`, `getNextTicket()`
- `getPendingBridgeOrders()`, `getMt5BridgeClients()`, `getWebDashboardClients()`
- `getWebRequestTest()`

**Key methods:**
- `loadFromDb()` — hydrates from SQLite
- `addLog()`, `broadcastToDashboards()`, `broadcastTradesUpdate()`
- `getFullStatusPayload(): FullStatusPayload`
- `getAndClearPendingOrders()`, `getPendingEaCommand()`
- `updateMarket(data: UpdateMarketPayload, clientIp?)` — core tick processing
- `ingestBulkCandles(symbol, candles, metadata?)` — bulk candle ingestion
- `buildTradeState(): TradeState` — snapshot for trade execution
- `buildMcpContext(): McpContext` — context for MCP tools
- `runBackgroundAnalysisWorker()` — processes telemetry, updates AI knowledge
- `updateSettings(params)`, `toggleTrading(isActive)`, `placeTrade()`, `closeTrade()`, `resetStats()`
- `switchSymbol(symbol)` — switches active symbol, loads candles from DB
- `updateWebRequestTest(update)` — partial update of WebRequest test state
- `sendTradingEvent(event)`, `sendBridgeEvent(event)`, `sendCalibrationEvent(event)` — xstate transitions
- `getTradingState()`, `getBridgeState()`, `getCalibrationState()` — xstate snapshots
- `addBridgeClient(ws)`, `removeBridgeClient(ws)`, `addDashboardClient(ws)`, `removeDashboardClient(ws)`
- `loadAiSynthesizedStrategy()`, `loadAiKnowledgeBase()`
- `analyzeMarket(): Promise<string>` — stub for MCP type requirement

### Route Registration Pattern

```ts
// index.ts
registerEaRoutes(app, store.getFullStatusPayload.bind(store), () => store.config, store.updateMarket.bind(store), store.getPendingEaCommand.bind(store));
registerMarketRoutes(app, store.updateMarket.bind(store), () => store.config, store.ingestBulkCandles.bind(store), () => store.getActiveSymbol());
registerSettingsRoutes(app, (params) => store.updateSettings(params), () => store.config, () => store.getWebRequestTest(), ...);
registerTradeRoutes(app, (isActive: boolean) => store.toggleTrading(isActive), () => store.resetStats(), process.env.SCALARAI_MCP_API_KEY);
registerMcpRoute(app, store.buildMcpContext(), process.env.SCALARAI_MCP_API_KEY);
registerStatusRoute(app, store.getFullStatusPayload.bind(store), (symbol) => { store.switchSymbol(symbol); }, store.getAndClearPendingOrders.bind(store), process.env.SCALARAI_MCP_API_KEY);
```

Note: `process.env.SCALARAI_MCP_API_KEY` is passed directly. If unset/empty, `requireApiKey()` in `middleware/auth.ts` passes all requests through.

### WebSocket Connect/Disconnect

```ts
// bridge.ts signature
createBridgeServer(server, onMessage, onConnect?, onClose?, allowedOrigin?)

// dashboard.ts signature
createDashboardServer(server, sendInit, onMessage, onConnect?, onClose?, allowedOrigin?)
```

`index.ts` uses `onConnect`/`onClose` to maintain `store.mt5BridgeClients` and `store.webDashboardClients` sets and broadcast connection state changes.

Both servers now support `request_history` messages from clients.

### Auth Behavior

`middleware/auth.ts`:
- If `apiKey` is `undefined` or empty string → passes through (no auth)
- If `apiKey` is set → requires `Authorization: Bearer <key>`

This means in development without `SCALARAI_MCP_API_KEY`, all protected routes are open.

`mcp_server.ts` has its own auth check — it always requires a valid Bearer token regardless of `expectedApiKey`.

### Important: Do NOT Delete or Rename

- `backend/src/services/app-state.ts` — already deleted; do not recreate
- `backend/src/utils/response.ts` — NOT empty; contains `ApiResponse<T>`, `jsonSuccess()`, `jsonError()`
- `backend/src/utils/time.ts` — contains date/time utility functions

### Environment Variables

- `PORT` — server port (default 3000)
- `SCALARAI_MCP_API_KEY` — if set, protects MCP route and other routes with Bearer auth
- `FRONTEND_URL` — allowed origin for WebSocket servers
- `NODE_ENV` — production uses static files, dev uses Vite middleware

### Backend Data Directory

```
backend/data/
├── scalarai.sqlite          # SQLite database (WAL mode, foreign keys enabled)
├── backups/                 # Empty directory (legacy JSON files removed)
```

## Data Flow

1. MT5 EA → `POST /api/ea/tick` → `store.updateMarket()` → updates symbol state, AI knowledge, strategy eval, broadcasts dashboards
2. MT5 EA → `POST /api/update-market` → bulk candles or single tick → `store.updateMarket()` or `store.ingestBulkCandles()`
3. MT5 Bridge → `WS /mt5-bridge` → receives pending orders/commands, supports `request_history`
4. Dashboard → `WS /ws/live` → receives init, tick, trade, log, config updates, supports `request_history`
5. Frontend → `POST /api/settings` → `store.updateSettings()` → persists + broadcasts
6. Background worker → every 5 min → `store.runBackgroundAnalysisWorker()` → processes telemetry, updates AI knowledge

## Current Dependencies Between Layers

```
index.ts
  → services/app-store.ts (state container)
    → services/market-ingestion.ts
    → services/trade-execution.ts
    → services/state-persistence.ts
    → services/defaults.ts
    → services/knowledge.ts (called by app-store via import, not method)
    → services/observations.ts (ObservationsService)
    → services/strategy-backtest.ts (BacktestEngine)
    → services/trading-machine.ts (xstate machines)
    → utils/ip.ts
    → utils/time.ts
  → routes/* (receive store methods as callbacks)
  → websockets/* (receive store methods as callbacks)
  → db/ (scalarAiDb singleton)
  → mcp_server.ts (receives McpContext from store.buildMcpContext())
```
