import { scalarAiDb } from "../db";
import { StrategyMode, TradeConfig } from "../types";

export interface BacktestCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  direction: "up" | "down" | "flat";
  volume?: number;
}

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  type: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  profit: number;
  reason: string;
}

export interface BacktestResult {
  strategyId: string;
  strategyMode: StrategyMode;
  symbol: string;
  fromTime: number;
  toTime: number;
  initialBalance: number;
  finalBalance: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgWin: number;
  avgLoss: number;
  trades: BacktestTrade[];
}

export class BacktestEngine {
  runBacktest(
    strategyMode: StrategyMode,
    candles: BacktestCandle[],
    config: TradeConfig,
    initialBalance: number = 10000
  ): BacktestResult {
    const trades: BacktestTrade[] = [];
    let balance = initialBalance;
    let peakBalance = initialBalance;
    let maxDrawdown = 0;
    let position: { type: "BUY" | "SELL"; entryPrice: number; entryTime: number } | null = null;

    const takeProfit = config.takeProfitPoints * 0.0001;
    const stopLoss = config.stopLossPoints * 0.0001;

    for (let i = 1; i < candles.length; i++) {
      const candle = candles[i];
      const prevCandle = candles[i - 1];

      if (!position) {
        let shouldEnter = false;
        let type: "BUY" | "SELL" = "BUY";

        if (strategyMode === StrategyMode.TREND_FOLLOWING) {
          if (candle.close > prevCandle.high && candle.direction === "up") {
            shouldEnter = true;
            type = "BUY";
          } else if (candle.close < prevCandle.low && candle.direction === "down") {
            shouldEnter = true;
            type = "SELL";
          }
        } else if (strategyMode === StrategyMode.MEAN_REVERSION) {
          if (candle.direction === "up" && prevCandle.direction === "down") {
            shouldEnter = true;
            type = "BUY";
          } else if (candle.direction === "down" && prevCandle.direction === "up") {
            shouldEnter = true;
            type = "SELL";
          }
        } else if (strategyMode === StrategyMode.AI_ADAPTIVE) {
          if (candle.direction !== prevCandle.direction && prevCandle.direction !== "flat") {
            shouldEnter = true;
            type = candle.direction === "up" ? "BUY" : "SELL";
          }
        }

        if (shouldEnter) {
          position = {
            type,
            entryPrice: candle.close,
            entryTime: candle.time,
          };
        }
      } else {
        let shouldExit = false;
        let exitPrice = candle.close;

        if (position.type === "BUY") {
          const profit = candle.close - position.entryPrice;
          if (profit >= takeProfit || profit <= -stopLoss) {
            shouldExit = true;
            exitPrice = profit >= takeProfit ? position.entryPrice + takeProfit : position.entryPrice - stopLoss;
          }
        } else {
          const profit = position.entryPrice - candle.close;
          if (profit >= takeProfit || profit <= -stopLoss) {
            shouldExit = true;
            exitPrice = profit >= takeProfit ? position.entryPrice - takeProfit : position.entryPrice + stopLoss;
          }
        }

        if (shouldExit && position) {
          const profit = position.type === "BUY" ? exitPrice - position.entryPrice : position.entryPrice - exitPrice;
          balance += profit;
          peakBalance = Math.max(peakBalance, balance);
          const drawdown = (peakBalance - balance) / peakBalance;
          maxDrawdown = Math.max(maxDrawdown, drawdown);

          trades.push({
            entryTime: position.entryTime,
            exitTime: candle.time,
            type: position.type,
            entryPrice: position.entryPrice,
            exitPrice,
            profit,
            reason: profit >= takeProfit ? "Take profit" : "Stop loss",
          });

          position = null;
        }
      }
    }

    const wins = trades.filter(t => t.profit > 0).length;
    const losses = trades.filter(t => t.profit <= 0).length;
    const winRate = trades.length > 0 ? wins / trades.length : 0;
    const avgWin = wins > 0 ? trades.filter(t => t.profit > 0).reduce((sum, t) => sum + t.profit, 0) / wins : 0;
    const avgLoss = losses > 0 ? Math.abs(trades.filter(t => t.profit <= 0).reduce((sum, t) => sum + t.profit, 0)) / losses : 0;
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

    const returns = trades.map(t => t.profit);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 0 ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length : 0;
    const sharpeRatio = variance > 0 ? avgReturn / Math.sqrt(variance) : 0;

    return {
      strategyId: "",
      strategyMode,
      symbol: "unknown",
      fromTime: candles[0]?.time || 0,
      toTime: candles[candles.length - 1]?.time || 0,
      initialBalance,
      finalBalance: balance,
      totalTrades: trades.length,
      wins,
      losses,
      winRate,
      profitFactor,
      maxDrawdown,
      sharpeRatio,
      avgWin,
      avgLoss,
      trades,
    };
  }

  calculateMetrics(trades: BacktestTrade[], initialBalance: number) {
    const wins = trades.filter(t => t.profit > 0).length;
    const losses = trades.filter(t => t.profit <= 0).length;
    const winRate = trades.length > 0 ? wins / trades.length : 0;
    const avgWin = wins > 0 ? trades.filter(t => t.profit > 0).reduce((sum, t) => sum + t.profit, 0) / wins : 0;
    const avgLoss = losses > 0 ? Math.abs(trades.filter(t => t.profit <= 0).reduce((sum, t) => sum + t.profit, 0)) / losses : 0;
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

    return {
      winRate,
      profitFactor,
      avgWin,
      avgLoss,
    };
  }

  saveResult(result: BacktestResult): void {
    const id = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    scalarAiDb.insertBacktestResult({
      id,
      strategy_id: result.strategyId,
      strategy_version_id: null,
      symbol: result.symbol,
      from_time: result.fromTime,
      to_time: result.toTime,
      initial_balance: result.initialBalance,
      final_balance: result.finalBalance,
      total_trades: result.totalTrades,
      wins: result.wins,
      losses: result.losses,
      win_rate: result.winRate,
      profit_factor: result.profitFactor,
      max_drawdown: result.maxDrawdown,
      sharpe_ratio: result.sharpeRatio,
      avg_win: result.avgWin,
      avg_loss: result.avgLoss,
      metadata: JSON.stringify({ trades: result.trades.length }),
      created_at: new Date().toISOString(),
    });
  }
}
