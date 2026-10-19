# Backend Plan — Stage 1: Service Extraction

> **Canonical structure:** See `knowledgebase/site-structure/backend/index.md` for the actual committed file layout before editing anything.

## Objective

Extract focused services from `backend/src/index.ts` to reduce god-file complexity.

## Actual Outcome

`index.ts` has been reduced from 721 lines to 192 lines. All business logic now lives in dedicated service modules. `index.ts` is a thin bootstrap file that wires routes, WebSockets, and middleware to the `AppStore` instance.

## Current File Structure

```
backend/src/
├── index.ts                       # 192 lines — Express bootstrap only
├── mcp_server.ts                  # MCP JSON-RPC handler + tool registry
├── types/
│   └── index.ts                   # Shared backend types
├── routes/                        # Express route handlers
│   ├── ai.ts                      # /api/ai-study-feed
│   ├── ea.ts                      # /api/ea/*, /api/update-market
│   ├── health.ts                  # /api/health
│   ├── market.ts                  # /api/market/history
│   ├── mcp.ts                     # /mcp route wiring
│   ├── settings.ts                # /api/settings, strategy updates
│   ├── status.ts                  # /api/status, /poll, symbol switching
│   ├── strategies.ts              # /api/strategies
│   └── trades.ts                  # /api/toggle-trade, /api/reset-stats
├── websockets/
│   ├── bridge.ts                  # /mt5-bridge WS handler
│   └── dashboard.ts               # /ws/live, /ws, /live-feed WS handler
├── services/
│   ├── app-store.ts               # AppStore class — ALL state + business logic
│   ├── defaults.ts                # Default config/knowledge/strategy factories
│   ├── ea-generator.ts            # MQL5 EA and Node.js bridge code generation
│   ├── knowledge.ts               # AI knowledge base calculations
│   ├── market-ingestion.ts        # Symbol state, tick aggregation, candle building
│   ├── state-persistence.ts       # DB hydration + persist helpers
│   ├── strategy.ts                # evaluateStrategy, indicator math helpers
│   ├── strategy-research.ts       # Strategy analysis/optimization helpers
│   └── strategy-templates.ts      # Built-in strategy templates
├── middleware/
│   ├── auth.ts                    # Bearer token auth middleware
│   ├── cors.ts                    # CORS headers + preflight
│   ├── error.ts                   # Centralized error handler
│   ├── logger.ts                  # Optional HTTP request/response logging
│   └── rateLimit.ts               # Rate limiting middleware
├── utils/
│   ├── auth.ts                    # Bearer token validation helper
│   ├── index.ts                   # Re-exports validators
│   ├── ip.ts                      # IPv6-mapped IPv4 normalization
│   ├── response.ts                # ApiResponse<T>, jsonSuccess(), jsonError() — NOT empty
│   ├── time.ts                    # Date/time utilities
│   └── validators.ts              # Request body validation helpers
└── db/
    ├── index.ts                   # DB initialization + migration
    ├── migrate.ts                 # Schema migration + seedDefaults + migrateJsonData
    ├── repository.ts              # ScalarAiDb — all SQL queries
    └── schema.sql                 # CREATE TABLE statements
```

## What Was Extracted

### A. `services/trade-execution.ts` (already existed)

Trade lifecycle and strategy evaluation. Contains:
- `evaluateSimulatedStrategy()` — ATR checks, trailing stop, TP/SL, position opening
- `openSimulatedPosition()` — gatekeeper logic, UUID generation, ticket assignment, bridge broadcast
- `closeSimulatedPosition()` — marks CLOSED, computes profit, broadcasts close
- Indicator math helpers: `getClosePrices`, `calculateEMA`, `calculateRSI`, `calculateATR`, `calculateBollingerBands`

### B. `services/state-persistence.ts` (already existed)

DB hydration and persistence helpers. Contains:
- `loadStateFromDb()` — loads settings, AI knowledge, AI strategy, trades, logs on startup
- `persistTrade()`, `persistLog()`, `persistAiKnowledge()`, `persistAiStrategy()`, `persistSettings()`, `persistEaConnection()`

### C. `services/market-ingestion.ts` (already existed)

Symbol state management and tick aggregation. Contains:
- `createSymbolStates()`, `getSymbolState()`, `updateMarketState()`, `aggregateTickIntoCandle()`

### D. `services/strategy.ts` (already existed)

Core strategy evaluation and indicator math. Contains:
- `evaluateStrategy()`, `buildContext()`, EMA/RSI/ATR/Bollinger calculations

### E. `services/defaults.ts` (already existed)

Factory functions for default state:
- `getDefaultTradeConfig()`, `getDefaultAiKnowledgeBase()`, `getDefaultAiSynthesizedStrategy()`, `createSystemLog()`

### F. `services/ea-generator.ts` (already existed)

MQL5 EA and Node.js bridge code generation.

### G. `services/knowledge.ts` (already existed)

AI knowledge base calculations and time-of-day pattern analysis.

## Implementation Notes

- `index.ts` no longer contains any business logic — only Express middleware, route registration, Vite/static serving, and WebSocket server creation
- All route handlers receive callbacks/getters from the `AppStore` instance
- WebSocket handlers use `store` methods directly
- The `AppStore` class in `services/app-store.ts` is the single source of truth for all application state and mutations

## Critical Fragility Warnings

### DO NOT CHANGE WITHOUT UNDERSTANDING THE CONTRACT

1. **EA routes must remain unauthenticated**: `registerEaRoutes()` is called WITHOUT `apiKey` in `index.ts:60`. The MT5 EA cannot perform Bearer auth. If you add auth to EA routes, the EA will be unable to send ticks and the site will stop receiving updates.

2. **Market routes must remain unauthenticated**: `registerMarketRoutes()` is called WITHOUT `apiKey` in `index.ts:61`. Same reason as EA routes.

3. **WebSocket message types are contracts**: The frontend expects these exact message types from the dashboard WebSocket:
   - `init` with full `FullStatusPayload`
   - `tick` with `symbol`, `activeSymbol`, `tick`, `currentPrice`, `connection`, `candles`, `stats`, `symbolStates`
   - `trades` with `trades`, `stats`
   - `log` with `log`
   - `config` with `config`
   - `connection` with `isBridgeConnected`
   - `webrequest_test` with `testState`
   - `ai_strategy` with `aiSynthesizedStrategy`
   - `pong` with `clientTime`, `serverTime`
   
   Renaming or removing any of these will break the frontend silently.

4. **EA tick response is a contract**: `POST /api/ea/tick` must return ALL of these fields or the EA will malfunction:
   - `isActive`, `selectedStrategy`, `lotSize`, `takeProfitPoints`, `stopLossPoints`
   - `trailingStopPoints`, `useTrailingStop`, `maxTrades`, `tradingMode`
   - `isAiModeEnabled`, `selectedAssets`
   - `pendingAction`, `pendingLot`, `pendingSL`, `pendingTP`
   
   Do NOT remove, rename, or change the type of any of these fields.

5. **Chart data depends on WebSocket tick messages**: The frontend chart depends on receiving `candles` (array of `{time, open, high, low, close}`) and `history`/`tick` objects from WebSocket. If you stop broadcasting these, the chart will break.

6. **Frontend state variable names are coupled**: `App.tsx` uses 25+ state variables with specific names. Many components depend on these names. Do not rename state setters without updating all consumers.

7. **`AppStore` is the ONLY state container**: Do not create new global stores, module-level state, or duplicate state in routes/WebSocket handlers. All state must live in `AppStore`.

8. **Database schema changes require migration**: New tables/columns must go through `db/migrate.ts` ALTER TABLE. Do not edit `schema.sql` alone for existing databases.

## Verification

- `npx tsc --noEmit` passes
- Dev server starts and `/api/health` returns `status: ok`
- EA tick endpoint accepts unauthenticated requests
- Protected routes require `SCALARAI_MCP_API_KEY`
- WebSocket bridge and dashboard connect and respond
