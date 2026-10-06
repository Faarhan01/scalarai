# Backend Plan — Stage 1: God-File Refactor

## Objective

Extract focused services from `backend/src/index.ts` to reduce god-file complexity.

## Current State

`backend/src/index.ts` is 721 lines and still mixes:
- Market ingestion / symbol state management
- Trade execution / strategy evaluation
- State persistence / DB hydration
- Route wiring

## Existing Service Files

- `backend/src/services/market-ingestion.ts` — already has `createSymbolStates`, `getSymbolState`, `aggregateTickIntoCandle`, `updateMarketState`
- `backend/src/services/strategy.ts` — already has `evaluateStrategy`, `buildContext`, indicator math helpers
- `backend/src/services/defaults.ts` — already has factory functions for defaults
- `backend/src/services/ea-generator.ts` — already has `generateMql5Code`

## What Needs to Be Extracted from `index.ts`

### A. `services/trade-execution.ts` — Trade lifecycle & strategy triggers

**Currently in `index.ts` lines 332–450:**
- `evaluateSimulatedStrategy()` — checks ATR, trailing stop, TP/SL, opens new positions
- `openSimulatedPosition()` — gatekeeper logic, `crypto.randomUUID()`, `nextTicket++`, bridge broadcast
- `closeSimulatedPosition()` — marks CLOSED, computes profit, broadcasts close

**Additionally in `index.ts` lines 266–330 (indicator math used by trade execution):**
- `getClosePrices()`
- `calculateEMA()`
- `calculateRSI()`
- `calculateATR()`
- `calculateBollingerBands()`

**Dependencies:**
- `symbolStates`, `activeSymbol`, `tradeConfig`, `tradesList`, `pendingBridgeOrders`, `pendingEaCommand`, `mt5BridgeClients`, `latestBuyLockedFromEa`, `latestSellLockedFromEa`, `aiKnowledgeBase`, `aiSynthesizedStrategy`, `lastStrategySignal`
- Calls: `addLog()`, `broadcastTradesUpdate()`, `getSymbolState()`, `buildContext()`, `evaluateStrategy()`, `scalarAiDb.resetTrades()`

**Target:** Move lines 332–450 + indicator helpers 266–330 into `services/trade-execution.ts`. Export `evaluateSimulatedStrategy`, `openSimulatedPosition`, `closeSimulatedPosition`, `resetStats`, `placeTrade`, `closeTrade`.

### B. `services/state-persistence.ts` — DB hydration & persist helpers

**Currently in `index.ts` lines 65–104:**
- `loadStateFromDb()` — loads settings, AI knowledge, AI strategy, trades, logs on startup
- `persistTrade()` — `scalarAiDb.insertTrade()`
- `persistLog()` — `scalarAiDb.insertLog()`
- `persistAiKnowledge()` — `scalarAiDb.upsertAiKnowledge()`
- `persistAiStrategy()` — `scalarAiDb.upsertAiStrategy()`
- `persistSettings()` — `scalarAiDb.upsertSettings()`
- `persistEaConnection()` — `scalarAiDb.upsertEaConnection()`

**Dependencies:**
- `tradeConfig`, `aiKnowledgeBase`, `aiSynthesizedStrategy`, `tradesList`, `systemLogs`
- Calls: `addLog()`, `getDefaultAiKnowledgeBase()`, `getDefaultAiSynthesizedStrategy()`

**Target:** Move lines 65–104 into `services/state-persistence.ts`. Export `loadStateFromDb` and all persist helpers.

### C. `services/app-state.ts` — Background workers & MCP context

**Currently in `index.ts` lines 452–595:**
- `loadAiSynthesizedStrategy()` (452–461)
- `loadAiKnowledgeBase()` (463–472)
- `runBackgroundAnalysisWorker()` (474–518)
- `analyzeMarket()`, `synthesizeStrategy()` (520–526)
- `updateSettings()` (528–542)
- `toggleTrading()` (544–558)
- `placeTrade()`, `closeTrade()`, `resetStats()` (560–577)
- `mcpContext` object (579–595)

**Dependencies:**
- `tradeConfig`, `aiKnowledgeBase`, `aiSynthesizedStrategy`, `tradesList`, `systemLogs`, `symbolStates`, `activeSymbol`, `lastStrategySignal`, `lastProcessedTelemetryIndex`
- Calls: `addLog()`, `broadcastToDashboards()`, `broadcastTradesUpdate()`, `getSymbolState()`, `evaluateSimulatedStrategy()`, `openSimulatedPosition()`, `closeSimulatedPosition()`, `scalarAiDb.*`

**Target:** Move lines 452–595 into `services/app-state.ts`. Export an `AppState` class or module that encapsulates all state mutations.

## Implementation Steps

1. **Extract `services/trade-execution.ts`**
   - Move indicator math helpers (`getClosePrices`, `calculateEMA`, `calculateRSI`, `calculateATR`, `calculateBollingerBands`)
   - Move trade execution functions (`evaluateSimulatedStrategy`, `openSimulatedPosition`, `closeSimulatedPosition`)
   - Export them with typed signatures
   - Update `index.ts` to import and use them

2. **Extract `services/state-persistence.ts`**
   - Move `loadStateFromDb` and all `persist*` helpers
   - Export them
   - Update `index.ts` to import and use them

3. **Extract `services/app-state.ts`**
   - Move AI loaders, background worker, settings/trading functions, MCP context
   - Export `mcpContext` factory
   - Update `index.ts` to import and use them

4. **Verify app compiles and all features work after each extraction**

## Verification

- `npx tsc --noEmit` passes
- `npm run test` passes
- Dev server starts and `/api/health` returns `status: ok`
- EA tick endpoint still accepts unauthenticated requests
- Protected routes still require `SCALARAI_MCP_API_KEY`
- WebSocket bridge and dashboard still connect
- Strategy evaluation still triggers on ticks
- Background analysis worker still runs every 5 minutes
