// Bullish Engulfing detector — standard variant.
//
// The current bar's body completely covers the previous bar's body, and both
// point the same way. Requires the previous bar to be bearish.
//
// To add a variant: create another file in this folder and export it from
// logic/index.ts.

import { Bar } from "backend/knowledgebase/core/common";
import type { PatternMatch } from "../../../patterns";

export function detectBullishEngulfing(bars: Bar[], i: number): PatternMatch | null {
  if (i < 1 || i >= bars.length) return null;
  const b = bars[i];
  const prev = bars[i - 1];

  const bullish = prev.close < prev.open && b.close > b.open &&
                  b.open <= prev.close && b.close >= prev.open;
  if (!bullish) return null;

  return {
    pattern: "Bullish Engulfing",
    index: i,
    time: b.time,
    direction: "BULLISH",
    confidence: 0.85,
    description: "Bullish candle completely engulfs prior bearish body.",
  };
}