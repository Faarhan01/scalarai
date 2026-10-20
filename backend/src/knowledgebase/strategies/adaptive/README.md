# AI Adaptive Strategies

## How they work

AI adaptive strategies combine multiple signals (EMA trend, RSI, velocity)
and adjust based on market conditions. They use the knowledgebase (velocity
patterns, time-of-day) to make decisions.

## Current strategies

| File | Strategy | Entry condition | Exit |
|---|---|---|---|
| (in strategy.ts) | AI Adaptive | Fast EMA > Slow EMA AND RSI > 50 AND close rising | SL/TP or trailing stop |

## How to add a new adaptive strategy

1. Create `logic/<strategy-name>.ts`
2. Export a function `(ctx: StrategyContext, config: TradeConfig) => TradeSignal`
3. Add it to `logic/index.ts`
4. Register in `strategy.ts` `evaluateStrategy()` switch

## How to remove

Delete the file from `logic/` and remove its export from `logic/index.ts`.