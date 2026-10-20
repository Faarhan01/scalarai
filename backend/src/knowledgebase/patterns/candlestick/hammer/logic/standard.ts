// Hammer / Bullish Pinbar detector — standard variant.
//
// A long lower wick (at least twice the body) with a small upper wick means
// sellers pushed price down and buyers took it back before the bar closed.
//
// To add a variant: create another file in this folder and export it from
// logic/index.ts.

import { Bar } from "backend/knowledgebase/core/common";
import type { PatternMatch } from "../../../patterns";

/** Lower wick must be at least this multiple of the body. */
export const HAMMER_WICK_RATIO = 2.0;
/** Upper wick must be at most this multiple of the body. */
export const HAMMER_OPPOSITE_RATIO = 0.5;

export function detectHammer(bars: Bar[], i: number): PatternMatch | null {
  if (i < 0 || i >= bars.length) return null;
  const b = bars[i];
  const body = Math.abs(b.close - b.open);
  const range = b.high - b.low;
  if (range <= 0) return null;

  const upperWick = b.high - Math.max(b.open, b.close);
  const lowerWick = Math.min(b.open, b.close) - b.low;

  if (!(lowerWick >= HAMMER_WICK_RATIO * body && upperWick <= HAMMER_OPPOSITE_RATIO * body)) return null;

  return {
    pattern: "Hammer / Bullish Pinbar",
    index: i,
    time: b.time,
    direction: "BULLISH",
    confidence: 0.82,
    description: "Long lower rejection wick rejecting lower prices.",
  };
}