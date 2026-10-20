// Doji detector — standard variant.
//
// A doji is a bar whose body is a tiny fraction of its total range: the market
// went nowhere. Body/range below the threshold means open and close are
// effectively the same price.
//
// To add a variant: create another file in this folder, e.g. `strict.ts` with
// a tighter threshold, and export it from logic/index.ts.

import { Bar } from "backend/knowledgebase/core/common";
import type { PatternMatch } from "../../../patterns";

/** Body as a fraction of total range. Below this, the bar is a doji. */
export const DOJI_BODY_RATIO = 0.1;

export function detectDoji(bars: Bar[], i: number): PatternMatch | null {
  if (i < 0 || i >= bars.length) return null;
  const b = bars[i];
  const body = Math.abs(b.close - b.open);
  const range = b.high - b.low;
  if (range <= 0) return null;
  if (body / range >= DOJI_BODY_RATIO) return null;

  return {
    pattern: "Doji",
    index: i,
    time: b.time,
    direction: "NEUTRAL",
    confidence: 0.75,
    description: "Indecision bar with very small real body.",
  };
}