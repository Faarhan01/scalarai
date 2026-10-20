// Shooting Star / Bearish Pinbar detector — standard variant.
//
// A long upper wick (at least twice the body) with a small lower wick means
// buyers pushed price up and sellers took it back before the bar closed.
//
// To add a variant: create another file in this folder and export it from
// logic/index.ts.

import { Bar } from "backend/knowledgebase/core/common";
import type { PatternMatch } from "../../../patterns";

/** Upper wick must be at least this multiple of the body. */
export const SHOOTING_STAR_WICK_RATIO = 2.0;
/** Lower wick must be at most this multiple of the body. */
export const SHOOTING_STAR_OPPOSITE_RATIO = 0.5;

export function detectShootingStar(bars: Bar[], i: number): PatternMatch | null {
  if (i < 0 || i >= bars.length) return null;
  const b = bars[i];
  const body = Math.abs(b.close - b.open);
  const range = b.high - b.low;
  if (range <= 0) return null;

  const upperWick = b.high - Math.max(b.open, b.close);
  const lowerWick = Math.min(b.open, b.close) - b.low;

  if (!(upperWick >= SHOOTING_STAR_WICK_RATIO * body && lowerWick <= SHOOTING_STAR_OPPOSITE_RATIO * body)) return null;

  return {
    pattern: "Shooting Star / Bearish Pinbar",
    index: i,
    time: b.time,
    direction: "BEARISH",
    confidence: 0.82,
    description: "Long upper rejection wick rejecting higher prices.",
  };
}