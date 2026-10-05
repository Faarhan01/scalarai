import { StrategyMode, TradeConfig, Tick, AiKnowledgeBase, AiSynthesizedStrategy } from "../types";
import { scalarAiDb } from "../db";

export type { StrategyMode, TradeConfig, Tick, AiKnowledgeBase, AiSynthesizedStrategy } from "../types";

export interface StrategyContext {
  prices: number[];
  currentPrice: number;
  atr: number;
  rsi: number;
  fastEma: number;
  slowEma: number;
  bands: { upper: number; middle: number; lower: number };
  velocity: number;
  acceleration: number;
  openTradesCount: number;
  activeBuyExists: boolean;
  activeSellExists: boolean;
  knowledge: AiKnowledgeBase;
  strategy: AiSynthesizedStrategy;
  tradingMode: "Scalping" | "Swing";
}

export interface TradeSignal {
  type: "BUY" | "SELL" | "HOLD";
  reason: string;
  confidence?: number;
}

export interface BacktestResult {
  mode: string;
  ticksAnalyzed: number;
  signals: number;
  simulatedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalProfit: number;
  avgProfit: number;
  maxDrawdown: number;
}

function getClosePrices(ticks: Tick[]): number[] {
  return ticks.map(t => (t.close !== undefined ? t.close : t.price));
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
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

function calculateATR(ticks: Tick[], period: number = 10): number {
  if (ticks.length < 2) return 0.5;
  const trs: number[] = [];
  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1];
    const curr = ticks[i];
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
  if (prices.length === 0) return { upper: 0, middle: 0, lower: 0 };
  const slice = prices.slice(-period);
  const middle = slice.reduce((sum, p) => sum + p, 0) / slice.length;
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / slice.length;
  const stdDev = Math.sqrt(variance) || 0.1;
  return { upper: middle + numDevs * stdDev, middle, lower: middle - numDevs * stdDev };
}

export function buildContext(ticks: Tick[], knowledge: AiKnowledgeBase, strategy: AiSynthesizedStrategy, tradingMode: "Scalping" | "Swing", openTradesCount: number, activeBuyExists: boolean, activeSellExists: boolean): StrategyContext {
  const prices = getClosePrices(ticks);
  const currentPrice = ticks.length > 0 ? (ticks[ticks.length - 1].close ?? ticks[ticks.length - 1].price) : 0;
  const atr = calculateATR(ticks, 10);
  const rsi = calculateRSI(prices, 10);
  const bands = calculateBollingerBands(prices, 15, 2);
  const isScalpingMode = tradingMode === "Scalping";
  const fastPeriod = isScalpingMode ? 5 : 9;
  const slowPeriod = isScalpingMode ? 13 : 21;
  const fastEma = calculateEMA(prices, fastPeriod);
  const slowEma = calculateEMA(prices, slowPeriod);
  let velocity = 0;
  let acceleration = 0;
  if (ticks.length >= 2) {
    const last = ticks[ticks.length - 1];
    const prev = ticks[ticks.length - 2];
    velocity = last.velocity || 0;
    acceleration = velocity - (prev.velocity || 0);
  }
  return {
    prices,
    currentPrice,
    atr,
    rsi,
    fastEma,
    slowEma,
    bands,
    velocity,
    acceleration,
    openTradesCount,
    activeBuyExists,
    activeSellExists,
    knowledge,
    strategy,
    tradingMode,
  };
}

export function evaluateTrendFollowing(ctx: StrategyContext, config: TradeConfig): TradeSignal {
  const { rsi, fastEma, slowEma, atr } = ctx;
  
  // Trend strength filter: require meaningful EMA separation relative to volatility
  const emaSeparation = Math.abs(fastEma - slowEma);
  const minSeparation = atr * 0.15;
  if (emaSeparation < minSeparation) return { type: "HOLD", reason: "EMA separation too weak for reliable trend" };
  
  if (fastEma > slowEma && rsi < 70) {
    if (ctx.activeSellExists) return { type: "HOLD", reason: "BUY blocked: opposite SELL lock active" };
    return { type: "BUY", reason: `EMA Golden Cross (${ctx.fastEma.toFixed(2)} > ${ctx.slowEma.toFixed(2)}, sep ${emaSeparation.toFixed(2)}). RSI: ${rsi.toFixed(1)}`, confidence: 0.75 };
  }
  if (fastEma < slowEma && rsi > 30) {
    if (ctx.activeBuyExists) return { type: "HOLD", reason: "SELL blocked: opposite BUY lock active" };
    return { type: "SELL", reason: `EMA Death Cross (${ctx.fastEma.toFixed(2)} < ${ctx.slowEma.toFixed(2)}, sep ${emaSeparation.toFixed(2)}). RSI: ${rsi.toFixed(1)}`, confidence: 0.75 };
  }
  return { type: "HOLD", reason: "No trend signal" };
}

export function evaluateMeanReversion(ctx: StrategyContext, config: TradeConfig): TradeSignal {
  const maxSafeAtr = 12.0;
  if (ctx.atr >= maxSafeAtr) return { type: "HOLD", reason: "ATR too high for mean reversion" };
  const { rsi, bands, currentPrice, acceleration } = ctx;
  
  // Momentum confirmation: require deceleration for reversal signals
  const isDecelerating = Math.abs(acceleration) < 0.01 || acceleration > 0.02;
  
  if (currentPrice < bands.lower && rsi < 30) {
    if (ctx.activeSellExists) return { type: "HOLD", reason: "BUY blocked: opposite SELL lock active" };
    if (!isDecelerating) return { type: "HOLD", reason: "Momentum still declining - waiting for deceleration" };
    return { type: "BUY", reason: `Oversold bounce: price ${currentPrice.toFixed(2)} < BB lower ${bands.lower.toFixed(2)}, RSI ${rsi.toFixed(1)}, accel ${acceleration.toFixed(4)}`, confidence: 0.7 };
  }
  if (currentPrice > bands.upper && rsi > 70) {
    if (ctx.activeBuyExists) return { type: "HOLD", reason: "SELL blocked: opposite BUY lock active" };
    if (!isDecelerating) return { type: "HOLD", reason: "Momentum still rising - waiting for deceleration" };
    return { type: "SELL", reason: `Overbought fade: price ${currentPrice.toFixed(2)} > BB upper ${bands.upper.toFixed(2)}, RSI ${rsi.toFixed(1)}, accel ${acceleration.toFixed(4)}`, confidence: 0.7 };
  }
  return { type: "HOLD", reason: "No mean reversion signal" };
}

export function evaluateAiAdaptive(ctx: StrategyContext, config: TradeConfig): TradeSignal {
  const telemetry = ctx.strategy.rules?.telemetry || {};
  const minSpeedFilter = ctx.strategy.rules?.minVelocityFilter ?? 0.15;
  const maxAllowedPositionDivergence = ctx.strategy.rules?.maxAllowedPositionDivergence ?? 2.0;
  const useEmaConfirmation = ctx.strategy.rules?.useEmaConfirmation ?? true;
  const allowCounterTrend = ctx.strategy.rules?.allowCounterTrend ?? false;

  const velocity = ctx.velocity;
  const acceleration = ctx.acceleration;
  const isHighMomentum = Math.abs(velocity) > minSpeedFilter;
  const globAvgSpeed = ctx.knowledge.globalAverageSpeed || 0.15;
  const speedDivergence = Math.abs(velocity) / globAvgSpeed;
  const withinDivergenceLimit = speedDivergence <= maxAllowedPositionDivergence;
  let isEmaTrendConfirmed = true;
  if (useEmaConfirmation) {
    isEmaTrendConfirmed = velocity > 0 ? (ctx.fastEma > ctx.slowEma) : (ctx.fastEma < ctx.slowEma);
  }
  let isDirectionAllowed = true;
  if (!allowCounterTrend) {
    isDirectionAllowed = velocity > 0 ? (ctx.fastEma >= ctx.slowEma) : (ctx.fastEma <= ctx.slowEma);
  }
  
  // Allow multiple positions up to maxTrades, but respect directional lock
  const atMaxTrades = ctx.openTradesCount >= config.maxTrades;
  if (atMaxTrades) return { type: "HOLD", reason: "Max concurrent trades reached" };
  
  const directionalBlock = velocity > 0 ? ctx.activeSellExists : ctx.activeBuyExists;
  if (directionalBlock) return { type: "HOLD", reason: `Opposite ${velocity > 0 ? 'SELL' : 'BUY'} lock active` };
  
  if (isHighMomentum && withinDivergenceLimit && isEmaTrendConfirmed && isDirectionAllowed && Math.abs(acceleration) > 0.02) {
    if (velocity > 0 && acceleration > 0) {
      return { type: "BUY", reason: `AI momentum: speed +${velocity.toFixed(3)}, accel +${acceleration.toFixed(3)}, div ${speedDivergence.toFixed(2)}x`, confidence: 0.8 };
    }
    if (velocity < 0 && acceleration < 0) {
      return { type: "SELL", reason: `AI momentum: speed ${velocity.toFixed(3)}, accel ${acceleration.toFixed(3)}, div ${speedDivergence.toFixed(2)}x`, confidence: 0.8 };
    }
  }
  return { type: "HOLD", reason: "No AI adaptive signal" };
}

export function evaluateCustomStrategy(ctx: StrategyContext, config: TradeConfig): TradeSignal {
  const rules = ctx.strategy.rules?.conditions || [];
  for (const rule of rules) {
    if (evaluateRule(rule, ctx)) {
      return { type: rule.action, reason: `Custom rule: ${rule.indicator} ${rule.condition} ${rule.value}`, confidence: 0.6 };
    }
  }
  return { type: "HOLD", reason: "No custom rule matched" };
}

function evaluateRule(rule: any, ctx: StrategyContext): boolean {
  const indicatorValue = getIndicatorValue(rule.indicator, ctx);
  if (indicatorValue === null || indicatorValue === undefined) return false;
  switch (rule.condition) {
    case ">": return indicatorValue > Number(rule.value);
    case "<": return indicatorValue < Number(rule.value);
    case ">=": return indicatorValue >= Number(rule.value);
    case "<=": return indicatorValue <= Number(rule.value);
    case "==": return indicatorValue === rule.value;
    case "!=": return indicatorValue !== rule.value;
    default: return false;
  }
}

function getIndicatorValue(indicator: string, ctx: StrategyContext): number | null {
  switch (indicator) {
    case "rsi": return ctx.rsi;
    case "atr": return ctx.atr;
    case "fast_ema": return ctx.fastEma;
    case "slow_ema": return ctx.slowEma;
    case "velocity": return ctx.velocity;
    case "acceleration": return ctx.acceleration;
    case "price": return ctx.currentPrice;
    case "bb_upper": return ctx.bands.upper;
    case "bb_lower": return ctx.bands.lower;
    default: return null;
  }
}

export function evaluateStrategy(mode: StrategyMode, ctx: StrategyContext, config: TradeConfig): TradeSignal {
  if (ctx.openTradesCount >= config.maxTrades) return { type: "HOLD", reason: "Max trades reached" };
  switch (mode) {
    case StrategyMode.TREND_FOLLOWING: return evaluateTrendFollowing(ctx, config);
    case StrategyMode.MEAN_REVERSION: return evaluateMeanReversion(ctx, config);
    case StrategyMode.AI_ADAPTIVE: return evaluateAiAdaptive(ctx, config);
    default: return evaluateCustomStrategy(ctx, config);
  }
}

export interface BacktestPosition {
  type: "BUY" | "SELL";
  entryPrice: number;
  entryIndex: number;
}

export function evaluateStrategyBacktest(mode: StrategyMode | string, limit = 500): BacktestResult {
  const ticks = scalarAiDb.getTicks(limit);
  if (ticks.length < 5) {
    return { mode: String(mode), ticksAnalyzed: ticks.length, signals: 0, simulatedTrades: 0, wins: 0, losses: 0, winRate: 0, totalProfit: 0, avgProfit: 0, maxDrawdown: 0 };
  }
  let signals = 0;
  let simulatedTrades = 0;
  let wins = 0;
  let losses = 0;
  let totalProfit = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const openPositions: BacktestPosition[] = [];
  const knowledge = scalarAiDb.getAiKnowledge() || { totalObservations: 0, globalAverageSpeed: 0, peakVelocityRegistered: 0, timeOfDayPatterns: {}, lastUpdated: "" };
  const strategy = scalarAiDb.getAiStrategy() || { id: "default", name: "Default", description: "", mode: "AI_ADAPTIVE" as StrategyMode, rules: {}, createdAt: "", updatedAt: "" };
  const config = scalarAiDb.getSettings() || { isActive: false, selectedStrategy: "TREND_FOLLOWING" as StrategyMode, lotSize: 0.1, takeProfitPoints: 300, stopLossPoints: 150, trailingStopPoints: 100, useTrailingStop: true, maxTrades: 3, tradingMode: "Scalping" as "Scalping" | "Swing" };

  for (let i = 5; i < ticks.length; i++) {
    const window = ticks.slice(0, i + 1);
    const openTradesCount = openPositions.length;
    const activeBuyExists = openPositions.some(p => p.type === "BUY");
    const activeSellExists = openPositions.some(p => p.type === "SELL");
    const ctx = buildContext(window, knowledge, strategy, config.tradingMode || "Scalping", openTradesCount, activeBuyExists, activeSellExists);
    const signal = evaluateStrategy(mode as StrategyMode, ctx, config);
    
    if (signal.type !== "HOLD") signals++;
    
    // Close existing positions on opposite signal or HOLD after entry
    for (let j = openPositions.length - 1; j >= 0; j--) {
      const pos = openPositions[j];
      const profitFactor = pos.type === "BUY" ? ctx.currentPrice - pos.entryPrice : pos.entryPrice - ctx.currentPrice;
      const pointsDiff = Math.abs(profitFactor) * 100;
      
      // Check TP/SL
      if (profitFactor > 0 && pointsDiff >= config.takeProfitPoints) {
        const profit = Number((profitFactor * 10.0 * config.lotSize).toFixed(2));
        if (profit > 0) wins++; else losses++;
        totalProfit += profit;
        peak = Math.max(peak, totalProfit);
        maxDrawdown = Math.max(maxDrawdown, peak - totalProfit);
        openPositions.splice(j, 1);
        simulatedTrades++;
      } else if (profitFactor < 0 && pointsDiff >= config.stopLossPoints) {
        const profit = Number((profitFactor * 10.0 * config.lotSize).toFixed(2));
        if (profit > 0) wins++; else losses++;
        totalProfit += profit;
        peak = Math.max(peak, totalProfit);
        maxDrawdown = Math.max(maxDrawdown, peak - totalProfit);
        openPositions.splice(j, 1);
        simulatedTrades++;
      }
    }
    
    // Open new position on signal
    if (signal.type !== "HOLD" && openPositions.length < config.maxTrades) {
      openPositions.push({
        type: signal.type,
        entryPrice: ctx.currentPrice,
        entryIndex: i,
      });
    }
  }
  
  // Close any remaining open positions at the end
  for (const pos of openPositions) {
    const lastPrice = ticks[ticks.length - 1].close ?? ticks[ticks.length - 1].price;
    const profitFactor = pos.type === "BUY" ? lastPrice - pos.entryPrice : pos.entryPrice - lastPrice;
    const profit = Number((profitFactor * 10.0 * config.lotSize).toFixed(2));
    if (profit > 0) wins++; else losses++;
    totalProfit += profit;
    simulatedTrades++;
  }
  
  return {
    mode: String(mode),
    ticksAnalyzed: ticks.length,
    signals,
    simulatedTrades,
    wins,
    losses,
    winRate: simulatedTrades > 0 ? Math.round((wins / simulatedTrades) * 100) : 0,
    totalProfit: Number(totalProfit.toFixed(2)),
    avgProfit: simulatedTrades > 0 ? Number((totalProfit / simulatedTrades).toFixed(2)) : 0,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
  };
}
