// Pattern suite — runs every pattern in a category against one bar set.
//
// This is the entry point for "run this chart history through the knowledgebase".
// One call, one fetch of bars, one statistical test per pattern, all stored.

import { Bar } from "backend/knowledgebase/core/common";
import { checkPattern, PatternCheckResult } from "./pattern-checker";
import { scanCandlePatterns } from "./patterns";

export interface SuiteParams {
  symbol: string;
  timeframe: string;
  bars: Bar[];
  forward_bars?: number;
  cost_points?: number;
  min_trades?: number;
  category?: string;   // 'candlestick' | 'shape' | 'indicator' | undefined = all
}

export interface SuiteResult {
  symbol: string;
  timeframe: string;
  bars_analyzed: number;
  patterns_tested: number;
  total_occurrences: number;
  edge_count: number;
  no_edge_count: number;
  inconclusive_count: number;
  results: PatternCheckResult[];
}

/**
 * Every distinct pattern name the detectors can produce, with the name to
 * pass to checkPattern. The detectors are the source of truth; this map only
 * exists so the suite can iterate a fixed list without scanning twice.
 */
const CANDLESTICK_PATTERNS = [
  { label: "Doji", query: "Doji" },
  { label: "Hammer", query: "Hammer" },
  { label: "Shooting Star", query: "Shooting Star" },
  { label: "Bullish Engulfing", query: "Bullish Engulfing" },
  { label: "Bearish Engulfing", query: "Bearish Engulfing" },
];

/**
 * Run every pattern against the bars and return one result per pattern.
 *
 * The bar set is scanned once for the master pattern list, then each pattern
 * is tested separately so the statistics are per-pattern rather than pooled.
 */
export function runPatternSuite(params: SuiteParams): SuiteResult {
  const {
    symbol, timeframe, bars,
    forward_bars = 5, cost_points = 0, min_trades = 30,
  } = params;

  // Scan once so the suite can report what the detectors actually saw.
  const detected = scanCandlePatterns(bars);
  const detectedNames = [...new Set(detected.map(d => d.pattern))];

  // Build the list to test: the known patterns, plus anything else detected.
  const queries = [...CANDLESTICK_PATTERNS.map(p => p.query)];
  for (const name of detectedNames) {
    if (!queries.some(q => name.toLowerCase().includes(q.toLowerCase()) ||
                          q.toLowerCase().includes(name.toLowerCase()))) {
      queries.push(name);
    }
  }

  const results: PatternCheckResult[] = [];
  for (const query of queries) {
    results.push(checkPattern({
      symbol, timeframe,
      pattern_name: query,
      bars,
      forward_bars,
      cost_points,
      min_trades,
    }));
  }

  return {
    symbol,
    timeframe,
    bars_analyzed: bars.length,
    patterns_tested: results.length,
    total_occurrences: results.reduce((s, r) => s + r.occurrences, 0),
    edge_count: results.filter(r => r.verdict === 'EDGE').length,
    no_edge_count: results.filter(r => r.verdict === 'NO EDGE').length,
    inconclusive_count: results.filter(r => r.verdict === 'INCONCLUSIVE').length,
    results,
  };
}