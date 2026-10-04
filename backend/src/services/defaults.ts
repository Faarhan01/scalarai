import { StrategyMode, TradeConfig, TradeRecord, SystemLog, Tick, AiSynthesizedStrategy, AiKnowledgeBase } from "../types";

export function getDefaultTradeConfig(): TradeConfig {
  return {
    isActive: false,
    selectedStrategy: StrategyMode.TREND_FOLLOWING,
    lotSize: 0.1,
    takeProfitPoints: 300,
    stopLossPoints: 150,
    trailingStopPoints: 100,
    useTrailingStop: true,
    maxTrades: 3,
    tradingMode: "Scalping",
    isAiModeEnabled: false,
  };
}

export function getDefaultAiKnowledgeBase(): AiKnowledgeBase {
  return {
    totalObservations: 0,
    globalAverageSpeed: 0,
    peakVelocityRegistered: 0,
    timeOfDayPatterns: {},
    lastUpdated: "",
  };
}

export function getDefaultAiSynthesizedStrategy(): AiSynthesizedStrategy {
  return {
    lastSynthesized: new Date().toISOString(),
    strategyName: "Adaptive Micro-Volatility Escalator",
    rationale: "Initial structural preset. Regulates velocity noise components and aligns trades with secondary EMA moving averages.",
    observationsUsed: [
      "Awaiting micro-tick observation cycle. Click 'Synthesize AI Strategy' to scan live telemetry bounds.",
    ],
    compiledRules: {
      minVelocityFilter: 0.15,
      slPointsMultiplier: 1.0,
      tpPointsMultiplier: 1.0,
      allowCounterTrend: false,
      useEmaConfirmation: true,
      maxAllowedPositionDivergence: 1.5,
    },
  };
}

export function createSystemLog(source: "SERVER" | "EA" | "AI", level: "INFO" | "SUCCESS" | "WARNING" | "ERROR", message: string): SystemLog {
  return {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toLocaleTimeString(),
    level,
    source,
    message,
  };
}
