# Mean Reversion Strategies

## How they work

Mean reversion strategies enter against the current move, expecting price to
return to its average. They use RSI extremes (oversold/overbought) and
Bollinger Band touches.

## Current strategies

| File | Strategy | Entry condition | Exit |
|---|---|---|---|
| (in strategy.ts) | RSI Reversion | RSI crosses above oversold (30) | SL/TP or trailing stop |
| (in strategy.ts) | Bollinger Reversion | Close below lower band | SL/TP or trailing stop |

## How to add a new reversion strategy

1. Create `logic/<strategy-name>.ts`
2. Export a function `(ctx: StrategyContext, config: TradeConfig) => TradeSignal`
3. Add it to `logic/index.ts`
4. Register in `strategy.ts` `evaluateStrategy()` switch

## How to remove

Delete the file from `logic/` and remove its export from `logic/index.ts`.