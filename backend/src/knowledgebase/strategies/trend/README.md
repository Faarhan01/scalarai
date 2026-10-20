# Trend Following Strategies

## How they work

Trend following strategies enter in the direction of the established trend.
They use moving average crossovers (EMA fast/slow) and momentum confirmation
(RSI > 50, price above middle band) to identify trend direction.

## Current strategies

| File | Strategy | Entry condition | Exit |
|---|---|---|---|
| (in strategy.ts) | EMA Crossover | Fast EMA crosses above Slow EMA | SL/TP or trailing stop |
| (in strategy.ts) | Indicator Inspector | Fast EMA > Slow EMA AND RSI > 50 AND close > mid band | SL/TP or trailing stop |

## How to add a new trend strategy

1. Create `logic/<strategy-name>.ts`
2. Export a function `(ctx: StrategyContext, config: TradeConfig) => TradeSignal`
3. Add it to `logic/index.ts`
4. Register in `strategy.ts` `evaluateStrategy()` switch

## How to remove

Delete the file from `logic/` and remove its export from `logic/index.ts`.
The strategy templates and backtest results are independent.