import { TradeConfig, TradeRecord, SystemLog, AiKnowledgeBase, AiSynthesizedStrategy, McpContext, EAConnectionDetails, Tick, FullStatusPayload, UpdateMarketPayload, BridgeOrder, AppStoreReadOnly, TradingState, BridgeState, CalibrationState, Observation, ObservationFilters, ObservationInsights, SymbolStateEntry, StrategyMode, EaCommand, EaConfirmation, EaPosition, EaLog } from "../types";
import { SymbolStates, createSymbolStates, createBlankSymbolState, getSymbolState, updateMarket as updateMarketState } from "./market-ingestion";
import { scalarAiDb } from "../db";
import { persistAiKnowledge, persistAiStrategy, persistSettings, persistEaConnection, loadStateFromDb, persistLog } from "./state-persistence";
import { evaluateSimulatedStrategy, openSimulatedPosition, closeSimulatedPosition, AppCallbacks, TradeState } from "./trade-execution";
import { getDefaultTradeConfig, getDefaultAiKnowledgeBase, getDefaultAiSynthesizedStrategy, createSystemLog } from "./defaults";
import { BacktestEngine, BacktestCandle } from "./strategy-backtest";
import { createActor } from "xstate";
import { WebSocket } from "ws";
import { normalizeIp } from "../utils/ip";
import { tradingMachine, bridgeMachine, calibrationMachine, TradingMachineService, BridgeMachineService, CalibrationMachineService } from "./trading-machine";
import { ObservationsService } from "./observations";

export class AppStore implements AppStoreReadOnly {
  private tradeConfig: TradeConfig;
  private tradesList: TradeRecord[];
  private systemLogs: SystemLog[];
  private aiKnowledgeBase: AiKnowledgeBase;
  private aiSynthesizedStrategy: AiSynthesizedStrategy;
  private lastStrategySignal: { type: string; reason: string; confidence?: number } | null;
  private symbolStates: SymbolStates;
  private activeSymbol: string;
  private lastProcessedTelemetryIndex: number;
  private nextTicket: { value: number };
  private latestBuyLockedFromEa: boolean;
  private latestSellLockedFromEa: boolean;
  private pendingBridgeOrders: BridgeOrder[];
  private pendingEaCommands: EaCommand[];
  private mt5BridgeClients: Set<WebSocket>;
  private webDashboardClients: Set<WebSocket>;
  private eaPositions: EaPosition[];
  private eaPositionsLastSync: string;
  private webRequestTest: { status: "idle" | "pending" | "success" | "failed"; lastTested: string; error: string; details: string; triggerTest: boolean };
  private tradingState: TradingMachineService;
  private bridgeState: BridgeMachineService;
  private calibrationState: CalibrationMachineService;
  private observationsService: ObservationsService;

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
    this.pendingEaCommands = [];
    this.mt5BridgeClients = new Set<WebSocket>();
    this.webDashboardClients = new Set<WebSocket>();
    this.eaPositions = [];
    this.eaPositionsLastSync = "";
    this.webRequestTest = {
      status: "idle",
      lastTested: "",
      error: "",
      details: "Awaiting first WebRequest test trigger.",
      triggerTest: false,
    };
    this.tradingState = createActor(tradingMachine).start();
    this.bridgeState = createActor(bridgeMachine).start();
    this.calibrationState = createActor(calibrationMachine).start();
    this.observationsService = new ObservationsService(scalarAiDb);
  }

  get config(): TradeConfig { return this.tradeConfig; }
  get trades(): readonly TradeRecord[] { return this.tradesList; }
  get logs(): readonly SystemLog[] { return this.systemLogs; }
  getAiKnowledgeBase(): AiKnowledgeBase { return this.aiKnowledgeBase; }
  getAiSynthesizedStrategy(): AiSynthesizedStrategy { return this.aiSynthesizedStrategy; }
  getStrategySignal(): { type: string; reason: string; confidence?: number } | null { return this.lastStrategySignal; }
  getSymbolStates(): SymbolStates { return this.symbolStates; }
  getActiveSymbol(): string { return this.activeSymbol; }
  getNextTicket(): { value: number } { return this.nextTicket; }
  getLatestBuyLockedFromEa(): boolean { return this.latestBuyLockedFromEa; }
  getLatestSellLockedFromEa(): boolean { return this.latestSellLockedFromEa; }
  getPendingBridgeOrders(): readonly BridgeOrder[] { return this.pendingBridgeOrders; }
  getMt5BridgeClients(): ReadonlySet<WebSocket> { return this.mt5BridgeClients; }
  getWebDashboardClients(): ReadonlySet<WebSocket> { return this.webDashboardClients; }
  getWebRequestTest(): { status: "idle" | "pending" | "success" | "failed"; lastTested: string; error: string; details: string; triggerTest: boolean } { return this.webRequestTest; }

  sendTradingEvent(event: "START" | "STOP"): void {
    this.tradingState.send({ type: event });
  }

  sendBridgeEvent(event: "CONNECT" | "DISCONNECT"): void {
    this.bridgeState.send({ type: event });
  }

  sendCalibrationEvent(event: "CALIBRATE"): void {
    this.calibrationState.send({ type: "CALIBRATE" });
  }

  getTradingState(): TradingState {
    return this.tradingState.getSnapshot().value as TradingState;
  }

  getBridgeState(): BridgeState {
    return this.bridgeState.getSnapshot().value as BridgeState;
  }

  getCalibrationState(): CalibrationState {
    return this.calibrationState.getSnapshot().value as CalibrationState;
  }

  updateWebRequestTest(update: { status?: "idle" | "pending" | "success" | "failed"; error?: string; details?: string; triggerTest?: boolean; lastTested?: string }): void {
    if (update.status !== undefined) this.webRequestTest.status = update.status;
    if (update.error !== undefined) this.webRequestTest.error = update.error;
    if (update.details !== undefined) this.webRequestTest.details = update.details;
    if (update.triggerTest !== undefined) this.webRequestTest.triggerTest = update.triggerTest;
    if (update.lastTested !== undefined) this.webRequestTest.lastTested = update.lastTested;
  }

  switchSymbol(symbol: string): void {
    this.activeSymbol = symbol;
    this.symbolStates.activeSymbol = symbol;
    this.addLog("SERVER", "INFO", `Active market symbol switched to: ${symbol}`);
    this.broadcastToDashboards({ type: "init", payload: this.getFullStatusPayload() });
  }

  addBridgeClient(ws: WebSocket): void {
    this.mt5BridgeClients.add(ws);
    this.sendBridgeEvent("CONNECT");
    this.broadcastToDashboards({ type: "connection", isBridgeConnected: true });
  }

  removeBridgeClient(ws: WebSocket): void {
    this.mt5BridgeClients.delete(ws);
    this.sendBridgeEvent("DISCONNECT");
    this.broadcastToDashboards({ type: "connection", isBridgeConnected: this.mt5BridgeClients.size > 0 });
  }

  addDashboardClient(ws: WebSocket): void {
    this.webDashboardClients.add(ws);
  }

  removeDashboardClient(ws: WebSocket): void {
    this.webDashboardClients.delete(ws);
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
      eaPositions: this.eaPositions,
      eaPositionsLastSync: this.eaPositionsLastSync,
    };
  }

  getAndClearPendingOrders(): BridgeOrder[] {
    const list = [...this.pendingBridgeOrders];
    this.pendingBridgeOrders = [];
    return list;
  }

  getPendingEaCommands(): EaCommand[] {
    const list = this.pendingEaCommands.filter(c => c.status === "pending");
    list.forEach(c => { c.status = "sent"; });
    return list;
  }

  handleEaConfirmation(confirmation: EaConfirmation): void {
    const cmd = this.pendingEaCommands.find(c =>
      (c.ticket === confirmation.ticket || (confirmation.action === "CLOSE_ALL" && c.action === "CLOSE_ALL")) &&
      (c.status === "sent" || c.status === "pending")
    );
    if (cmd) {
      cmd.status = confirmation.success ? "confirmed" : "failed";
      cmd.error = confirmation.error;
      if (confirmation.mt5Ticket && confirmation.mt5Ticket > 0) {
        const trade = this.tradesList.find(t => t.ticket === confirmation.ticket);
        if (trade) {
          trade.mt5Ticket = confirmation.mt5Ticket;
          try {
            scalarAiDb.updateTrade(trade.id, { ticket: confirmation.ticket });
          } catch {}
        }
      }
      this.addLog(
        "EA",
        confirmation.success ? "SUCCESS" : "ERROR",
        `Command ${cmd.action} (Ticket #${confirmation.ticket || cmd.ticket}${confirmation.mt5Ticket ? ` / MT5 #${confirmation.mt5Ticket}` : ""}) ${confirmation.success ? "executed successfully on MT5" : "failed: " + (confirmation.error || "unknown error")}`
      );
    }
  }

  handleEaPositionsReport(positions: EaPosition[]): void {
    this.eaPositions = positions;
    this.eaPositionsLastSync = new Date().toISOString();
    const state = getSymbolState(this.symbolStates, this.activeSymbol);
    state.connection.isEaConnected = true;
    state.connection.lastPing = new Date().toISOString();

    let updatedAny = false;
    const reportedMt5Tickets = new Set(positions.map(p => p.ticket));

    // 1. Sync live profits, prices, and SL/TP from EA positions into matching open trades
    for (const pos of positions) {
      let matchingTrade = this.tradesList.find(t => (t.ticket === pos.ticket || t.mt5Ticket === pos.ticket) && t.status === "OPEN");

      if (!matchingTrade) {
        matchingTrade = this.tradesList.find(t => t.status === "OPEN" && t.symbol === pos.symbol && t.type === pos.type && !t.mt5Ticket);
        if (matchingTrade) {
          matchingTrade.mt5Ticket = pos.ticket;
        }
      }

      if (matchingTrade) {
        matchingTrade.profit = pos.profit;
        if (pos.openPrice > 0) matchingTrade.entryPrice = pos.openPrice;
        if (pos.sl > 0) matchingTrade.sl = pos.sl;
        if (pos.tp > 0) matchingTrade.tp = pos.tp;
        updatedAny = true;
      } else {
        // Trade opened externally on MT5: import into tradesList so site & MCP know about it
        const importedTrade: TradeRecord = {
          id: crypto.randomUUID(),
          ticket: pos.ticket,
          mt5Ticket: pos.ticket,
          symbol: pos.symbol || this.activeSymbol,
          type: pos.type,
          entryPrice: pos.openPrice,
          lotSize: pos.volume,
          profit: pos.profit,
          status: "OPEN",
          openTime: pos.openTime || new Date().toLocaleTimeString(),
          strategy: this.tradeConfig.selectedStrategy,
          reason: "Synchronized from MetaTrader 5 terminal",
          sl: pos.sl > 0 ? pos.sl : undefined,
          tp: pos.tp > 0 ? pos.tp : undefined,
        };
        this.tradesList.unshift(importedTrade);
        try { scalarAiDb.insertTrade(importedTrade); } catch {}
        updatedAny = true;
      }
    }

    // 2. Any trade marked OPEN that was previously confirmed on MT5, but is no longer reported:
    // It was closed on MT5 (SL/TP hit, trailing stop reached, or closed by broker)
    for (const trade of this.tradesList) {
      if (trade.status === "OPEN" && trade.mt5Ticket && !reportedMt5Tickets.has(trade.mt5Ticket)) {
        trade.status = "CLOSED";
        trade.closeTime = new Date().toLocaleTimeString();
        trade.closePrice = getSymbolState(this.symbolStates, trade.symbol || this.activeSymbol).currentPrice;
        trade.reason = "Position liquidated or SL/TP hit on MetaTrader 5";
        try {
          scalarAiDb.updateTrade(trade.id, {
            status: trade.status,
            closeTime: trade.closeTime,
            closePrice: trade.closePrice,
            profit: trade.profit,
            reason: trade.reason,
          });
        } catch {}
        this.addLog("EA", "SUCCESS", `MT5 closed position #${trade.mt5Ticket} (Final Profit: ${trade.profit > 0 ? "+" : ""}$${trade.profit})`);
        updatedAny = true;
      }
    }

    if (updatedAny) {
      this.broadcastTradesUpdate();
    }
  }

  handleEaLogs(logs: EaLog[]): void {
    for (const log of logs) {
      const level = log.level === "WARN" ? "WARNING" : log.level;
      this.addLog(log.source || "EA", level, `[EA] ${log.message}`);
    }
  }

  queueEaConfigUpdate(config: Record<string, unknown>): void {
    const cmd: EaCommand = {
      id: crypto.randomUUID(),
      action: "CONFIG_UPDATE",
      symbol: this.activeSymbol,
      lot: 0,
      sl: 0,
      tp: 0,
      reason: "runtime config update",
      timestamp: Date.now(),
      status: "pending",
    };
    (cmd as any).configUpdate = config;
    this.pendingEaCommands.push(cmd);
  }

  async updateMarket(data: UpdateMarketPayload, clientIp?: string): Promise<void> {
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
    this.sendCalibrationEvent("CALIBRATE");

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

    // Store observation if velocity is significant
    if (numVelocity > 0.05) {
      this.observationsService.storeObservation({
        symbol,
        timestamp: Date.now(),
        direction: state.lastDirection,
        velocity: numVelocity,
        price: targetPrice,
        tags: this.generateObservationTags(state, numVelocity, state.lastDirection),
        metadata: {
          buyLocked: isBuyLocked,
          sellLocked: isSellLocked,
          spread: data.spread,
          session: data.session,
        }
      });
    }

    if (this.tradeConfig.isActive) {
      await evaluateSimulatedStrategy(this.buildTradeState(), this).catch((err) => {
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
      pendingEaCommands: this.pendingEaCommands,
      mt5BridgeClients: this.mt5BridgeClients,
      eaPositions: this.eaPositions,
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
          eaPositions: this.eaPositions,
          eaPositionsLastSync: this.eaPositionsLastSync,
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
      placeTrade: async (
        type: "BUY" | "SELL",
        reason?: string,
        options?: { symbol?: string; lotSize?: number; sl?: number; tp?: number }
      ) => this.placeTrade(type, reason || "MCP initiated trade", options),
      closeTrade: async (tradeId: string) => this.closeTrade(tradeId),
      closeAllTrades: async (symbol?: string) => this.closeAllTrades(symbol),
      modifyTrade: async (tradeId: string, options: { sl?: number; tp?: number }) => this.modifyTrade(tradeId, options),
      switchSymbol: (symbol: string) => this.switchSymbol(symbol),
      getSymbols: () => this.getSymbolsList(),
      resetStats: async () => Promise.resolve(this.resetStats()),
      getTradingState: () => this.getTradingState(),
      getBridgeState: () => this.getBridgeState(),
      getCalibrationState: () => this.getCalibrationState(),
      getObservations: (filters?: ObservationFilters) => this.observationsService.getObservations(filters),
      generateInsights: (symbol: string, from?: number, to?: number) => this.observationsService.generateInsights(symbol, { from, to }),
      backtestStrategyWithHistory: (strategyId: string, symbol: string, from: number, to: number, initialBalance?: number) => {
        const candles = scalarAiDb.getCandles(symbol, from, to, 10000);
        if (candles.length === 0) return { error: "No candles found" };

        const strategy = scalarAiDb.getStrategyById(strategyId);
        if (!strategy) return { error: "Strategy not found" };

        const engine = new BacktestEngine();
        const backtestMode = strategy.mode as unknown as StrategyMode;
        const result = engine.runBacktest(backtestMode, candles.map(c => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          direction: c.direction,
          volume: c.volume || undefined,
        })), this.config);

        engine.saveResult(result);
        return result;
      },
    };
  }

  private generateObservationTags(state: SymbolStateEntry, velocity: number, direction: string): string[] {
    const tags: string[] = [];
    if (velocity > 0.3) tags.push("high_velocity");
    else if (velocity > 0.15) tags.push("medium_velocity");
    else tags.push("low_velocity");

    if (direction === "up") tags.push("bullish");
    else if (direction === "down") tags.push("bearish");

    const hour = new Date().getHours();
    if (hour >= 9 && hour <= 12) tags.push("morning_session");
    else if (hour >= 14 && hour <= 17) tags.push("afternoon_session");

    return tags;
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

    // Sync parameters dynamically to connected MT5 EA
    this.queueEaConfigUpdate({
      lotSize: this.tradeConfig.lotSize,
      stopLossPoints: this.tradeConfig.stopLossPoints,
      takeProfitPoints: this.tradeConfig.takeProfitPoints,
      trailingStopPoints: this.tradeConfig.useTrailingStop ? this.tradeConfig.trailingStopPoints : 0,
      trailingStepPoints: 10,
      maxTrades: this.tradeConfig.maxTrades,
    });

    return this.tradeConfig;
  }

  toggleTrading(isActive: boolean): TradeConfig {
    this.tradeConfig.isActive = isActive;
    this.sendTradingEvent(isActive ? "START" : "STOP");
    const statusLabel = this.tradeConfig.isActive ? "STARTED" : "STOPPED";
    this.addLog("SERVER", "INFO", `Trading remote state toggled to: ${statusLabel}`);
    if (!this.tradeConfig.isActive) {
      const openTrades = this.tradesList.filter((t: TradeRecord) => t.status === "OPEN");
      if (openTrades.length > 0) {
        const tradeState = this.buildTradeState();
        openTrades.forEach((t: TradeRecord) => closeSimulatedPosition(tradeState, t, "Forced termination from remote dashboard.", this));
      }
      this.pendingEaCommands.push({
        id: crypto.randomUUID(),
        action: "CLOSE_ALL",
        symbol: this.activeSymbol,
        lot: 0,
        sl: 0,
        tp: 0,
        reason: "Trading deactivated from dashboard",
        timestamp: Date.now(),
        status: "pending",
      });
    }
    persistSettings(this.tradeConfig);
    this.broadcastToDashboards({ type: "config", config: this.tradeConfig });
    this.broadcastTradesUpdate();
    return this.tradeConfig;
  }

  async placeTrade(
    type: "BUY" | "SELL",
    reason: string,
    options?: { symbol?: string; lotSize?: number; sl?: number; tp?: number }
  ): Promise<{ success: boolean; message: string; ticket?: number }> {
    const tradeState = this.buildTradeState();
    const ticket = await openSimulatedPosition(tradeState, type, reason, this, options);
    if (ticket !== undefined) {
      return { success: true, message: `Trade #${ticket} placed: ${type} on ${options?.symbol || this.activeSymbol}`, ticket };
    }
    return { success: false, message: `Trade execution blocked by risk controls or opposite positions.` };
  }

  async modifyTrade(
    tradeId: string,
    options: { sl?: number; tp?: number }
  ): Promise<{ success: boolean; message: string }> {
    const trade = this.tradesList.find(t => (t.id === tradeId || String(t.ticket) === tradeId || String(t.mt5Ticket) === tradeId) && t.status === "OPEN");
    if (!trade) return { success: false, message: `Open trade with ID or ticket ${tradeId} not found` };

    if (options.sl !== undefined) trade.sl = options.sl;
    if (options.tp !== undefined) trade.tp = options.tp;

    const targetTicket = trade.mt5Ticket || trade.ticket;
    const cmd: EaCommand = {
      id: crypto.randomUUID(),
      action: "MODIFY_POSITION",
      symbol: trade.symbol || this.activeSymbol,
      lot: trade.lotSize,
      sl: options.sl ?? (trade.sl || 0),
      tp: options.tp ?? (trade.tp || 0),
      ticket: targetTicket,
      reason: "SL/TP modified from remote dashboard / MCP",
      timestamp: Date.now(),
      status: "pending",
    };
    this.pendingEaCommands.push(cmd);
    this.broadcastTradesUpdate();
    this.addLog("SERVER", "INFO", `Queued SL/TP modification for Trade #${trade.ticket} [${trade.symbol || this.activeSymbol}] (SL: ${options.sl ?? "keep"}, TP: ${options.tp ?? "keep"})`);
    return { success: true, message: `Queued modification for trade #${trade.ticket}` };
  }

  async closeTrade(tradeId: string): Promise<{ success: boolean; message: string }> {
    const trade = this.tradesList.find((t: TradeRecord) => (t.id === tradeId || String(t.ticket) === tradeId || String(t.mt5Ticket) === tradeId) && t.status === "OPEN");
    if (!trade) return { success: false, message: `Open trade with id ${tradeId} not found` };
    const tradeState = this.buildTradeState();
    closeSimulatedPosition(tradeState, trade, "Closed via MCP / web request.", this);
    return { success: true, message: `Trade ${tradeId} closed` };
  }

  async closeAllTrades(symbol?: string): Promise<{ success: boolean; closedCount: number; message: string }> {
    const targetSymbol = symbol?.trim();
    const openTrades = this.tradesList.filter((t: TradeRecord) => t.status === "OPEN" && (!targetSymbol || t.symbol === targetSymbol));
    const tradeState = this.buildTradeState();
    openTrades.forEach((t: TradeRecord) => closeSimulatedPosition(tradeState, t, "Liquidated via command.", this));

    // Also queue global CLOSE_ALL to MT5
    this.pendingEaCommands.push({
      id: crypto.randomUUID(),
      action: "CLOSE_ALL",
      symbol: targetSymbol || this.activeSymbol,
      lot: 0,
      sl: 0,
      tp: 0,
      reason: "Liquidate all positions command",
      timestamp: Date.now(),
      status: "pending",
    });

    return { success: true, closedCount: openTrades.length, message: `Liquidated ${openTrades.length} open position(s).` };
  }

  getSymbolsList(): Array<{ symbol: string; isConnected: boolean; currentPrice: number; tickCount: number; digits?: number | null; tickSize?: number | null }> {
    const known = new Set<string>();
    Array.from(this.symbolStates.map.keys()).forEach((s) => known.add(s));
    scalarAiDb.getKnownSymbols().forEach((s) => known.add(s));

    return Array.from(known).map((symbol) => {
      const state = this.symbolStates.map.get(symbol);
      return {
        symbol,
        isConnected: !!state?.connection.isEaConnected,
        currentPrice: state?.currentPrice || 0,
        tickCount: state?.ticks.length || 0,
        digits: state?.connection.symbolDigits ?? null,
        tickSize: state?.connection.symbolTickSize ?? null,
      };
    });
  }

  ingestBulkCandles(
    symbolName: string,
    candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number; direction?: string }>,
    metadata?: { digits?: number; tickSize?: number }
  ): void {
    const symbol = (symbolName && symbolName.trim()) || this.activeSymbol || "Step Index";
    if (!this.activeSymbol || this.activeSymbol === "") {
      this.activeSymbol = symbol;
    }
    const state = getSymbolState(this.symbolStates, symbol);
    state.connection.isEaConnected = true;
    state.connection.symbol = symbol;
    state.connection.lastPing = new Date().toISOString();
    if (metadata?.digits !== undefined) state.connection.symbolDigits = metadata.digits;
    if (metadata?.tickSize !== undefined) state.connection.symbolTickSize = metadata.tickSize;

    if (candles && candles.length > 0) {
      const latest = candles[candles.length - 1];
      state.currentPrice = latest.close;
      state.candles = candles.slice(-500).map((c) => ({
        time: c.time > 1000000000000 ? c.time : c.time * 1000,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
        direction: (c.close >= c.open ? "up" : "down") as "up" | "down",
      }));
      state.ticks = candles.slice(-100).map((c) => ({
        time: c.time > 1000000000000 ? c.time : c.time * 1000,
        price: c.close,
        direction: (c.close >= c.open ? "up" : "down") as "up" | "down",
      }));

      const candleRows = candles.map((c) => {
        const timeMs = c.time > 1000000000000 ? c.time : c.time * 1000;
        return {
          symbol,
          time: timeMs,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume ?? 0,
          direction: (c.direction || (c.close >= c.open ? "up" : "down")) as "up" | "down" | "flat",
          minute_bucket: Math.floor(timeMs / 60000) * 60000,
        };
      });
      scalarAiDb.insertCandlesBatch(candleRows);
      this.addLog("EA", "SUCCESS", `Loaded ${candles.length} historical bars for ${symbol} from MT5.`);
    }

    try {
      scalarAiDb.upsertEaConnection(state.connection);
    } catch {}

    this.broadcastToDashboards({ type: "init", payload: this.getFullStatusPayload() });
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
