import { StrategyMode, AiSynthesizedStrategy, TradeConfig } from "../types";

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  mode: StrategyMode;
  category: "scalping" | "day_trading" | "swing" | "momentum" | "breakout" | "reversal" | "adaptive";
  rules: Record<string, any>;
  defaultConfig: Partial<TradeConfig>;
  tags: string[];
}

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: "scalping_ema_cross",
    name: "Quick Scalp EMA Cross",
    description: "Ultra-fast EMA(5/13) golden/death cross with tight TP/SL. Best for M1 timeframe.",
    mode: StrategyMode.TREND_FOLLOWING,
    category: "scalping",
    tags: ["ema", "scalping", "m1", "fast"],
    defaultConfig: {
      tradingMode: "Scalping",
      takeProfitPoints: 150,
      stopLossPoints: 75,
      trailingStopPoints: 50,
      maxTrades: 2,
    },
    rules: {
      fastEmaPeriod: 5,
      slowEmaPeriod: 13,
      rsiFilter: 65,
      useTrailingStop: true,
    },
  },
  {
    id: "scalping_momentum",
    name: "Velocity Scalper",
    description: "Scalps on high-velocity bursts with acceleration confirmation. ATR-gated.",
    mode: StrategyMode.AI_ADAPTIVE,
    category: "scalping",
    tags: ["velocity", "acceleration", "scalping", "atr"],
    defaultConfig: {
      tradingMode: "Scalping",
      takeProfitPoints: 100,
      stopLossPoints: 50,
      trailingStopPoints: 30,
      maxTrades: 3,
    },
    rules: {
      minVelocityFilter: 0.2,
      maxAllowedPositionDivergence: 2.5,
      useEmaConfirmation: true,
      allowCounterTrend: false,
      atrGate: 8.0,
    },
  },
  {
    id: "day_trading_trend",
    name: "Day Trend Rider",
    description: "Trend-following for M5-M15 day trading. EMA(9/21) with RSI filter.",
    mode: StrategyMode.TREND_FOLLOWING,
    category: "day_trading",
    tags: ["trend", "day_trading", "m5", "m15"],
    defaultConfig: {
      tradingMode: "Swing",
      takeProfitPoints: 500,
      stopLossPoints: 250,
      trailingStopPoints: 150,
      maxTrades: 2,
    },
    rules: {
      fastEmaPeriod: 9,
      slowEmaPeriod: 21,
      rsiFilter: 70,
      useTrailingStop: true,
    },
  },
  {
    id: "day_trading_breakout",
    name: "Opening Range Breakout",
    description: "Day trading breakout strategy. Trades breakouts from opening range high/low.",
    mode: StrategyMode.CUSTOM,
    category: "day_trading",
    tags: ["breakout", "day_trading", "opening_range"],
    defaultConfig: {
      tradingMode: "Swing",
      takeProfitPoints: 400,
      stopLossPoints: 200,
      trailingStopPoints: 100,
      maxTrades: 2,
    },
    rules: {
      openingRangeMinutes: 15,
      breakoutBuffer: 5,
      useVolumeConfirmation: true,
    },
  },
  {
    id: "momentum_bb_momentum",
    name: "Bollinger Momentum",
    description: "Momentum-based BB expansion strategy. Entries on BB width expansion with RSI.",
    mode: StrategyMode.MEAN_REVERSION,
    category: "momentum",
    tags: ["bollinger", "momentum", "rsi"],
    defaultConfig: {
      tradingMode: "Swing",
      takeProfitPoints: 350,
      stopLossPoints: 175,
      trailingStopPoints: 100,
      maxTrades: 2,
    },
    rules: {
      bbPeriod: 20,
      bbStdDev: 2.5,
      rsiFilter: 35,
      bbWidthGate: 0.5,
    },
  },
  {
    id: "breakout_atr",
    name: "ATR Breakout",
    description: "Volatility breakout using ATR. Entries when price moves > 1x ATR from VWAP.",
    mode: StrategyMode.CUSTOM,
    category: "breakout",
    tags: ["atr", "breakout", "volatility"],
    defaultConfig: {
      tradingMode: "Swing",
      takeProfitPoints: 600,
      stopLossPoints: 300,
      trailingStopPoints: 200,
      maxTrades: 2,
    },
    rules: {
      atrPeriod: 14,
      atrMultiplier: 1.5,
      useVwap: true,
    },
  },
  {
    id: "reversal_rsi",
    name: "RSI Reversal",
    description: "Classic RSI reversal with BB confirmation. Entries on oversold/overbought with BB bounce.",
    mode: StrategyMode.MEAN_REVERSION,
    category: "reversal",
    tags: ["rsi", "reversal", "bollinger"],
    defaultConfig: {
      tradingMode: "Swing",
      takeProfitPoints: 300,
      stopLossPoints: 150,
      trailingStopPoints: 80,
      maxTrades: 2,
    },
    rules: {
      rsiPeriod: 14,
      oversold: 30,
      overbought: 70,
      bbPeriod: 20,
      bbStdDev: 2,
    },
  },
  {
    id: "adaptive_velocity",
    name: "Adaptive Velocity",
    description: "AI-adaptive strategy using velocity, acceleration, and EMA confirmation. Self-adjusting.",
    mode: StrategyMode.AI_ADAPTIVE,
    category: "adaptive",
    tags: ["adaptive", "velocity", "ai"],
    defaultConfig: {
      tradingMode: "Scalping",
      takeProfitPoints: 250,
      stopLossPoints: 125,
      trailingStopPoints: 75,
      maxTrades: 3,
    },
    rules: {
      minVelocityFilter: 0.15,
      maxAllowedPositionDivergence: 2.0,
      useEmaConfirmation: true,
      allowCounterTrend: false,
    },
  },
];

export function getStrategyTemplateById(id: string): StrategyTemplate | undefined {
  return STRATEGY_TEMPLATES.find(t => t.id === id);
}

export function getStrategiesByCategory(category: StrategyTemplate["category"]): StrategyTemplate[] {
  return STRATEGY_TEMPLATES.filter(t => t.category === category);
}

export function createStrategyFromTemplate(templateId: string, overrides?: Partial<StrategyTemplate>): AiSynthesizedStrategy {
  const template = getStrategyTemplateById(templateId);
  if (!template) {
    throw new Error(`Strategy template not found: ${templateId}`);
  }

  return {
    id: templateId,
    name: template.name,
    description: template.description,
    mode: template.mode,
    rules: { ...template.rules, ...overrides?.rules },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
