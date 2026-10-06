import { TradeConfig, TradeRecord, SystemLog, AiKnowledgeBase, AiSynthesizedStrategy, McpContext, EAConnectionDetails } from "../types";
import { SymbolStates, getSymbolState } from "./market-ingestion";
import { scalarAiDb } from "../db";
import { persistAiKnowledge, persistAiStrategy, persistSettings, persistEaConnection, loadStateFromDb } from "./state-persistence";
import { evaluateSimulatedStrategy, openSimulatedPosition, closeSimulatedPosition, AppCallbacks, TradeState } from "./trade-execution";
import { evaluateStrategyBacktest } from "./strategy";
import { WebSocket } from "ws";

export interface AppState {
  tradeConfig: TradeConfig;
  tradesList: TradeRecord[];
  systemLogs: SystemLog[];
  aiKnowledgeBase: AiKnowledgeBase;
  aiSynthesizedStrategy: AiSynthesizedStrategy;
  lastStrategySignal: { type: string; reason: string; confidence?: number } | null;
  symbolStates: SymbolStates;
  activeSymbol: string;
  lastProcessedTelemetryIndex: number;
  nextTicket: { value: number };
  latestBuyLockedFromEa: boolean;
  latestSellLockedFromEa: boolean;
  pendingBridgeOrders: any[];
  pendingEaCommand: { action: string; lot: number; sl: number; tp: number } | null;
  mt5BridgeClients: Set<WebSocket>;
}

export function buildTradeState(state: AppState, callbacks: AppCallbacks): TradeState {
  return {
    tradesList: state.tradesList,
    symbolStates: state.symbolStates,
    activeSymbol: state.activeSymbol,
    tradeConfig: state.tradeConfig,
    aiKnowledgeBase: state.aiKnowledgeBase,
    aiSynthesizedStrategy: state.aiSynthesizedStrategy,
    latestBuyLockedFromEa: state.latestBuyLockedFromEa,
    latestSellLockedFromEa: state.latestSellLockedFromEa,
    nextTicket: state.nextTicket,
    pendingBridgeOrders: state.pendingBridgeOrders,
    pendingEaCommand: state.pendingEaCommand,
    mt5BridgeClients: state.mt5BridgeClients,
  };
}

export function loadAiSynthesizedStrategy(state: AppState, callbacks: AppCallbacks): void {
  const saved = scalarAiDb.getAiStrategy();
  if (saved) {
    state.aiSynthesizedStrategy = saved;
    callbacks.addLog("AI", "SUCCESS", `Loaded persistent AI Synthesized Strategy. Name: '${saved.name}'`);
  } else {
    persistAiStrategy(state.aiSynthesizedStrategy);
    callbacks.addLog("AI", "INFO", "Initialized fresh persistent AI strategy in SQLite.");
  }
}

export function loadAiKnowledgeBase(state: AppState, callbacks: AppCallbacks): void {
  const saved = scalarAiDb.getAiKnowledge();
  if (saved) {
    state.aiKnowledgeBase = saved;
    callbacks.addLog("AI", "SUCCESS", `Loaded long-term knowledge base. Total historical observations: ${saved.totalObservations}, Glob Avg Speed: ${saved.globalAverageSpeed} pt/s.`);
  } else {
    persistAiKnowledge(state.aiKnowledgeBase);
    callbacks.addLog("AI", "INFO", "Initialized fresh persistent knowledge base in SQLite.");
  }
}

export function runBackgroundAnalysisWorker(state: AppState, callbacks: AppCallbacks): void {
  try {
    const symbolTelemetry = getSymbolState(state.symbolStates, state.activeSymbol).telemetry;
    if (symbolTelemetry.length <= state.lastProcessedTelemetryIndex) return;
    const unprocessedRecords = symbolTelemetry.slice(state.lastProcessedTelemetryIndex);
    state.lastProcessedTelemetryIndex = symbolTelemetry.length;
    const newObservationsCount = unprocessedRecords.length;
    let sumAbsVelocity = 0;
    let localPeakVelocity = 0;
    const hourGroups: Record<string, number[]> = {};
    for (const record of unprocessedRecords) {
      const speed = Math.abs(record.velocity);
      sumAbsVelocity += speed;
      if (speed > localPeakVelocity) localPeakVelocity = speed;
      const hourStr = String(new Date(record.timestamp).getHours()).padStart(2, "0");
      if (!hourGroups[hourStr]) hourGroups[hourStr] = [];
      hourGroups[hourStr].push(speed);
    }
    const oldTotal = state.aiKnowledgeBase.totalObservations;
    const newTotal = oldTotal + newObservationsCount;
    const currentGlobalAvgSpeed = state.aiKnowledgeBase.globalAverageSpeed;
    const updatedGlobalAvgSpeed = newTotal > 0 ? (currentGlobalAvgSpeed * oldTotal + sumAbsVelocity) / newTotal : 0;
    const updatedPeak = Math.max(state.aiKnowledgeBase.peakVelocityRegistered, localPeakVelocity);
    const updatedPatterns = { ...state.aiKnowledgeBase.timeOfDayPatterns };
    for (const hour of Object.keys(hourGroups)) {
      const speeds = hourGroups[hour];
      const newSpeedSum = speeds.reduce((sum: number, s: number) => sum + s, 0);
      const newSpeedCount = speeds.length;
      if (!updatedPatterns[hour]) updatedPatterns[hour] = { count: 0, avgSpeed: 0 };
      const oldHourData = updatedPatterns[hour];
      const totalHourCount = oldHourData.count + newSpeedCount;
      const updatedHourAvgSpeed = totalHourCount > 0 ? (oldHourData.avgSpeed * oldHourData.count + newSpeedSum) / totalHourCount : 0;
      updatedPatterns[hour] = { count: totalHourCount, avgSpeed: Number(updatedHourAvgSpeed.toFixed(4)) };
    }
    state.aiKnowledgeBase.totalObservations = newTotal;
    state.aiKnowledgeBase.globalAverageSpeed = Number(updatedGlobalAvgSpeed.toFixed(4));
    state.aiKnowledgeBase.peakVelocityRegistered = Number(updatedPeak.toFixed(4));
    state.aiKnowledgeBase.timeOfDayPatterns = updatedPatterns;
    state.aiKnowledgeBase.lastUpdated = new Date().toISOString();
    persistAiKnowledge(state.aiKnowledgeBase);
    callbacks.addLog("AI", "SUCCESS", `Background worker completed quantitative study run. Observations: +${newObservationsCount} (Total: ${newTotal}). Saved to SQLite.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    callbacks.addLog("SERVER", "ERROR", `Quantitative background worker failed: ${message}`);
  }
}

export async function analyzeMarket(): Promise<string> {
  return "Market analysis is handled by the active strategy engine. Use backtest_strategy MCP tool for performance evaluation.";
}

export async function synthesizeStrategy(state: AppState): Promise<AiSynthesizedStrategy> {
  return state.aiSynthesizedStrategy;
}

export function updateSettings(state: AppState, params: Partial<TradeConfig>, callbacks: AppCallbacks): TradeConfig {
  if (params.selectedStrategy !== undefined) state.tradeConfig.selectedStrategy = params.selectedStrategy;
  if (params.lotSize !== undefined) state.tradeConfig.lotSize = Number(params.lotSize);
  if (params.takeProfitPoints !== undefined) state.tradeConfig.takeProfitPoints = Number(params.takeProfitPoints);
  if (params.stopLossPoints !== undefined) state.tradeConfig.stopLossPoints = Number(params.stopLossPoints);
  if (params.trailingStopPoints !== undefined) state.tradeConfig.trailingStopPoints = Number(params.trailingStopPoints);
  if (params.useTrailingStop !== undefined) state.tradeConfig.useTrailingStop = Boolean(params.useTrailingStop);
  if (params.maxTrades !== undefined) state.tradeConfig.maxTrades = Number(params.maxTrades);
  if (params.tradingMode !== undefined) state.tradeConfig.tradingMode = params.tradingMode;
  if (params.isAiModeEnabled !== undefined) state.tradeConfig.isAiModeEnabled = Boolean(params.isAiModeEnabled);
  callbacks.addLog("SERVER", "WARNING", "Strategy configurations changed. Running parameters updated.");
  persistSettings(state.tradeConfig);
  callbacks.broadcastToDashboards({ type: "config", config: state.tradeConfig });
  return state.tradeConfig;
}

export function toggleTrading(state: AppState, isActive: boolean, callbacks: AppCallbacks): TradeConfig {
  state.tradeConfig.isActive = isActive;
  const statusLabel = state.tradeConfig.isActive ? "STARTED" : "STOPPED";
  callbacks.addLog("SERVER", "INFO", `Trading remote state toggled to: ${statusLabel}`);
  if (!state.tradeConfig.isActive) {
    const openTrades = state.tradesList.filter((t: TradeRecord) => t.status === "OPEN");
    if (openTrades.length > 0) {
      const tradeState = buildTradeState(state, callbacks);
      openTrades.forEach((t: TradeRecord) => closeSimulatedPosition(tradeState, t, "Forced termination from remote dashboard.", callbacks));
    }
  }
  persistSettings(state.tradeConfig);
  callbacks.broadcastToDashboards({ type: "config", config: state.tradeConfig });
  callbacks.broadcastTradesUpdate();
  return state.tradeConfig;
}

export async function placeTrade(state: AppState, type: "BUY" | "SELL", reason: string, callbacks: AppCallbacks): Promise<{ success: boolean; message: string }> {
  const tradeState = buildTradeState(state, callbacks);
  await openSimulatedPosition(tradeState, type, reason, callbacks);
  return { success: true, message: `Trade signal sent: ${type}` };
}

export async function closeTrade(state: AppState, tradeId: string, callbacks: AppCallbacks): Promise<{ success: boolean; message: string }> {
  const trade = state.tradesList.find((t: TradeRecord) => t.id === tradeId && t.status === "OPEN");
  if (!trade) return { success: false, message: `Open trade with id ${tradeId} not found` };
  const tradeState = buildTradeState(state, callbacks);
  closeSimulatedPosition(tradeState, trade, "Closed via MCP request.", callbacks);
  return { success: true, message: `Trade ${tradeId} closed` };
}

export function resetStats(state: AppState, callbacks: AppCallbacks): void {
  state.tradesList.length = 0;
  scalarAiDb.resetTrades();
  callbacks.addLog("SERVER", "SUCCESS", "User reset session statistics and trading history log.");
  callbacks.broadcastTradesUpdate();
}

export function buildMcpContext(state: AppState, callbacks: AppCallbacks): McpContext {
  return {
    getStatus: () => {
      const closedPositions = state.tradesList.filter((t: TradeRecord) => t.status === "CLOSED");
      const wins = closedPositions.filter((t: TradeRecord) => t.profit > 0).length;
      const totalProfit = closedPositions.reduce((sum: number, t: TradeRecord) => sum + t.profit, 0);
      const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;
      const openPositions = state.tradesList.filter((t: TradeRecord) => t.status === "OPEN");
      const activeState = getSymbolState(state.symbolStates, state.activeSymbol);
      return {
        config: state.tradeConfig,
        connection: activeState.connection,
        isBridgeConnected: false,
        logs: state.systemLogs,
        trades: state.tradesList,
        history: activeState.connection.isEaConnected ? activeState.ticks.slice(-50) : [],
        candles: activeState.connection.isEaConnected ? activeState.candles.slice(-100) : [],
        status: activeState.connection.isEaConnected ? "active" : "waiting",
        currentPrice: activeState.currentPrice,
        activeSymbol: state.activeSymbol,
        symbolStates: Array.from(state.symbolStates.map.entries()).map(([symbol, s]) => ({
          symbol,
          connection: s.connection,
          currentPrice: s.currentPrice,
          tickCount: s.ticks.length,
        })),
        aiSynthesizedStrategy: state.aiSynthesizedStrategy,
        lastStrategySignal: state.lastStrategySignal,
        stats: {
          totalProfit: Number(totalProfit.toFixed(2)),
          tradesCount: closedPositions.length,
          winRate: Math.round(winRate),
          activePositionsCount: openPositions.length,
          lastHeartbeatTime: activeState.connection.lastPing,
        },
        webRequestStatus: {
          status: "idle" as const,
          lastTested: "",
          error: "",
          details: "Awaiting first WebRequest test trigger.",
          triggerTest: false,
        },
      };
    },
    getAiStudyFeed: async () => ({
      status: state.aiKnowledgeBase.totalObservations >= 20 ? "optimized" : "calibrating",
      message: state.aiKnowledgeBase.totalObservations >= 20 ? "Quantitative baseline calibrated." : "AI is analyzing market speed baseline... Awaiting sufficient expert data stream from MetaTrader 5 terminal.",
      count: state.aiKnowledgeBase.totalObservations,
      aiKnowledgeBase: state.aiKnowledgeBase,
      aiSynthesizedStrategy: state.aiSynthesizedStrategy,
      candleStream: getSymbolState(state.symbolStates, state.activeSymbol).ticks,
      averageVelocity: state.aiKnowledgeBase.globalAverageSpeed,
    }),
    getTrades: () => state.tradesList,
    getLogs: () => state.systemLogs,
    getConfig: () => state.tradeConfig,
    getConnection: () => getSymbolState(state.symbolStates, state.activeSymbol).connection,
    getAiStrategy: () => state.aiSynthesizedStrategy,
    getAiKnowledgeBase: () => state.aiKnowledgeBase,
    analyzeMarket,
    synthesizeStrategy: () => synthesizeStrategy(state),
    updateSettings: async (params: any) => Promise.resolve(updateSettings(state, params, callbacks)),
    toggleTrading: async (isActive: boolean) => Promise.resolve(toggleTrading(state, isActive, callbacks)),
    placeTrade: async (type: "BUY" | "SELL", reason?: string) => placeTrade(state, type, reason || "MCP initiated trade", callbacks),
    closeTrade: async (tradeId: string) => closeTrade(state, tradeId, callbacks),
    resetStats: async () => Promise.resolve(resetStats(state, callbacks)),
  };
}
