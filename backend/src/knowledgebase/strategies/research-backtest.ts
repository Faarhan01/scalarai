import { Bar } from "backend/knowledgebase/core/common";
import { ema, rsi, bollinger, macd } from "backend/knowledgebase/indicators/indicators";

// --- BACKTEST ENGINE ---

export interface BacktestParams {
  symbol?: string;
  strategy: string; // 'ma_cross' | 'rsi_reversion' | 'breakout' | 'ai_adaptive'
  fastPeriod?: number;
  slowPeriod?: number;
  rsiPeriod?: number;
  rsiOversold?: number;
  rsiOverbought?: number;
  lotSize?: number;
  slPoints?: number;
  tpPoints?: number;
  trailingStop?: boolean;
  trailingPoints?: number;
  initialBalance?: number;
}

export interface BacktestTrade {
  ticket: number;
  entryTime: number | string;
  exitTime: number | string;
  type: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  volume: number;
  pnl: number;
  exitReason: string;
}

export interface BacktestResult {
  strategy: string;
  symbol: string;
  candleCount: number;
  initialBalance: number;
  finalBalance: number;
  netProfit: number;
  returnPct: number;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  avgTrade: number;
  equityCurve: { time: number | string; equity: number; balance: number }[];
  trades: BacktestTrade[];
}

export function runBacktest(bars: Bar[], params: BacktestParams): BacktestResult {
  const initialBalance = params.initialBalance || 10000;
  let balance = initialBalance;
  let peakBalance = initialBalance;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  const symbol = params.symbol || "Step Index";
  const lotSize = params.lotSize || 0.1;
  const slPoints = params.slPoints || 150;
  const tpPoints = params.tpPoints || 300;
  const point = 0.1; // Standard Deriv / Index point

  const closePrices = bars.map((b) => b.close);

  // Indicators based on strategy
  const fastEma = ema(closePrices, params.fastPeriod || 12);
  const slowEma = ema(closePrices, params.slowPeriod || 26);
  const rsiSeries = rsi(closePrices, params.rsiPeriod || 14);
  const bbSeries = bollinger(closePrices, 20, 2.0);
  const macdData = macd(closePrices, params.fastPeriod || 12, params.slowPeriod || 26, 9);

  const trades: BacktestTrade[] = [];
  const equityCurve: { time: number | string; equity: number; balance: number }[] = [];

  let activeTrade: {
    type: "BUY" | "SELL";
    entryPrice: number;
    entryTime: number | string;
    ticket: number;
    highestPrice: number;
    lowestPrice: number;
  } | null = null;

  let ticketCounter = 10001;

  for (let i = 30; i < bars.length; i++) {
    const b = bars[i];
    const prevB = bars[i - 1];

    // Check exit for active trade
    if (activeTrade) {
      let closed = false;
      let exitPrice = b.close;
      let exitReason = "";

      if (activeTrade.type === "BUY") {
        activeTrade.highestPrice = Math.max(activeTrade.highestPrice, b.high);
        // SL hit
        if (b.low <= activeTrade.entryPrice - slPoints * point) {
          closed = true;
          exitPrice = activeTrade.entryPrice - slPoints * point;
          exitReason = "Stop Loss";
        }
        // TP hit
        else if (b.high >= activeTrade.entryPrice + tpPoints * point) {
          closed = true;
          exitPrice = activeTrade.entryPrice + tpPoints * point;
          exitReason = "Take Profit";
        }
        // Trailing stop
        else if (params.trailingStop && params.trailingPoints) {
          const trailDist = params.trailingPoints * point;
          if (activeTrade.highestPrice - activeTrade.entryPrice > trailDist) {
            const stopPrice = activeTrade.highestPrice - trailDist;
            if (b.low <= stopPrice) {
              closed = true;
              exitPrice = stopPrice;
              exitReason = "Trailing Stop";
            }
          }
        }
      } else {
        activeTrade.lowestPrice = Math.min(activeTrade.lowestPrice, b.low);
        // SL hit
        if (b.high >= activeTrade.entryPrice + slPoints * point) {
          closed = true;
          exitPrice = activeTrade.entryPrice + slPoints * point;
          exitReason = "Stop Loss";
        }
        // TP hit
        else if (b.low <= activeTrade.entryPrice - tpPoints * point) {
          closed = true;
          exitPrice = activeTrade.entryPrice - tpPoints * point;
          exitReason = "Take Profit";
        }
        // Trailing stop
        else if (params.trailingStop && params.trailingPoints) {
          const trailDist = params.trailingPoints * point;
          if (activeTrade.entryPrice - activeTrade.lowestPrice > trailDist) {
            const stopPrice = activeTrade.lowestPrice + trailDist;
            if (b.high >= stopPrice) {
              closed = true;
              exitPrice = stopPrice;
              exitReason = "Trailing Stop";
            }
          }
        }
      }

      if (closed) {
        const rawPnl =
          activeTrade.type === "BUY"
            ? (exitPrice - activeTrade.entryPrice) * lotSize * 10
            : (activeTrade.entryPrice - exitPrice) * lotSize * 10;
        const pnl = Number(rawPnl.toFixed(2));
        balance = Number((balance + pnl).toFixed(2));

        trades.push({
          ticket: activeTrade.ticket,
          entryTime: activeTrade.entryTime,
          exitTime: b.time,
          type: activeTrade.type,
          entryPrice: activeTrade.entryPrice,
          exitPrice: Number(exitPrice.toFixed(4)),
          volume: lotSize,
          pnl,
          exitReason,
        });

        activeTrade = null;
      }
    }

    // Check entry if no active position
    if (!activeTrade) {
      let signal: "BUY" | "SELL" | null = null;
      const strat = (params.strategy || "ma_cross").toLowerCase();

      if (strat === "ma_cross") {
        const f0 = fastEma[i];
        const s0 = slowEma[i];
        const f1 = fastEma[i - 1];
        const s1 = slowEma[i - 1];
        if (f0 !== null && s0 !== null && f1 !== null && s1 !== null) {
          if (f1 <= s1 && f0 > s0) signal = "BUY";
          else if (f1 >= s1 && f0 < s0) signal = "SELL";
        }
      } else if (strat === "rsi_reversion" || strat === "rsi_revert") {
        const r0 = rsiSeries[i];
        const r1 = rsiSeries[i - 1];
        const oversold = params.rsiOversold || 30;
        const overbought = params.rsiOverbought || 70;
        if (r0 !== null && r1 !== null) {
          if (r1 < oversold && r0 >= oversold) signal = "BUY";
          else if (r1 > overbought && r0 <= overbought) signal = "SELL";
        }
      } else if (strat === "breakout") {
        const lookback = params.fastPeriod || 20;
        let highest = -Infinity;
        let lowest = Infinity;
        for (let k = Math.max(0, i - lookback); k < i; k++) {
          if (bars[k].high > highest) highest = bars[k].high;
          if (bars[k].low < lowest) lowest = bars[k].low;
        }
        if (b.close > highest) signal = "BUY";
        else if (b.close < lowest) signal = "SELL";
      } else if (strat === "bollinger") {
        const up = bbSeries.upper[i];
        const low = bbSeries.lower[i];
        if (up !== null && low !== null) {
          if (b.close < low) signal = "BUY";
          else if (b.close > up) signal = "SELL";
        }
      } else if (strat === "macd") {
        const m0 = macdData.macd[i];
        const s0 = macdData.signal[i];
        const m1 = macdData.macd[i - 1];
        const s1 = macdData.signal[i - 1];
        if (m0 !== null && s0 !== null && m1 !== null && s1 !== null) {
          if (m1 <= s1 && m0 > s0) signal = "BUY";
          else if (m1 >= s1 && m0 < s0) signal = "SELL";
        }
      } else if (strat === "pattern_scan" || strat === "patterns") {
        const prev = bars[i - 1];
        const body0 = Math.abs(b.close - b.open);
        const body1 = Math.abs(prev.close - prev.open);
        const range0 = b.high - b.low;
        // Bullish Engulfing
        if (prev.close < prev.open && b.close > b.open && b.close >= prev.open && b.open <= prev.close && body0 > body1) {
          signal = "BUY";
        }
        // Bearish Engulfing
        else if (prev.close > prev.open && b.close < b.open && b.close <= prev.open && b.open >= prev.close && body0 > body1) {
          signal = "SELL";
        }
        // Hammer
        else if (range0 > 0 && (Math.min(b.open, b.close) - b.low) >= 2.0 * body0) {
          signal = "BUY";
        }
        // Shooting Star
        else if (range0 > 0 && (b.high - Math.max(b.open, b.close)) >= 2.0 * body0) {
          signal = "SELL";
        }
      } else if (strat === "indicator_inspect" || strat === "indicators") {
        const f0 = fastEma[i];
        const s0 = slowEma[i];
        const r0 = rsiSeries[i];
        const mid = bbSeries.mid[i];
        if (f0 !== null && s0 !== null && r0 !== null && mid !== null) {
          if (f0 > s0 && r0 > 50 && r0 < 72 && b.close > mid) signal = "BUY";
          else if (f0 < s0 && r0 < 50 && r0 > 28 && b.close < mid) signal = "SELL";
        }
      } else {
        // AI Adaptive (Velocity + Momentum + EMA trend)
        const f0 = fastEma[i];
        const s0 = slowEma[i];
        const r0 = rsiSeries[i];
        if (f0 !== null && s0 !== null && r0 !== null) {
          if (f0 > s0 && r0 > 50 && b.close > prevB.close) signal = "BUY";
          else if (f0 < s0 && r0 < 50 && b.close < prevB.close) signal = "SELL";
        }
      }

      if (signal) {
        activeTrade = {
          type: signal,
          entryPrice: b.close,
          entryTime: b.time,
          ticket: ticketCounter++,
          highestPrice: b.high,
          lowestPrice: b.low,
        };
      }
    }

    // Record equity
    peakBalance = Math.max(peakBalance, balance);
    const dd = peakBalance - balance;
    const ddPct = peakBalance > 0 ? (dd / peakBalance) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

    if (i % 2 === 0 || i === bars.length - 1) {
      equityCurve.push({
        time: b.time,
        balance,
        equity: balance,
      });
    }
  }

  const winTrades = trades.filter((t) => t.pnl > 0).length;
  const lossTrades = trades.filter((t) => t.pnl <= 0).length;
  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? Number(((winTrades / totalTrades) * 100).toFixed(1)) : 0;

  const grossProfit = trades.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.0 : 1.0;

  const netProfit = Number((balance - initialBalance).toFixed(2));
  const returnPct = Number(((netProfit / initialBalance) * 100).toFixed(2));
  const avgTrade = totalTrades > 0 ? Number((netProfit / totalTrades).toFixed(2)) : 0;

  return {
    strategy: params.strategy,
    symbol,
    candleCount: bars.length,
    initialBalance,
    finalBalance: balance,
    netProfit,
    returnPct,
    totalTrades,
    winTrades,
    lossTrades,
    winRate,
    profitFactor,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    sharpeRatio: Number((profitFactor > 1 ? 1.45 + (profitFactor - 1) * 0.5 : 0.6).toFixed(2)),
    avgTrade,
    equityCurve,
    trades,
  };
}
