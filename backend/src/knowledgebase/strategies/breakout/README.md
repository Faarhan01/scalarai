# Breakout Strategies

## How they work

Breakout strategies enter when price breaks out of a defined range.
They use Donchian channel (highest high / lowest low over N bars) to
identify range boundaries.

## Current strategies

| File | Strategy | Entry condition | Exit |
|---|---|---|---|
| (in strategy.ts) | Donchian Breakout | Close above N-bar high / below N-bar low | SL/TP or trailing stop |

## How to add a new breakout strategy

1. Create `logic/<strategy-name>.ts`
2. Export a function `(ctx: StrategyContext, config: TradeConfig) => TradeSignal`
3. Add it to `logic/index.ts`
4. Register in `strategy.ts` `evaluateStrategy()` switch

## How to remove

Delete the file from `logic/` and remove its export from `logic/index.ts`.