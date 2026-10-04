import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import { simpleGit } from "simple-git";
import { generateMql5Code } from "./src/lib/mql5_generator";
import { StrategyMode, TradeConfig, TradeRecord, SystemLog, Tick, EAConnectionDetails, AiSynthesizedStrategy } from "./src/types";
import { createMcpHandler } from "./src/mcp_server";

// Load environment variables strictly in local dev
import dotenv from "dotenv";
dotenv.config();

// Force PORT to 3000 within this container environment to comply with sandboxed routing
process.env.PORT = "3000";

const app = express();
const PORT = 3000;

// Initialize Google GenAI client
const geminiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (geminiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Global In-Memory App States
const tradeConfig: TradeConfig = {
  isActive: false,
  selectedStrategy: StrategyMode.TREND_FOLLOWING,
  lotSize: 0.1,
  takeProfitPoints: 300,
  stopLossPoints: 150,
  trailingStopPoints: 100,
  useTrailingStop: true,
  maxTrades: 3,
  mt5Path: "",
  appEndpoint: "http://127.0.0.1:3000",
  tradingMode: "Scalping",
  selectedAssets: ["Step Index"],
  isAiModeEnabled: !!geminiKey
};

// Tick history
let tickHistory: Tick[] = [];
let currentPrice = 1250.0; // Baseline mock index price
let lastDirection: "up" | "down" | "flat" = "flat";

// Active EA connection parameters
let eaConnection: EAConnectionDetails = {
  isEaConnected: false,
  clientIp: null,
  lastPing: null,
  broker: null,
  accountNumber: null,
  balance: null
};

// WebRequest verification system state
let webRequestTest = {
  status: "idle", // "idle" | "pending" | "success" | "failed"
  lastTested: "",
  error: "",
  details: "Awaiting first WebRequest test trigger.",
  triggerTest: false
};

// Logs & Positions lists
let systemLogs: SystemLog[] = [];
let tradesList: TradeRecord[] = [];
let nextTicket = 837201;

// Market Telemetry data stream for quantitative velocity study
interface MarketTelemetry {
  timestamp: number;
  price: number;
  velocity: number;
  buyLocked: boolean;
  sellLocked: boolean;
}
let marketTelemetryData: MarketTelemetry[] = [];
let lastEvaluationTime = 0;
let lastCandleTime = "";
let latestBuyLockedFromEa = false;
let latestSellLockedFromEa = false;

// AI Knowledge Base State structure
interface AiKnowledgeBase {
  totalObservations: number;
  globalAverageSpeed: number;
  peakVelocityRegistered: number;
  timeOfDayPatterns: Record<string, { count: number; avgSpeed: number }>;
  lastUpdated: string;
}

let aiKnowledgeBase: AiKnowledgeBase = {
  totalObservations: 0,
  globalAverageSpeed: 0,
  peakVelocityRegistered: 0,
  timeOfDayPatterns: {},
  lastUpdated: ""
};

let aiSynthesizedStrategy: AiSynthesizedStrategy = {
  lastSynthesized: new Date().toISOString(),
  strategyName: "Adaptive Micro-Volatility Escalator",
  rationale: "Initial structural preset. Regulates velocity noise components and aligns trades with secondary EMA moving averages.",
  observationsUsed: [
    "Awaiting micro-tick observation cycle. Click 'Synthesize AI Strategy' to scan live telemetry bounds."
  ],
  compiledRules: {
    minVelocityFilter: 0.15,
    slPointsMultiplier: 1.0,
    tpPointsMultiplier: 1.0,
    allowCounterTrend: false,
    useEmaConfirmation: true,
    maxAllowedPositionDivergence: 1.5
  }
};

const KNOWLEDGE_FILE_PATH = path.join(process.cwd(), "ai_knowledge_profile.json");
const STRATEGY_FILE_PATH = path.join(process.cwd(), "ai_synthesized_strategy.json");
let lastProcessedTelemetryIndex = 0;

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
      aiKnowledgeBase = {
        totalObservations: 0,
        globalAverageSpeed: 0,
        peakVelocityRegistered: 0,
        timeOfDayPatterns: {},
        lastUpdated: ""
      };
      fs.writeFileSync(KNOWLEDGE_FILE_PATH, JSON.stringify(aiKnowledgeBase, null, 2), "utf-8");
      addLog("AI", "INFO", "Initialized fresh 'ai_knowledge_profile.json' persistent knowledge file on disk.");
    }
  } catch (error: any) {
    console.error("Failed to load ai_knowledge_profile.json:", error);
  }
}

function runBackgroundAnalysisWorker() {
  try {
    if (marketTelemetryData.length <= lastProcessedTelemetryIndex) {
      return;
    }

    const unprocessedRecords = marketTelemetryData.slice(lastProcessedTelemetryIndex);
    lastProcessedTelemetryIndex = marketTelemetryData.length;

    const newObservationsCount = unprocessedRecords.length;
    let sumAbsVelocity = 0;
    let localPeakVelocity = 0;
    
    const hourGroups: Record<string, number[]> = {};

    for (const record of unprocessedRecords) {
      const speed = Math.abs(record.velocity);
      sumAbsVelocity += speed;
      if (speed > localPeakVelocity) {
        localPeakVelocity = speed;
      }

      const hourStr = String(new Date(record.timestamp).getHours()).padStart(2, "0");
      if (!hourGroups[hourStr]) {
        hourGroups[hourStr] = [];
      }
      hourGroups[hourStr].push(speed);
    }

    const oldTotal = aiKnowledgeBase.totalObservations;
    const newTotal = oldTotal + newObservationsCount;

    // Rolling cumulative average
    const currentGlobalAvgSpeed = aiKnowledgeBase.globalAverageSpeed;
    const updatedGlobalAvgSpeed = newTotal > 0
      ? (currentGlobalAvgSpeed * oldTotal + sumAbsVelocity) / newTotal
      : 0;

    // Peak velocity
    const updatedPeak = Math.max(aiKnowledgeBase.peakVelocityRegistered, localPeakVelocity);

    // Time of day pattern hourly rolling stats
    const updatedPatterns = { ...aiKnowledgeBase.timeOfDayPatterns };
    for (const hour of Object.keys(hourGroups)) {
      const speeds = hourGroups[hour];
      const newSpeedSum = speeds.reduce((sum, s) => sum + s, 0);
      const newSpeedCount = speeds.length;
      
      if (!updatedPatterns[hour]) {
        updatedPatterns[hour] = { count: 0, avgSpeed: 0 };
      }
      
      const oldHourData = updatedPatterns[hour];
      const totalHourCount = oldHourData.count + newSpeedCount;
      const updatedHourAvgSpeed = totalHourCount > 0
        ? (oldHourData.avgSpeed * oldHourData.count + newSpeedSum) / totalHourCount
        : 0;

      updatedPatterns[hour] = {
        count: totalHourCount,
        avgSpeed: Number(updatedHourAvgSpeed.toFixed(4))
      };
    }

    // Assign back
    aiKnowledgeBase.totalObservations = newTotal;
    aiKnowledgeBase.globalAverageSpeed = Number(updatedGlobalAvgSpeed.toFixed(4));
    aiKnowledgeBase.peakVelocityRegistered = Number(updatedPeak.toFixed(4));
    aiKnowledgeBase.timeOfDayPatterns = updatedPatterns;
    aiKnowledgeBase.lastUpdated = new Date().toISOString();

    // Write back to disk
    fs.writeFileSync(KNOWLEDGE_FILE_PATH, JSON.stringify(aiKnowledgeBase, null, 2), "utf-8");
    addLog("AI", "SUCCESS", `Background worker completed quantitative study run. Observations: +${newObservationsCount} (Total: ${newTotal}). File saved.`);
  } catch (err: any) {
    addLog("SERVER", "ERROR", `Quantitative background worker failed: ${err.message || err}`);
  }
}

// Cognitive AI Evaluation Engine using native JSON schema output
async function evaluateWithGemini(marketData: any, savedProfile: any): Promise<{ decision: "APPROVE" | "REJECT"; riskLevel: "LOW" | "MEDIUM" | "HIGH"; reasoning: string }> {
  if (!ai) {
    // If Gemini client is not initialized, fallback to REJECT safe lock
    return {
      decision: "REJECT",
      riskLevel: "HIGH",
      reasoning: "AI Verification client is inactive. To activate AI verification, configure your GEMINI_API_KEY."
    };
  }

  const currentHour = new Date().getHours();
  const currentHourStr = String(currentHour).padStart(2, "0");
  
  const systemPrompt = `You are a professional quantitative AI analyst and risk-management expert for synthetic asset trading.
Your job is to analyze the relationship between the current market state and the historical knowledge profile.

You MUST parse this quantitative data mathematically:
1. CHECK FOR VELOCITY DIVERGENCE:
   - Calculate if the absolute current market velocity (${Math.abs(marketData.velocity)}) is greater than 3x the globalAverageSpeed (${savedProfile.globalAverageSpeed}).
   - If it is, this indicates a massive velocity divergence. Mark the environment as "High-Risk Chaos" and set decision to "REJECT".

2. TIME-OF-DAY PROFILING:
   - Identify the current trading hour: ${currentHourStr}:00.
   - Look at the historical average speed for this hour in the timeOfDayPatterns: ${JSON.stringify(savedProfile.timeOfDayPatterns[currentHourStr] || { avgSpeed: savedProfile.globalAverageSpeed })}.
   - If the current velocity is significantly higher than historical hourly patterns or if this hour historically has erratic spikes (average hourly speed > global average speed * 1.5), enforce a higher verification guard: require tighter confirmation thresholds. If velocity is elevated, set decision to "REJECT".

You must respond with a STRICT, unformatted JSON block. Do NOT include markdown tags like \`\`\`json or \`\`\`. No leading/trailing conversational text.
Your entire response must be a single parsable JSON object exactly following this format:
{
  "decision": "APPROVE" or "REJECT",
  "riskLevel": "LOW" or "MEDIUM" or "HIGH",
  "reasoning": "Brief explanation of velocity divergence or pattern matching matching the local knowledge profile data"
}
`;

  const modelInput = `
Market State:
${JSON.stringify(marketData, null, 2)}

Historical Knowledge Profile:
${JSON.stringify(savedProfile, null, 2)}
  `;

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: modelInput,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    });
  } catch (err: any) {
    console.warn("Primary Gemini model evaluation failed, trying fallback. Error:", err.message || err);
    response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: modelInput,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    });
  }

  const rawText = response.text?.trim() || "";
  let cleanText = rawText;
  if (cleanText.includes("```")) {
    cleanText = cleanText.replace(/```json/g, "").replace(/```/g, "").trim();
  }
  
  try {
    const parsed = JSON.parse(cleanText);
    return {
      decision: (parsed.decision === "APPROVE" || parsed.decision === "REJECT") ? parsed.decision : "REJECT",
      riskLevel: (parsed.riskLevel === "LOW" || parsed.riskLevel === "MEDIUM" || parsed.riskLevel === "HIGH") ? parsed.riskLevel : "HIGH",
      reasoning: parsed.reasoning || "Declined by AI verification engine."
    };
  } catch (err) {
    console.error("Failed to parse Gemini strict JSON. Raw Text:", rawText);
    const isApprove = rawText.toUpperCase().includes('"DECISION": "APPROVE"') || rawText.toUpperCase().includes('"APPROVE"');
    const isReject = rawText.toUpperCase().includes('"DECISION": "REJECT"') || rawText.toUpperCase().includes('"REJECT"');
    const risk = rawText.toUpperCase().includes('"HIGH"') ? "HIGH" : (rawText.toUpperCase().includes('"MEDIUM"') ? "MEDIUM" : "LOW");
    
    return {
      decision: (isApprove && !isReject) ? "APPROVE" : "REJECT",
      riskLevel: risk,
      reasoning: "Heuristic classification based on raw AI output stream."
    };
  }
}

// HTTP execution bridge queue and WebSocket tracking
let pendingTrades: any[] = [];
let lastBridgePoll: number | null = null;
const mt5BridgeClients = new Set<WebSocket>();
const webDashboardClients = new Set<WebSocket>();

function getFullStatusPayload() {
  const openPositions = tradesList.filter(t => t.status === "OPEN");
  const closedPositions = tradesList.filter(t => t.status === "CLOSED");
  const wins = closedPositions.filter(t => t.profit > 0).length;
  
  const totalProfit = closedPositions.reduce((sum, t) => sum + t.profit, 0);
  const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;
  const isEaConnected = eaConnection.isEaConnected;
  
  return {
    config: tradeConfig,
    connection: eaConnection,
    isBridgeConnected: mt5BridgeClients.size > 0 || (lastBridgePoll !== null && (Date.now() - lastBridgePoll < 6000)),
    logs: systemLogs,
    trades: tradesList,
    history: isEaConnected ? tickHistory : [],
    status: isEaConnected ? "active" : "waiting",
    currentPrice,
    hasGeminiKey: !!geminiKey,
    aiSynthesizedStrategy,
    stats: {
      totalProfit: Number(totalProfit.toFixed(2)),
      tradesCount: closedPositions.length,
      winRate: Math.round(winRate),
      activePositionsCount: openPositions.length,
      lastHeartbeatTime: eaConnection.lastPing
    },
    webRequestStatus: webRequestTest
  };
}

function broadcastToDashboards(payload: any) {
  const message = JSON.stringify(payload);
  webDashboardClients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      try {
        client.send(message);
      } catch (err) {}
    }
  });
}

function broadcastTradesUpdate() {
  broadcastToDashboards({
    type: "trades",
    trades: tradesList,
    stats: getFullStatusPayload().stats
  });
}

function broadcastToBridge(payload: any) {
  const message = JSON.stringify(payload);
  let count = 0;
  mt5BridgeClients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN is 1
      try {
        client.send(message);
        count++;
      } catch (err) {
        console.error("Error sending to WS client:", err);
      }
    }
  });
  if (count > 0) {
    addLog("SERVER", "SUCCESS", `Broadcasted trading signal [${payload.action}] to ${count} active MetaTrader bridge client(s).`);
  }
}

// Seed original logs
addLog("SERVER", "INFO", "Step Index server initialisation complete.");
addLog("AI", "INFO", "Built-in AI model ready. Waiting for MT5 client to pull latest weights.");

function addLog(source: "SERVER" | "EA" | "AI", level: "INFO" | "SUCCESS" | "WARNING" | "ERROR", message: string) {
  const newLog: SystemLog = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toLocaleTimeString(),
    level,
    source,
    message
  };
  systemLogs.unshift(newLog);
  if (systemLogs.length > 80) systemLogs.pop();
  broadcastToDashboards({ type: "log", log: newLog });
}

// Background poller to monitor and update MT5 connection status heartbeat gracefully
setInterval(() => {
  const secondsSinceLastRealPing = eaConnection.lastPing
    ? (Date.now() - new Date(eaConnection.lastPing).getTime()) / 1000
    : 999;
  const isRealEaConnected = secondsSinceLastRealPing < 15;
  if (eaConnection.isEaConnected !== isRealEaConnected) {
    eaConnection.isEaConnected = isRealEaConnected;
  }
}, 5000);

// Helper to get raw price history array
function getClosePrices(): number[] {
  return tickHistory.map(t => t.close !== undefined ? t.close : t.price);
}

// Calculate EMA (Exponential Moving Average)
function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return currentPrice;
  if (prices.length < period) {
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }
  let ema = prices[0];
  const coeff = 2 / (period + 1);
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * coeff + ema * (1 - coeff);
  }
  return ema;
}

// Calculate RSI (Relative Strength Index)
function calculateRSI(prices: number[], period: number = 10): number {
  if (prices.length <= period) return 50; // Neutral default
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

// Calculate ATR (Average True Range)
function calculateATR(period: number = 10): number {
  if (tickHistory.length < 2) return 0.5;
  const trs: number[] = [];
  for (let i = 1; i < tickHistory.length; i++) {
    const prev = tickHistory[i - 1];
    const curr = tickHistory[i];
    const prevClose = prev.close !== undefined ? prev.close : prev.price;
    const currHigh = curr.high !== undefined ? curr.high : curr.price;
    const currLow = curr.low !== undefined ? curr.low : curr.price;
    
    const tr = Math.max(
      currHigh - currLow,
      Math.abs(currHigh - prevClose),
      Math.abs(currLow - prevClose)
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  if (slice.length === 0) return 0.5;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// Calculate Bollinger Bands
function calculateBollingerBands(prices: number[], period: number = 15, numDevs: number = 2): { upper: number; middle: number; lower: number } {
  if (prices.length === 0) {
    return { upper: currentPrice, middle: currentPrice, lower: currentPrice };
  }
  const slice = prices.slice(-period);
  const middle = slice.reduce((sum, p) => sum + p, 0) / slice.length;
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / slice.length;
  const stdDev = Math.sqrt(variance) || 0.1;
  return {
    upper: middle + numDevs * stdDev,
    middle,
    lower: middle - numDevs * stdDev
  };
}

// Advanced rule evaluation for simulation
async function evaluateSimulatedStrategy() {
  // Explicitly prevent any manual or automated algorithmic execution signals if calibrating
  const MIN_SAFETY_CALIBRATION_THRESHOLD = 20;
  if (aiKnowledgeBase.totalObservations < MIN_SAFETY_CALIBRATION_THRESHOLD) {
    return;
  }

  if (tickHistory.length < 5) return;
  
  const prices = getClosePrices();
  const len = prices.length;
  const p0 = prices[len - 1];
  const p1 = prices[len - 2];
  
  // Real-time structural indicators
  const atr = calculateATR(10);
  const rsi = calculateRSI(prices, 10);
  const bands = calculateBollingerBands(prices, 15, 2);
  
  // Adjust indicator parameters based on the selected execution profile (Scalping vs Swing)
  const isScalpingMode = tradeConfig.tradingMode === "Scalping";
  const fastPeriod = isScalpingMode ? 5 : 9;
  const slowPeriod = isScalpingMode ? 13 : 21;
  
  const fastEma = calculateEMA(prices, fastPeriod);
  const slowEma = calculateEMA(prices, slowPeriod);
  
  const isBullishCross = fastEma > slowEma && prices[len - 2] <= calculateEMA(prices.slice(0, -1), fastPeriod);
  const isBearishCross = fastEma < slowEma && prices[len - 2] >= calculateEMA(prices.slice(0, -1), fastPeriod);

  const openTrades = tradesList.filter(t => t.status === "OPEN");
  
  // Check TP, SL and Trailing Stop conditions for simulated open trades
  openTrades.forEach(trade => {
    let priceDiff = 0;
    if (trade.type === "BUY") {
      priceDiff = currentPrice - trade.entryPrice;
    } else {
      priceDiff = trade.entryPrice - currentPrice;
    }

    const pointsDiff = Math.abs(priceDiff) * 100; // Step Index scale

    // Check TP
    if (pointsDiff >= tradeConfig.takeProfitPoints && priceDiff > 0) {
      closeSimulatedPosition(trade, `TAKE PROFIT reached on Step Index limit (+${pointsDiff.toFixed(1)} pts).`);
    }
    // Check SL
    else if (pointsDiff >= tradeConfig.stopLossPoints && priceDiff < 0) {
      closeSimulatedPosition(trade, `STOP LOSS reached on risk boundary (-${pointsDiff.toFixed(1)} pts).`);
    }
    // Deep dynamic trailing stop mechanism to lock in profits on favorable moves
    else if (tradeConfig.useTrailingStop && priceDiff > 0) {
      const distancePoints = priceDiff * 100;
      if (distancePoints > tradeConfig.trailingStopPoints) {
        const lockedProfitPercent = 0.5; // lock in at least 50% of the maximum peak points
        const profitLockPoints = distancePoints * lockedProfitPercent;
        
        // Simulating the trailing stop trigger if price retraces downwards by more than ATR
        const atrPoints = atr * 100;
        const potentialRetracement = distancePoints - profitLockPoints;
        if (potentialRetracement < atrPoints) {
          // If retracing below our trailing buffer, execute trailing-lock
          closeSimulatedPosition(trade, `TRAILING STOP triggered: locked in +${profitLockPoints.toFixed(1)} pts of profit.`);
        }
      }
    }
  });

  const activeBuyExists = openTrades.some(t => t.type === "BUY") || latestBuyLockedFromEa;
  const activeSellExists = openTrades.some(t => t.type === "SELL") || latestSellLockedFromEa;

  // Let's only enter if we haven't reached the maximum allowed concurrent transactions
  if (openTrades.length >= tradeConfig.maxTrades) return;

  // Render decisions on clear candle boundaries/closings or substantial momentum shifts
  if (tradeConfig.selectedStrategy === StrategyMode.TREND_FOLLOWING) {
    // Advanced Trend Following: Double EMA crossovers confirmed with RSI filter to stay clear of extreme overbought/oversold levels
    if (fastEma > slowEma && rsi < 70) {
      if (activeSellExists) {
        addLog("SERVER", "WARNING", "BUY trend signal dropped: Directional mutual exclusion lock is active (opposite SELL open).");
      } else if (!activeBuyExists) {
         await openSimulatedPosition("BUY", `EMA ${fastPeriod}/${slowPeriod} Golden Cross confirmed. RSI: ${rsi.toFixed(1)}.`);
      }
    } else if (fastEma < slowEma && rsi > 30) {
      if (activeBuyExists) {
        addLog("SERVER", "WARNING", "SELL trend signal dropped: Directional mutual exclusion lock is active (opposite BUY open).");
      } else if (!activeSellExists) {
         await openSimulatedPosition("SELL", `EMA ${fastPeriod}/${slowPeriod} Death Cross confirmed. RSI: ${rsi.toFixed(1)}.`);
      }
    }
  } else if (tradeConfig.selectedStrategy === StrategyMode.MEAN_REVERSION) {
    // High-precision Mean Reversion using Bollinger Bands and RSI extremes
    // Also, block reversion entry if volatility (ATR) is extremely high, avoiding catching running knives
    const maxSafeAtr = 12.0; // avoid entering counter-trend during wild, uncalibrated price spikes
    if (atr < maxSafeAtr) {
      const isOversold = p0 < bands.lower && rsi < 30;
      const isOverbought = p0 > bands.upper && rsi > 70;

      if (isOversold) {
        if (activeSellExists) {
          addLog("SERVER", "WARNING", "Oversold BUY signal dropped: Opposite SELL partition remains locked.");
        } else if (!activeBuyExists) {
           await openSimulatedPosition("BUY", `Price pierced lower Bollinger Band (${bands.lower.toFixed(2)}) with oversold RSI (${rsi.toFixed(1)}).`);
        }
      } else if (isOverbought) {
        if (activeBuyExists) {
          addLog("SERVER", "WARNING", "Overbought SELL signal dropped: Opposite BUY partition remains locked.");
        } else if (!activeSellExists) {
           await openSimulatedPosition("SELL", `Price pierced upper Bollinger Band (${bands.upper.toFixed(2)}) with overbought RSI (${rsi.toFixed(1)}).`);
        }
      }
    }
  } else if (tradeConfig.selectedStrategy === StrategyMode.AI_ADAPTIVE) {
    // Cognitive AI Strategy governed by live AI Synthesized Strategy Rules & Observations!
    if (marketTelemetryData.length >= 2) {
      const currTelemetry = marketTelemetryData[marketTelemetryData.length - 1];
      const prevTelemetry = marketTelemetryData[marketTelemetryData.length - 2];
      
      const velocity = currTelemetry.velocity; // speed metric (points/sec)
      const acceleration = velocity - prevTelemetry.velocity; // acceleration velocity trend
      
      // We read and apply our dynamically formulated AI rules
      const minSpeedFilter = aiSynthesizedStrategy.compiledRules.minVelocityFilter || 0.15;
      const isHighMomentum = Math.abs(velocity) > minSpeedFilter;
      
      const globAvgSpeed = aiKnowledgeBase.globalAverageSpeed || 0.15;
      const speedDivergence = Math.abs(velocity) / globAvgSpeed;
      const withinDivergenceLimit = speedDivergence <= (aiSynthesizedStrategy.compiledRules.maxAllowedPositionDivergence || 2.0);
      
      // Direct EMA filter confirmation if specified in our active strategy template
      let isEmaTrendConfirmed = true;
      if (aiSynthesizedStrategy.compiledRules.useEmaConfirmation) {
        isEmaTrendConfirmed = velocity > 0 ? (fastEma > slowEma) : (fastEma < slowEma);
      }

      // Check if counter-trend entries are disabled
      let isDirectionAllowed = true;
      if (!aiSynthesizedStrategy.compiledRules.allowCounterTrend) {
        // If counter-trend entries are disallowed, only trade when velocity direction agrees with the EMA trend
        isDirectionAllowed = velocity > 0 ? (fastEma >= slowEma) : (fastEma <= slowEma);
      }

      if (isHighMomentum && withinDivergenceLimit && isEmaTrendConfirmed && isDirectionAllowed && Math.abs(acceleration) > 0.02) {
        // High-conviction AI breakout / breakdown synced with synthesized findings
        if (velocity > 0 && acceleration > 0) {
          if (!activeSellExists && !activeBuyExists) {
            await openSimulatedPosition("BUY", `AI Synthesized Strategy Signal (Speed: +${velocity.toFixed(3)} > Filter: ${minSpeedFilter}, Speed Div: ${speedDivergence.toFixed(2)}x).`);
          }
        } else if (velocity < 0 && acceleration < 0) {
          if (!activeBuyExists && !activeSellExists) {
            await openSimulatedPosition("SELL", `AI Synthesized Strategy Signal (Speed: ${velocity.toFixed(3)} > Filter: ${minSpeedFilter}, Speed Div: ${speedDivergence.toFixed(2)}x).`);
          }
        }
      }
    }
  }
}

async function openSimulatedPosition(type: "BUY" | "SELL", reason: string) {
  const openTrades = tradesList.filter(t => t.status === "OPEN");
  const activeBuyExists = openTrades.some(t => t.type === "BUY") || latestBuyLockedFromEa;
  const activeSellExists = openTrades.some(t => t.type === "SELL") || latestSellLockedFromEa;

  // Gatekeeper: ensure strict directional state lock (Mutual Exclusion Gate)
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

  // INTERCEPT: If AI Core Execution is active, perform Premium Cognitive Verification
  if (tradeConfig.isAiModeEnabled) {
    const lastTick = tickHistory[tickHistory.length - 1];
    const lastTelemetry = marketTelemetryData[marketTelemetryData.length - 1];
    const marketData = {
      open: lastTick?.open ?? currentPrice,
      high: lastTick?.high ?? currentPrice,
      low: lastTick?.low ?? currentPrice,
      close: currentPrice,
      velocity: lastTelemetry ? lastTelemetry.velocity : 0
    };
    const savedProfile = {
      globalAverageSpeed: aiKnowledgeBase.globalAverageSpeed,
      peakVelocityRegistered: aiKnowledgeBase.peakVelocityRegistered,
      timeOfDayPatterns: aiKnowledgeBase.timeOfDayPatterns
    };

    addLog("AI", "INFO", `Intercepted standard execution signal (${type}). Initiating deep cognitive verification run...`);
    
    const aiResponse = await evaluateWithGemini(marketData, savedProfile);
    if (aiResponse.decision !== "APPROVE") {
      addLog("AI", "WARNING", `[BLOCKED BY AI] Cognitive engine REJECTED trade! Risk: ${aiResponse.riskLevel}. Reasoning: ${aiResponse.reasoning}`);
      throw { isAiBlock: true, reasoning: aiResponse.reasoning };
    } else {
      addLog("AI", "SUCCESS", `[APPROVED BY AI] Cognitive engine VERIFIED trade! Risk: ${aiResponse.riskLevel}. Reasoning: ${aiResponse.reasoning}`);
    }
  }

  const slApplied = Math.round(
    Number(tradeConfig.stopLossPoints || 0) * (aiSynthesizedStrategy.compiledRules.slPointsMultiplier || 1.0)
  );
  const tpApplied = Math.round(
    Number(tradeConfig.takeProfitPoints || 0) * (aiSynthesizedStrategy.compiledRules.tpPointsMultiplier || 1.0)
  );

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
    reason
  };
  tradesList.unshift(newTrade);
  addLog("SERVER", "SUCCESS", `Open simulated MT5 position ticket #${newTrade.ticket} - ${type} at ${currentPrice} (Dynamic SL: ${slApplied} pts, TP: ${tpApplied} pts scaled by AI Strategy rules)`);

  // Broadcast WebSocket execution bridge payload instantly, and queue for HTTP polling
  const orderPayload = {
    action: (type || "BUY").toUpperCase(),
    symbol: "Step Index",
    volume: Number(tradeConfig.lotSize || 0.1),
    sl: slApplied,
    tp: tpApplied
  };
  broadcastToBridge(orderPayload);
  pendingTrades.push(orderPayload);
  broadcastTradesUpdate();
}

function closeSimulatedPosition(trade: TradeRecord, reason: string) {
  trade.status = "CLOSED";
  trade.closePrice = currentPrice;
  trade.closeTime = new Date().toLocaleTimeString();
  
  let profitFactor = 0;
  if (trade.type === "BUY") {
    profitFactor = currentPrice - trade.entryPrice;
  } else {
    profitFactor = trade.entryPrice - currentPrice;
  }
  
  // Calculate raw cash value (e.g. $10 per unit lot size per base point)
  const finalProfit = Number((profitFactor * 10.0 * trade.lotSize).toFixed(2));
  trade.profit = finalProfit;
  trade.reason = reason;

  addLog("SERVER", "SUCCESS", `Simulated Trade #${trade.ticket} CLOSED. Profit: ${finalProfit > 0 ? "+" : ""}$${finalProfit}`);

  // Broadcast CLOSE_ALL action so the connected MT5 EA closes real positions as well
  const closePayload = {
    action: "CLOSE_ALL",
    symbol: "Step Index",
    volume: trade.lotSize,
    sl: 0,
    tp: 0
  };
  broadcastToBridge(closePayload);
  pendingTrades.push(closePayload);
  broadcastTradesUpdate();
}

// API MIDDLEWARES
app.use(express.json());

// CORS configuration helper supporting preflight OPTIONS fully
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// API Routes

// 1. Download EA Script
app.get("/api/ea/download", (req: Request, res: Response) => {
  const queryUrl = (req.query.url as string)?.trim();
  let appUrl = queryUrl || tradeConfig.appEndpoint || "http://127.0.0.1:3000";
  
  // Clean up potential trailing slashes for consistency
  appUrl = appUrl.replace(/\/$/, "");
  if (!appUrl) {
    appUrl = "http://127.0.0.1:3000";
  }
  
  const mql5Code = generateMql5Code(appUrl, tradeConfig);
  
  res.setHeader("Content-Disposition", "attachment; filename=StepIndex_AI_Scalper_EA.mq5");
  res.setHeader("Content-Type", "text/plain");
  res.send(mql5Code);
});

// 1a. Download MQL5 Generator Source (mql5_generator.ts)
app.get("/api/ea/generator-source", (req: Request, res: Response) => {
  const possiblePaths = [
    path.join(process.cwd(), "src", "lib", "mql5_generator.ts"),
    path.join(process.cwd(), "src", "mql5_generator.ts"),
    path.join(process.cwd(), "mql5_generator.ts")
  ];
  const foundPath = possiblePaths.find(p => fs.existsSync(p));
  if (foundPath) {
    res.setHeader("Content-Disposition", "attachment; filename=mql5_generator.ts");
    res.setHeader("Content-Type", "text/plain");
    res.sendFile(foundPath);
  } else {
    res.status(404).json({ error: "mql5_generator.ts file not found" });
  }
});

// 1b. Download MT5 Chart Template
app.get("/api/ea/template", (req: Request, res: Response) => {
  const templateCode = `<chart>
id=134262721989799627
symbol=Step Index
description=Equal probability of up/down with fixed step size of 0.1
period_type=0
period_size=1
digits=1
tick_size=0.000000
position_time=1781804820
scale_fix=0
scale_fixed_min=7953.456657
scale_fixed_max=7958.686686
scale_fix11=0
scale_bar=0
scale_bar_val=1.000000
scale=32
mode=1
fore=0
grid=0
volume=0
scroll=1
shift=1
shift_size=37.550471
fixed_pos=0.000000
ticker=1
ohlc=0
one_click=0
one_click_btn=1
bidline=1
askline=0
lastline=0
days=0
descriptions=0
tradelines=1
tradehistory=0
window_left=-49
window_top=-16
window_right=1354
window_bottom=369
window_type=1
floating=0
floating_left=0
floating_top=0
floating_right=0
floating_bottom=0
floating_type=1
floating_toolbar=1
floating_tbstate=
background_color=4294967295
foreground_color=4294967295
barup_color=8125265
bardown_color=5592575
bullcandle_color=8125265
bearcandle_color=5264367
chartline_color=8125265
volumes_color=7451452
grid_color=4294967295
bidline_color=14772545
askline_color=16356285
lastline_color=9305073
stops_color=5264367
windows_total=1

<window>
height=100.000000
objects=1

<indicator>
name=Main
path=
apply=1
show_data=1
scale_inherit=0
scale_line=0
scale_line_percent=50
scale_line_value=0.000000
scale_fix_min=0
scale_fix_min_val=0.000000
scale_fix_max=0
scale_fix_max_val=0.000000
expertmode=0
fixed_height=-1
</indicator>
<object>
type=102
name=Spread&Bar
hidden=1
descr=Spread: 8.. Next Bar in 01:15
color=10777186
selectable=0
angle=0
pos_x=10
pos_y=2
fontsz=10
fontnm=Courier
anchorpos=4
refpoint=2
</object>

</window>
</chart>`;

  res.setHeader("Content-Disposition", "attachment; filename=step_index_chart.tpl");
  res.setHeader("Content-Type", "text/plain");
  res.send(templateCode);
});

// 2. MT5 EA Tick Request/Ping Update (the entrypoint pinged by the MQ5 client)
app.post("/api/ea/tick", (req: Request, res: Response) => {
  console.log("MT5 WebRequest received. Body:", JSON.stringify(req.body), "Headers:", req.headers);
  const { account, broker, balance, profit, bid, ask, strategy, version } = req.body;

  if (account) {
    // Record actual connection stats
    const originIp = req.ip || "127.0.0.1";
    
    // Update live connection statuses
    if (!eaConnection.isEaConnected) {
      addLog("EA", "SUCCESS", `Step Index MT5 Expert Advisor synced successfully from IP ${originIp}. Account: ${account}`);
    }
    
    eaConnection = {
      isEaConnected: true,
      clientIp: originIp,
      lastPing: new Date().toISOString(),
      broker: broker || "Deriv Ltd.",
      accountNumber: String(account),
      balance: balance ? Number(balance) : 1000.0
    };

    // Keep server prices and ticks in line with actual MT5 terminal data if provided
    if (bid) {
      const numBid = Number(bid);
      let direction: "up" | "down" | "flat" = "flat";
      if (numBid > currentPrice) direction = "up";
      else if (numBid < currentPrice) direction = "down";
      
      currentPrice = numBid;
      lastDirection = direction;
      
      tickHistory.push({
        time: Date.now(),
        price: currentPrice,
        direction
      });
      if (tickHistory.length > 150) tickHistory.shift();

      broadcastToDashboards({
        type: "tick",
        tick: tickHistory[tickHistory.length - 1],
        currentPrice,
        connection: eaConnection,
        stats: getFullStatusPayload().stats
      });
    }

    // Capture floating profit for logs
    if (profit !== undefined && Number(profit) !== 0 && Math.random() < 0.2) {
      addLog("EA", "INFO", "MT5 Terminal floating profit: " + Number(profit).toFixed(2));
    }
  } else {
    addLog("SERVER", "WARNING", `EA route was hit but payload has no account info. Body: ${JSON.stringify(req.body || {})}`);
  }

  // Retrieve next action from pendingTrades queue if available
  let pendingAction = "NONE";
  let pendingLot = tradeConfig.lotSize;
  let pendingSL = tradeConfig.stopLossPoints;
  let pendingTP = tradeConfig.takeProfitPoints;
  
  if (pendingTrades.length > 0) {
    const nextTrade = pendingTrades.shift();
    if (nextTrade) {
      pendingAction = nextTrade.action; // "BUY", "SELL", or "CLOSE_ALL"
      pendingLot = nextTrade.volume || tradeConfig.lotSize;
      pendingSL = nextTrade.sl || tradeConfig.stopLossPoints;
      pendingTP = nextTrade.tp || tradeConfig.takeProfitPoints;
      addLog("SERVER", "SUCCESS", `Dispatched remote action ${pendingAction} (Lot: ${pendingLot}) directly to MT5 EA via tick connection.`);
    }
  }

  // Return execution instructions back to the EA as a JSON block
  res.json({
    isActive: tradeConfig.isActive,
    selectedStrategy: tradeConfig.selectedStrategy,
    lotSize: tradeConfig.lotSize,
    takeProfitPoints: tradeConfig.takeProfitPoints,
    stopLossPoints: tradeConfig.stopLossPoints,
    trailingStopPoints: tradeConfig.trailingStopPoints,
    useTrailingStop: tradeConfig.useTrailingStop,
    pendingAction,
    pendingLot,
    pendingSL,
    pendingTP
  });
});

// 2.2 MT5 Expert Advisor Market Stream Update Endpoint (Copies MT5 Step Index graph directly to Dashboard)
app.post("/api/update-market", async (req: Request, res: Response) => {
  const { price, velocity, buyLocked, sellLocked, symbol, open, high, low, close, volume, current_time } = req.body;
  
  // Accept standard metrics from incoming EA feed, falling back on close price if needed
  const targetPrice = price !== undefined ? Number(price) : (close !== undefined ? Number(close) : currentPrice);
  const numVelocity = velocity !== undefined ? Number(velocity) : 0;
  const isBuyLocked = buyLocked !== undefined ? Boolean(buyLocked) : false;
  const isSellLocked = sellLocked !== undefined ? Boolean(sellLocked) : false;

  // Enforce strict global lock states from direct MT5 terminal indicators
  latestBuyLockedFromEa = isBuyLocked;
  latestSellLockedFromEa = isSellLocked;

  // Store in shared in-memory array capped at 500 records
  marketTelemetryData.push({
    timestamp: Date.now(),
    price: targetPrice,
    velocity: numVelocity,
    buyLocked: isBuyLocked,
    sellLocked: isSellLocked
  });
  if (marketTelemetryData.length > 500) {
    marketTelemetryData.shift();
  }

  // Trigger instantaneous background calibration if under threshold to build baseline immediately
  if (aiKnowledgeBase.totalObservations < 20) {
    runBackgroundAnalysisWorker();
  }

  const numPrice = targetPrice;
  let direction: "up" | "down" | "flat" = "flat";
  if (numPrice > currentPrice) direction = "up";
  else if (numPrice < currentPrice) direction = "down";

  currentPrice = numPrice;
  lastDirection = direction;

  // Feed this live price and full OHLC parameters into the tickHistory for live front-end SVG synchronization
  tickHistory.push({
    time: Date.now(),
    price: currentPrice,
    direction,
    open: open !== undefined ? Number(open) : currentPrice,
    high: high !== undefined ? Number(high) : currentPrice,
    low: low !== undefined ? Number(low) : currentPrice,
    close: Number(currentPrice)
  });
  if (tickHistory.length > 150) tickHistory.shift();

  // Maintain connection states active
  if (!eaConnection.isEaConnected) {
    addLog("EA", "SUCCESS", `Step Index MT5 Expert Advisor linked! Real-time velocity baseline metric: ${numVelocity.toFixed(4)} pt/s.`);
  }

  eaConnection = {
    isEaConnected: true,
    clientIp: req.ip || "127.0.0.1",
    lastPing: new Date().toISOString(),
    broker: "MetaTrader 5 Link",
    accountNumber: eaConnection.accountNumber || "Simulated MT5 Acc",
    balance: eaConnection.balance || 1000.0
  };

  broadcastToDashboards({
    type: "tick",
    tick: tickHistory[tickHistory.length - 1],
    currentPrice,
    connection: eaConnection,
    stats: getFullStatusPayload().stats
  });

  // Move signal evaluations away from random tick noise. Validate strictly on structural boundaries / frames.
  const hasCandleTransition = current_time && String(current_time) !== lastCandleTime;
  const hasTimePassed = (Date.now() - lastEvaluationTime) >= 5000;

  if (hasCandleTransition || hasTimePassed) {
    if (current_time) lastCandleTime = String(current_time);
    lastEvaluationTime = Date.now();

    // Run active strategies on incoming real ticks
    if (tradeConfig.isActive) {
      if (aiKnowledgeBase.totalObservations < 20) {
        addLog("SERVER", "WARNING", "Automated trade execution blocked: AI Speed dynamic baseline study is currently calibrating.");
      } else {
        try {
          await evaluateSimulatedStrategy();
        } catch (err: any) {
          if (err.isAiBlock) {
            return res.json({ status: "blocked_by_ai", reason: err.reasoning });
          }
          console.error("Signal execution process failed:", err.message || err);
        }
      }
    }
  }

  // Return identical synchronization metrics back to the EA as a JSON block
  res.json({
    status: "ok",
    isActive: tradeConfig.isActive,
    selectedStrategy: tradeConfig.selectedStrategy,
    lotSize: tradeConfig.lotSize,
    takeProfitPoints: tradeConfig.takeProfitPoints,
    stopLossPoints: tradeConfig.stopLossPoints,
    trailingStopPoints: tradeConfig.trailingStopPoints,
    useTrailingStop: tradeConfig.useTrailingStop
  });
});

// GET endpoint /api/ai-study-feed to expose calculated market speed statistics
app.get("/api/ai-study-feed", (req: Request, res: Response) => {
  const MIN_SAFETY_CALIBRATION_THRESHOLD = 20;

  if (aiKnowledgeBase.totalObservations < MIN_SAFETY_CALIBRATION_THRESHOLD) {
    const rawSum = marketTelemetryData.reduce((sum, item) => sum + Math.abs(item.velocity), 0);
    const calculatedAvg = marketTelemetryData.length > 0 ? Number((rawSum / marketTelemetryData.length).toFixed(4)) : 0;
    
    return res.json({
      status: "calibrating",
      message: "AI is calibrating long-term behavioral profile... Execution locked.",
      count: marketTelemetryData.length,
      unprocessedCount: marketTelemetryData.length - lastProcessedTelemetryIndex,
      threshold: MIN_SAFETY_CALIBRATION_THRESHOLD,
      aiKnowledgeBase,
      aiSynthesizedStrategy,
      candleStream: tickHistory,
      averageVelocity: calculatedAvg || aiKnowledgeBase.globalAverageSpeed
    });
  }

  // Calculate the average market velocity (absolute speed profile of the index) over historical window
  const sumAbsVelocity = marketTelemetryData.reduce((sum, item) => sum + Math.abs(item.velocity), 0);
  const averageVelocity = Number((sumAbsVelocity / marketTelemetryData.length).toFixed(4));

  res.json({
    status: "optimized",
    averageVelocity: averageVelocity || aiKnowledgeBase.globalAverageSpeed,
    aiKnowledgeBase,
    aiSynthesizedStrategy,
    candleStream: tickHistory,
    count: marketTelemetryData.length,
    stream: marketTelemetryData
  });
});

// Bridge Polling Routes (Caters to the Node.js HTTP client bridge)
app.get("/poll", (req: Request, res: Response) => {
  // Clear any potential server timeouts on incoming requests
  req.socket.setTimeout(0);
  
  // Prevent any intermediary proxy or browser caching
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  
  lastBridgePoll = Date.now();
  const tradesToDispatch = [...pendingTrades];
  pendingTrades = []; // clear queue immediately to prevent double processing
  
  if (tradesToDispatch.length > 0) {
    addLog("SERVER", "SUCCESS", `Routed ${tradesToDispatch.length} pending trade(s) to Node.js MT5 bridge via poll.`);
  }
  res.json(tradesToDispatch);
});

app.get("/get-pending-trades", (req: Request, res: Response) => {
  // Clear any potential server timeouts on incoming requests
  req.socket.setTimeout(0);
  
  // Prevent any intermediary proxy or browser caching
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  
  lastBridgePoll = Date.now();
  const tradesToDispatch = [...pendingTrades];
  pendingTrades = []; // clear queue immediately to prevent double processing
  
  if (tradesToDispatch.length > 0) {
    addLog("SERVER", "SUCCESS", `Routed ${tradesToDispatch.length} pending trade(s) to Node.js MT5 bridge.`);
  }
  res.json(tradesToDispatch);
});

app.get("/api/get-pending-trades", (req: Request, res: Response) => {
  // Clear any potential server timeouts on incoming requests
  req.socket.setTimeout(0);
  
  // Prevent any intermediary proxy or browser caching
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  
  lastBridgePoll = Date.now();
  const tradesToDispatch = [...pendingTrades];
  pendingTrades = []; // clear queue immediately to prevent double processing
  
  if (tradesToDispatch.length > 0) {
    addLog("SERVER", "SUCCESS", `Routed ${tradesToDispatch.length} pending trade(s) to Node.js MT5 bridge (API Namespace).`);
  }
  res.json(tradesToDispatch);
});

// 3. Global Status API (Frontend polls this or receives it over WebSocket)
app.get("/api/status", (req: Request, res: Response) => {
  res.json(getFullStatusPayload());
});

// 4. Update Strategy Settings from Frontend Control Center
app.get("/api/settings", (req: Request, res: Response) => {
  res.json({
    ...tradeConfig,
    triggerWebRequestTest: webRequestTest.triggerTest
  });
});

// 4b. WebRequest Verification Endpoints
app.post("/api/test-webrequest/trigger", (req: Request, res: Response) => {
  webRequestTest.status = "pending";
  webRequestTest.lastTested = new Date().toISOString();
  webRequestTest.error = "";
  webRequestTest.details = "Verification triggered. Polling local bridge daemon for MT5 environment check...";
  webRequestTest.triggerTest = true; // Signal the bridge next time it polls/syncs
  
  addLog("SERVER", "INFO", `WebRequest connection test triggered by user.`);
  res.json({ status: "ok", testState: webRequestTest });
});

app.get("/api/test-webrequest/status", (req: Request, res: Response) => {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.get("host") || "localhost:3000";
  const origin = tradeConfig.appEndpoint || `${protocol}://${host}`;
  const suggestedUrl = origin.replace(/\/$/, ""); // Strip trailing slash

  res.json({ 
    testState: webRequestTest,
    suggestedUrl: suggestedUrl
  });
});

app.post("/api/test-webrequest/report", (req: Request, res: Response) => {
  const { status, error, details } = req.body;
  
  if (status) webRequestTest.status = status;
  if (error !== undefined) webRequestTest.error = error;
  if (details !== undefined) webRequestTest.details = details;
  webRequestTest.triggerTest = false; // Reset trigger once reported
  
  addLog("SERVER", status === "success" ? "SUCCESS" : "WARNING", `WebRequest test completed. Result: ${String(status).toUpperCase()}. Details: ${details}`);
  broadcastToDashboards({ type: "webrequest_test", testState: webRequestTest });
  res.json({ status: "ok" });
});

app.post("/api/settings", (req: Request, res: Response) => {
  const { selectedStrategy, lotSize, takeProfitPoints, stopLossPoints, trailingStopPoints, useTrailingStop, maxTrades, mt5Path, appEndpoint, tradingMode, selectedAssets, isAiModeEnabled } = req.body;

  if (selectedStrategy !== undefined) tradeConfig.selectedStrategy = selectedStrategy;
  if (lotSize !== undefined) tradeConfig.lotSize = Number(lotSize);
  if (takeProfitPoints !== undefined) tradeConfig.takeProfitPoints = Number(takeProfitPoints);
  if (stopLossPoints !== undefined) tradeConfig.stopLossPoints = Number(stopLossPoints);
  if (trailingStopPoints !== undefined) tradeConfig.trailingStopPoints = Number(trailingStopPoints);
  if (useTrailingStop !== undefined) tradeConfig.useTrailingStop = Boolean(useTrailingStop);
  if (maxTrades !== undefined) tradeConfig.maxTrades = Number(maxTrades);
  if (mt5Path !== undefined) tradeConfig.mt5Path = String(mt5Path);
  if (appEndpoint !== undefined) tradeConfig.appEndpoint = String(appEndpoint);
  if (tradingMode !== undefined) tradeConfig.tradingMode = tradingMode;
  if (selectedAssets !== undefined) tradeConfig.selectedAssets = selectedAssets;
  if (isAiModeEnabled !== undefined) {
    if (isAiModeEnabled && !geminiKey) {
      tradeConfig.isAiModeEnabled = false;
      addLog("SERVER", "WARNING", "AI mode toggle declined: No Gemini API Key configured in Environment Secrets.");
    } else {
      tradeConfig.isAiModeEnabled = Boolean(isAiModeEnabled);
      if (tradeConfig.isAiModeEnabled) {
        addLog("AI", "SUCCESS", "AI Core Execution Mode: Premium Cognitive verification engine ACTIVATED.");
      } else {
        addLog("AI", "INFO", "AI Core Execution Mode: DEACTIVATED. Reverted to standard technical execution.");
      }
    }
  }

  addLog("SERVER", "WARNING", `Strategy configurations changed. Running parameters updated.`);
  broadcastToDashboards({ type: "config", config: tradeConfig });
  res.json({ status: "ok", config: tradeConfig });
});

// 5. Start/Stop Trading execution toggle
app.post("/api/toggle-trade", (req: Request, res: Response) => {
  const { isActive } = req.body;
  if (isActive && aiKnowledgeBase.totalObservations < 20) {
    return res.status(400).json({
      status: "error",
      message: "Cannot initiate automated trading execution. AI Speed Study profile is still calibrating."
    });
  }
  tradeConfig.isActive = !!isActive;
  
  const statusLabel = tradeConfig.isActive ? "STARTED" : "STOPPED";
  addLog("SERVER", "INFO", `Trading remote state toggled to: ${statusLabel}`);
  
  if (!tradeConfig.isActive) {
    // If trade stop is received, clear simulated positions for testing ease
    const openTrades = tradesList.filter(t => t.status === "OPEN");
    if (openTrades.length > 0) {
      openTrades.forEach(t => {
        closeSimulatedPosition(t, "Forced termination from remote dashboard.");
      });
      addLog("SERVER", "WARNING", "Active positions liquidated on trade pause.");
    }
  } else {
    addLog("AI", "SUCCESS", `AI reinforcement activated on strategy model ${tradeConfig.selectedStrategy}`);
  }

  broadcastToDashboards({ type: "config", config: tradeConfig });
  broadcastTradesUpdate();
  res.json({ status: "ok", config: tradeConfig });
});

// 5.5 Reset statistics and clear trades history
app.post("/api/reset-stats", (req: Request, res: Response) => {
  tradesList = [];
  addLog("SERVER", "SUCCESS", "User reset session statistics and trading history log.");
  broadcastTradesUpdate();
  res.json({ status: "ok" });
});

// 5.6 GitHub OAuth Integration Support
let storedGithubAccessToken: string | null = null;

function getAuthenticatedRemoteUrl(originalUrl: string, token: string): string {
  let cleanUrl = originalUrl;
  
  // Convert SSH URLs (e.g. git@github.com:owner/repo.git) to HTTPS form
  if (cleanUrl.startsWith("git@github.com:")) {
    cleanUrl = cleanUrl.replace("git@github.com:", "github.com/");
  } else if (cleanUrl.startsWith("ssh://git@github.com/")) {
    cleanUrl = cleanUrl.replace("ssh://git@github.com/", "github.com/");
  }
  
  cleanUrl = cleanUrl.replace(/^https?:\/\//, "");
  
  // Remove user credentials if any exist (e.g. user:pass@github.com)
  const atIndex = cleanUrl.indexOf("@");
  if (atIndex !== -1) {
    cleanUrl = cleanUrl.substring(atIndex + 1);
  }
  
  if (cleanUrl.endsWith(".git")) {
    cleanUrl = cleanUrl.substring(0, cleanUrl.length - 4);
  }
  
  return `https://x-access-token:${token}@${cleanUrl}`;
}

// Route to handle standard Web Application Flow Callback
app.get("/api/auth/github/callback", async (req: Request, res: Response) => {
  const { code } = req.query;
  if (!code) {
    addLog("SERVER", "WARNING", "GitHub OAuth invoked without a temporary authorization code.");
    return res.status(400).send("Missing temporary code parameter");
  }

  const clientId = process.env.GITHUB_CLIENT_ID || "Ov231i1UE0j2FgaM9tP3";
  const clientSecret = process.env.GITHUB_CLIENT_SECRET || "b2bd9097c8c301fc623b441ff75c2f9fcc46074e";

  try {
    addLog("SERVER", "INFO", "Exchanging temporary OAuth code for safe GitHub access token...");
    
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub token exchange failed: ${response.statusText}`);
    }

    const data: any = await response.json();
    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
    }

    if (data.access_token) {
      storedGithubAccessToken = data.access_token;
      addLog("SERVER", "SUCCESS", "GitHub OAuth authentication successful!");

      res.send(`
        <html>
          <body style="background: #0b1329; color: #f1f5f9; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="text-align: center; background: #1e293b; padding: 2rem; border-radius: 12px; border: 1px solid #334155; max-width: 400px; width: 90%;">
              <h2 style="color: #6366f1; margin: 0 0 0.5rem 0; font-size: 1.5rem;">Connection Successful</h2>
              <p style="color: #94a3b8; font-size: 0.9rem; line-height: 1.5; margin-bottom: 1.5rem;">
                Your GitHub access token has been safely stored in secure server session memory.
              </p>
              <div style="display: inline-block; width: 1.5rem; height: 1.5rem; border: 3px solid #6366f1; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
              <style>
                @keyframes spin { to { transform: rotate(360deg); } }
              </style>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: '${data.access_token}' }, '*');
                  setTimeout(() => window.close(), 1500);
                } else {
                  setTimeout(() => { window.location.href = '/?github_auth=success'; }, 2000);
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } else {
      res.status(400).send("Did not receive an access_token from GitHub.");
    }
  } catch (error: any) {
    addLog("SERVER", "WARNING", `GitHub OAuth failed: ${error.message}`);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// Endpoint to retrieve active connection status and details
app.get("/api/github-status", (req: Request, res: Response) => {
  res.json({
    authenticated: !!storedGithubAccessToken,
    clientId: process.env.GITHUB_CLIENT_ID || "Ov231i1UE0j2FgaM9tP3"
  });
});

// Endpoint to log out or clear stored token
app.post("/api/auth/github/logout", (req: Request, res: Response) => {
  storedGithubAccessToken = null;
  addLog("SERVER", "INFO", "User cleared active GitHub access token from secure server memory.");
  res.json({ success: true, message: "Disconnected successfully" });
});

// Programmatic Repository Update endpoint using simple-git
app.all("/api/sync-from-github", async (req: Request, res: Response) => {
  const token = (req.query.token as string) || (req.body && req.body.token) || storedGithubAccessToken;
  
  if (!token) {
    addLog("SERVER", "WARNING", "Synchronization triggered but no active GitHub token was found.");
    return res.status(401).json({
      success: false,
      error: "Authentication required",
      message: "Please log in with GitHub first to retrieve an access token."
    });
  }

  try {
    const git = simpleGit();
    
    // Check if it's a valid git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      throw new Error("The application path is not a valid git repository.");
    }

    // Read configured owner and repo from environment variables
    const owner = process.env.GITHUB_REPO_OWNER || "Faarhan01";
    const repo = process.env.GITHUB_REPO_NAME || "Scalarai";

    // Get current branch name
    const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
    addLog("SERVER", "INFO", `Sync initiated: targeting repository ${owner}/${repo} on branch ${branch}...`);

    // Dynamically build authenticated https repository URL using credentials
    const authUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;

    addLog("SERVER", "INFO", `Executing simple-git pull operation securely for ${owner}/${repo}...`);
    
    // Perform programmatic pull from explicit url on active branch
    const pullResult = await git.pull(authUrl, branch);
    
    const summaryMsg = `Successfully synchronized with GitHub. Changes pulled: Files (${pullResult.files.length}), Insertions (${pullResult.summary.insertions}), Deletions (${pullResult.summary.deletions}).`;
    addLog("SERVER", "SUCCESS", summaryMsg);

    res.json({
      success: true,
      branch,
      summary: pullResult.summary,
      files: pullResult.files,
      message: `Repository ${owner}/${repo} pulled and synchronized successfully!`
    });
  } catch (error: any) {
    const errorMsg = `Programmatic synchronization failed: ${error.message}`;
    addLog("SERVER", "ERROR", errorMsg);
    res.status(500).json({
      success: false,
      error: error.message || error,
      message: "A failure condition occurred while programmatically pulling updates."
    });
  }
});

// 6. Gemini Core AI integration: Generate professional Step Index trading reinforcement summaries
app.post("/api/gemini/analyze", async (req: Request, res: Response) => {
  if (!ai) {
    return res.status(200).json({
      error: "Gemini API key is not configured inside server configurations. To activate Gemini, insert a value into the SECRETS panel."
    });
  }

  try {
    const historicalPrices = tickHistory.map(t => t.price).slice(-40);
    const mockStrategyUsed = tradeConfig.selectedStrategy;

    const systemPrompt = `You are the built-in AI trading engine of an advanced MetaTrader 5 Expert Advisor designed explicitly for Step Index. Step Index is a DERIV synthetic index that fluctuates in discrete mathematical sizes (e.g. +0.1, +0.2). Analyze the provided list of recent price movements, the current active strategy, and risk variables. Return a 3-bullet concise expert training analysis containing structural momentum forecast, recommended trailing stop multiplier settings, and market volatility index. Do not write codes. Speak like an objective quantum machine learning system. Keep it brief.`;

    const modelInput = `
Historical step index series (last 40 ticks): ${JSON.stringify(historicalPrices)}
Target Strategy Model: ${mockStrategyUsed}
Take Profit: ${tradeConfig.takeProfitPoints} points
Stop Loss: ${tradeConfig.stopLossPoints} points
Current Price: ${currentPrice}
    `;

    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: modelInput,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2
        }
      });
    } catch (primaryErr: any) {
      console.warn("Primary Gemini model (gemini-3.5-flash) failed or overloaded, trying fallback (gemini-flash-latest). Error details:", primaryErr.message || primaryErr);
      addLog("AI", "WARNING", "Primary model overloaded. Routing request through safe-failover high-capacity model (gemini-flash-latest).");
      response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: modelInput,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2
        }
      });
    }

    const aiReport = response.text || "No insights returned from cognitive server.";
    addLog("AI", "SUCCESS", "Step Index predictive insights reinforced by server model.");
    
    res.json({ report: aiReport });
  } catch (err: any) {
    console.error("Gemini model analysis integration failed: ", err);
    res.status(500).json({ error: "Gemini analysis error: " + err.message });
  }
});

// 7. Specialized Step Index EA Meta-Analysis & Log Synthesis Agent
app.post("/api/gemini/meta-analysis", async (req: Request, res: Response) => {
  if (!ai) {
    return res.status(200).json({
      error: "Gemini API key is not configured. To activate the Meta-Analysis, configure the GEMINI_API_KEY in the Environment Secrets."
    });
  }

  try {
    const historicalTicks = tickHistory.slice(-30).map(t => ({
      price: t.price,
      open: t.open,
      high: t.high,
      low: t.low,
      close: t.close,
      time: t.time
    }));

    const simplifiedLogs = systemLogs.slice(-15).map(l => `[${l.source}] (${l.level}) ${l.message}`);

    const closedPositions = tradesList.filter(t => t.status === "CLOSED");
    const wins = closedPositions.filter(t => t.profit > 0).length;
    const winRatePercent = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;

    const payload = {
      priceHistorySample: historicalTicks,
      averageVelocity: aiKnowledgeBase.globalAverageSpeed,
      peakVelocityRegistered: aiKnowledgeBase.peakVelocityRegistered,
      recentLogs: simplifiedLogs,
      activeTradesCount: tradesList.filter(t => t.status === "OPEN").length,
      winRatePercent: Math.round(winRatePercent)
    };

    const systemPrompt = `You are an elite quantitative AI developer and specialized Step Index Expert Advisor (EA) Meta-Analysis & Log Synthesis Agent.
Your task is to analyze the provided raw trading variables, recent price ticks, execution metrics, and system log records. Translate complex technical actions into clear, conceptual breakdowns.
Do not include any source code, markdown, or text wrapping. Only respond with a valid JSON array of insights.

Analyze the EA payload for:
1. Market Regime Shifts: Identify structural changes (e.g. tight consolidation vs step velocity expansions).
2. Execution Anomalies and Adjustments: Abstract technical telemetry changes (e.g. latency, trailing stop shifts).
3. Strategy Optimization: Summarize indicators, success/streak evaluations, or risk adjustments.

Format your entire response as a valid, unformatted JSON array of objects. Each object must contain exactly:
- "category": String. Operational category (e.g. "Market Behavior", "Execution Status", or "Risk Adjustment")
- "metric": String. Specific target metric or system variable affected (e.g. "Step Velocity", "Loss Limit Guard", "Trailing Trigger")
- "explanation": String. Concise, plain-language explanation of what was observed or how the system adapted.
- "summary": String. A sharp, professional, one-sentence summary string (under 120 characters) designed for direct dashboard display.

Example structure:
[
  {
    "category": "Market Behavior",
    "metric": "Step Index Velocity",
    "explanation": "Observed transition from a narrow 15-tick range into high velocity expansion breaking the local ceiling.",
    "summary": "Breakout velocity surge triggered; standard EMA crossovers overridden by high-momentum priority flow."
  }
]`;

    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: JSON.stringify(payload, null, 2),
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      });
    } catch (primaryErr: any) {
      console.warn("Primary gemini-3.5-flash failed for meta-analysis, using fallback. Error:", primaryErr.message || primaryErr);
      response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: JSON.stringify(payload, null, 2),
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      });
    }

    const rawText = response.text?.trim() || "[]";
    let cleanText = rawText;
    if (cleanText.includes("```")) {
      cleanText = cleanText.replace(/```json/g, "").replace(/```/g, "").trim();
    }

    const insights = JSON.parse(cleanText);
    res.json({ success: true, insights });
  } catch (err: any) {
    console.error("Meta-analysis synthesis failed:", err);
    res.status(500).json({ error: "Synthesis engine error: " + err.message });
  }
});

// 8. Dynamic AI Strategy & Observational Synthesis from tick and knowledge findings
app.post("/api/gemini/synthesize-strategy", async (req: Request, res: Response) => {
  if (!ai) {
    return res.status(200).json({
      error: "Gemini API key is not configured inside server configurations. To activate Gemini, insert a value into the SECRETS panel."
    });
  }

  try {
    const historicalTicks = tickHistory.slice(-40).map(t => ({
      price: t.price,
      direction: t.direction,
      open: t.open,
      high: t.high,
      low: t.low,
      close: t.close,
      time: t.time
    }));

    const savedProfile = {
      globalAverageSpeed: aiKnowledgeBase.globalAverageSpeed,
      peakVelocityRegistered: aiKnowledgeBase.peakVelocityRegistered,
      timeOfDayPatterns: aiKnowledgeBase.timeOfDayPatterns,
      totalObservations: aiKnowledgeBase.totalObservations
    };

    const closedPositions = tradesList.filter(t => t.status === "CLOSED");
    const wins = closedPositions.filter(t => t.profit > 0).length;
    const statsSummary = {
      totalTrades: closedPositions.length,
      winRate: closedPositions.length > 0 ? Math.round((wins / closedPositions.length) * 100) : 0,
      totalProfit: Number(closedPositions.reduce((sum, t) => sum + t.profit, 0).toFixed(2))
    };

    const systemPrompt = `You are a professional quantitative AI analyst and algorithmic systems designer for synthetic index trading.
Your task is to analyze the provided long-term knowledge profiles, recent micro-tick logs, and overall trading performance to synthesize a tailored, highly specific, and reactive execution strategy.

Identify key observational findings (e.g., peak/average velocity patterns, current hour speed vs global speed, trend persistence, trade success rate) and formulate concrete rules for our engine.

You must respond with a STRICT, unformatted JSON block. Do NOT include markdown tags like \`\`\`json or \`\`\`. No leading/trailing conversational text.
Your entire response must be a single parsable JSON object matching this structure:
{
  "strategyName": "A descriptive, professional quantitative name",
  "rationale": "A comprehensive operational explanation citing specific observations from findings (e.g. average velocity of historical timings, or recent direction distributions)",
  "observationsUsed": [
    "Observation 1 (e.g., peak registered tick speed of X pt/s demands a tight filter)",
    "Observation 2 (e.g., Hour Y shows Z avg velocity indicating high activity windows)",
    "Observation 3 (e.g., trend following performance indicates we should enforce trade boundaries)"
  ],
  "compiledRules": {
    "minVelocityFilter": 0.15,
    "slPointsMultiplier": 1.0,
    "tpPointsMultiplier": 1.0,
    "allowCounterTrend": false,
    "useEmaConfirmation": true,
    "maxAllowedPositionDivergence": 2.0
  }
}
`;

    const modelInput = `
Recent Tick History Summary:
${JSON.stringify(historicalTicks, null, 2)}

Historical Knowledge Profile:
${JSON.stringify(savedProfile, null, 2)}

Trading Performance Stats:
${JSON.stringify(statsSummary, null, 2)}
    `;

    addLog("AI", "INFO", "Initiating quantitative strategy synthesis based on tick history and database findings...");

    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: modelInput,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      });
    } catch (primaryErr: any) {
      console.warn("Primary Gemini model failed on strategy synthesis, trying fallback. Error:", primaryErr.message || primaryErr);
      response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: modelInput,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      });
    }

    const rawText = response.text?.trim() || "{}";
    let cleanText = rawText;
    if (cleanText.includes("```")) {
      cleanText = cleanText.replace(/```json/g, "").replace(/```/g, "").trim();
    }

    const parsed = JSON.parse(cleanText);
    
    // Validate rules to keep execution stable
    const minVelocityFilter = typeof parsed.compiledRules?.minVelocityFilter === "number" ? parsed.compiledRules.minVelocityFilter : 0.15;
    const slPointsMultiplier = typeof parsed.compiledRules?.slPointsMultiplier === "number" ? parsed.compiledRules.slPointsMultiplier : 1.0;
    const tpPointsMultiplier = typeof parsed.compiledRules?.tpPointsMultiplier === "number" ? parsed.compiledRules.tpPointsMultiplier : 1.0;
    const allowCounterTrend = typeof parsed.compiledRules?.allowCounterTrend === "boolean" ? parsed.compiledRules.allowCounterTrend : false;
    const useEmaConfirmation = typeof parsed.compiledRules?.useEmaConfirmation === "boolean" ? parsed.compiledRules.useEmaConfirmation : true;
    const maxAllowedPositionDivergence = typeof parsed.compiledRules?.maxAllowedPositionDivergence === "number" ? parsed.compiledRules.maxAllowedPositionDivergence : 2.0;

    aiSynthesizedStrategy = {
      lastSynthesized: new Date().toISOString(),
      strategyName: parsed.strategyName || "Quantum Velocity Escalator",
      rationale: parsed.rationale || "Formulated default quantitative fallback parameters to safeguard capital boundaries.",
      observationsUsed: Array.isArray(parsed.observationsUsed) ? parsed.observationsUsed : ["General micro-tick velocity distribution balanced successfully."],
      compiledRules: {
        minVelocityFilter,
        slPointsMultiplier,
        tpPointsMultiplier,
        allowCounterTrend,
        useEmaConfirmation,
        maxAllowedPositionDivergence
      }
    };

    // Save to disk
    fs.writeFileSync(STRATEGY_FILE_PATH, JSON.stringify(aiSynthesizedStrategy, null, 2), "utf-8");
    addLog("AI", "SUCCESS", `Synthesizing strategy complete. New design: '${aiSynthesizedStrategy.strategyName}'. Rules written to disk.`);

    res.json({ success: true, strategy: aiSynthesizedStrategy });
  } catch (err: any) {
    console.error("AI strategy synthesis failed: ", err);
    res.status(500).json({ error: "Strategy synthesis error: " + err.message });
  }
});

// Implement Vite static and fallback route parameters
async function startServer() {
  loadAiKnowledgeBase();
  loadAiSynthesizedStrategy();

  // Run automated background analysis worker every 5 minutes (300,000 ms)
  setInterval(() => {
    runBackgroundAnalysisWorker();
  }, 300000);

  // Return JSON 404 for unhandled API endpoints to prevent Vite from returning index.html
  app.all("/api/*", (req: Request, res: Response) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  });

  const mcpContext = {
    getStatus: () => getFullStatusPayload(),
    getAiStudyFeed: async () => {
      const MIN_SAFETY_CALIBRATION_THRESHOLD = 20;
      if (aiKnowledgeBase.totalObservations < MIN_SAFETY_CALIBRATION_THRESHOLD) {
        const rawSum = marketTelemetryData.reduce((sum, item) => sum + Math.abs(item.velocity), 0);
        const calculatedAvg = marketTelemetryData.length > 0 ? Number((rawSum / marketTelemetryData.length).toFixed(4)) : 0;
        return {
          status: "calibrating",
          message: "AI is calibrating long-term behavioral profile... Execution locked.",
          count: marketTelemetryData.length,
          unprocessedCount: marketTelemetryData.length - lastProcessedTelemetryIndex,
          threshold: MIN_SAFETY_CALIBRATION_THRESHOLD,
          aiKnowledgeBase,
          aiSynthesizedStrategy,
          candleStream: tickHistory,
          averageVelocity: calculatedAvg || aiKnowledgeBase.globalAverageSpeed,
        };
      }
      const sumAbsVelocity = marketTelemetryData.reduce((sum, item) => sum + Math.abs(item.velocity), 0);
      const averageVelocity = Number((sumAbsVelocity / marketTelemetryData.length).toFixed(4));
      return {
        status: "optimized",
        averageVelocity: averageVelocity || aiKnowledgeBase.globalAverageSpeed,
        aiKnowledgeBase,
        aiSynthesizedStrategy,
        candleStream: tickHistory,
        count: marketTelemetryData.length,
        stream: marketTelemetryData,
      };
    },
    getTrades: () => tradesList,
    getLogs: () => systemLogs,
    getConfig: () => tradeConfig,
    getConnection: () => eaConnection,
    getAiStrategy: () => aiSynthesizedStrategy,
    getAiKnowledgeBase: () => aiKnowledgeBase,
    analyzeMarket: async () => {
      if (!ai) {
        return "Gemini API key is not configured inside server configurations. To activate Gemini, insert a value into the SECRETS panel.";
      }
      try {
        const historicalPrices = tickHistory.map(t => t.price).slice(-40);
        const mockStrategyUsed = tradeConfig.selectedStrategy;
        const systemPrompt = `You are the built-in AI trading engine of an advanced MetaTrader 5 Expert Advisor designed explicitly for Step Index. Step Index is a DERIV synthetic index that fluctuates in discrete mathematical sizes (e.g. +0.1, +0.2). Analyze the provided list of recent price movements, the current active strategy, and risk variables. Return a 3-bullet concise expert training analysis containing structural momentum forecast, recommended trailing stop multiplier settings, and market volatility index. Do not write codes. Speak like an objective quantum machine learning system. Keep it brief.`;
        const modelInput = `
Historical step index series (last 40 ticks): ${JSON.stringify(historicalPrices)}
Target Strategy Model: ${mockStrategyUsed}
Take Profit: ${tradeConfig.takeProfitPoints} points
Stop Loss: ${tradeConfig.stopLossPoints} points
Current Price: ${currentPrice}
        `;
        let response;
        try {
          response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: modelInput,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.2,
            },
          });
        } catch (primaryErr: any) {
          response = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: modelInput,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.2,
            },
          });
        }
        return response.text || "No insights returned from cognitive server.";
      } catch (err: any) {
        return `Gemini analysis error: ${err.message}`;
      }
    },
    synthesizeStrategy: async () => {
      if (!ai) {
        throw new Error("Gemini API key is not configured inside server configurations.");
      }
      try {
        const historicalTicks = tickHistory.slice(-40).map(t => ({
          price: t.price,
          direction: t.direction,
          open: t.open,
          high: t.high,
          low: t.low,
          close: t.close,
          time: t.time,
        }));
        const savedProfile = {
          globalAverageSpeed: aiKnowledgeBase.globalAverageSpeed,
          peakVelocityRegistered: aiKnowledgeBase.peakVelocityRegistered,
          timeOfDayPatterns: aiKnowledgeBase.timeOfDayPatterns,
          totalObservations: aiKnowledgeBase.totalObservations,
        };
        const closedPositions = tradesList.filter(t => t.status === "CLOSED");
        const wins = closedPositions.filter(t => t.profit > 0).length;
        const statsSummary = {
          totalTrades: closedPositions.length,
          winRate: closedPositions.length > 0 ? Math.round((wins / closedPositions.length) * 100) : 0,
          totalProfit: Number(closedPositions.reduce((sum, t) => sum + t.profit, 0).toFixed(2)),
        };
        const systemPrompt = `You are a professional quantitative AI analyst and algorithmic systems designer for synthetic index trading.
Your task is to analyze the provided long-term knowledge profiles, recent micro-tick logs, and overall trading performance to synthesize a tailored, highly specific, and reactive execution strategy.

Identify key observational findings (e.g., peak/average velocity patterns, current hour speed vs global speed, trend persistence, trade success rate) and formulate concrete rules for our engine.

You must respond with a STRICT, unformatted JSON block. Do NOT include markdown tags like \`\`\`json or \`\`\`. No leading/trailing conversational text.
Your entire response must be a single parsable JSON object matching this structure:
{
  "strategyName": "A descriptive, professional quantitative name",
  "rationale": "A comprehensive operational explanation citing specific observations from findings (e.g. average velocity of historical timings, or recent direction distributions)",
  "observationsUsed": [
    "Observation 1 (e.g., peak registered tick speed of X pt/s demands a tight filter)",
    "Observation 2 (e.g., Hour Y shows Z avg velocity indicating high activity windows)",
    "Observation 3 (e.g., trend following performance indicates we should enforce trade boundaries)"
  ],
  "compiledRules": {
    "minVelocityFilter": 0.15,
    "slPointsMultiplier": 1.0,
    "tpPointsMultiplier": 1.0,
    "allowCounterTrend": false,
    "useEmaConfirmation": true,
    "maxAllowedPositionDivergence": 2.0
  }
}
`;
        const modelInput = `
Recent Tick History Summary:
${JSON.stringify(historicalTicks, null, 2)}

Historical Knowledge Profile:
${JSON.stringify(savedProfile, null, 2)}

Trading Performance Stats:
${JSON.stringify(statsSummary, null, 2)}
        `;
        let response;
        try {
          response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: modelInput,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.2,
              responseMimeType: "application/json",
            },
          });
        } catch (primaryErr: any) {
          response = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: modelInput,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.2,
              responseMimeType: "application/json",
            },
          });
        }
        const rawText = response.text?.trim() || "{}";
        let cleanText = rawText;
        if (cleanText.includes("```")) {
          cleanText = cleanText.replace(/```json/g, "").replace(/```/g, "").trim();
        }
        const parsed = JSON.parse(cleanText);
        const minVelocityFilter = typeof parsed.compiledRules?.minVelocityFilter === "number" ? parsed.compiledRules.minVelocityFilter : 0.15;
        const slPointsMultiplier = typeof parsed.compiledRules?.slPointsMultiplier === "number" ? parsed.compiledRules.slPointsMultiplier : 1.0;
        const tpPointsMultiplier = typeof parsed.compiledRules?.tpPointsMultiplier === "number" ? parsed.compiledRules.tpPointsMultiplier : 1.0;
        const allowCounterTrend = typeof parsed.compiledRules?.allowCounterTrend === "boolean" ? parsed.compiledRules.allowCounterTrend : false;
        const useEmaConfirmation = typeof parsed.compiledRules?.useEmaConfirmation === "boolean" ? parsed.compiledRules.useEmaConfirmation : true;
        const maxAllowedPositionDivergence = typeof parsed.compiledRules?.maxAllowedPositionDivergence === "number" ? parsed.compiledRules.maxAllowedPositionDivergence : 2.0;
        const newStrategy: AiSynthesizedStrategy = {
          lastSynthesized: new Date().toISOString(),
          strategyName: parsed.strategyName || "Quantum Velocity Escalator",
          rationale: parsed.rationale || "Formulated default quantitative fallback parameters to safeguard capital boundaries.",
          observationsUsed: Array.isArray(parsed.observationsUsed) ? parsed.observationsUsed : ["General micro-tick velocity distribution balanced successfully."],
          compiledRules: {
            minVelocityFilter,
            slPointsMultiplier,
            tpPointsMultiplier,
            allowCounterTrend,
            useEmaConfirmation,
            maxAllowedPositionDivergence,
          },
        };
        aiSynthesizedStrategy = newStrategy;
        fs.writeFileSync(STRATEGY_FILE_PATH, JSON.stringify(aiSynthesizedStrategy, null, 2), "utf-8");
        addLog("AI", "SUCCESS", `Synthesizing strategy complete. New design: '${aiSynthesizedStrategy.strategyName}'. Rules written to disk.`);
        return aiSynthesizedStrategy;
      } catch (err: any) {
        throw new Error(`Strategy synthesis error: ${err.message}`);
      }
    },
    updateSettings: async (params: any) => {
      if (params.selectedStrategy !== undefined) tradeConfig.selectedStrategy = params.selectedStrategy;
      if (params.lotSize !== undefined) tradeConfig.lotSize = Number(params.lotSize);
      if (params.takeProfitPoints !== undefined) tradeConfig.takeProfitPoints = Number(params.takeProfitPoints);
      if (params.stopLossPoints !== undefined) tradeConfig.stopLossPoints = Number(params.stopLossPoints);
      if (params.trailingStopPoints !== undefined) tradeConfig.trailingStopPoints = Number(params.trailingStopPoints);
      if (params.useTrailingStop !== undefined) tradeConfig.useTrailingStop = Boolean(params.useTrailingStop);
      if (params.maxTrades !== undefined) tradeConfig.maxTrades = Number(params.maxTrades);
      if (params.tradingMode !== undefined) tradeConfig.tradingMode = params.tradingMode;
      if (params.isAiModeEnabled !== undefined) {
        if (params.isAiModeEnabled && !geminiKey) {
          tradeConfig.isAiModeEnabled = false;
          addLog("SERVER", "WARNING", "AI mode toggle declined: No Gemini API Key configured in Environment Secrets.");
        } else {
          tradeConfig.isAiModeEnabled = Boolean(params.isAiModeEnabled);
        }
      }
      addLog("SERVER", "WARNING", "Strategy configurations changed. Running parameters updated.");
      broadcastToDashboards({ type: "config", config: tradeConfig });
      return tradeConfig;
    },
    toggleTrading: async (isActive: boolean) => {
      tradeConfig.isActive = isActive;
      const statusLabel = tradeConfig.isActive ? "STARTED" : "STOPPED";
      addLog("SERVER", "INFO", `Trading remote state toggled to: ${statusLabel}`);
      if (!tradeConfig.isActive) {
        const openTrades = tradesList.filter(t => t.status === "OPEN");
        if (openTrades.length > 0) {
          openTrades.forEach(t => closeSimulatedPosition(t, "Forced termination from remote dashboard."));
        }
      }
      broadcastToDashboards({ type: "config", config: tradeConfig });
      broadcastTradesUpdate();
      return tradeConfig;
    },
    placeTrade: async (type: "BUY" | "SELL", reason?: string) => {
      await openSimulatedPosition(type, reason || "MCP initiated trade");
      return { success: true, message: `Trade signal sent: ${type}` };
    },
    closeTrade: async (tradeId: string) => {
      const trade = tradesList.find(t => t.id === tradeId && t.status === "OPEN");
      if (!trade) {
        return { success: false, message: `Open trade with id ${tradeId} not found` };
      }
      closeSimulatedPosition(trade, "Closed via MCP request.");
      return { success: true, message: `Trade ${tradeId} closed` };
    },
    resetStats: async () => {
      tradesList = [];
      addLog("SERVER", "SUCCESS", "User reset session statistics and trading history log.");
      broadcastTradesUpdate();
    },
  };

  const SCALARAI_MCP_API_KEY = process.env.SCALARAI_MCP_API_KEY || "+Z45RyDNhRZ5np8QWW6yrwfbKcnd5KNGzhzHU4nP8K";
  app.post("/mcp", (req: Request, res: Response) => {
    createMcpHandler(mcpContext, SCALARAI_MCP_API_KEY)(req, res);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Step Index Scalper full-stack server running on http://localhost:${PORT}`);
  });

  // Create WebSocket Servers: one for desktop MT5 bridge, one for web dashboard real-time stream
  const wssBridge = new WebSocketServer({ noServer: true });
  const wssDashboard = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    try {
      const urlObj = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
      if (urlObj.pathname === "/mt5-bridge") {
        wssBridge.handleUpgrade(request, socket, head, (ws) => {
          wssBridge.emit("connection", ws, request);
        });
      } else if (urlObj.pathname === "/ws/live" || urlObj.pathname === "/ws" || urlObj.pathname === "/live-feed") {
        wssDashboard.handleUpgrade(request, socket, head, (ws) => {
          wssDashboard.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });

  wssBridge.on("connection", (ws: WebSocket) => {
    mt5BridgeClients.add(ws);
    addLog("SERVER", "SUCCESS", "Local MetaTrader 5 WebSocket Bridge connection established.");

    // Simple ping-pong interval to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === 1) { // OPEN
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 15000);

    ws.on("message", (rawMsg) => {
      try {
        const message = JSON.parse(rawMsg.toString());
        if (message.client) {
          addLog("SERVER", "SUCCESS", `Bridge client registered: ${message.client} | Status: ${message.status}`);
        }
      } catch (err) {
        // Quietly ignore
      }
    });

    ws.on("close", () => {
      clearInterval(pingInterval);
      mt5BridgeClients.delete(ws);
      addLog("SERVER", "WARNING", "Local MetaTrader 5 WebSocket Bridge connection closed.");
    });

    ws.on("error", (err: any) => {
      clearInterval(pingInterval);
      mt5BridgeClients.delete(ws);
      addLog("SERVER", "ERROR", `MT5 Bridge WebSocket error: ${err.message || err}`);
    });
  });

  // Web Dashboard Real-Time Live Stream connection handling
  wssDashboard.on("connection", (ws: WebSocket) => {
    webDashboardClients.add(ws);
    // Send immediate comprehensive snapshot
    try {
      ws.send(JSON.stringify({ type: "init", payload: getFullStatusPayload() }));
    } catch {}

    ws.on("message", (rawMsg) => {
      try {
        const msg = JSON.parse(rawMsg.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", clientTime: msg.clientTime, serverTime: Date.now() }));
        } else if (msg.type === "toggle_trade") {
          tradeConfig.isActive = !tradeConfig.isActive;
          const statusLabel = tradeConfig.isActive ? "STARTED" : "STOPPED";
          addLog("SERVER", "INFO", `Trading remote state toggled to: ${statusLabel}`);
          if (!tradeConfig.isActive) {
            const openTrades = tradesList.filter(t => t.status === "OPEN");
            if (openTrades.length > 0) {
              openTrades.forEach(t => closeSimulatedPosition(t, "Forced termination from remote dashboard."));
            }
          }
          broadcastToDashboards({ type: "config", config: tradeConfig });
          broadcastTradesUpdate();
        } else if (msg.type === "close_all") {
          tradesList.forEach(t => {
            if (t.status === "OPEN") {
              closeSimulatedPosition(t, "Closed from remote web dashboard.");
            }
          });
          broadcastTradesUpdate();
        } else if (msg.type === "reset_stats") {
          tradesList = [];
          broadcastTradesUpdate();
        }
      } catch {}
    });

    ws.on("close", () => {
      webDashboardClients.delete(ws);
    });

    ws.on("error", () => {
      webDashboardClients.delete(ws);
    });
  });
}

startServer();
