// Mean reversion — RSI extremes with Bollinger confirmation, standard variant.
//
// Buys below the lower band with oversold RSI, sells above the upper band
// with overbought RSI. Requires momentum deceleration before reversing, and
// refuses to trade when ATR is above a safe ceiling.
//
// To add a variant: create another file in this folder and export it from
// logic/index.ts.

import type { TradeConfig } from "backend/types";
import type { StrategyContext, TradeSignal } from "../../../strategy";

/** ATR above this is treated as too volatile to fade. */
export const MAX_SAFE_ATR = 12.0;

export function evaluateMeanReversion(ctx: StrategyContext, config: TradeConfig): TradeSignal {
  if (ctx.atr >= MAX_SAFE_ATR) return { type: "HOLD", reason: "ATR too high for mean reversion" };
  const { rsi, bands, currentPrice, acceleration } = ctx;

  // Momentum confirmation: require deceleration for reversal signals
  const isDecelerating = Math.abs(acceleration) < 0.01 || acceleration > 0.02;

  if (currentPrice < bands.lower && rsi < 30) {
    if (ctx.activeSellExists) return { type: "HOLD", reason: "BUY blocked: opposite SELL lock active" };
    if (!isDecelerating) return { type: "HOLD", reason: "Momentum still declining - waiting for deceleration" };
    return { type: "BUY", reason: `Oversold bounce: price ${currentPrice.toFixed(2)} < BB lower ${bands.lower.toFixed(2)}, RSI ${rsi.toFixed(1)}, accel ${acceleration.toFixed(4)}`, confidence: 0.7 };
  }

  if (currentPrice > bands.upper && rsi > 70) {
    if (ctx.activeBuyExists) return { type: "HOLD", reason: "SELL blocked: opposite BUY lock active" };
    if (!isDecelerating) return { type: "HOLD", reason: "Momentum still rising - waiting for deceleration" };
    return { type: "SELL", reason: `Overbought fade: price ${currentPrice.toFixed(2)} > BB upper ${bands.upper.toFixed(2)}, RSI ${rsi.toFixed(1)}, accel ${acceleration.toFixed(4)}`, confidence: 0.7 };
  }

  return { type: "HOLD", reason: "No mean reversion signal" };
}