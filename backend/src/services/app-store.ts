import { TradeConfig, TradeRecord, SystemLog, AiKnowledgeBase, AiSynthesizedStrategy, McpContext, EAConnectionDetails, Tick, FullStatusPayload, UpdateMarketPayload, BridgeOrder } from "../types";
import { SymbolStates, createSymbolStates, createBlankSymbolState, getSymbolState, updateMarket as updateMarketState, aggregateTickIntoCandle } from "./market-ingestion";
import { scalarAiDb } from "../db";
import { persistAiKnowledge, persistAiStrategy, persistSettings, persistEaConnection, loadStateFromDb, persistLog } from "./state-persistence";
import { evaluateSimulatedStrategy, openSimulatedPosition, closeSimulatedPosition, AppCallbacks, TradeState } from "./trade-execution";
import { getDefaultTradeConfig, getDefaultAiKnowledgeBase, getDefaultAiSynthesizedStrategy, createSystemLog } from "./defaults";
import { WebSocket } from "ws";
import { normalizeIp } from "../utils/ip";

export class AppStore {
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
  pendingBridgeOrders: BridgeOrder[];
  pendingEaCommand: { action: string; lot: number; sl: number; tp: number } | null;
  mt5BridgeClients: Set<WebSocket>;
  webDashboardClients: Set<WebSocket>;
  webRequestTest: { status: "idle" | "pending" | "success" | "failed"; lastTested: string; error: string; details: string; triggerTest: boolean };

  constructor() {
    this.tradeConfig = getDefaultTradeConfig();
    this.tradesList = [];
    this.systemLogs = [];
    this.aiKnowledgeBase = getDefaultAiKnowledgeBase();
    this.aiSynthesizedStrategy = getDefaultAiSynthesizedStrategy();
    this.lastStrategySignal = null;
    this.symbolStates = createSymbolStates("");
    this.activeSymbol = "";
    this.lastProcessedTelemetryIndex = 0;
    this.nextTicket = { value: scalarAiDb.getMaxTicket() + 1 };
    this.latestBuyLockedFromEa = false;
    this.latestSellLockedFromEa = false;
    this.pendingBridgeOrders = [];
    this.pendingEaCommand = null;
    this.mt5BridgeClients = new Set<WebSocket>();
    this.webDashboardClients = new Set<WebSocket>();
    this.webRequestTest = {
      status: "idle",
      lastTested: "",
      error: "",
      details: "Awaiting first WebRequest test trigger.",
      triggerTest: false,
    };
  }

  loadFromDb(): void {
    const loaded = loadStateFromDb();
    this.tradeConfig = loaded.tradeConfig;
    this.aiKnowledgeBase = loaded.aiKnowledgeBase;
    this.aiSynthesizedStrategy = loaded.aiSynthesizedStrategy;
    this.tradesList = loaded.trades;
    this.systemLogs = loaded.logs;
    this.nextTicket = { value: scalarAiDb.getMaxTicket() + 1 };
  }

  addLog(source: "SERVER" | "EA" | "AI", level: "INFO" | "SUCCESS" | "WARNING" | "ERROR", message: string): void {
    const newLog = createSystemLog(source, level, message);
    this.systemLogs.unshift(newLog);
    if (this.systemLogs.length > 80) this.systemLogs.pop();
    persistLog(newLog);
  }

  broadcastToDashboards(payload: unknown): void {
    const message = JSON.stringify(payload);
    this.webDashboardClients.forEach((client: WebSocket) => {
      if (client.readyState === 1) {
        try {
          client.send(message);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.error(`Dashboard broadcast failed: ${reason}`);
        }
      }
    });
  }

  broadcastTradesUpdate(): void {
    this.broadcastToDashboards({ type: "trades", trades: this.tradesList, stats: this.getFullStatusPayload().stats });
  }

  getFullStatusPayload(): FullStatusPayload {
    const closedPositions = this.tradesList.filter((t: TradeRecord) => t.status === "CLOSED");
    const wins = closedPositions.filter((t: TradeRecord) => t.profit > 0).length;
    const totalProfit = closedPositions.reduce((sum: number, t: TradeRecord) => sum + t.profit, 0);
    const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;
    const openPositions = this.tradesList.filter((t: TradeRecord) => t.status === "OPEN");
    const hasSymbols = this.symbolStates.map.size > 0;
    const currentActiveSymbol = this.activeSymbol || (hasSymbols ? Array.from(this.symbolStates.map.keys())[0] : "");
    const activeState = hasSymbols
      ? getSymbolState(this.symbolStates, currentActiveSymbol)
      : createBlankSymbolState("");

    return {
      config: this.tradeConfig,
      connection: activeState.connection,
      isBridgeConnected: this.mt5BridgeClients.size > 0,
      logs: this.systemLogs,
      trades: this.tradesList,
      history: activeState.connection.isEaConnected ? activeState.ticks.slice(-50) : [],
      candles: activeState.connection.isEaConnected ? activeState.candles.slice(-100) : [],
      status: activeState.connection.isEaConnected ? "active" : "waiting",
      currentPrice: activeState.currentPrice,
      activeSymbol: currentActiveSymbol,
      symbolStates: Array.from(this.symbolStates.map.entries()).map(([symbol, state]) => ({
        symbol,
        connection: state.connection,
        currentPrice: state.currentPrice,
        tickCount: state.ticks.length,
      })),
      aiSynthesizedStrategy: this.aiSynthesizedStrategy,
      lastStrategySignal: this.lastStrategySignal,
      stats: {
        totalProfit: Number(totalProfit.toFixed(2)),
        tradesCount: closedPositions.length,
        winRate: Math.round(winRate),
        activePositionsCount: openPositions.length,
        lastHeartbeatTime: activeState.connection.lastPing,
      },
      webRequestStatus: this.webRequestTest,
    };
  }

  getAndClearPendingOrders(): BridgeOrder[] {
    const list = [...this.pendingBridgeOrders];
    this.pendingBridgeOrders = [];
    return list;
  }

  getPendingEaCommand(): { action: string; lot: number; sl: number; tp: number } | null {
    const cmd = this.pendingEaCommand;
    this.pendingEaCommand = null;
    return cmd;
  }

  updateMarket(data: UpdateMarketPayload, clientIp?: string): void {
    const symbol = (data.symbol && data.symbol.trim()) || this.activeSymbol || "Step Index";
    if (!this.activeSymbol || this.activeSymbol === "") {
      this.activeSymbol = symbol;
    }
    const result = updateMarketState(this.symbolStates, { ...data, symbol });
    const state = result.symbol;

    if (result.switched) {
      this.addLog("SERVER", "INFO", `Active market symbol updated to: ${this.symbolStates.activeSymbol}`);
    }

    const rawPrice = data.price !== undefined ? Number(data.price) : (data.close !== undefined ? Number(data.close) : state.currentPrice);
    if (!isFinite(rawPrice) || rawPrice <= 0) {
      return;
    }
    const targetPrice = rawPrice;

    const now = Date.now();

    if (state.ticks.length > 0 && Math.abs(targetPrice - state.currentPrice) < 0.0001 && state.telemetry.length > 0) {
      const lastTel = state.telemetry[state.telemetry.length - 1];
      const newVelocity = data.velocity !== undefined ? Number(data.velocity) : lastTel.velocity;
      if (Math.abs(newVelocity - lastTel.velocity) < 0.00001 && data.buyLocked === lastTel.buyLocked && data.sellLocked === lastTel.sellLocked) {
        return;
      }
    }

    const numVelocity = data.velocity !== undefined ? Number(data.velocity) : 0;
    if (!isFinite(numVelocity)) return;

    const isBuyLocked = data.buyLocked !== undefined ? Boolean(data.buyLocked) : false;
    const isSellLocked = data.sellLocked !== undefined ? Boolean(data.sellLocked) : false;
    this.latestBuyLockedFromEa = isBuyLocked;
    this.latestSellLockedFromEa = isSellLocked;

    const absVelocity = Math.abs(numVelocity);
    this.aiKnowledgeBase.totalObservations += 1;
    const obs = this.aiKnowledgeBase.totalObservations;
    this.aiKnowledgeBase.globalAverageSpeed = Number((((obs - 1) * this.aiKnowledgeBase.globalAverageSpeed + absVelocity) / obs).toFixed(4));
    if (absVelocity > this.aiKnowledgeBase.peakVelocityRegistered) {
      this.aiKnowledgeBase.peakVelocityRegistered = Number(absVelocity.toFixed(4));
    }
    if (obs % 25 === 0) {
      persistAiKnowledge(this.aiKnowledgeBase);
    }

    aggregateTickIntoCandle(state, targetPrice);

    if (!state.connection.isEaConnected) {
      this.addLog("EA", "SUCCESS", `${symbol} MT5 Expert Advisor linked! Real-time velocity baseline metric: ${numVelocity.toFixed(4)} pt/s.`);
    }

    state.connection.isEaConnected = true;
    if (!state.connection.clientIp) {
      const normalized = normalizeIp(clientIp);
      state.connection.clientIp = normalized || "127.0.0.1";
    }
    state.connection.lastPing = new Date().toISOString();
    state.connection.broker = data.broker || "MetaTrader 5 Link";
    state.connection.accountNumber = state.connection.accountNumber || data.account || "Simulated MT5 Acc";
    state.connection.balance = data.balance !== undefined ? Number(data.balance) : (state.connection.balance || 1000.0);
    state.connection.symbol = symbol;
    state.connection.symbolDigits = data.digits !== undefined ? Number(data.digits) : null;
    state.connection.symbolTickSize = data.tickSize !== undefined ? Number(data.tickSize) : null;
    state.connection.symbolDescription = data.description || null;
    state.connection.spread = data.spread !== undefined ? Number(data.spread) : null;
    state.connection.session = data.session || null;
    state.connection.margin = data.margin !== undefined ? Number(data.margin) : null;
    state.connection.leverage = data.leverage !== undefined ? Number(data.leverage) : null;
    state.connection.swapLong = data.swapLong !== undefined ? Number(data.swapLong) : null;
    state.connection.swapShort = data.swapShort !== undefined ? Number(data.swapShort) : null;
    state.connection.profitCalcMode = data.profitCalcMode !== undefined ? Number(data.profitCalcMode) : null;

    // Persist tick & connection to database with symbol
    try {
      const latestTick = state.ticks[state.ticks.length - 1];
      if (latestTick) {
        scalarAiDb.insertTick(latestTick, symbol);
      }
      scalarAiDb.upsertEaConnection(state.connection);
    } catch {
      // quiet persistence
    }

    if (this.tradeConfig.isActive) {
      evaluateSimulatedStrategy(this.buildTradeState(), this).catch((err) => {
        console.error("Strategy evaluation error on tick:", err);
      });
    }

    this.broadcastToDashboards({
      type: "tick",
      symbol,
      activeSymbol: this.activeSymbol,
      tick: state.ticks[state.ticks.length - 1],
      currentPrice: state.currentPrice,
      connection: state.connection,
      candles: state.candles.slice(-100),
      stats: this.getFullStatusPayload().stats,
      symbolStates: Array.from(this.symbolStates.map.entries()).map(([sKey, sState]) => ({
        symbol: sKey,
        connection: sState.connection,
        currentPrice: sState.currentPrice,
        tickCount: sState.ticks.length,
      })),
    });
  }

  buildTradeState(): TradeState {
    return {
      tradesList: this.tradesList,
      symbolStates: this.symbolStates,
      activeSymbol: this.activeSymbol,
      tradeConfig: this.tradeConfig,
      aiKnowledgeBase: this.aiKnowledgeBase,
      aiSynthesizedStrategy: this.aiSynthesizedStrategy,
      latestBuyLockedFromEa: this.latestBuyLockedFromEa,
      latestSellLockedFromEa: this.latestSellLockedFromEa,
      nextTicket: this.nextTicket,
      pendingBridgeOrders: this.pendingBridgeOrders,
      pendingEaCommand: this.pendingEaCommand,
      mt5BridgeClients: this.mt5BridgeClients,
    };
  }

  buildMcpContext(): McpContext {
    return {
      getStatus: () => {
        const closedPositions = this.tradesList.filter((t: TradeRecord) => t.status === "CLOSED");
        const wins = closedPositions.filter((t: TradeRecord) => t.profit > 0).length;
        const totalProfit = closedPositions.reduce((sum: number, t: TradeRecord) => sum + t.profit, 0);
        const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;
        const openPositions = this.tradesList.filter((t: TradeRecord) => t.status === "OPEN");
        const activeState = getSymbolState(this.symbolStates, this.activeSymbol);
        return {
          config: this.tradeConfig,
          connection: activeState.connection,
          isBridgeConnected: false,
          logs: this.systemLogs,
          trades: this.tradesList,
          history: activeState.connection.isEaConnected ? activeState.ticks.slice(-50) : [],
          candles: activeState.connection.isEaConnected ? activeState.candles.slice(-100) : [],
          status: activeState.connection.isEaConnected ? "active" : "waiting",
          currentPrice: activeState.currentPrice,
          activeSymbol: this.activeSymbol,
          symbolStates: Array.from(this.symbolStates.map.entries()).map(([symbol, s]) => ({
            symbol,
            connection: s.connection,
            currentPrice: s.currentPrice,
            tickCount: s.ticks.length,
          })),
          aiSynthesizedStrategy: this.aiSynthesizedStrategy,
          lastStrategySignal: this.lastStrategySignal,
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
        status: this.aiKnowledgeBase.totalObservations >= 20 ? "optimized" : "calibrating",
        message: this.aiKnowledgeBase.totalObservations >= 20 ? "Quantitative baseline calibrated." : "AI is analyzing market speed baseline... Awaiting sufficient expert data stream from MetaTrader 5 terminal.",
        count: this.aiKnowledgeBase.totalObservations,
        aiKnowledgeBase: this.aiKnowledgeBase,
        aiSynthesizedStrategy: this.aiSynthesizedStrategy,
        candleStream: getSymbolState(this.symbolStates, this.activeSymbol).ticks,
        averageVelocity: this.aiKnowledgeBase.globalAverageSpeed,
      }),
      getTrades: () => this.tradesList,
      getLogs: () => this.systemLogs,
      getConfig: () => this.tradeConfig,
      getConnection: () => getSymbolState(this.symbolStates, this.activeSymbol).connection,
      getAiStrategy: () => this.aiSynthesizedStrategy,
      getAiKnowledgeBase: () => this.aiKnowledgeBase,
      analyzeMarket: () => this.analyzeMarket(),
      synthesizeStrategy: () => Promise.resolve(this.aiSynthesizedStrategy),
      updateSettings: async (params: Partial<TradeConfig>) => Promise.resolve(this.updateSettings(params)),
      toggleTrading: async (isActive: boolean) => Promise.resolve(this.toggleTrading(isActive)),
      placeTrade: async (type: "BUY" | "SELL", reason?: string) => this.placeTrade(type, reason || "MCP initiated trade"),
      closeTrade: async (tradeId: string) => this.closeTrade(tradeId),
      resetStats: async () => Promise.resolve(this.resetStats()),
    };
  }

  loadAiSynthesizedStrategy(): void {
    const saved = scalarAiDb.getAiStrategy();
    if (saved) {
      this.aiSynthesizedStrategy = saved;
      this.addLog("AI", "SUCCESS", `Loaded persistent AI Synthesized Strategy. Name: '${saved.name}'`);
    } else {
      persistAiStrategy(this.aiSynthesizedStrategy);
      this.addLog("AI", "INFO", "Initialized fresh persistent AI strategy in SQLite.");
    }
  }

  loadAiKnowledgeBase(): void {
    const saved = scalarAiDb.getAiKnowledge();
    if (saved) {
      this.aiKnowledgeBase = saved;
      this.addLog("AI", "SUCCESS", `Loaded long-term knowledge base. Total historical observations: ${saved.totalObservations}, Glob Avg Speed: ${saved.globalAverageSpeed} pt/s.`);
    } else {
      persistAiKnowledge(this.aiKnowledgeBase);
      this.addLog("AI", "INFO", "Initialized fresh persistent knowledge base in SQLite.");
    }
  }

  runBackgroundAnalysisWorker(): void {
    try {
      const symbolTelemetry = getSymbolState(this.symbolStates, this.activeSymbol).telemetry;
      if (symbolTelemetry.length <= this.lastProcessedTelemetryIndex) return;
      const unprocessedRecords = symbolTelemetry.slice(this.lastProcessedTelemetryIndex);
      this.lastProcessedTelemetryIndex = symbolTelemetry.length;
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
      const oldTotal = this.aiKnowledgeBase.totalObservations;
      const newTotal = oldTotal + newObservationsCount;
      const currentGlobalAvgSpeed = this.aiKnowledgeBase.globalAverageSpeed;
      const updatedGlobalAvgSpeed = newTotal > 0 ? (currentGlobalAvgSpeed * oldTotal + sumAbsVelocity) / newTotal : 0;
      const updatedPeak = Math.max(this.aiKnowledgeBase.peakVelocityRegistered, localPeakVelocity);
      const updatedPatterns = { ...this.aiKnowledgeBase.timeOfDayPatterns };
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
      this.aiKnowledgeBase.totalObservations = newTotal;
      this.aiKnowledgeBase.globalAverageSpeed = Number(updatedGlobalAvgSpeed.toFixed(4));
      this.aiKnowledgeBase.peakVelocityRegistered = Number(updatedPeak.toFixed(4));
      this.aiKnowledgeBase.timeOfDayPatterns = updatedPatterns;
      this.aiKnowledgeBase.lastUpdated = new Date().toISOString();
      persistAiKnowledge(this.aiKnowledgeBase);
      this.addLog("AI", "SUCCESS", `Background worker completed quantitative study run. Observations: +${newObservationsCount} (Total: ${newTotal}). Saved to SQLite.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.addLog("SERVER", "ERROR", `Quantitative background worker failed: ${message}`);
    }
  }

  updateSettings(params: Partial<TradeConfig>): TradeConfig {
    if (params.selectedStrategy !== undefined) this.tradeConfig.selectedStrategy = params.selectedStrategy;
    if (params.lotSize !== undefined) this.tradeConfig.lotSize = Number(params.lotSize);
    if (params.takeProfitPoints !== undefined) this.tradeConfig.takeProfitPoints = Number(params.takeProfitPoints);
    if (params.stopLossPoints !== undefined) this.tradeConfig.stopLossPoints = Number(params.stopLossPoints);
    if (params.trailingStopPoints !== undefined) this.tradeConfig.trailingStopPoints = Number(params.trailingStopPoints);
    if (params.useTrailingStop !== undefined) this.tradeConfig.useTrailingStop = Boolean(params.useTrailingStop);
    if (params.maxTrades !== undefined) this.tradeConfig.maxTrades = Number(params.maxTrades);
    if (params.tradingMode !== undefined) this.tradeConfig.tradingMode = params.tradingMode;
    if (params.isAiModeEnabled !== undefined) this.tradeConfig.isAiModeEnabled = Boolean(params.isAiModeEnabled);
    this.addLog("SERVER", "WARNING", "Strategy configurations changed. Running parameters updated.");
    persistSettings(this.tradeConfig);
    this.broadcastToDashboards({ type: "config", config: this.tradeConfig });
    return this.tradeConfig;
  }

  toggleTrading(isActive: boolean): TradeConfig {
    this.tradeConfig.isActive = isActive;
    const statusLabel = this.tradeConfig.isActive ? "STARTED" : "STOPPED";
    this.addLog("SERVER", "INFO", `Trading remote state toggled to: ${statusLabel}`);
    if (!this.tradeConfig.isActive) {
      const openTrades = this.tradesList.filter((t: TradeRecord) => t.status === "OPEN");
      if (openTrades.length > 0) {
        const tradeState = this.buildTradeState();
        openTrades.forEach((t: TradeRecord) => closeSimulatedPosition(tradeState, t, "Forced termination from remote dashboard.", this));
      }
    }
    persistSettings(this.tradeConfig);
    this.broadcastToDashboards({ type: "config", config: this.tradeConfig });
    this.broadcastTradesUpdate();
    return this.tradeConfig;
  }

  async placeTrade(type: "BUY" | "SELL", reason: string): Promise<{ success: boolean; message: string }> {
    const tradeState = this.buildTradeState();
    await openSimulatedPosition(tradeState, type, reason, this);
    return { success: true, message: `Trade signal sent: ${type}` };
  }

  async closeTrade(tradeId: string): Promise<{ success: boolean; message: string }> {
    const trade = this.tradesList.find((t: TradeRecord) => t.id === tradeId && t.status === "OPEN");
    if (!trade) return { success: false, message: `Open trade with id ${tradeId} not found` };
    const tradeState = this.buildTradeState();
    closeSimulatedPosition(tradeState, trade, "Closed via MCP request.", this);
    return { success: true, message: `Trade ${tradeId} closed` };
  }

  resetStats(): void {
    this.tradesList.length = 0;
    scalarAiDb.resetTrades();
    this.addLog("SERVER", "SUCCESS", "User reset session statistics and trading history log.");
    this.broadcastTradesUpdate();
  }

  analyzeMarket(): Promise<string> {
    return Promise.resolve("Market analysis is handled by the active strategy engine. Use backtest_strategy MCP tool for performance evaluation.");
  }
}
