// Bearish Engulfing detector — standard variant.
//
// The current bar's body completely covers the previous bar's body, and both
// point the same way. Requires the previous bar to be bullish.
//
// To add a variant: create another file in this folder and export it from
// logic/index.ts.

import { Bar } from "backend/knowledgebase/core/common";
import type { PatternMatch } from "../../../patterns";

export function detectBearishEngulfing(bars: Bar[], i: number): PatternMatch | null {
  if (i < 1 || i >= bars.length) return null;
  const b = bars[i];
  const prev = bars[i - 1];

  const bearish = prev.close > prev.open && b.close < b.open &&
                  b.open >= prev.close && b.close <= prev.open;
  if (!bearish) return null;

  return {
    pattern: "Bearish Engulfing",
    index: i,
    time: b.time,
    direction: "BEARISH",
    confidence: 0.85,
    description: "Bearish candle completely engulfs prior bullish body.",
  };
}