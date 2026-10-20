// Statistical pattern checker.
// Wraps pattern detection with t-test, null comparison, split-half, and cost-adjusted expectancy.
// This is the knowledgebase's version of the Python analysis/patterns/ tools.

import { Bar } from "backend/knowledgebase/core/common";
import { welchT, tDistributionP, betai, shuffleNull, splitHalf, mean, sd } from "../core/common";
import { scanCandlePatterns, PatternMatch } from "./patterns";

export interface PatternCheckParams {
  symbol: string;
  timeframe: string;
  pattern_name: string;
  bars: Bar[];
  forward_bars: number;
  cost_points?: number;
  min_trades?: number;
}

export interface WelchTResult {
  t: number;
  p: number;
  meanA: number;
  meanB: number;
  nA: number;
  nB: number;
}

export interface PatternCheckResult {
  symbol: string;
  timeframe: string;
  pattern_name: string;
  occurrences: number;
  forward_return_mean: number;
  forward_return_sd: number;
  t_statistic: number;
  p_value: number;
  win_rate: number;
  expectancy: number;
  net_after_cost: number;
  spread_points: number;
  verdict: 'EDGE' | 'NO EDGE' | 'INCONCLUSIVE';
  null_comparison: { t: number; p_value: number; mean: number };
  split_half_agree: boolean;
  split_half_t1: number;
  split_half_t2: number;
  min_trades_threshold: number;
  bars_analyzed: number;
  matched_patterns: string[];  // which pattern names were matched
}

// Welch's t-test for unequal variance mean comparison.

export function checkPattern(params: PatternCheckParams): PatternCheckResult {
  const { symbol, timeframe, pattern_name, bars, forward_bars, cost_points, min_trades } = params;
  const cost = cost_points ?? 0;
  const minTrades = min_trades ?? 30;
  const fb = forward_bars || 5;

  // Scan for pattern occurrences using scanCandlePatterns
  const allMatches = scanCandlePatterns(bars);
  
  // Filter by pattern_name (case-insensitive partial match)
  const nameLower = pattern_name.toLowerCase();
  const matched = allMatches.filter(m => m.pattern.toLowerCase().includes(nameLower) || nameLower.includes(m.pattern.toLowerCase()));
  const matchedNames = [...new Set(matched.map(m => m.pattern))];
  
  // Get unique bar indices where the pattern was detected
  const occurrenceIndices = [...new Set(matched.map(m => m.index))];
  
  // Compute forward returns for pattern occurrences
  const maxIdx = bars.length - fb - 1;
  const validOccurrences = occurrenceIndices.filter(i => i >= 0 && i < maxIdx);
  const forwardReturns = validOccurrences.map(i => (bars[i + fb]?.close ?? 0) - (bars[i]?.close ?? 0));
  
  // Compute baseline (unconditional) forward returns for all valid bars
  const baseline = bars
    .map((b, i) => (bars[i + fb]?.close ?? 0) - (b.close ?? 0))
    .filter((_, i) => i < bars.length - fb);
  
  const baselineMean = baseline.length > 0 ? baseline.reduce((s, v) => s + v, 0) / baseline.length : 0;
  const baselineSd = baseline.length > 1 ? Math.sqrt(baseline.reduce((s, v) => s + (v - baselineMean) ** 2, 0) / (baseline.length - 1)) : 0;
  
  const n = forwardReturns.length;
  const mean = n > 0 ? forwardReturns.reduce((s, v) => s + v, 0) / n : 0;
  const sdVal = n > 1 ? Math.sqrt(forwardReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  
  const tResult = welchT(forwardReturns, baseline);
  const nullResult = shuffleNull(forwardReturns);
  const split = splitHalf(forwardReturns);
  
  const winRate = n > 0 ? forwardReturns.filter(v => v > 0).length / n : 0;
  const expectancy = mean;
  const netAfterCost = expectancy - (cost * 0.0001); // convert points to price units
  
  const beatsNull = Math.abs(tResult.t) >= Math.abs(nullResult.t);
  const verdict: 'EDGE' | 'NO EDGE' | 'INCONCLUSIVE' =
    Math.abs(tResult.t) >= 2 && split.agree && beatsNull && n >= minTrades && netAfterCost > 0
      ? 'EDGE'
      : (Math.abs(tResult.t) < 1.5 || n < 10 || netAfterCost <= 0)
        ? 'NO EDGE'
        : 'INCONCLUSIVE';

  return {
    symbol,
    timeframe,
    pattern_name,
    occurrences: n,
    forward_return_mean: mean,
    forward_return_sd: sdVal,
    t_statistic: tResult.t,
    p_value: tResult.p,
    win_rate: winRate,
    expectancy,
    net_after_cost: netAfterCost,
    spread_points: cost,
    verdict,
    null_comparison: { t: nullResult.t, p_value: nullResult.p_value, mean: nullResult.mean },
    split_half_agree: split.agree,
    split_half_t1: split.t1,
    split_half_t2: split.t2,
    min_trades_threshold: minTrades,
    bars_analyzed: bars.length,
    matched_patterns: matchedNames,
  };
}
