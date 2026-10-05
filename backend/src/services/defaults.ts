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
    id: "ai_adaptive",
    name: "AI Adaptive",
    description: "Adaptive strategy using velocity, acceleration, and EMA trend confirmation.",
    mode: StrategyMode.AI_ADAPTIVE,
    rules: {
      minVelocityFilter: 0.15,
      maxAllowedPositionDivergence: 2.0,
      useEmaConfirmation: true,
      allowCounterTrend: false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
