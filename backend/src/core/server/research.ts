import { Application, Request, Response } from "express";
import { AppStore } from "../../services/app-store";
import { scalarAiDb } from "../../db";
import { Bar } from "backend/knowledgebase/core/common";
import { sma, ema, rsi, atr, bollinger, macd } from "backend/knowledgebase/indicators/indicators";
import { scanCandlePatterns } from "backend/knowledgebase/patterns/patterns";
import { runBacktest } from "backend/knowledgebase/strategies/research-backtest";
import { parseSymbol } from "./validation";
import { ok, error } from "./responses";
import { config } from "../config";
import { mt5Bridge } from "../../gateway/mt5-bridge";

export interface StrategyForgeResultItem {
  id: string;
  tag: string;
  symbol: string;
  mode: number;
  modeName: string;
  timeframe: string;
  fast?: number;
  slow?: number;
  period?: number;
  threshold?: number;
  lots?: number;
  stopPips?: number;
  takePips?: number;
  criterion?: number;
  score: number;
  trades: number;
  wins: number;
  losses: number;
  profit: number;
  netPips?: number;
  profitFactor: number;
  expectedPayoff?: number;
  sharpe: number;
  drawdown: number;
  drawdownPct: number;
  winRate: number;
  // Money, not counts: STAT_MAX_CONWINS / STAT_MAX_CONLOSSES return money in
  // this MT5 build despite being documented as counts.
  maxWinRunMoney?: number;
  maxLossRunMoney?: number;
  attempts?: number;
  skipped?: number;
  blocked?: number;
  // --- Evidence, not just outcome. -------------------------------------
  // Without these a losing run and a winning run are indistinguishable once
  // they are both just "profit: -121, PF 0.82". The verdict is the EA's own
  // ruling on whether the sample supports the claim, and it must survive
  // ingest or the platform files a fitted patch next to a real edge.
  verdict?: string;
  tStat?: number;
  /** PF recomputed from the deal history; differs from profitFactor on
   *  partially-closed trades. Both are kept so the gap stays visible. */
  tradeProfitFactor?: number;
  /** Measured erosion of the winning leg, as % of the target. */
  costSharePct?: number;
  /** Measured win rate against the rate actually needed to pay for spread. */
  breakEvenWinRate?: number;
  avgWinTicks?: number;
  avgLossTicks?: number;
  spreadTicks?: number;
  /** Strategy identity. `mode` is the family index; these are the rest of
   *  the taxonomy, which is what actually distinguishes two runs. */
  stratClass?: string;
  stratFamily?: string;
  stratIndicator?: string;
  stratPattern?: string;
  stratTimeframe?: string;
  /** Window the tester actually loaded, which is not always the window
   *  requested -- this symbol silently caps at 62 days. */
  fromDate?: string;
  toDate?: string;
  minStopDist?: number;
  stopsClamped?: number;
  timestamp: number;
  source: "LIVE_EA" | "CSV_IMPORT" | "STUDIO_TESTER";
}

// In-memory persistent array for StrategyForge backtest & session results
const strategyForgeResults: StrategyForgeResultItem[] = [];

// Must mirror ENUM_STRAT_FAMILY in StrategyForge.mq5, in order. This used to be
// the pre-taxonomy flat list, so a RUN_FADE run (7) was labelled AI_ADAPTIVE --
// the stored result then named a strategy the EA never traded.
const MODE_NAMES = ["MA_CROSS", "RSI_REVERT", "BREAKOUT", "BOLLINGER", "MACD",
  "PATTERN", "MOMENTUM", "RUN_FADE", "VOL_EXPANSION", "RANGE_REVERT",
  "TREND_PULLBACK", "SEQUENTIAL"];

/** Record a StrategyForge result, newest first, capped at 50. */
export function recordStrategyForgeResult(item: StrategyForgeResultItem): void {
  strategyForgeResults.unshift(item);
  if (strategyForgeResults.length > 50) strategyForgeResults.pop();
}

/** Read the store. Exposed so the MCP server can surface tester results. */
export function getStrategyForgeResults(): StrategyForgeResultItem[] {
  return strategyForgeResults;
}

/**
 * Parse a StrategyForge_<tag>.csv into a result item.
 *
 * This is the ONLY way tester results can reach the site: the EA's own
 * WebRequest post cannot work from the Strategy Tester (error 4014, "function
 * not allowed for call"), regardless of the MT5 allow-list. The agent runs the
 * pass, reads the CSV the EA wrote to FILE_COMMON, and hands it here.
 *
 * Shared with the MCP tool of the same purpose so both paths agree.
 */
export function parseStrategyForgeCsv(csvContent: string, fallbackSymbol: string): StrategyForgeResultItem | null {
  const lines = csvContent.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  // Sniff the delimiter. The EA pins FIO_DELIMITER to a comma, but an older
  // build defaulted to a tab, and a reader that assumes ',' silently produces
  // one giant field instead of failing.
  const header = lines[0].split(",").map((h) => h.trim());
  const delim = maxBy(header.length, [",", "\t", ";"], (d) => header.join(d).split(d).length);
  const cols = lines[0].split(delim).map((h) => h.trim());
  const vals = lines[1].split(delim).map((v) => v.trim());

  const map: Record<string, string> = {};
  for (let i = 0; i < cols.length; i++) map[cols[i]] = vals[i] || "";

  // Require the core StrategyForge columns. Without this, any two-line string
  // ("not,a,valid" / "csv") parses as a result with every metric defaulting to
  // zero, and gets recorded as though it were a real test run.
  const REQUIRED = ["score", "trades", "profit"];
  const missing = REQUIRED.filter((k) => !(k in map));
  if (missing.length) return null;

  const mode = parseInt(map["mode"] || "0", 10);
  const trades = parseInt(map["trades"] || "0", 10);
  const wins = parseInt(map["wins"] || "0", 10);
  const losses = parseInt(map["losses"] || "0", 10);
  const num = (k: string, dflt: number) => {
    const v = parseFloat(map[k] ?? "");
    return Number.isFinite(v) ? v : dflt;
  };

  // Prefer the EA's MEASURED win rate over wins/trades. TesterStatistics'
  // PROFIT_TRADES / LOSS_TRADES split disagrees with the deal history on
  // partially-closed trades, and the deal scan is what t-stat and PF already
  // use -- so taking the measured value keeps all three consistent.
  const measuredWinRate = num("win_rate", -1);
  const winRate = measuredWinRate >= 0
    ? measuredWinRate
    : (trades > 0 ? (wins / trades) * 100 : 0);

  return {
    id: "sf-csv-" + Date.now(),
    tag: map["tag"] || "uploaded_run",
    symbol: map["symbol"] || fallbackSymbol,
    mode,
    modeName: map["strat_family"] || MODE_NAMES[mode] || "MODE_" + mode,
    timeframe: "CSV_PASS",
    fast: parseInt(map["fast"] || "0", 10),
    slow: parseInt(map["slow"] || "0", 10),
    period: parseInt(map["period"] || "0", 10),
    threshold: parseFloat(map["threshold"] || "0"),
    lots: parseFloat(map["lots"] || "0.1"),
    stopPips: parseFloat(map["stop_pips"] || "0"),
    takePips: parseFloat(map["take_pips"] || "0"),
    criterion: parseInt(map["criterion"] || "1", 10),
    score: parseFloat(map["score"] || "0"),
    trades,
    wins,
    losses,
    profit: parseFloat(map["profit"] || "0"),
    netPips: parseFloat(map["net_pips"] || "0"),
    profitFactor: parseFloat(map["profit_factor"] || "1.0"),
    expectedPayoff: parseFloat(map["expected_payoff"] || "0"),
    sharpe: parseFloat(map["sharpe"] || "0"),
    drawdown: parseFloat(map["dd_abs"] || "0"),
    drawdownPct: parseFloat(map["dd_rel_pct"] || "0"),
    maxWinRunMoney: parseFloat(map["max_win_run_money"] || "0"),
    maxLossRunMoney: parseFloat(map["max_loss_run_money"] || "0"),
    winRate,
    verdict: map["verdict"] || undefined,
    tStat: num("t_stat", 0),
    tradeProfitFactor: num("trade_profit_factor", 0),
    costSharePct: num("cost_share_pct", 0),
    breakEvenWinRate: num("breakeven_win_rate", 0),
    avgWinTicks: num("avg_win_ticks", 0),
    avgLossTicks: num("avg_loss_ticks", 0),
    spreadTicks: num("spread_ticks", 0),
    stratClass: map["strat_class"] || undefined,
    stratFamily: map["strat_family"] || undefined,
    stratIndicator: map["strat_indicator"] || undefined,
    stratPattern: map["strat_pattern"] || undefined,
    stratTimeframe: map["strat_timeframe"] || undefined,
    fromDate: map["from_date"] || undefined,
    toDate: map["to_date"] || undefined,
    minStopDist: num("min_stop_dist", 0),
    stopsClamped: num("stops_clamped", 0),
    timestamp: Date.now(),
    source: "CSV_IMPORT",
  };
}

function maxBy<T>(_key: T, candidates: string[], score: (c: string) => number): string {
  return candidates.reduce((best, c) => (score(c) > score(best) ? c : best), candidates[0]);
}

export function registerResearchRoutes(app: Application, store: AppStore) {
  // 1. Catalogue
  app.get("/api/research/catalogue", (req: Request, res: Response) => {
    return ok(res, {
      indicators: [
        { name: "SMA", description: "Simple Moving Average over specified window" },
        { name: "EMA", description: "Exponential Moving Average with adaptive smoothing" },
        { name: "RSI", description: "Relative Strength Index momentum oscillator (0-100)" },
        { name: "MACD", description: "Moving Average Convergence Divergence with signal & histogram" },
        { name: "Bollinger Bands", description: "Upper/Lower volatility bands around SMA" },
        { name: "ATR", description: "Average True Range measuring absolute market volatility" },
      ],
      patterns: [
        { name: "Hammer", type: "Bullish", description: "Small body at top with long lower shadow (min 2x body)" },
        { name: "Inverted Hammer", type: "Bullish", description: "Small body at bottom with long upper shadow" },
        { name: "Shooting Star", type: "Bearish", description: "Small body at bottom after uptrend with long upper shadow" },
        { name: "Hanging Man", type: "Bearish", description: "Small body at top after uptrend with long lower shadow" },
        { name: "Bullish Engulfing", type: "Bullish", description: "Large green candle engulfing previous red body" },
        { name: "Bearish Engulfing", type: "Bearish", description: "Large red candle engulfing previous green body" },
        { name: "Doji", type: "Neutral", description: "Open and close virtually equal, signaling indecision" },
      ],
      strategies: [
        { id: "ma_cross", name: "Fast/Slow Moving Average Cross", type: "Trend Following" },
        { id: "rsi_reversion", name: "RSI Dynamic Mean Reversion", type: "Oscillator" },
        { id: "breakout", name: "Donchian Range Breakout", type: "Volatility" },
        { id: "bollinger", name: "Bollinger Volatility Mean Reversion", type: "Volatility" },
        { id: "macd", name: "MACD Signal Line Cross", type: "Momentum" },
        { id: "pattern_scan", name: "Candlestick Pattern Recognition", type: "Price Action" },
        { id: "indicator_inspect", name: "Indicator Inspector Composite", type: "Multi-Indicator" },
        { id: "ai_adaptive", name: "Adaptive Multi-Regime Quant Model", type: "Machine Learning" },
      ],
    });
  });

  // 2. Indicators list
  app.get("/api/research/indicators", (req: Request, res: Response) => {
    return ok(res, [
      { id: "sma", name: "Simple Moving Average", params: [{ name: "period", default: 20 }] },
      { id: "ema", name: "Exponential Moving Average", params: [{ name: "period", default: 14 }] },
      { id: "rsi", name: "Relative Strength Index", params: [{ name: "period", default: 14 }] },
      { id: "macd", name: "MACD", params: [{ name: "fast", default: 12 }, { name: "slow", default: 26 }, { name: "signal", default: 9 }] },
      { id: "bollinger", name: "Bollinger Bands", params: [{ name: "period", default: 20 }, { name: "stdDev", default: 2.0 }] },
      { id: "atr", name: "Average True Range", params: [{ name: "period", default: 14 }] },
    ]);
  });

  // 3. Patterns list
  app.get("/api/research/patterns", (req: Request, res: Response) => {
    return ok(res, [
      { id: "hammer", name: "Hammer", sentiment: "Bullish", reliability: "Medium" },
      { id: "inverted_hammer", name: "Inverted Hammer", sentiment: "Bullish", reliability: "Medium" },
      { id: "shooting_star", name: "Shooting Star", sentiment: "Bearish", reliability: "High" },
      { id: "hanging_man", name: "Hanging Man", sentiment: "Bearish", reliability: "Medium" },
      { id: "bullish_engulfing", name: "Bullish Engulfing", sentiment: "Bullish", reliability: "High" },
      { id: "bearish_engulfing", name: "Bearish Engulfing", sentiment: "Bearish", reliability: "High" },
      { id: "doji", name: "Doji", sentiment: "Indecision", reliability: "Medium" },
    ]);
  });

  // 4. Pattern Scanning (handles both /api/research/patterns/scan and /api/research/pattern-scan)
  const handlePatternScan = async (req: Request, res: Response) => {
    try {
      const { symbol, count = 100 } = req.body || {};
      const sym = parseSymbol(symbol, store.getActiveSymbol() || config.defaultSymbol);
      let dbCandles = scalarAiDb.getCandles(sym, undefined, undefined, Math.min(Number(count), 500));

      // Attempt to pull real historical rates from MT5 bridge if DB has insufficient candles
      if (dbCandles.length < 10) {
        try {
          const ratesRes = await mt5Bridge.getRates(sym, 1, Math.min(Number(count), 100));
          if (ratesRes && ratesRes.success && Array.isArray(ratesRes.rates) && ratesRes.rates.length > 0) {
            store.ingestBulkCandles(
              sym,
              ratesRes.rates.map((r: any) => ({
                time: typeof r.time === "number" ? (r.time < 10000000000 ? r.time * 1000 : r.time) : Date.now(),
                open: r.open,
                high: r.high,
                low: r.low,
                close: r.close,
                volume: r.tick_volume || r.volume || 100,
              }))
            );
            dbCandles = scalarAiDb.getCandles(sym, undefined, undefined, Math.min(Number(count), 500));
          }
        } catch {
          // quiet sync
        }
      }

      const bars: Bar[] = dbCandles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 100,
      }));

      if (bars.length < 5) {
        return res.json({
          success: true,
          symbol: sym,
          totalBars: bars.length,
          detectedPatterns: [],
          patterns: [],
          message: "Awaiting live candle data from MetaTrader 5 bridge.",
        });
      }

      const patterns = scanCandlePatterns(bars);
      const payload = { symbol: sym, totalBars: bars.length, detectedPatterns: patterns, patterns };
      return res.json({ success: true, ...payload, data: payload });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  };

  app.post("/api/research/patterns/scan", handlePatternScan);
  app.post("/api/research/pattern-scan", handlePatternScan);

  // Knowledge pattern results (stored in pattern_results table)
  app.get("/api/knowledge/patterns", (req: Request, res: Response) => {
    const symbol = req.query.symbol as string | undefined;
    const timeframe = req.query.timeframe as string | undefined;
    const verdict = req.query.verdict as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const results = scalarAiDb.getPatternResults(symbol, timeframe, verdict, limit);
    return ok(res, { count: results.length, results });
  });

  app.post("/api/knowledge/check-pattern", async (req: Request, res: Response) => {
    try {
      const { symbol, timeframe = "M15", pattern_name, bars = 1000, forward_bars = 5, cost_points = 0, min_trades = 30 } = req.body || {};
      const sym = parseSymbol(symbol, store.getActiveSymbol() || config.defaultSymbol);

      let dbCandles = scalarAiDb.getCandles(sym, undefined, undefined, Math.min(Number(bars), 5000));
      if (dbCandles.length < 10) {
        try {
          const ratesRes = await mt5Bridge.getRates(sym, 1, Math.min(Number(bars), 500));
          if (ratesRes && ratesRes.success && Array.isArray(ratesRes.rates) && ratesRes.rates.length > 0) {
            store.ingestBulkCandles(sym, ratesRes.rates.map((r: any) => ({
              time: typeof r.time === "number" ? (r.time < 10000000000 ? r.time * 1000 : r.time) : Date.now(),
              open: r.open, high: r.high, low: r.low, close: r.close,
              volume: r.tick_volume || r.volume || 100,
            })));
            dbCandles = scalarAiDb.getCandles(sym, undefined, undefined, Math.min(Number(bars), 5000));
          }
        } catch { /* quiet */ }
      }

      const candleBars = dbCandles.map((c: any) => ({
        time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 100,
      }));

      if (candleBars.length < 10) {
        return ok(res, { success: false, error: "Insufficient bar data" });
      }

      const { checkPattern } = await import("../../knowledgebase/patterns/pattern-checker");
      const result = checkPattern({
        symbol: sym,
        timeframe,
        pattern_name: pattern_name || "engulfing",
        bars: candleBars,
        forward_bars,
        cost_points: cost_points,
        min_trades: min_trades,
      });

      // Store result
      const id = `pat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      scalarAiDb.insertPatternResult({
        id,
        symbol: result.symbol,
        timeframe: result.timeframe,
        pattern_name: result.pattern_name,
        pattern_category: "candlestick",
        occurrences: result.occurrences,
        forward_return_mean: result.forward_return_mean,
        forward_return_sd: result.forward_return_sd,
        t_statistic: result.t_statistic,
        p_value: result.p_value,
        win_rate: result.win_rate,
        expectancy: result.expectancy,
        net_after_cost: result.net_after_cost,
        spread_points: result.spread_points,
        verdict: result.verdict,
        null_comparison: JSON.stringify(result.null_comparison),
        split_half_agree: result.split_half_agree ? 1 : 0,
        split_half_t1: result.split_half_t1,
        split_half_t2: result.split_half_t2,
        min_trades_threshold: result.min_trades_threshold,
        bars_analyzed: result.bars_analyzed,
        created_at: new Date().toISOString(),
      });

      return ok(res, { success: true, id, ...result });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  });

  // 5. Indicator Calculation (handles both /api/research/indicator/calculate and /api/research/indicator)
  const handleIndicatorCalc = async (req: Request, res: Response) => {
    try {
      const { symbol, indicator = "rsi", period = 14, count = 100 } = req.body || {};
      const sym = parseSymbol(symbol, store.getActiveSymbol() || config.defaultSymbol);
      let dbCandles = scalarAiDb.getCandles(sym, undefined, undefined, Math.min(Number(count), 500));

      if (dbCandles.length < Number(period) + 2) {
        try {
          const ratesRes = await mt5Bridge.getRates(sym, 1, Math.min(Number(count), 100));
          if (ratesRes && ratesRes.success && Array.isArray(ratesRes.rates) && ratesRes.rates.length > 0) {
            store.ingestBulkCandles(
              sym,
              ratesRes.rates.map((r: any) => ({
                time: typeof r.time === "number" ? (r.time < 10000000000 ? r.time * 1000 : r.time) : Date.now(),
                open: r.open,
                high: r.high,
                low: r.low,
                close: r.close,
                volume: r.tick_volume || r.volume || 100,
              }))
            );
            dbCandles = scalarAiDb.getCandles(sym, undefined, undefined, Math.min(Number(count), 500));
          }
        } catch {
          // quiet sync
        }
      }

      const closes = dbCandles.map((c) => c.close);
      const indLower = String(indicator).toLowerCase();

      if (closes.length < Number(period)) {
        return res.json({
          success: true,
          symbol: sym,
          indicator,
          period: Number(period),
          dataPoints: closes.length,
          series: [],
          message: `Need at least ${period} candles from MT5 to calculate ${indicator}. Currently have ${closes.length}.`,
        });
      }

      let result: any = null;
      if (indLower === "rsi") {
        result = rsi(closes, Number(period));
      } else if (indLower === "ema") {
        result = ema(closes, Number(period));
      } else if (indLower === "sma") {
        result = sma(closes, Number(period));
      } else if (indLower === "bollinger") {
        result = bollinger(closes, Number(period), 2.0);
      } else if (indLower === "macd") {
        result = macd(closes);
      } else {
        return error(res, `Unknown indicator: ${indicator}`, 400);
      }

      const payload = {
        symbol: sym,
        indicator,
        period: Number(period),
        dataPoints: closes.length,
        series: result,
      };

      return res.json({ success: true, ...payload, data: payload });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  };

  app.post("/api/research/indicator/calculate", handleIndicatorCalc);
  app.post("/api/research/indicator", handleIndicatorCalc);

  // 6. Strategy Backtest
  app.post("/api/research/backtest", async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const strategyId = body.strategy || body.strategyId || "ma_cross";
      const symbol = body.symbol;
      const initialBalance = Number(body.initialBalance) || 10000;
      const lotSize = Number(body.lotSize) || 0.1;
      const stopLoss = Number(body.slPoints !== undefined ? body.slPoints : body.stopLoss !== undefined ? body.stopLoss : 150);
      const takeProfit = Number(body.tpPoints !== undefined ? body.tpPoints : body.takeProfit !== undefined ? body.takeProfit : 300);
      const barsCount = Number(body.candleCount || body.barsCount || 200);
      const trailingStop = body.trailingStop !== undefined ? !!body.trailingStop : true;
      const trailingPoints = Number(body.trailingPoints) || 100;
      const fastPeriod = Number(body.fastPeriod) || 12;
      const slowPeriod = Number(body.slowPeriod) || 26;
      const rsiPeriod = Number(body.rsiPeriod) || 14;

      const sym = parseSymbol(symbol, store.getActiveSymbol() || config.defaultSymbol);
      let dbCandles = scalarAiDb.getCandles(sym, undefined, undefined, Math.min(barsCount, 1000));

      if (dbCandles.length < 35) {
        try {
          const ratesRes = await mt5Bridge.getRates(sym, 1, Math.max(barsCount, 100));
          if (ratesRes && ratesRes.success && Array.isArray(ratesRes.rates) && ratesRes.rates.length > 0) {
            store.ingestBulkCandles(
              sym,
              ratesRes.rates.map((r: any) => ({
                time: typeof r.time === "number" ? (r.time < 10000000000 ? r.time * 1000 : r.time) : Date.now(),
                open: r.open,
                high: r.high,
                low: r.low,
                close: r.close,
                volume: r.tick_volume || r.volume || 100,
              }))
            );
            dbCandles = scalarAiDb.getCandles(sym, undefined, undefined, Math.min(barsCount, 1000));
          }
        } catch {
          // quiet sync
        }
      }

      const bars: Bar[] = dbCandles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 100,
      }));

      if (bars.length < 10) {
        const count = Math.max(barsCount, 60);
        const basePrice = 8500.0;
        let currentPrice = basePrice;
        const now = Date.now();
        for (let i = count; i >= 1; i--) {
          const time = now - i * 60000;
          const delta = (Math.sin(i / 5) * 5) + ((i % 3 === 0 ? 3.2 : -2.8));
          const open = currentPrice;
          const close = Number((currentPrice + delta).toFixed(2));
          const high = Number((Math.max(open, close) + 3.0).toFixed(2));
          const low = Number((Math.min(open, close) - 3.0).toFixed(2));
          currentPrice = close;
          bars.push({ time, open, high, low, close, volume: 100 });
        }
      }

      const results = runBacktest(bars, {
        strategy: strategyId,
        symbol: sym,
        initialBalance,
        lotSize,
        slPoints: stopLoss,
        tpPoints: takeProfit,
        trailingStop,
        trailingPoints,
        fastPeriod,
        slowPeriod,
        rsiPeriod,
      });

      return res.json({
        success: true,
        results: { ...results, symbol: sym },
        data: { success: true, results: { ...results, symbol: sym } },
      });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  });

  // 7. StrategyForge Webhook / Direct Result Submission from MT5
  app.post("/api/research/strategyforge-result", (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const newItem: StrategyForgeResultItem = {
        id: "sf-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        tag: String(body.tag || "default"),
        symbol: String(body.symbol || store.getActiveSymbol() || "EURUSD"),
        mode: Number(body.mode) || 0,
        modeName: String(body.modeName || "MA_CROSS"),
        timeframe: String(body.timeframe || "PERIOD_H1"),
        fast: body.fast ? Number(body.fast) : undefined,
        slow: body.slow ? Number(body.slow) : undefined,
        period: body.period ? Number(body.period) : undefined,
        threshold: body.threshold ? Number(body.threshold) : undefined,
        lots: Number(body.lots) || 0.1,
        stopPips: Number(body.stopPips) || 20,
        takePips: Number(body.takePips) || 30,
        criterion: Number(body.criterion) || 1,
        score: Number(body.score) || 0,
        trades: Number(body.trades) || 0,
        wins: Number(body.wins) || 0,
        losses: Number(body.losses) || 0,
        profit: Number(body.profit) || 0,
        netPips: Number(body.netPips) || 0,
        profitFactor: Number(body.profitFactor) || 1.0,
        expectedPayoff: Number(body.expectedPayoff) || 0,
        sharpe: Number(body.sharpe) || 0,
        drawdown: Number(body.drawdown) || 0,
        drawdownPct: Number(body.drawdownPct) || 0,
        winRate: Number(body.winRate) || 0,
        attempts: Number(body.attempts) || Number(body.trades) || 0,
        skipped: Number(body.skipped) || 0,
        blocked: Number(body.blocked) || 0,
        // The EA now sends the measured win rate, the verdict and the tested
        // window. Recording them keeps a losing run distinguishable from a
        // winning one at ingest time instead of only in the EA's own CSV.
        verdict: body.verdict ? String(body.verdict) : undefined,
        tStat: body.tStat !== undefined ? Number(body.tStat) : undefined,
        tradeProfitFactor: body.tradeProfitFactor !== undefined ? Number(body.tradeProfitFactor) : undefined,
        costSharePct: body.costSharePct !== undefined ? Number(body.costSharePct) : undefined,
        breakEvenWinRate: body.breakEvenWinRate !== undefined ? Number(body.breakEvenWinRate) : undefined,
        avgWinTicks: body.avgWinTicks !== undefined ? Number(body.avgWinTicks) : undefined,
        avgLossTicks: body.avgLossTicks !== undefined ? Number(body.avgLossTicks) : undefined,
        spreadTicks: body.spreadTicks !== undefined ? Number(body.spreadTicks) : undefined,
        stratClass: body.stratClass ? String(body.stratClass) : undefined,
        stratFamily: body.stratFamily ? String(body.stratFamily) : undefined,
        stratIndicator: body.stratIndicator ? String(body.stratIndicator) : undefined,
        stratPattern: body.stratPattern ? String(body.stratPattern) : undefined,
        stratTimeframe: body.stratTimeframe ? String(body.stratTimeframe) : undefined,
        fromDate: body.fromDate ? String(body.fromDate) : undefined,
        toDate: body.toDate ? String(body.toDate) : undefined,
        minStopDist: body.minStopDist !== undefined ? Number(body.minStopDist) : undefined,
        stopsClamped: body.stopsClamped !== undefined ? Number(body.stopsClamped) : undefined,
        timestamp: Number(body.timestamp) ? Number(body.timestamp) * 1000 : Date.now(),
        source: "LIVE_EA",
      };

      recordStrategyForgeResult(newItem);

      console.log(`[StrategyForge] ${newItem.tag} on ${newItem.symbol} (${newItem.modeName}): Trades ${newItem.trades}, Profit $${newItem.profit.toFixed(2)}, PF ${newItem.profitFactor}${newItem.verdict ? " -- " + newItem.verdict : ""}`);

      return res.json({ success: true, id: newItem.id, message: "StrategyForge result logged successfully." });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  });

  // 8. StrategyForge Fetch All Results
  app.get("/api/research/strategyforge-results", (req: Request, res: Response) => {
    try {
      const symbol = req.query.symbol as string;
      let list = strategyForgeResults;
      if (symbol) {
        list = list.filter((r) => r.symbol.toLowerCase() === symbol.toLowerCase());
      }
      return res.json({ success: true, count: list.length, results: list });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  });

  // 9. StrategyForge CSV Parser (allows user to upload or paste StrategyForge_*.csv)
  app.post("/api/research/strategyforge-parse-csv", (req: Request, res: Response) => {
    try {
      const { csvContent } = req.body || {};
      if (!csvContent || typeof csvContent !== "string") {
        return error(res, "Missing csvContent", 400);
      }

      const newItem = parseStrategyForgeCsv(csvContent, store.getActiveSymbol() || "EURUSD");
      if (!newItem) {
        return error(res, "CSV must be a StrategyForge report: a header row containing at least score, trades and profit, plus one data row", 400);
      }

      recordStrategyForgeResult(newItem);
      return res.json({ success: true, result: newItem, results: strategyForgeResults });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  });
}
