// AI adaptive — velocity and acceleration with EMA confirmation, standard variant.
//
// Enters when price is moving fast, the speed is not diverging wildly from
// the knowledgebase's global average, the EMA trend agrees with the
// direction, and momentum is accelerating.
//
// To add a variant: create another file in this folder and export it from
// logic/index.ts.

import type { TradeConfig } from "backend/types";
import type { StrategyContext, TradeSignal } from "../../../strategy";

export function evaluateAiAdaptive(ctx: StrategyContext, config: TradeConfig): TradeSignal {
  const telemetry = ctx.strategy.rules?.telemetry || {};
  const minSpeedFilter = ctx.strategy.rules?.minVelocityFilter ?? 0.15;
  const maxAllowedPositionDivergence = ctx.strategy.rules?.maxAllowedPositionDivergence ?? 2.0;
  const useEmaConfirmation = ctx.strategy.rules?.useEmaConfirmation ?? true;
  const allowCounterTrend = ctx.strategy.rules?.allowCounterTrend ?? false;

  const velocity = ctx.velocity;
  const acceleration = ctx.acceleration;
  const isHighMomentum = Math.abs(velocity) > minSpeedFilter;
  const globAvgSpeed = ctx.knowledge.globalAverageSpeed || 0.15;
  const speedDivergence = Math.abs(velocity) / globAvgSpeed;
  const withinDivergenceLimit = speedDivergence <= maxAllowedPositionDivergence;

  let isEmaTrendConfirmed = true;
  if (useEmaConfirmation) {
    isEmaTrendConfirmed = velocity > 0 ? (ctx.fastEma > ctx.slowEma) : (ctx.fastEma < ctx.slowEma);
  }

  let isDirectionAllowed = true;
  if (!allowCounterTrend) {
    isDirectionAllowed = velocity > 0 ? (ctx.fastEma >= ctx.slowEma) : (ctx.fastEma <= ctx.slowEma);
  }

  // Allow multiple positions up to maxTrades, but respect directional lock
  const atMaxTrades = ctx.openTradesCount >= config.maxTrades;
  if (atMaxTrades) return { type: "HOLD", reason: "Max concurrent trades reached" };

  const directionalBlock = velocity > 0 ? ctx.activeSellExists : ctx.activeBuyExists;
  if (directionalBlock) return { type: "HOLD", reason: `Opposite ${velocity > 0 ? 'SELL' : 'BUY'} lock active` };

  if (isHighMomentum && withinDivergenceLimit && isEmaTrendConfirmed && isDirectionAllowed && Math.abs(acceleration) > 0.02) {
    if (velocity > 0 && acceleration > 0) {
      return { type: "BUY", reason: `AI momentum: speed +${velocity.toFixed(3)}, accel +${acceleration.toFixed(3)}, div ${speedDivergence.toFixed(2)}x`, confidence: 0.8 };
    }
    if (velocity < 0 && acceleration < 0) {
      return { type: "SELL", reason: `AI momentum: speed ${velocity.toFixed(3)}, accel ${acceleration.toFixed(3)}, div ${speedDivergence.toFixed(2)}x`, confidence: 0.8 };
    }
  }

  return { type: "HOLD", reason: "No AI adaptive signal" };
}