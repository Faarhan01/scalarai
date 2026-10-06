# Backend Site Structure

> Source of truth for `backend/src/`. Do not refactor based on `knowledgebase/plans/backend/stage-*.md` alone; this file reflects the actual committed code at HEAD.

## Tree

```
backend/src/
├── index.ts                       # Express bootstrap only (192 lines)
├── mcp_server.ts                  # MCP JSON-RPC 2.0 handler + tool registry
├── types/
│   └── index.ts                   # Shared backend interfaces/types
├── routes/
│   ├── ai.ts                      # GET /api/ai-study-feed
│   ├── ea.ts                      # GET /api/ea/download, /api/ea/generator-source, /api/ea/template
│   │                               # POST /api/ea/tick, POST /api/update-market
│   ├── health.ts                  # GET /api/health
│   ├── market.ts                  # GET /api/market/history
│   ├── mcp.ts                     # POST /mcp → createMcpHandler(ctx, apiKey)
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
│   ├── app-store.ts               # AppStore class — ALL state + business logic
│   ├── defaults.ts                # Factories: getDefaultTradeConfig, getDefaultAiKnowledgeBase, etc.
│   ├── ea-generator.ts            # generateMql5Code(), validateAppUrl() (internal)
│   ├── knowledge.ts               # updateKnowledgeBaseFromTelemetry(), formatKnowledgeBase()
│   ├── market-ingestion.ts        # SymbolStates, createSymbolStates, createBlankSymbolState,
│   │                               # getSymbolState, updateMarket, aggregateTickIntoCandle
│   ├── state-persistence.ts       # loadStateFromDb, persistTrade, persistLog, persistAiKnowledge, etc.
│   ├── strategy.ts                # evaluateStrategy, buildContext, StrategyContext, indicator math
│   ├── strategy-research.ts       # analyzeMarket, analyzeStrategyPerformance, suggestStrategyOptimizations
│   ├── strategy-templates.ts      # STRATEGY_TEMPLATES array, StrategyTemplate interface
│   └── trade-execution.ts         # evaluateSimulatedStrategy, openSimulatedPosition, closeSimulatedPosition
│                                   # AppCallbacks interface, TradeState interface
├── middleware/
│   ├── auth.ts                    # requireApiKey(expectedApiKey?) — passes if empty/missing
│   ├── cors.ts                    # Reflects request Origin, credentials allowed
│   ├── error.ts                   # Centralized error handler
│   ├── logger.ts                  # HTTP request/response logging
│   └── rateLimit.ts               # In-memory sliding-window rate limiter (default 1200 req/min)
├── utils/
│   ├── auth.ts                    # validateBearerToken() helper
│   ├── index.ts                   # Re-exports validators
│   ├── ip.ts                      # normalizeIp() — strips ::ffff: prefix
│   ├── time.ts                    # Date/time utilities: toIso8601, formatTime, timeAgo, etc.
│   ├── response.ts                # ApiResponse<T>, jsonSuccess(), jsonError() — NOT empty
│   └── validators.ts              # isValidStrategyMode, isValidTradingMode, isValidTradeType
└── db/
    ├── index.ts                   # openDb(), migrate(), exports scalarAiDb singleton
    ├── migrate.ts                 # Schema migration + seedDefaults + migrateJsonData
    ├── repository.ts              # ScalarAiDb — all SQL queries
    └── schema.sql                 # CREATE TABLE statements
```

## Key Facts

### `index.ts` — Thin Bootstrap (192 lines)

- Does NOT contain business logic
- Creates a single `AppStore` instance
- Loads state from DB via `store.loadFromDb()`
- Registers all routes, passing store methods/getters
- Creates Vite dev server or static file serving
- Creates WebSocket servers with connect/disconnect handlers
- Background intervals: analysis worker (5 min), DB cleanup (1 hour)

### `AppStore` class — `services/app-store.ts` (453 lines)

Single source of truth for all application state and mutations.

**State fields:**
- `tradeConfig`, `tradesList`, `systemLogs`, `aiKnowledgeBase`, `aiSynthesizedStrategy`
- `lastStrategySignal`, `symbolStates`, `activeSymbol`, `lastProcessedTelemetryIndex`
- `nextTicket: { value: number }`
- `latestBuyLockedFromEa`, `latestSellLockedFromEa`
- `pendingBridgeOrders: any[]`, `pendingEaCommand: { action, lot, sl, tp } | null`
- `mt5BridgeClients: Set<WebSocket>`, `webDashboardClients: Set<WebSocket>`
- `webRequestTest: { status, lastTested, error, details, triggerTest }`

**Key methods:**
- `loadFromDb()` — hydrates from SQLite
- `addLog()`, `broadcastToDashboards()`, `broadcastTradesUpdate()`
- `getFullStatusPayload(): FullStatusPayload`
- `getAndClearPendingOrders()`, `getPendingEaCommand()`
- `updateMarket(data: UpdateMarketPayload, clientIp?)` — core tick processing
- `buildTradeState(): TradeState` — snapshot for trade execution
- `buildMcpContext(): McpContext` — context for MCP tools
- `runBackgroundAnalysisWorker()` — processes telemetry, updates AI knowledge
- `updateSettings(params)`, `toggleTrading(isActive)`, `placeTrade()`, `closeTrade()`, `resetStats()`
- `loadAiSynthesizedStrategy()`, `loadAiKnowledgeBase()`
- `analyzeMarket(): Promise<string>` — stub for MCP type requirement

## Detailed Documentation

For detailed information on specific areas, see:

- [Routes](routes.md) — all Express routes, endpoints, request/response shapes
- [WebSockets](websockets.md) — WebSocket servers, protocols, message types
- [Services](services.md) — service layer details, AppStore, strategy, trade execution, market ingestion
- [Middleware](middleware.md) — auth, CORS, error handling, logging, rate limiting
- [Utils](utils.md) — utility functions (auth, IP, time, validators, response)
- [Database](db.md) — SQLite layer, schema, migrations, queries, data retention
- [MCP Server](mcp.md) — MCP JSON-RPC 2.0 handler, all tools
- [Types](types.md) — key TypeScript interfaces and types

## Current Dependencies Between Layers

```
index.ts
  → services/app-store.ts (state container)
    → services/market-ingestion.ts
    → services/trade-execution.ts
    → services/state-persistence.ts
    → services/defaults.ts
    → services/knowledge.ts (called by app-store via import, not method)
    → utils/ip.ts
    → utils/time.ts
  → routes/* (receive store methods as callbacks)
  → websockets/* (receive store methods as callbacks)
  → db/ (scalarAiDb singleton)
  → mcp_server.ts (receives McpContext from store.buildMcpContext())
```

## Data Flow

1. MT5 EA → `POST /api/ea/tick` → `store.updateMarket()` → updates symbol state, AI knowledge, strategy eval, broadcasts dashboards
2. MT5 EA → `POST /api/update-market` → same as above (alternate endpoint)
3. MT5 Bridge → `WS /mt5-bridge` → receives pending orders/commands
4. Dashboard → `WS /ws/live` → receives init, tick, trade, log, config updates
5. Frontend → `POST /api/settings` → `store.updateSettings()` → persists + broadcasts
6. Background worker → every 5 min → `store.runBackgroundAnalysisWorker()` → processes telemetry, updates AI knowledge

## Route Registration Pattern

```ts
registerEaRoutes(app, store.getFullStatusPayload.bind(store), () => store.tradeConfig, store.updateMarket.bind(store), store.getPendingEaCommand.bind(store), process.env.SCALARAI_MCP_API_KEY);
registerMarketRoutes(app, store.updateMarket.bind(store), () => store.tradeConfig, process.env.SCALARAI_MCP_API_KEY);
registerStatusRoute(app, store.getFullStatusPayload.bind(store), (symbol) => { store.activeSymbol = symbol; ... }, store.getAndClearPendingOrders.bind(store), process.env.SCALARAI_MCP_API_KEY);
```

Note: `process.env.SCALARAI_MCP_API_KEY` is passed directly. If unset/empty, `requireApiKey()` in `middleware/auth.ts` passes all requests through.

## Auth Behavior

`middleware/auth.ts`:
- If `apiKey` is `undefined` or empty string → passes through (no auth)
- If `apiKey` is set → requires `Authorization: Bearer <key>`

This means in development without `SCALARAI_MCP_API_KEY`, all protected routes are open.

`mcp_server.ts` has its own auth check — it always requires a valid Bearer token regardless of `expectedApiKey`.

## WebSocket Connect/Disconnect

```ts
// bridge.ts signature
createBridgeServer(server, onMessage, onConnect?, onClose?)

// dashboard.ts signature
createDashboardServer(server, sendInit, onMessage, onConnect?, onClose?)
```

`index.ts` uses `onConnect`/`onClose` to maintain `store.mt5BridgeClients` and `store.webDashboardClients` sets and broadcast connection state changes.

## Important: Do NOT Delete or Rename

- `backend/src/services/app-state.ts` — already deleted; do not recreate
- `backend/src/utils/response.ts` — NOT empty; contains `ApiResponse<T>`, `jsonSuccess()`, `jsonError()`
- `backend/src/utils/time.ts` — contains date/time utility functions

## Environment Variables

- `PORT` — server port (default 3000)
- `SCALARAI_MCP_API_KEY` — if set, protects MCP route and other routes with Bearer auth
- `NODE_ENV` — production uses static files, dev uses Vite middleware

## Backend Data Directory

```
backend/data/
├── scalarai.sqlite          # SQLite database
├── ai_knowledge_profile.json # Legacy knowledge backup (migrated on first run)
├── ai_synthesized_strategy.json # Legacy strategy backup (migrated on first run)
└── backups/
    ├── ai_knowledge_profile.json
    └── ai_synthesized_strategy.json
```
