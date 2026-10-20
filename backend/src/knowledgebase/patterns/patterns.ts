// Pattern detection — orchestrator.
//
// Each pattern lives in its own folder under a type folder:
//   candlestick/doji/logic/standard.ts
//   candlestick/hammer/logic/standard.ts
//   ...
//
// This file walks the bars once and asks each detector whether it fires.
// Detectors are independent: remove one from a type's barrel and it stops
// being scanned, with nothing else to edit.

import { Bar } from "backend/knowledgebase/core/common";
import { detectDoji as doji } from "./candlestick/doji/logic/standard";
import { detectHammer as hammer } from "./candlestick/hammer/logic/standard";
import { detectShootingStar as shootingStar } from "./candlestick/shooting-star/logic/standard";
import { detectBullishEngulfing as bullishEngulfing } from "./candlestick/bullish-engulfing/logic/standard";
import { detectBearishEngulfing as bearishEngulfing } from "./candlestick/bearish-engulfing/logic/standard";

export interface PatternMatch {
  pattern: string;
  index: number;
  time: number | string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  description: string;
}

/** A detector: given bars and a bar index, does the pattern fire here? */
export type Detector = (bars: Bar[], i: number) => PatternMatch | null;

/**
 * The default detector set.
 *
 * Add a pattern here when you add its folder. The detector files import
 * `PatternMatch` as a TYPE, so there is no runtime cycle.
 */
export const DEFAULT_DETECTORS: Detector[] = [
  doji,
  hammer,
  shootingStar,
  bullishEngulfing,
  bearishEngulfing,
];

/**
 * The scanner. Walks the bars once, asks every detector about every bar,
 * and collects the matches.
 *
 * A bar can match more than one pattern — a doji is also an inside bar, and
 * a hammer can be a bullish engulfing. That is intentional: each pattern is
 * tested independently by the statistical checker.
 */
export function scanCandlePatterns(bars: Bar[], detectors: Detector[] = DEFAULT_DETECTORS): PatternMatch[] {
  const matches: PatternMatch[] = [];
  if (bars.length < 5) return matches;

  for (let i = 2; i < bars.length; i++) {
    for (const detect of detectors) {
      const match = detect(bars, i);
      if (match) matches.push(match);
    }
  }

  return matches;
}