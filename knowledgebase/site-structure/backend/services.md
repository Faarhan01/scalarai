# Backend Services

> Detailed reference for all service modules in `backend/src/services/`.

## Overview

Services contain all business logic. `AppStore` orchestrates them, and routes/WebSocket handlers receive store methods as callbacks.

## Service Modules

### `app-store.ts` — AppStore Class (720 lines)

Single source of truth for all application state and mutations. Fields are `private`; access is via getters. Uses xstate for trading/bridge/calibration state machines and `ObservationsService` for market observations.

**State fields:**
- `tradeConfig: TradeConfig`
- `tradesList: TradeRecord[]`
- `systemLogs: SystemLog[]`
- `aiKnowledgeBase: AiKnowledgeBase`
- `aiSynthesizedStrategy: AiSynthesizedStrategy`
- `lastStrategySignal: { type: string; reason: string; confidence?: number } | null`
- `symbolStates: SymbolStates`
- `activeSymbol: string`
- `lastProcessedTelemetryIndex: number`
- `nextTicket: { value: number }`
- `latestBuyLockedFromEa: boolean`
- `latestSellLockedFromEa: boolean`
- `pendingBridgeOrders: BridgeOrder[]`
- `pendingEaCommand: { action: string; lot: number; sl: number; tp: number } | null`
- `mt5BridgeClients: Set<WebSocket>`
- `webDashboardClients: Set<WebSocket>`
- `webRequestTest: { status: "idle" | "pending" | "success" | "failed"; lastTested: string; error: string; details: string; triggerTest: boolean }`
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
- `loadFromDb()` — hydrates from SQLite via `loadStateFromDb()`
- `addLog(source, level, message)` — creates log, persists, keeps max 80
- `broadcastToDashboards(payload)` — sends JSON to all WS dashboard clients
- `broadcastTradesUpdate()` — sends `{ type: "trades", trades, stats }`
- `getFullStatusPayload(): FullStatusPayload` — assembles full status response
- `getAndClearPendingOrders(): BridgeOrder[]` — returns and clears pending bridge orders
- `getPendingEaCommand()` — returns and clears pending EA command
- `updateMarket(data, clientIp?)` — core tick processing: updates symbol state, AI knowledge, strategy eval, broadcasts
- `ingestBulkCandles(symbol, candles, metadata?)` — bulk candle ingestion
- `buildTradeState(): TradeState` — creates snapshot for trade execution
- `buildMcpContext(): McpContext` — creates context for MCP tools
- `runBackgroundAnalysisWorker()` — processes unprocessed telemetry, updates AI knowledge
- `updateSettings(params)` — updates config, persists, broadcasts
- `toggleTrading(isActive)` — toggles trading, force-closes open trades if stopping
- `placeTrade(type, reason)` — opens simulated position
- `closeTrade(tradeId)` — closes open trade
- `resetStats()` — clears trade list, resets DB
- `switchSymbol(symbol)` — switches active symbol, loads candles from DB
- `updateWebRequestTest(update)` — partial update of WebRequest test state
- `sendTradingEvent(event)`, `sendBridgeEvent(event)`, `sendCalibrationEvent(event)` — xstate transitions
- `getTradingState()`, `getBridgeState()`, `getCalibrationState()` — xstate snapshots
- `addBridgeClient(ws)`, `removeBridgeClient(ws)`, `addDashboardClient(ws)`, `removeDashboardClient(ws)`
- `loadAiSynthesizedStrategy()` — loads AI strategy from DB or initializes default
- `loadAiKnowledgeBase()` — loads knowledge base from DB or initializes default
- `analyzeMarket()` — stub returning string for MCP type requirement

### `defaults.ts` — Default Factories

- `getDefaultTradeConfig(): TradeConfig` — default config with TREND_FOLLOWING, lot 0.1, TP 300, SL 150, max 3 trades
- `getDefaultAiKnowledgeBase(): AiKnowledgeBase` — empty knowledge base
- `getDefaultAiSynthesizedStrategy(): AiSynthesizedStrategy` — AI_ADAPTIVE strategy with default rules
- `createSystemLog(source, level, message): SystemLog` — creates log with random ID and current time

### `ea-generator.ts` — MQL5 EA Generator

- `generateMql5Code(appUrl, config)` — generates complete MQL5 EA source as string
- `validateAppUrl(appUrl)` — internal helper (not exported), validates URL and blocks private IPs in production

EA features:
- Version 1.50, magic number 20260617
- Indicators: EMA(9/21), ADX(14), BB(20,2), Stochastic(5,3,3), ATR(14)
- Strategies: TREND_FOLLOWING, MEAN_REVERSION, AI_ADAPTIVE
- Anti-hedging lock
- Remote command processing via JSON response parsing
- WebRequest sync every 3s
- Trailing stop logic

### `knowledge.ts` — AI Knowledge Base

- `updateKnowledgeBaseFromTelemetry(symbol, telemetry): KnowledgeUpdateResult` — updates knowledge base from telemetry records using exponential moving average
- `formatKnowledgeBase(knowledge): string` — formats knowledge base summary for display

### `market-ingestion.ts` — Market Data Processing

**Key types:**
- `SymbolStates` — `{ map: Map<string, SymbolStateEntry>; activeSymbol: string }`
- `SymbolStateEntry` — ticks, candles, telemetry, connection, currentPrice, lastDirection, tickCount
- `TelemetryRecord` — timestamp, price, velocity, buyLocked, sellLocked

**Key functions:**
- `createSymbolStates(initialActiveSymbol)` — creates empty SymbolStates
- `createBlankSymbolState(symbol)` — creates empty SymbolStateEntry
- `getSymbolState(symbolStates, symbol?)` — gets or creates symbol state, falls back to active symbol or first in map
- `aggregateTickIntoCandle(state, targetPrice)` — creates/updates 1-minute OHLC candles from ticks
- `updateMarket(symbolStates, data)` — processes incoming market data, deduplicates ticks, updates telemetry, returns `{ symbol, switched }`

### `observations.ts` — Observations Service

**Class:** `ObservationsService`

- `storeObservation(obs)` — stores market observation with tags/metadata
- `getObservations(filters?): Observation[]` — queries observations with filters
- `getObservationsByCandle(candleId): Observation[]` — observations linked to a candle
- `generateInsights(symbol, timeRange?): ObservationInsights` — direction distribution, top hours, velocity clusters, suggested strategies
- `linkObservationToStrategy(observationId, strategyId)` — links observation to strategy via metadata
- `getObservationsForStrategy(strategyId): Observation[]` — observations linked to a strategy

### `state-persistence.ts` — Database Persistence

- `loadStateFromDb()` — loads config, knowledge, strategy, trades, logs from SQLite
- `persistTrade(trade)` — inserts trade
- `persistLog(log)` — inserts log
- `persistAiKnowledge(knowledge)` — upserts knowledge base
- `persistAiStrategy(strategy)` — upserts AI strategy
- `persistSettings(config)` — upserts settings
- `persistEaConnection(conn)` — upserts EA connection

### `strategy.ts` — Strategy Engine

**Key interfaces:**
- `StrategyContext` — prices, currentPrice, atr, rsi, fastEma, slowEma, bands, velocity, acceleration, openTradesCount, activeBuyExists, activeSellExists, knowledge, strategy, tradingMode
- `TradeSignal` — type: BUY/SELL/HOLD, reason, confidence
- `BacktestResult` — mode, ticksAnalyzed, signals, simulatedTrades, wins, losses, winRate, totalProfit, avgProfit, maxDrawdown

**Key functions:**
- `buildContext(ticks, knowledge, strategy, tradingMode, openTradesCount, activeBuyExists, activeSellExists): StrategyContext`
- `evaluateStrategy(mode, ctx, config): TradeSignal` — dispatches to strategy evaluator
- `evaluateTrendFollowing(ctx, config)` — EMA golden/death cross + RSI filter
- `evaluateMeanReversion(ctx, config)` — Bollinger Bands + RSI + momentum confirmation
- `evaluateAiAdaptive(ctx, config)` — velocity + acceleration + EMA confirmation + speed divergence
- `evaluateCustomStrategy(ctx, config)` — rule-based with conditions

**Indicator math:**
- `calculateEMA(prices, period)`
- `calculateRSI(prices, period)`
- `calculateATR(ticks, period)` / `calculateATR(state, activeSymbol, period)`
- `calculateBollingerBands(prices, period, numDevs)`

### `strategy-backtest.ts` — Backtest Engine

**Class:** `BacktestEngine`

- `backtest(strategyId, symbol, from, to, initialBalance?): BacktestResult` — runs strategy against historical candles

**Key interfaces:**
- `BacktestCandle` — time, open, high, low, close, direction, volume
- `BacktestTrade` — entryTime, exitTime, type, entryPrice, exitPrice, profit, reason
- `BacktestResult` — strategyId, strategyMode, symbol, fromTime, toTime, initialBalance, finalBalance, totalTrades, wins, losses, winRate, totalProfit, maxDrawdown, trades

### `strategy-research.ts` — Market & Strategy Analysis

- `analyzeMarket(symbol, knowledge): MarketAnalysis` — comprehensive market analysis
- `analyzeStrategyPerformance(mode, limit): StrategyPerformance` — performance metrics from historical trades
- `suggestStrategyOptimizations(mode): StrategyOptimizationSuggestion[]` — parameter optimization suggestions
- `recommendStrategyForConditions(volatility, trend, timeOfDay)` — strategy recommendation based on market conditions

### `strategy-templates.ts` — Strategy Templates

- `STRATEGY_TEMPLATES: StrategyTemplate[]` — 8 built-in templates:
  - `scalping_ema_cross` — Quick Scalp EMA Cross (TREND_FOLLOWING)
  - `scalping_momentum` — Velocity Scalper (AI_ADAPTIVE)
  - `day_trading_trend` — Day Trend Rider (TREND_FOLLOWING)
  - `day_trading_breakout` — Opening Range Breakout (CUSTOM)
  - `momentum_bb_momentum` — Bollinger Momentum (MEAN_REVERSION)
  - `breakout_atr` — ATR Breakout (CUSTOM)
  - `reversal_rsi` — RSI Reversal (MEAN_REVERSION)
  - `adaptive_velocity` — Adaptive Velocity (AI_ADAPTIVE)

- `getStrategyTemplateById(id)` — lookup by ID
- `getStrategiesByCategory(category)` — filter by category
- `createStrategyFromTemplate(templateId, overrides): AiSynthesizedStrategy` — creates strategy from template

### `trade-execution.ts` — Trade Execution

**Key interfaces:**
- `AppCallbacks` — addLog, broadcastToDashboards, broadcastTradesUpdate
- `TradeState` — tradesList, symbolStates, activeSymbol, tradeConfig, aiKnowledgeBase, aiSynthesizedStrategy, latestBuyLockedFromEa, latestSellLockedFromEa, nextTicket, pendingBridgeOrders, pendingEaCommand, mt5BridgeClients

**Key functions:**
- `evaluateSimulatedStrategy(state, callbacks)` — runs on every tick when trading active: checks TP/SL/trailing, evaluates strategy, opens positions
- `openSimulatedPosition(state, type, reason, callbacks)` — gatekeeper checks, creates trade, broadcasts to bridge/dashboards
- `closeSimulatedPosition(state, trade, reason, callbacks)` — calculates profit, updates trade, broadcasts close command

**Indicator math (duplicated from strategy.ts for decoupling):**
- `calculateEMA(prices, period)`
- `calculateRSI(prices, period)`
- `calculateATR(state, activeSymbol, period)`
- `calculateBollingerBands(prices, period, numDevs)`

### `trading-machine.ts` — State Machines

Uses `xstate` to model trading, bridge, and calibration state machines.

**Machines:**
- `tradingMachine` — `idle` ↔ `active` via START/STOP events
- `bridgeMachine` — `disconnected` ↔ `connected` via CONNECT/DISCONNECT events
- `calibrationMachine` — `calibrating` → `optimized` via CALIBRATE event (final state)

**Types:**
- `TradingState` — `"idle" | "active"`
- `BridgeState` — `"disconnected" | "connected"`
- `CalibrationState` — `"calibrating" | "optimized"`
