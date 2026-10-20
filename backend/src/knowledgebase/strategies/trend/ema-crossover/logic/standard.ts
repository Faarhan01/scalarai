// Trend following — EMA alignment, standard variant.
//
// Enters in the direction of the EMA alignment, when RSI is not at an
// extreme and the market is not flat.
//
// To add a variant: create another file in this folder (e.g. `slope.ts` for
// an EMA-slope version) and export it from logic/index.ts.

import type { TradeConfig } from "backend/types";
import type { StrategyContext, TradeSignal } from "../../../strategy";

export function evaluateEmaCrossover(ctx: StrategyContext, config: TradeConfig): TradeSignal {
  const { rsi, fastEma, slowEma, velocity } = ctx;

  const emaSeparation = Math.abs(fastEma - slowEma);
  if (emaSeparation < 0.00001 && Math.abs(velocity) < 0.0001) {
    return { type: "HOLD", reason: "Market flat - awaiting directional momentum" };
  }

  // Bullish Trend condition: Fast EMA >= Slow EMA with RSI not extremely overbought
  if (fastEma >= slowEma && rsi < 75) {
    if (ctx.activeSellExists) {
      return {
        type: "BUY",
        reason: `Trend Following Reversal: Fast EMA (${fastEma.toFixed(2)}) crossed above Slow EMA (${slowEma.toFixed(2)}). Liquidating SELL and entering BUY.`,
        confidence: 0.85,
      };
    }
    return {
      type: "BUY",
      reason: `Trend Following Alignment: Fast EMA (${fastEma.toFixed(2)}) >= Slow EMA (${slowEma.toFixed(2)}), RSI: ${rsi.toFixed(1)}${velocity > 0 ? `, Speed: +${velocity.toFixed(3)}` : ""}`,
      confidence: 0.8,
    };
  }

  // Bearish Trend condition: Fast EMA <= Slow EMA with RSI not extremely oversold
  if (fastEma <= slowEma && rsi > 25) {
    if (ctx.activeBuyExists) {
      return {
        type: "SELL",
        reason: `Trend Following Reversal: Fast EMA (${fastEma.toFixed(2)}) crossed below Slow EMA (${slowEma.toFixed(2)}). Liquidating BUY and entering SELL.`,
        confidence: 0.85,
      };
    }
    return {
      type: "SELL",
      reason: `Trend Following Alignment: Fast EMA (${fastEma.toFixed(2)}) <= Slow EMA (${slowEma.toFixed(2)}), RSI: ${rsi.toFixed(1)}${velocity < 0 ? `, Speed: ${velocity.toFixed(3)}` : ""}`,
      confidence: 0.8,
    };
  }

  return { type: "HOLD", reason: "No trend signal" };
}