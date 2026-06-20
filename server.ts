import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import { generateMql5Code } from "./src/lib/mql5_generator";
import { StrategyMode, TradeConfig, TradeRecord, SystemLog, Tick, EAConnectionDetails } from "./src/types";

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
  appEndpoint: "",
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

const KNOWLEDGE_FILE_PATH = path.join(process.cwd(), "ai_knowledge_profile.json");
let lastProcessedTelemetryIndex = 0;

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
  systemLogs.unshift({
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toLocaleTimeString(),
    level,
    source,
    message
  });
  if (systemLogs.length > 80) systemLogs.pop();
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
    // Cognitive AI Strategy: Evaluates real-time market acceleration and velocity against historical baseline
    if (marketTelemetryData.length >= 2) {
      const currTelemetry = marketTelemetryData[marketTelemetryData.length - 1];
      const prevTelemetry = marketTelemetryData[marketTelemetryData.length - 2];
      
      const velocity = currTelemetry.velocity; // speed metric (points/sec)
      const acceleration = velocity - prevTelemetry.velocity; // acceleration velocity trend
      
      const globAvgSpeed = aiKnowledgeBase.globalAverageSpeed;
      const isHighMomentum = Math.abs(velocity) > globAvgSpeed * 1.5;
      
      if (isHighMomentum && Math.abs(acceleration) > 0.05) {
        // High-conviction speed explosion! Align position with current directional flow
        if (velocity > 0 && acceleration > 0) {
          if (!activeSellExists && !activeBuyExists) {
            await openSimulatedPosition("BUY", `AI Breakout detected! Velocity: +${velocity.toFixed(3)} (Limit: ${globAvgSpeed}), Accel: +${acceleration.toFixed(4)}.`);
          }
        } else if (velocity < 0 && acceleration < 0) {
          if (!activeBuyExists && !activeSellExists) {
            await openSimulatedPosition("SELL", `AI Breakdown detected! Velocity: ${velocity.toFixed(3)} (Limit: ${globAvgSpeed}), Accel: ${acceleration.toFixed(4)}.`);
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
  addLog("SERVER", "SUCCESS", `Open simulated MT5 position ticket #${newTrade.ticket} - ${type} at ${currentPrice}`);

  // Broadcast WebSocket execution bridge payload instantly, and queue for HTTP polling
  const orderPayload = {
    action: (type || "BUY").toUpperCase(),
    symbol: "Step Index",
    volume: Number(tradeConfig.lotSize || 0.1),
    sl: Number(tradeConfig.stopLossPoints || 0),
    tp: Number(tradeConfig.takeProfitPoints || 0)
  };
  broadcastToBridge(orderPayload);
  pendingTrades.push(orderPayload);
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
  const queryUrl = req.query.url as string;
  let appUrl = tradeConfig.appEndpoint || queryUrl;
  
  if (!appUrl) {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.get("host") || "localhost:3000";
    // Always prefer the exact APP_URL supplied by the environment variables if present
    appUrl = process.env.APP_URL || `${protocol}://${host}`;
  }
  
  // Clean up potential trailing slashes for consistency
  appUrl = appUrl.replace(/\/$/, "");
  
  const mql5Code = generateMql5Code(appUrl, tradeConfig);
  
  res.setHeader("Content-Disposition", "attachment; filename=StepIndex_AI_Scalper_EA.mq5");
  res.setHeader("Content-Type", "text/plain");
  res.send(mql5Code);
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

// 3. Global Status API (Frontend polls this to refresh UI indicators and data)
app.get("/api/status", (req: Request, res: Response) => {
  const openPositions = tradesList.filter(t => t.status === "OPEN");
  const closedPositions = tradesList.filter(t => t.status === "CLOSED");
  const wins = closedPositions.filter(t => t.profit > 0).length;
  
  const totalProfit = closedPositions.reduce((sum, t) => sum + t.profit, 0);
  const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;
  
  const isEaConnected = eaConnection.isEaConnected;
  
  res.json({
    config: tradeConfig,
    connection: eaConnection,
    isBridgeConnected: mt5BridgeClients.size > 0 || (lastBridgePoll !== null && (Date.now() - lastBridgePoll < 6000)),
    logs: systemLogs,
    trades: tradesList,
    history: isEaConnected ? tickHistory : [],
    status: isEaConnected ? "active" : "waiting",
    currentPrice,
    hasGeminiKey: !!geminiKey,
    stats: {
      totalProfit: Number(totalProfit.toFixed(2)),
      tradesCount: closedPositions.length,
      winRate: Math.round(winRate),
      activePositionsCount: openPositions.length,
      lastHeartbeatTime: eaConnection.lastPing
    }
  });
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

  res.json({ status: "ok", config: tradeConfig });
});

// 5.5 Reset statistics and clear trades history
app.post("/api/reset-stats", (req: Request, res: Response) => {
  tradesList = [];
  addLog("SERVER", "SUCCESS", "User reset session statistics and trading history log.");
  res.json({ status: "ok" });
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

// Implement Vite static and fallback route parameters
async function startServer() {
  loadAiKnowledgeBase();

  // Run automated background analysis worker every 5 minutes (300,000 ms)
  setInterval(() => {
    runBackgroundAnalysisWorker();
  }, 300000);

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

  // Create WebSocket Server attached to server upgrade events on /mt5-bridge
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const urlObj = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
    if (urlObj.pathname === "/mt5-bridge") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (ws: WebSocket) => {
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
}

startServer();
