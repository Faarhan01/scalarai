import { scalarAiDb } from "../db";
import { Tick, AiKnowledgeBase } from "../types";
import { buildContext, evaluateStrategy, evaluateStrategyBacktest, StrategyContext } from "./strategy";

export interface MarketAnalysis {
  symbol: string;
  timestamp: string;
  currentPrice: number;
  trend: "bullish" | "bearish" | "neutral";
  volatility: "low" | "medium" | "high";
  momentum: "positive" | "negative" | "neutral";
  support: number;
  resistance: number;
  atr: number;
  rsi: number;
  emaTrend: "bullish" | "bearish" | "neutral";
  recommendation: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string[];
}

export interface StrategyPerformance {
  mode: string;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  totalTrades: number;
  bestPerformingHours: string[];
  worstPerformingHours: string[];
  recommendation: string;
}

export interface StrategyOptimizationSuggestion {
  parameter: string;
  currentValue: number;
  suggestedValue: number;
  reason: string;
  expectedImprovement: string;
}

function getRecentTicks(symbol: string, limit = 200): Tick[] {
  return scalarAiDb.rawQuery(
    "SELECT * FROM market_ticks WHERE symbol = ? ORDER BY time DESC LIMIT ?",
    [symbol, limit]
  ).reverse() as Tick[];
}

function calculateSupportResistance(ticks: Tick[]): { support: number; resistance: number } {
  if (ticks.length < 20) {
    const prices = ticks.map(t => t.price);
    return { support: Math.min(...prices), resistance: Math.max(...prices) };
  }

  const prices = ticks.slice(-50).map(t => t.price);
  const sorted = [...prices].sort((a, b) => a - b);
  
  const support = sorted[Math.floor(sorted.length * 0.1)];
  const resistance = sorted[Math.floor(sorted.length * 0.9)];
  
  return { support, resistance };
}

function detectVolatility(atr: number, currentPrice: number): "low" | "medium" | "high" {
  const atrPercent = (atr / currentPrice) * 100;
  if (atrPercent < 0.3) return "low";
  if (atrPercent < 0.8) return "medium";
  return "high";
}

export function analyzeMarket(symbol: string, knowledge: AiKnowledgeBase): MarketAnalysis {
  const ticks = getRecentTicks(symbol, 200);
  if (ticks.length < 10) {
    return {
      symbol,
      timestamp: new Date().toISOString(),
      currentPrice: 1250,
      trend: "neutral",
      volatility: "medium",
      momentum: "neutral",
      support: 1250,
      resistance: 1250,
      atr: 0,
      rsi: 50,
      emaTrend: "neutral",
      recommendation: "HOLD",
      confidence: 0,
      reasoning: ["Insufficient data for analysis"],
    };
  }

  const prices = ticks.map(t => t.close ?? t.price);
  const currentPrice = prices[prices.length - 1];
  
  const ctx = buildContext(
    ticks,
    knowledge,
    { id: "default", name: "Default", description: "", mode: "AI_ADAPTIVE" as any, rules: {}, createdAt: "", updatedAt: "" },
    "Scalping",
    0,
    false,
    false
  );

  const { support, resistance } = calculateSupportResistance(ticks);
  const volatility = detectVolatility(ctx.atr, currentPrice);
  
  const emaTrend = ctx.fastEma > ctx.slowEma ? "bullish" : ctx.fastEma < ctx.slowEma ? "bearish" : "neutral";
  const trend = emaTrend;
  
  const momentum = ctx.acceleration > 0.02 ? "positive" : ctx.acceleration < -0.02 ? "negative" : "neutral";
  
  const signal = evaluateStrategy("TREND_FOLLOWING" as any, ctx, {
    takeProfitPoints: 300,
    stopLossPoints: 150,
    maxTrades: 3,
    tradingMode: "Scalping",
  } as any);

  const reasoning: string[] = [];
  reasoning.push(`RSI: ${ctx.rsi.toFixed(1)}`);
  reasoning.push(`ATR: ${ctx.atr.toFixed(4)} (${volatility} volatility)`);
  reasoning.push(`EMA trend: ${emaTrend}`);
  reasoning.push(`Velocity: ${ctx.velocity.toFixed(4)}, Acceleration: ${ctx.acceleration.toFixed(4)}`);
  reasoning.push(`Support: ${support.toFixed(2)}, Resistance: ${resistance.toFixed(2)}`);
  reasoning.push(`Signal: ${signal.type} - ${signal.reason}`);

  return {
    symbol,
    timestamp: new Date().toISOString(),
    currentPrice,
    trend,
    volatility,
    momentum,
    support,
    resistance,
    atr: ctx.atr,
    rsi: ctx.rsi,
    emaTrend,
    recommendation: signal.type,
    confidence: signal.confidence || 0.5,
    reasoning,
  };
}

export function analyzeStrategyPerformance(mode: string, limit = 100): StrategyPerformance {
  const backtest = evaluateStrategyBacktest(mode as any, limit);
  const allTrades = scalarAiDb.getTrades().filter(t => t.strategy === mode);
  const closedTrades = allTrades.filter(t => t.status === "CLOSED");
  
  const wins = closedTrades.filter(t => t.profit > 0);
  const losses = closedTrades.filter(t => t.profit <= 0);
  
  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.profit, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + t.profit, 0) / losses.length : 0;
  const profitFactor = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;
  
  const hourPerformance: Record<string, { wins: number; losses: number; profit: number }> = {};
  closedTrades.forEach(trade => {
    const hour = new Date(trade.openTime).getHours();
    const key = `${hour.toString().padStart(2, "0")}:00`;
    if (!hourPerformance[key]) hourPerformance[key] = { wins: 0, losses: 0, profit: 0 };
    hourPerformance[key].profit += trade.profit;
    if (trade.profit > 0) hourPerformance[key].wins++;
    else hourPerformance[key].losses++;
  });

  const sortedHours = Object.entries(hourPerformance).sort((a, b) => b[1].profit - a[1].profit);
  const bestHours = sortedHours.slice(0, 3).map(([hour]) => hour);
  const worstHours = sortedHours.slice(-3).map(([hour]) => hour);

  let recommendation = "Strategy needs more data";
  if (closedTrades.length > 20) {
    if (winRate > 60 && profitFactor > 1.5) {
      recommendation = "Excellent performance. Consider increasing position size.";
    } else if (winRate > 50 && profitFactor > 1.2) {
      recommendation = "Good performance. Strategy is viable.";
    } else if (winRate < 40 || profitFactor < 0.8) {
      recommendation = "Poor performance. Review parameters or consider switching strategy.";
    } else {
      recommendation = "Mixed results. Optimize parameters before live trading.";
    }
  }

  return {
    mode,
    winRate: Math.round(winRate),
    profitFactor: Number(profitFactor.toFixed(2)),
    avgWin: Number(avgWin.toFixed(2)),
    avgLoss: Number(avgLoss.toFixed(2)),
    maxDrawdown: backtest.maxDrawdown,
    totalTrades: closedTrades.length,
    bestPerformingHours: bestHours,
    worstPerformingHours: worstHours,
    recommendation,
  };
}

export function suggestStrategyOptimizations(mode: string): StrategyOptimizationSuggestion[] {
  const suggestions: StrategyOptimizationSuggestion[] = [];
  const performance = analyzeStrategyPerformance(mode);
  
  if (performance.winRate < 50) {
    suggestions.push({
      parameter: "Take Profit",
      currentValue: 300,
      suggestedValue: 200,
      reason: "Win rate is below 50%. Consider taking profits earlier.",
      expectedImprovement: "May increase win rate by 5-10%",
    });
  }
  
  if (performance.profitFactor < 1.0) {
    suggestions.push({
      parameter: "Stop Loss",
      currentValue: 150,
      suggestedValue: 100,
      reason: "Losses exceed wins. Tighten stop loss to reduce average loss.",
      expectedImprovement: "Should improve profit factor by 0.2-0.3",
    });
  }
  
  if (performance.maxDrawdown > 500) {
    suggestions.push({
      parameter: "Max Trades",
      currentValue: 3,
      suggestedValue: 2,
      reason: "High drawdown detected. Reduce concurrent positions.",
      expectedImprovement: "May reduce max drawdown by 20-30%",
    });
  }
  
  return suggestions;
}

export function recommendStrategyForConditions(
  volatility: "low" | "medium" | "high",
  trend: "bullish" | "bearish" | "neutral",
  timeOfDay: string
): { strategy: string; reason: string } | null {
  const hour = parseInt(timeOfDay.split(":")[0]);
  const isSession = hour >= 8 && hour <= 16;

  if (volatility === "high" && isSession) {
    return {
      strategy: "breakout_atr",
      reason: "High volatility during active session favors breakout strategies.",
    };
  }
  
  if (volatility === "low" && trend === "neutral") {
    return {
      strategy: "scalping_momentum",
      reason: "Low volatility range favors quick momentum scalps.",
    };
  }
  
  if (trend === "bullish" || trend === "bearish") {
    return {
      strategy: "day_trading_trend",
      reason: "Clear trend favors trend-following day trading.",
    };
  }
  
  if (volatility === "medium") {
    return {
      strategy: "scalping_ema_cross",
      reason: "Medium volatility supports fast EMA cross scalps.",
    };
  }
  
  return null;
}
