// Custom rules — user-defined conditions, standard variant.
//
// Reads the strategy's rule list and evaluates them in order. The first rule
// that matches wins.
//
// To add a variant: create another file in this folder and export it from
// logic/index.ts.

import type { TradeConfig, StrategyCondition } from "backend/types";
import type { StrategyContext, TradeSignal } from "../../../strategy";

export function evaluateCustomRules(ctx: StrategyContext, config: TradeConfig): TradeSignal {
  const rules = ctx.strategy.rules?.conditions || [];
  for (const rule of rules) {
    if (evaluateRule(rule, ctx)) {
      return { type: rule.action, reason: `Custom rule: ${rule.indicator} ${rule.condition} ${rule.value}`, confidence: 0.6 };
    }
  }
  return { type: "HOLD", reason: "No custom rule matched" };
}

export function evaluateRule(rule: StrategyCondition, ctx: StrategyContext): boolean {
  const indicatorValue = getIndicatorValue(rule.indicator, ctx);
  if (indicatorValue === null || indicatorValue === undefined) return false;
  switch (rule.condition) {
    case ">": return indicatorValue > Number(rule.value);
    case "<": return indicatorValue < Number(rule.value);
    case ">=": return indicatorValue >= Number(rule.value);
    case "<=": return indicatorValue <= Number(rule.value);
    case "==": return indicatorValue === rule.value;
    case "!=": return indicatorValue !== rule.value;
    default: return false;
  }
}

export function getIndicatorValue(indicator: string, ctx: StrategyContext): number | null {
  switch (indicator) {
    case "rsi": return ctx.rsi;
    case "atr": return ctx.atr;
    case "fast_ema": return ctx.fastEma;
    case "slow_ema": return ctx.slowEma;
    case "velocity": return ctx.velocity;
    case "acceleration": return ctx.acceleration;
    case "price": return ctx.currentPrice;
    case "bb_upper": return ctx.bands.upper;
    case "bb_lower": return ctx.bands.lower;
    default: return null;
  }
}