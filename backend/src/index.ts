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
import { createBridgeServer } from "./websockets/bridge";
import { createDashboardServer } from "./websockets/dashboard";
import { McpContext } from "./types";
import { getDefaultTradeConfig, getDefaultAiKnowledgeBase, getDefaultAiSynthesizedStrategy, createSystemLog } from "./services/defaults";
import { StrategyMode, TradeRecord, AiSynthesizedStrategy } from "./types";

dotenv.config();
process.env.PORT = "3000";

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(corsMiddleware);
app.use(loggerMiddleware);
app.use(errorMiddleware);

// Global state
const tradeConfig = getDefaultTradeConfig();
const tickHistory: any[] = [];
let currentPrice = 1250.0;
let lastDirection: "up" | "down" | "flat" = "flat";
const eaConnection = { isEaConnected: false, clientIp: null, lastPing: null, broker: null, accountNumber: null, balance: null };
const webRequestTest = { status: "idle" as const, lastTested: "", error: "", details: "Awaiting first WebRequest test trigger.", triggerTest: false };
const systemLogs: any[] = [];
const tradesList: any[] = [];
let nextTicket = 837201;
const marketTelemetryData: any[] = [];
let lastEvaluationTime = 0;
let lastCandleTime = "";
let latestBuyLockedFromEa = false;
let latestSellLockedFromEa = false;
let aiKnowledgeBase = getDefaultAiKnowledgeBase();
let aiSynthesizedStrategy = getDefaultAiSynthesizedStrategy();
let lastProcessedTelemetryIndex = 0;

const KNOWLEDGE_FILE_PATH = path.join(process.cwd(), "backend", "data", "ai_knowledge_profile.json");
const STRATEGY_FILE_PATH = path.join(process.cwd(), "backend", "data", "ai_synthesized_strategy.json");

function addLog(source: "SERVER" | "EA" | "AI", level: "INFO" | "SUCCESS" | "WARNING" | "ERROR", message: string) {
  const newLog = createSystemLog(source, level, message);
  systemLogs.unshift(newLog);
  if (systemLogs.length > 80) systemLogs.pop();
}

function broadcastToDashboards(payload: any) {
  const message = JSON.stringify(payload);
  webDashboardClients.forEach((client: WebSocket) => {
    if (client.readyState === 1) {
      try { client.send(message); } catch {}
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

  return {
    config: tradeConfig,
    connection: eaConnection,
    isBridgeConnected: mt5BridgeClients.size > 0,
    logs: systemLogs,
    trades: tradesList,
    history: eaConnection.isEaConnected ? tickHistory : [],
    status: eaConnection.isEaConnected ? "active" : "waiting",
    currentPrice,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    aiSynthesizedStrategy,
    stats: {
      totalProfit: Number(totalProfit.toFixed(2)),
      tradesCount: closedPositions.length,
      winRate: Math.round(winRate),
      activePositionsCount: openPositions.length,
      lastHeartbeatTime: eaConnection.lastPing,
    },
    webRequestStatus: webRequestTest,
  };
}

function updateMarket(data: any) {
  const targetPrice = data.price !== undefined ? Number(data.price) : (data.close !== undefined ? Number(data.close) : currentPrice);
  const numVelocity = data.velocity !== undefined ? Number(data.velocity) : 0;
  const isBuyLocked = data.buyLocked !== undefined ? Boolean(data.buyLocked) : false;
  const isSellLocked = data.sellLocked !== undefined ? Boolean(data.sellLocked) : false;
  latestBuyLockedFromEa = isBuyLocked;
  latestSellLockedFromEa = isSellLocked;

  marketTelemetryData.push({ timestamp: Date.now(), price: targetPrice, velocity: numVelocity, buyLocked: isBuyLocked, sellLocked: isSellLocked });
  if (marketTelemetryData.length > 500) marketTelemetryData.shift();

  let direction: "up" | "down" | "flat" = "flat";
  if (targetPrice > currentPrice) direction = "up";
  else if (targetPrice < currentPrice) direction = "down";
  currentPrice = targetPrice;
  lastDirection = direction;

  tickHistory.push({
    time: Date.now(),
    price: currentPrice,
    direction,
    open: data.open !== undefined ? Number(data.open) : currentPrice,
    high: data.high !== undefined ? Number(data.high) : currentPrice,
    low: data.low !== undefined ? Number(data.low) : currentPrice,
    close: Number(currentPrice),
  });
  if (tickHistory.length > 150) tickHistory.shift();

  if (!eaConnection.isEaConnected) {
    addLog("EA", "SUCCESS", `Step Index MT5 Expert Advisor linked! Real-time velocity baseline metric: ${numVelocity.toFixed(4)} pt/s.`);
  }

  eaConnection.isEaConnected = true;
  eaConnection.clientIp = "127.0.0.1";
  eaConnection.lastPing = new Date().toISOString();
  eaConnection.broker = "MetaTrader 5 Link";
  eaConnection.accountNumber = eaConnection.accountNumber || "Simulated MT5 Acc";
  eaConnection.balance = eaConnection.balance || 1000.0;

  broadcastToDashboards({
    type: "tick",
    tick: tickHistory[tickHistory.length - 1],
    currentPrice,
    connection: eaConnection,
    stats: getFullStatusPayload().stats,
  });
}

function getClosePrices() {
  return tickHistory.map(t => (t.close !== undefined ? t.close : t.price));
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return currentPrice;
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
  if (tickHistory.length < 2) return 0.5;
  const trs: number[] = [];
  for (let i = 1; i < tickHistory.length; i++) {
    const prev = tickHistory[i - 1];
    const curr = tickHistory[i];
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
  if (prices.length === 0) return { upper: currentPrice, middle: currentPrice, lower: currentPrice };
  const slice = prices.slice(-period);
  const middle = slice.reduce((sum, p) => sum + p, 0) / slice.length;
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / slice.length;
  const stdDev = Math.sqrt(variance) || 0.1;
  return { upper: middle + numDevs * stdDev, middle, lower: middle - numDevs * stdDev };
}

async function evaluateSimulatedStrategy() {
  const MIN_SAFETY_CALIBRATION_THRESHOLD = 20;
  if (aiKnowledgeBase.totalObservations < MIN_SAFETY_CALIBRATION_THRESHOLD) return;
  if (tickHistory.length < 5) return;

  const prices = getClosePrices();
  const len = prices.length;
  const p0 = prices[len - 1];
  const p1 = prices[len - 2];
  const atr = calculateATR(10);
  const rsi = calculateRSI(prices, 10);
  const bands = calculateBollingerBands(prices, 15, 2);
  const isScalpingMode = tradeConfig.tradingMode === "Scalping";
  const fastPeriod = isScalpingMode ? 5 : 9;
  const slowPeriod = isScalpingMode ? 13 : 21;
  const fastEma = calculateEMA(prices, fastPeriod);
  const slowEma = calculateEMA(prices, slowPeriod);
  const isBullishCross = fastEma > slowEma && prices[len - 2] <= calculateEMA(prices.slice(0, -1), fastPeriod);
  const isBearishCross = fastEma < slowEma && prices[len - 2] >= calculateEMA(prices.slice(0, -1), fastPeriod);
  const openTrades = tradesList.filter((t: any) => t.status === "OPEN");

  openTrades.forEach((trade: any) => {
    let priceDiff = trade.type === "BUY" ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice;
    const pointsDiff = Math.abs(priceDiff) * 100;
    if (pointsDiff >= tradeConfig.takeProfitPoints && priceDiff > 0) closeSimulatedPosition(trade, `TAKE PROFIT reached on Step Index limit (+${pointsDiff.toFixed(1)} pts).`);
    else if (pointsDiff >= tradeConfig.stopLossPoints && priceDiff < 0) closeSimulatedPosition(trade, `STOP LOSS reached on risk boundary (-${pointsDiff.toFixed(1)} pts).`);
    else if (tradeConfig.useTrailingStop && priceDiff > 0) {
      const distancePoints = priceDiff * 100;
      if (distancePoints > tradeConfig.trailingStopPoints) {
        const lockedProfitPercent = 0.5;
        const profitLockPoints = distancePoints * lockedProfitPercent;
        const atrPoints = atr * 100;
        const potentialRetracement = distancePoints - profitLockPoints;
        if (potentialRetracement < atrPoints) closeSimulatedPosition(trade, `TRAILING STOP triggered: locked in +${profitLockPoints.toFixed(1)} pts of profit.`);
      }
    }
  });

  const activeBuyExists = openTrades.some((t: any) => t.type === "BUY") || latestBuyLockedFromEa;
  const activeSellExists = openTrades.some((t: any) => t.type === "SELL") || latestSellLockedFromEa;

  if (openTrades.length >= tradeConfig.maxTrades) return;

  if (tradeConfig.selectedStrategy === StrategyMode.TREND_FOLLOWING) {
    if (fastEma > slowEma && rsi < 70) {
      if (activeSellExists) addLog("SERVER", "WARNING", "BUY trend signal dropped: Directional mutual exclusion lock is active (opposite SELL open).");
      else if (!activeBuyExists) await openSimulatedPosition("BUY", `EMA ${fastPeriod}/${slowPeriod} Golden Cross confirmed. RSI: ${rsi.toFixed(1)}.`);
    } else if (fastEma < slowEma && rsi > 30) {
      if (activeBuyExists) addLog("SERVER", "WARNING", "SELL trend signal dropped: Directional mutual exclusion lock is active (opposite BUY open).");
      else if (!activeSellExists) await openSimulatedPosition("SELL", `EMA ${fastPeriod}/${slowPeriod} Death Cross confirmed. RSI: ${rsi.toFixed(1)}.`);
    }
  } else if (tradeConfig.selectedStrategy === StrategyMode.MEAN_REVERSION) {
    const maxSafeAtr = 12.0;
    if (atr < maxSafeAtr) {
      const isOversold = p0 < bands.lower && rsi < 30;
      const isOverbought = p0 > bands.upper && rsi > 70;
      if (isOversold) {
        if (activeSellExists) addLog("SERVER", "WARNING", "Oversold BUY signal dropped: Opposite SELL partition remains locked.");
        else if (!activeBuyExists) await openSimulatedPosition("BUY", `Price pierced lower Bollinger Band (${bands.lower.toFixed(2)}) with oversold RSI (${rsi.toFixed(1)}).`);
      } else if (isOverbought) {
        if (activeBuyExists) addLog("SERVER", "WARNING", "Overbought SELL signal dropped: Opposite BUY partition remains locked.");
        else if (!activeSellExists) await openSimulatedPosition("SELL", `Price pierced upper Bollinger Band (${bands.upper.toFixed(2)}) with overbought RSI (${rsi.toFixed(1)}).`);
      }
    }
  } else if (tradeConfig.selectedStrategy === StrategyMode.AI_ADAPTIVE) {
    if (marketTelemetryData.length >= 2) {
      const currTelemetry = marketTelemetryData[marketTelemetryData.length - 1];
      const prevTelemetry = marketTelemetryData[marketTelemetryData.length - 2];
      const velocity = currTelemetry.velocity;
      const acceleration = velocity - prevTelemetry.velocity;
      const minSpeedFilter = aiSynthesizedStrategy.compiledRules.minVelocityFilter || 0.15;
      const isHighMomentum = Math.abs(velocity) > minSpeedFilter;
      const globAvgSpeed = aiKnowledgeBase.globalAverageSpeed || 0.15;
      const speedDivergence = Math.abs(velocity) / globAvgSpeed;
      const withinDivergenceLimit = speedDivergence <= (aiSynthesizedStrategy.compiledRules.maxAllowedPositionDivergence || 2.0);
      let isEmaTrendConfirmed = true;
      if (aiSynthesizedStrategy.compiledRules.useEmaConfirmation) {
        isEmaTrendConfirmed = velocity > 0 ? (fastEma > slowEma) : (fastEma < slowEma);
      }
      let isDirectionAllowed = true;
      if (!aiSynthesizedStrategy.compiledRules.allowCounterTrend) {
        isDirectionAllowed = velocity > 0 ? (fastEma >= slowEma) : (fastEma <= slowEma);
      }
      if (isHighMomentum && withinDivergenceLimit && isEmaTrendConfirmed && isDirectionAllowed && Math.abs(acceleration) > 0.02) {
        if (velocity > 0 && acceleration > 0 && !activeSellExists && !activeBuyExists) {
          await openSimulatedPosition("BUY", `AI Synthesized Strategy Signal (Speed: +${velocity.toFixed(3)} > Filter: ${minSpeedFilter}, Speed Div: ${speedDivergence.toFixed(2)}x).`);
        } else if (velocity < 0 && acceleration < 0 && !activeBuyExists && !activeSellExists) {
          await openSimulatedPosition("SELL", `AI Synthesized Strategy Signal (Speed: ${velocity.toFixed(3)} > Filter: ${minSpeedFilter}, Speed Div: ${speedDivergence.toFixed(2)}x).`);
        }
      }
    }
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

  const slApplied = Math.round(Number(tradeConfig.stopLossPoints || 0) * (aiSynthesizedStrategy.compiledRules.slPointsMultiplier || 1.0));
  const tpApplied = Math.round(Number(tradeConfig.takeProfitPoints || 0) * (aiSynthesizedStrategy.compiledRules.tpPointsMultiplier || 1.0));
  const tId = Math.random().toString(36).substring(2, 9);
  const newTrade: TradeRecord = {
    id: tId,
    ticket: nextTicket++,
    type,
    entryPrice: currentPrice,
    lotSize: tradeConfig.lotSize,
    profit: 0,
    status: "OPEN",
    openTime: new Date().toLocaleTimeString(),
    strategy: tradeConfig.selectedStrategy,
    reason,
  };
  tradesList.unshift(newTrade);
  addLog("SERVER", "SUCCESS", `Open simulated MT5 position ticket #${newTrade.ticket} - ${type} at ${currentPrice} (Dynamic SL: ${slApplied} pts, TP: ${tpApplied} pts scaled by AI Strategy rules)`);
  const orderPayload = { action: (type || "BUY").toUpperCase(), symbol: "Step Index", volume: Number(tradeConfig.lotSize || 0.1), sl: slApplied, tp: tpApplied };
  mt5BridgeClients.forEach((client: WebSocket) => {
    if (client.readyState === 1) {
      try { client.send(JSON.stringify(orderPayload)); } catch {}
    }
  });
  broadcastTradesUpdate();
}

function closeSimulatedPosition(trade: TradeRecord, reason: string) {
  trade.status = "CLOSED";
  trade.closePrice = currentPrice;
  trade.closeTime = new Date().toLocaleTimeString();
  const profitFactor = trade.type === "BUY" ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice;
  const finalProfit = Number((profitFactor * 10.0 * trade.lotSize).toFixed(2));
  trade.profit = finalProfit;
  trade.reason = reason;
  addLog("SERVER", "SUCCESS", `Simulated Trade #${trade.ticket} CLOSED. Profit: ${finalProfit > 0 ? "+" : ""}$${finalProfit}`);
  const closePayload = { action: "CLOSE_ALL", symbol: "Step Index", volume: trade.lotSize, sl: 0, tp: 0 };
  mt5BridgeClients.forEach((client: WebSocket) => {
    if (client.readyState === 1) {
      try { client.send(JSON.stringify(closePayload)); } catch {}
    }
  });
  broadcastTradesUpdate();
}

function loadAiSynthesizedStrategy() {
  try {
    if (fs.existsSync(STRATEGY_FILE_PATH)) {
      const fileData = fs.readFileSync(STRATEGY_FILE_PATH, "utf-8");
      aiSynthesizedStrategy = JSON.parse(fileData);
      addLog("AI", "SUCCESS", `Loaded persistent AI Synthesized Strategy. Name: '${aiSynthesizedStrategy.strategyName}'`);
    } else {
      fs.writeFileSync(STRATEGY_FILE_PATH, JSON.stringify(aiSynthesizedStrategy, null, 2), "utf-8");
      addLog("AI", "INFO", "Initialized fresh 'ai_synthesized_strategy.json' persistent strategy file.");
    }
  } catch (error: any) {
    console.error("Failed to load ai_synthesized_strategy.json:", error);
  }
}

function loadAiKnowledgeBase() {
  try {
    if (fs.existsSync(KNOWLEDGE_FILE_PATH)) {
      const fileData = fs.readFileSync(KNOWLEDGE_FILE_PATH, "utf-8");
      aiKnowledgeBase = JSON.parse(fileData);
      addLog("AI", "SUCCESS", `Loaded long-term knowledge base. Total historical observations: ${aiKnowledgeBase.totalObservations}, Glob Avg Speed: ${aiKnowledgeBase.globalAverageSpeed} pt/s.`);
    } else {
      fs.writeFileSync(KNOWLEDGE_FILE_PATH, JSON.stringify(aiKnowledgeBase, null, 2), "utf-8");
      addLog("AI", "INFO", "Initialized fresh 'ai_knowledge_profile.json' persistent knowledge file on disk.");
    }
  } catch (error: any) {
    console.error("Failed to load ai_knowledge_profile.json:", error);
  }
}

function runBackgroundAnalysisWorker() {
  try {
    if (marketTelemetryData.length <= lastProcessedTelemetryIndex) return;
    const unprocessedRecords = marketTelemetryData.slice(lastProcessedTelemetryIndex);
    lastProcessedTelemetryIndex = marketTelemetryData.length;
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
    fs.writeFileSync(KNOWLEDGE_FILE_PATH, JSON.stringify(aiKnowledgeBase, null, 2), "utf-8");
    addLog("AI", "SUCCESS", `Background worker completed quantitative study run. Observations: +${newObservationsCount} (Total: ${newTotal}). File saved.`);
  } catch (err: any) {
    addLog("SERVER", "ERROR", `Quantitative background worker failed: ${err.message || err}`);
  }
}

async function analyzeMarket(): Promise<string> {
  if (!process.env.GEMINI_API_KEY) return "Gemini API key is not configured inside server configurations.";
  return "AI analysis requires backend service integration.";
}

async function synthesizeStrategy(): Promise<AiSynthesizedStrategy> {
  if (!process.env.GEMINI_API_KEY) throw new Error("Gemini API key is not configured inside server configurations.");
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
  addLog("SERVER", "SUCCESS", "User reset session statistics and trading history log.");
  broadcastTradesUpdate();
}

const mcpContext: McpContext = {
  getStatus: () => getFullStatusPayload(),
  getAiStudyFeed: async () => ({ status: "calibrating", message: "AI is calibrating...", count: 0, aiKnowledgeBase, aiSynthesizedStrategy, candleStream: tickHistory, averageVelocity: 0 }),
  getTrades: () => tradesList,
  getLogs: () => systemLogs,
  getConfig: () => tradeConfig,
  getConnection: () => eaConnection,
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
  loadAiKnowledgeBase();
  loadAiSynthesizedStrategy();

  setInterval(() => { runBackgroundAnalysisWorker(); }, 300000);

  registerEaRoutes(app, getFullStatusPayload, updateMarket);
  registerMarketRoutes(app, updateMarket);
  registerSettingsRoutes(app, updateSettings, () => tradeConfig, () => {});
  registerTradeRoutes(app, toggleTrading, resetStats);
  registerAiRoutes(app);
  registerMcpRoute(app, mcpContext, process.env.SCALARAI_MCP_API_KEY || "+Z45RyDNhRZ5np8QWW6yrwfbKcnd5KNGzhzHU4nP8K");
  registerStatusRoute(app, getFullStatusPayload);
  registerHealthRoutes(app);

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
    } catch {}
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
    } catch {}
  });
}

startServer();
