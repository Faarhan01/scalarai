import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import { corsMiddleware } from "./middleware/cors";
import { loggerMiddleware } from "./middleware/logger";
import { errorMiddleware } from "./middleware/error";
import { registerEaRoutes } from "./routes/ea";
import { registerMarketRoutes } from "./routes/market";
import { registerSettingsRoutes } from "./routes/settings";
import { registerTradeRoutes } from "./routes/trades";
import { registerAiRoutes } from "./routes/ai";
import { registerMcpRoute } from "./routes/mcp";
import { registerStatusRoute } from "./routes/status";
import { registerHealthRoutes } from "./routes/health";
import { registerStrategyRoutes } from "./routes/strategies";
import { createBridgeServer } from "./websockets/bridge";
import { createDashboardServer } from "./websockets/dashboard";
import { McpContext } from "./types";
import { getDefaultTradeConfig, getDefaultAiKnowledgeBase, getDefaultAiSynthesizedStrategy, createSystemLog } from "./services/defaults";
import { StrategyMode, TradeRecord, AiSynthesizedStrategy, EAConnectionDetails, Tick, SystemLog } from "./types";
import { scalarAiDb } from "./db";
import { evaluateStrategy, buildContext, evaluateStrategyBacktest } from "./services/strategy";
import { createSymbolStates, getSymbolState, updateMarket as updateMarketState, aggregateTickIntoCandle } from "./services/market-ingestion";
import { rateLimit } from "./middleware/rateLimit";

dotenv.config();
process.env.PORT = process.env.PORT || "3000";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(corsMiddleware);
app.use(loggerMiddleware);
app.use(errorMiddleware);
app.use(rateLimit());

// Global state
let tradeConfig = getDefaultTradeConfig();
let pendingBridgeOrders: any[] = [];
let pendingEaCommand: { action: string; lot: number; sl: number; tp: number } | null = null;
const symbolStates = createSymbolStates("Step Index");
let activeSymbol = "Step Index";

const webRequestTest: { status: "idle" | "pending" | "success" | "failed"; lastTested: string; error: string; details: string; triggerTest: boolean } = {
  status: "idle",
  lastTested: "",
  error: "",
  details: "Awaiting first WebRequest test trigger.",
  triggerTest: false,
};
let systemLogs: SystemLog[] = [];
let tradesList: TradeRecord[] = [];
let nextTicket = 837201;
let latestBuyLockedFromEa = false;
let latestSellLockedFromEa = false;
let aiKnowledgeBase = getDefaultAiKnowledgeBase();
let lastStrategySignal: { type: string; reason: string; confidence?: number } | null = null;
let aiSynthesizedStrategy = getDefaultAiSynthesizedStrategy();
let lastProcessedTelemetryIndex = 0;

function loadStateFromDb() {
  const savedConfig = scalarAiDb.getSettings();
  if (savedConfig) {
    tradeConfig = savedConfig;
  }
  const savedKnowledge = scalarAiDb.getAiKnowledge();
  if (savedKnowledge) {
    aiKnowledgeBase = savedKnowledge;
  }
  const savedStrategy = scalarAiDb.getAiStrategy();
  if (savedStrategy) {
    aiSynthesizedStrategy = savedStrategy;
  }
  tradesList = scalarAiDb.getTrades();
  systemLogs = scalarAiDb.getLogs(80);
}

function persistTrade(trade: TradeRecord) {
  scalarAiDb.insertTrade(trade);
}

function persistLog(log: SystemLog) {
  scalarAiDb.insertLog(log);
}

function persistAiKnowledge() {
  scalarAiDb.upsertAiKnowledge(aiKnowledgeBase);
}

function persistAiStrategy() {
  scalarAiDb.upsertAiStrategy(aiSynthesizedStrategy);
}

function persistSettings() {
  scalarAiDb.upsertSettings(tradeConfig);
}

function persistEaConnection(conn: EAConnectionDetails) {
  scalarAiDb.upsertEaConnection(conn);
}

function addLog(source: "SERVER" | "EA" | "AI", level: "INFO" | "SUCCESS" | "WARNING" | "ERROR", message: string) {
  const newLog = createSystemLog(source, level, message);
  systemLogs.unshift(newLog);
  if (systemLogs.length > 80) systemLogs.pop();
  persistLog(newLog);
}

function broadcastToDashboards(payload: unknown) {
  const message = JSON.stringify(payload);
  webDashboardClients.forEach((client: WebSocket) => {
    if (client.readyState === 1) {
      try { client.send(message); } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`Dashboard broadcast failed: ${reason}`);
      }
    }
  });
}

function broadcastTradesUpdate() {
  broadcastToDashboards({ type: "trades", trades: tradesList, stats: getFullStatusPayload().stats });
}

const mt5BridgeClients = new Set<WebSocket>();
const webDashboardClients = new Set<WebSocket>();

function getFullStatusPayload() {
  const closedPositions = tradesList.filter((t: any) => t.status === "CLOSED");
  const wins = closedPositions.filter((t: any) => t.profit > 0).length;
  const totalProfit = closedPositions.reduce((sum: number, t: any) => sum + t.profit, 0);
  const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;
  const openPositions = tradesList.filter((t: any) => t.status === "OPEN");
  const activeState = getSymbolState(symbolStates, activeSymbol);

  return {
    config: tradeConfig,
    connection: activeState.connection,
    isBridgeConnected: mt5BridgeClients.size > 0,
    logs: systemLogs,
    trades: tradesList,
    history: activeState.connection.isEaConnected ? activeState.ticks.slice(-50) : [],
    candles: activeState.connection.isEaConnected ? activeState.candles.slice(-100) : [],
    status: activeState.connection.isEaConnected ? "active" : "waiting",
    currentPrice: activeState.currentPrice,
    activeSymbol,
    symbolStates: Array.from(symbolStates.map.entries()).map(([symbol, state]) => ({
      symbol,
      connection: state.connection,
      currentPrice: state.currentPrice,
      tickCount: state.ticks.length,
    })),
    aiSynthesizedStrategy,
    lastStrategySignal,
    stats: {
      totalProfit: Number(totalProfit.toFixed(2)),
      tradesCount: closedPositions.length,
      winRate: Math.round(winRate),
      activePositionsCount: openPositions.length,
      lastHeartbeatTime: activeState.connection.lastPing,
    },
    webRequestStatus: webRequestTest,
  };
}

function getMinuteBucket(ts: number): number {
  return Math.floor(ts / 60000);
}

function updateMarket(data: any, clientIp?: string) {
  const result = updateMarketState(symbolStates, data);
  const state = result.symbol;
  const symbol = data.symbol || symbolStates.activeSymbol || "Step Index";
  
  if (result.switched) {
    addLog("SERVER", "INFO", `Switched active symbol to: ${symbolStates.activeSymbol}`);
  }
  
  // Validate and sanitize incoming data
  const rawPrice = data.price !== undefined ? Number(data.price) : (data.close !== undefined ? Number(data.close) : state.currentPrice);
  if (!isFinite(rawPrice) || rawPrice <= 0) {
    return;
  }
  const targetPrice = rawPrice;
  
  const now = Date.now();
  
  // Lightweight deduplication: skip only if literally identical tick
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
  latestBuyLockedFromEa = isBuyLocked;
  latestSellLockedFromEa = isSellLocked;

  // Incremental online speed calibration study
  const absVelocity = Math.abs(numVelocity);
  aiKnowledgeBase.totalObservations += 1;
  const obs = aiKnowledgeBase.totalObservations;
  aiKnowledgeBase.globalAverageSpeed = Number((((obs - 1) * aiKnowledgeBase.globalAverageSpeed + absVelocity) / obs).toFixed(4));
  if (absVelocity > aiKnowledgeBase.peakVelocityRegistered) {
    aiKnowledgeBase.peakVelocityRegistered = Number(absVelocity.toFixed(4));
  }
  if (obs % 25 === 0) {
    persistAiKnowledge();
  }

  aggregateTickIntoCandle(getSymbolState(symbolStates, activeSymbol), targetPrice);

  if (!getSymbolState(symbolStates, activeSymbol).connection.isEaConnected) {
    addLog("EA", "SUCCESS", `${symbol} MT5 Expert Advisor linked! Real-time velocity baseline metric: ${numVelocity.toFixed(4)} pt/s.`);
  }

  const activeState = getSymbolState(symbolStates, activeSymbol);
  activeState.connection.isEaConnected = true;
  if (!activeState.connection.clientIp) {
    activeState.connection.clientIp = clientIp || "127.0.0.1";
  }
  activeState.connection.lastPing = new Date().toISOString();
  activeState.connection.broker = data.broker || "MetaTrader 5 Link";
  activeState.connection.accountNumber = activeState.connection.accountNumber || data.account || "Simulated MT5 Acc";
  activeState.connection.balance = data.balance !== undefined ? Number(data.balance) : (activeState.connection.balance || 1000.0);
  activeState.connection.symbol = symbol;
  activeState.connection.symbolDigits = data.digits !== undefined ? Number(data.digits) : null;
  activeState.connection.symbolTickSize = data.tickSize !== undefined ? Number(data.tickSize) : null;
  activeState.connection.symbolDescription = data.description || null;
  activeState.connection.spread = data.spread !== undefined ? Number(data.spread) : null;
  activeState.connection.session = data.session || null;
  activeState.connection.margin = data.margin !== undefined ? Number(data.margin) : null;
  activeState.connection.leverage = data.leverage !== undefined ? Number(data.leverage) : null;
  activeState.connection.swapLong = data.swapLong !== undefined ? Number(data.swapLong) : null;
  activeState.connection.swapShort = data.swapShort !== undefined ? Number(data.swapShort) : null;
  activeState.connection.profitCalcMode = data.profitCalcMode !== undefined ? Number(data.profitCalcMode) : null;

  // Real-time strategy evaluation when automated trading is active
  if (tradeConfig.isActive) {
    evaluateSimulatedStrategy().catch((err) => {
      console.error("Strategy evaluation error on tick:", err);
    });
  }

  broadcastToDashboards({
    type: "tick",
    symbol,
    tick: state.ticks[state.ticks.length - 1],
    currentPrice: state.currentPrice,
    connection: state.connection,
    candles: state.candles.slice(-100),
    stats: getFullStatusPayload().stats,
  });
}

function getClosePrices() {
  const state = getSymbolState(symbolStates, activeSymbol);
  return state.ticks.map(t => (t.close !== undefined ? t.close : t.price));
}

function calculateEMA(prices: number[], period: number): number {
  const state = getSymbolState(symbolStates, activeSymbol);
  if (prices.length === 0) return state.currentPrice;
  if (prices.length < period) return prices.reduce((a, b) => a + b, 0) / prices.length;
  let ema = prices[0];
  const coeff = 2 / (period + 1);
  for (let i = 1; i < prices.length; i++) ema = prices[i] * coeff + ema * (1 - coeff);
  return ema;
}

function calculateRSI(prices: number[], period: number = 10): number {
  if (prices.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateATR(period: number = 10): number {
  const state = getSymbolState(symbolStates, activeSymbol);
  if (state.ticks.length < 2) return 0.5;
  const trs: number[] = [];
  for (let i = 1; i < state.ticks.length; i++) {
    const prev = state.ticks[i - 1];
    const curr = state.ticks[i];
    const prevClose = prev.close !== undefined ? prev.close : prev.price;
    const currHigh = curr.high !== undefined ? curr.high : curr.price;
    const currLow = curr.low !== undefined ? curr.low : curr.price;
    const tr = Math.max(currHigh - currLow, Math.abs(currHigh - prevClose), Math.abs(currLow - prevClose));
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  if (slice.length === 0) return 0.5;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function calculateBollingerBands(prices: number[], period: number = 15, numDevs: number = 2): { upper: number; middle: number; lower: number } {
  const state = getSymbolState(symbolStates, activeSymbol);
  if (prices.length === 0) return { upper: state.currentPrice, middle: state.currentPrice, lower: state.currentPrice };
  const slice = prices.slice(-period);
  const middle = slice.reduce((sum, p) => sum + p, 0) / slice.length;
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / slice.length;
  const stdDev = Math.sqrt(variance) || 0.1;
  return { upper: middle + numDevs * stdDev, middle, lower: middle - numDevs * stdDev };
}

async function evaluateSimulatedStrategy() {
  const MIN_SAFETY_CALIBRATION_THRESHOLD = 20;
  if (aiKnowledgeBase.totalObservations < MIN_SAFETY_CALIBRATION_THRESHOLD) return;
  if (getSymbolState(symbolStates, activeSymbol).ticks.length < 5) return;

  const ticks = getSymbolState(symbolStates, activeSymbol).ticks;
  const openTrades = tradesList.filter((t: any) => t.status === "OPEN");

  openTrades.forEach((trade: any) => {
    let priceDiff = trade.type === "BUY" ? getSymbolState(symbolStates, activeSymbol).currentPrice - trade.entryPrice : trade.entryPrice - getSymbolState(symbolStates, activeSymbol).currentPrice;
    const pointsDiff = Math.abs(priceDiff) * 100;
    if (pointsDiff >= tradeConfig.takeProfitPoints && priceDiff > 0) closeSimulatedPosition(trade, `TAKE PROFIT reached on ${activeSymbol} limit (+${pointsDiff.toFixed(1)} pts).`);
    else if (pointsDiff >= tradeConfig.stopLossPoints && priceDiff < 0) closeSimulatedPosition(trade, `STOP LOSS reached on ${activeSymbol} risk boundary (-${pointsDiff.toFixed(1)} pts).`);
    else if (tradeConfig.useTrailingStop && priceDiff > 0) {
      const distancePoints = priceDiff * 100;
      if (distancePoints > tradeConfig.trailingStopPoints) {
        const atr = calculateATR(10);
        const atrPoints = atr * 100;
        const profitLockPoints = distancePoints * 0.5;
        const potentialRetracement = distancePoints - profitLockPoints;
        if (potentialRetracement < atrPoints) closeSimulatedPosition(trade, `TRAILING STOP triggered: locked in +${profitLockPoints.toFixed(1)} pts of profit.`);
      }
    }
  });

  const activeBuyExists = openTrades.some((t: any) => t.type === "BUY") || latestBuyLockedFromEa;
  const activeSellExists = openTrades.some((t: any) => t.type === "SELL") || latestSellLockedFromEa;

  if (openTrades.length >= tradeConfig.maxTrades) return;

  const ctx = buildContext(
    ticks,
    aiKnowledgeBase,
    aiSynthesizedStrategy,
    tradeConfig.tradingMode || "Scalping",
    openTrades.length,
    activeBuyExists,
    activeSellExists
  );

  const signal = evaluateStrategy(tradeConfig.selectedStrategy, ctx, tradeConfig);
  lastStrategySignal = signal;
  if (signal.type !== "HOLD") {
    await openSimulatedPosition(signal.type, signal.reason);
    addLog("SERVER", "INFO", `Strategy signal: ${signal.type} - ${signal.reason}`);
  }
}

async function openSimulatedPosition(type: "BUY" | "SELL", reason: string) {
  const openTrades = tradesList.filter((t: any) => t.status === "OPEN");
  const activeBuyExists = openTrades.some((t: any) => t.type === "BUY") || latestBuyLockedFromEa;
  const activeSellExists = openTrades.some((t: any) => t.type === "SELL") || latestSellLockedFromEa;

  if (type === "BUY" && activeSellExists) {
    addLog("SERVER", "ERROR", "Block BUY Execution: Gatekeeper locked because of active opposite SELL position(s).");
    return;
  }
  if (type === "SELL" && activeBuyExists) {
    addLog("SERVER", "ERROR", "Block SELL Execution: Gatekeeper locked because of active opposite BUY position(s).");
    return;
  }
  if (openTrades.length >= tradeConfig.maxTrades) {
    addLog("SERVER", "WARNING", "Block Trade Execution: Max trade boundary hit.");
    return;
  }

  const slApplied = Math.round(Number(tradeConfig.stopLossPoints || 0) * (aiSynthesizedStrategy.rules.slPointsMultiplier || 1.0));
  const tpApplied = Math.round(Number(tradeConfig.takeProfitPoints || 0) * (aiSynthesizedStrategy.rules.tpPointsMultiplier || 1.0));
  const tId = crypto.randomUUID();
  const newTrade: TradeRecord = {
    id: tId,
    ticket: nextTicket++,
    type,
    entryPrice: getSymbolState(symbolStates, activeSymbol).currentPrice,
    lotSize: tradeConfig.lotSize,
    profit: 0,
    status: "OPEN",
    openTime: new Date().toLocaleTimeString(),
    strategy: tradeConfig.selectedStrategy,
    reason,
  };
  tradesList.unshift(newTrade);
  addLog("SERVER", "SUCCESS", `Open simulated MT5 position ticket #${newTrade.ticket} - ${type} at ${getSymbolState(symbolStates, activeSymbol).currentPrice} (Dynamic SL: ${slApplied} pts, TP: ${tpApplied} pts scaled by AI Strategy rules)`);
  const orderPayload = { action: (type || "BUY").toUpperCase(), symbol: activeSymbol, volume: Number(tradeConfig.lotSize || 0.1), sl: slApplied, tp: tpApplied };
  pendingBridgeOrders.push({ ...orderPayload, id: newTrade.id, ticket: newTrade.ticket, timestamp: Date.now() });
  pendingEaCommand = { action: (type || "BUY").toUpperCase(), lot: Number(tradeConfig.lotSize || 0.1), sl: slApplied, tp: tpApplied };
  mt5BridgeClients.forEach((client: WebSocket) => {
    if (client.readyState === 1) {
      try { client.send(JSON.stringify(orderPayload)); } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`Bridge order broadcast failed: ${reason}`);
      }
    }
  });
  broadcastTradesUpdate();
}

function closeSimulatedPosition(trade: TradeRecord, reason: string) {
  trade.status = "CLOSED";
  trade.closePrice = getSymbolState(symbolStates, activeSymbol).currentPrice;
  trade.closeTime = new Date().toLocaleTimeString();
  const profitFactor = trade.type === "BUY" ? getSymbolState(symbolStates, activeSymbol).currentPrice - trade.entryPrice : trade.entryPrice - getSymbolState(symbolStates, activeSymbol).currentPrice;
  const finalProfit = Number((profitFactor * 10.0 * trade.lotSize).toFixed(2));
  trade.profit = finalProfit;
  trade.reason = reason;
  addLog("SERVER", "SUCCESS", `Simulated Trade #${trade.ticket} CLOSED. Profit: ${finalProfit > 0 ? "+" : ""}$${finalProfit}`);
  const closePayload = { action: "CLOSE_ALL", symbol: activeSymbol, volume: trade.lotSize, sl: 0, tp: 0 };
  pendingBridgeOrders.push({ ...closePayload, id: trade.id, timestamp: Date.now() });
  pendingEaCommand = { action: "CLOSE_ALL", lot: trade.lotSize, sl: 0, tp: 0 };
  mt5BridgeClients.forEach((client: WebSocket) => {
    if (client.readyState === 1) {
      try { client.send(JSON.stringify(closePayload)); } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`Bridge close broadcast failed: ${reason}`);
      }
    }
  });
  broadcastTradesUpdate();
}

function loadAiSynthesizedStrategy() {
  const saved = scalarAiDb.getAiStrategy();
  if (saved) {
    aiSynthesizedStrategy = saved;
    addLog("AI", "SUCCESS", `Loaded persistent AI Synthesized Strategy. Name: '${aiSynthesizedStrategy.name}'`);
  } else {
    persistAiStrategy();
    addLog("AI", "INFO", "Initialized fresh persistent AI strategy in SQLite.");
  }
}

function loadAiKnowledgeBase() {
  const saved = scalarAiDb.getAiKnowledge();
  if (saved) {
    aiKnowledgeBase = saved;
    addLog("AI", "SUCCESS", `Loaded long-term knowledge base. Total historical observations: ${aiKnowledgeBase.totalObservations}, Glob Avg Speed: ${aiKnowledgeBase.globalAverageSpeed} pt/s.`);
  } else {
    persistAiKnowledge();
    addLog("AI", "INFO", "Initialized fresh persistent knowledge base in SQLite.");
  }
}

function runBackgroundAnalysisWorker() {
  try {
    const symbolTelemetry = getSymbolState(symbolStates, activeSymbol).telemetry;
    if (symbolTelemetry.length <= lastProcessedTelemetryIndex) return;
    const unprocessedRecords = symbolTelemetry.slice(lastProcessedTelemetryIndex);
    lastProcessedTelemetryIndex = symbolTelemetry.length;
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
    const oldTotal = aiKnowledgeBase.totalObservations;
    const newTotal = oldTotal + newObservationsCount;
    const currentGlobalAvgSpeed = aiKnowledgeBase.globalAverageSpeed;
    const updatedGlobalAvgSpeed = newTotal > 0 ? (currentGlobalAvgSpeed * oldTotal + sumAbsVelocity) / newTotal : 0;
    const updatedPeak = Math.max(aiKnowledgeBase.peakVelocityRegistered, localPeakVelocity);
    const updatedPatterns = { ...aiKnowledgeBase.timeOfDayPatterns };
    for (const hour of Object.keys(hourGroups)) {
      const speeds = hourGroups[hour];
      const newSpeedSum = speeds.reduce((sum, s) => sum + s, 0);
      const newSpeedCount = speeds.length;
      if (!updatedPatterns[hour]) updatedPatterns[hour] = { count: 0, avgSpeed: 0 };
      const oldHourData = updatedPatterns[hour];
      const totalHourCount = oldHourData.count + newSpeedCount;
      const updatedHourAvgSpeed = totalHourCount > 0 ? (oldHourData.avgSpeed * oldHourData.count + newSpeedSum) / totalHourCount : 0;
      updatedPatterns[hour] = { count: totalHourCount, avgSpeed: Number(updatedHourAvgSpeed.toFixed(4)) };
    }
    aiKnowledgeBase.totalObservations = newTotal;
    aiKnowledgeBase.globalAverageSpeed = Number(updatedGlobalAvgSpeed.toFixed(4));
    aiKnowledgeBase.peakVelocityRegistered = Number(updatedPeak.toFixed(4));
    aiKnowledgeBase.timeOfDayPatterns = updatedPatterns;
    aiKnowledgeBase.lastUpdated = new Date().toISOString();
    persistAiKnowledge();
    addLog("AI", "SUCCESS", `Background worker completed quantitative study run. Observations: +${newObservationsCount} (Total: ${newTotal}). Saved to SQLite.`);
  } catch (err: any) {
    addLog("SERVER", "ERROR", `Quantitative background worker failed: ${err.message || err}`);
  }
}

async function analyzeMarket(): Promise<string> {
  return "Market analysis is handled by the active strategy engine. Use backtest_strategy MCP tool for performance evaluation.";
}

async function synthesizeStrategy(): Promise<AiSynthesizedStrategy> {
  return aiSynthesizedStrategy;
}

function updateSettings(params: any) {
  if (params.selectedStrategy !== undefined) tradeConfig.selectedStrategy = params.selectedStrategy;
  if (params.lotSize !== undefined) tradeConfig.lotSize = Number(params.lotSize);
  if (params.takeProfitPoints !== undefined) tradeConfig.takeProfitPoints = Number(params.takeProfitPoints);
  if (params.stopLossPoints !== undefined) tradeConfig.stopLossPoints = Number(params.stopLossPoints);
  if (params.trailingStopPoints !== undefined) tradeConfig.trailingStopPoints = Number(params.trailingStopPoints);
  if (params.useTrailingStop !== undefined) tradeConfig.useTrailingStop = Boolean(params.useTrailingStop);
  if (params.maxTrades !== undefined) tradeConfig.maxTrades = Number(params.maxTrades);
  if (params.tradingMode !== undefined) tradeConfig.tradingMode = params.tradingMode;
  if (params.isAiModeEnabled !== undefined) tradeConfig.isAiModeEnabled = Boolean(params.isAiModeEnabled);
  addLog("SERVER", "WARNING", "Strategy configurations changed. Running parameters updated.");
  persistSettings();
  broadcastToDashboards({ type: "config", config: tradeConfig });
  return tradeConfig;
}

function toggleTrading(isActive: boolean) {
  tradeConfig.isActive = isActive;
  const statusLabel = tradeConfig.isActive ? "STARTED" : "STOPPED";
  addLog("SERVER", "INFO", `Trading remote state toggled to: ${statusLabel}`);
  if (!tradeConfig.isActive) {
    const openTrades = tradesList.filter((t: any) => t.status === "OPEN");
    if (openTrades.length > 0) {
      openTrades.forEach((t: any) => closeSimulatedPosition(t, "Forced termination from remote dashboard."));
    }
  }
  persistSettings();
  broadcastToDashboards({ type: "config", config: tradeConfig });
  broadcastTradesUpdate();
  return tradeConfig;
}

async function placeTrade(type: "BUY" | "SELL", reason?: string) {
  await openSimulatedPosition(type, reason || "MCP initiated trade");
  return { success: true, message: `Trade signal sent: ${type}` };
}

async function closeTrade(tradeId: string) {
  const trade = tradesList.find((t: any) => t.id === tradeId && t.status === "OPEN");
  if (!trade) return { success: false, message: `Open trade with id ${tradeId} not found` };
  closeSimulatedPosition(trade, "Closed via MCP request.");
  return { success: true, message: `Trade ${tradeId} closed` };
}

function resetStats() {
  tradesList.length = 0;
  scalarAiDb.resetTrades();
  addLog("SERVER", "SUCCESS", "User reset session statistics and trading history log.");
  broadcastTradesUpdate();
}

const mcpContext: McpContext = {
  getStatus: () => getFullStatusPayload(),
  getAiStudyFeed: async () => ({ status: "calibrating", message: "AI is calibrating...", count: 0, aiKnowledgeBase, aiSynthesizedStrategy, candleStream: getSymbolState(symbolStates, activeSymbol).ticks, averageVelocity: 0 }),
  getTrades: () => tradesList,
  getLogs: () => systemLogs,
  getConfig: () => tradeConfig,
  getConnection: () => getSymbolState(symbolStates, activeSymbol).connection,
  getAiStrategy: () => aiSynthesizedStrategy,
  getAiKnowledgeBase: () => aiKnowledgeBase,
  analyzeMarket,
  synthesizeStrategy,
  updateSettings: async (params) => Promise.resolve(updateSettings(params)),
  toggleTrading: async (isActive) => Promise.resolve(toggleTrading(isActive)),
  placeTrade,
  closeTrade,
  resetStats: async () => Promise.resolve(resetStats()),
};

async function startServer() {
  loadStateFromDb();

  setInterval(() => { runBackgroundAnalysisWorker(); }, 300000);
  setInterval(() => {
    try {
      const cleanup = scalarAiDb.cleanupOldData();
      if (cleanup.deletedTicks > 0 || cleanup.deletedLogs > 0) {
        addLog("SERVER", "INFO", `Database cleanup: removed ${cleanup.deletedTicks} old ticks, ${cleanup.deletedLogs} old logs`);
      }
    } catch (err: any) {
      addLog("SERVER", "ERROR", `Database cleanup failed: ${err.message || err}`);
    }
  }, 3600000);

  const getAndClearPendingOrders = () => {
    const list = [...pendingBridgeOrders];
    pendingBridgeOrders = [];
    return list;
  };

  const getPendingEaCommand = () => {
    const cmd = pendingEaCommand;
    pendingEaCommand = null;
    return cmd;
  };

  registerEaRoutes(app, getFullStatusPayload, () => tradeConfig, updateMarket, getPendingEaCommand, process.env.SCALARAI_MCP_API_KEY);
  registerMarketRoutes(app, updateMarket, () => tradeConfig, process.env.SCALARAI_MCP_API_KEY);
  registerSettingsRoutes(
    app,
    updateSettings,
    () => tradeConfig,
    () => webRequestTest,
    () => {
      webRequestTest.status = "pending";
      webRequestTest.triggerTest = true;
      webRequestTest.lastTested = new Date().toISOString();
      webRequestTest.details = "Verification probe initiated. Waiting for MT5 bridge...";
      broadcastToDashboards({ type: "webrequest_test", testState: webRequestTest });
    },
    (report) => {
      webRequestTest.status = report.status as any;
      webRequestTest.error = report.error || "";
      webRequestTest.details = report.details || "";
      webRequestTest.lastTested = new Date().toISOString();
      webRequestTest.triggerTest = false;
      broadcastToDashboards({ type: "webrequest_test", testState: webRequestTest });
      addLog("SERVER", report.status === "success" ? "SUCCESS" : "WARNING", `WebRequest verification report: ${report.status.toUpperCase()} - ${report.details}`);
    },
    process.env.SCALARAI_MCP_API_KEY
  );
  registerTradeRoutes(app, toggleTrading, resetStats, process.env.SCALARAI_MCP_API_KEY);
  registerAiRoutes(app, () => ({
    status: aiKnowledgeBase.totalObservations >= 20 ? "optimized" : "calibrating",
    message: aiKnowledgeBase.totalObservations >= 20 ? "Quantitative baseline calibrated." : "AI is analyzing market speed baseline... Awaiting sufficient expert data stream from MetaTrader 5 terminal.",
    count: aiKnowledgeBase.totalObservations,
    aiKnowledgeBase,
    aiSynthesizedStrategy,
    candleStream: getSymbolState(symbolStates, activeSymbol).ticks,
    averageVelocity: aiKnowledgeBase.globalAverageSpeed,
  }));
  registerMcpRoute(app, mcpContext, process.env.SCALARAI_MCP_API_KEY);
  registerStatusRoute(app, getFullStatusPayload, (symbol: string) => { activeSymbol = symbol; }, getAndClearPendingOrders, process.env.SCALARAI_MCP_API_KEY);
  registerHealthRoutes(app);
  registerStrategyRoutes(app);

  app.all("/api/*", (req: Request, res: Response) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      root: path.resolve(process.cwd(), "frontend"),
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Step Index Scalper full-stack server running on http://localhost:${PORT}`);
  });

  createBridgeServer(server, (ws: WebSocket, rawMsg: string) => {
    try {
      const message = JSON.parse(rawMsg.toString());
      if (message.client) addLog("SERVER", "SUCCESS", `Bridge client registered: ${message.client} | Status: ${message.status}`);
    } catch {
      // Ignore malformed bridge messages
    }
  });

  createDashboardServer(server, () => JSON.stringify({ type: "init", payload: getFullStatusPayload() }), (ws: WebSocket, rawMsg: string) => {
    try {
      const msg = JSON.parse(rawMsg.toString());
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", clientTime: msg.clientTime, serverTime: Date.now() }));
      } else if (msg.type === "toggle_trade") {
        toggleTrading(!tradeConfig.isActive);
      } else if (msg.type === "close_all") {
        tradesList.forEach((t: any) => { if (t.status === "OPEN") closeSimulatedPosition(t, "Closed from remote web dashboard."); });
        broadcastTradesUpdate();
      } else if (msg.type === "reset_stats") {
        resetStats();
      }
    } catch {
      // Ignore malformed dashboard messages
    }
  });

  process.on("uncaughtException", (err) => {
    addLog("SERVER", "ERROR", `Uncaught exception: ${err.message || err}`);
  });

  process.on("unhandledRejection", (reason) => {
    addLog("SERVER", "ERROR", `Unhandled rejection: ${reason}`);
  });
}

startServer();
