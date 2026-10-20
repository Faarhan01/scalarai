# Momentum Indicators

## How they work

Momentum indicators measure the speed and strength of price movement.
They help identify overbought/oversold conditions and trend strength.

## Current indicators

| File | Indicator | Params | Description |
|---|---|---|---|
| (in indicators.ts) | RSI | period=14 | Relative Strength Index |
| (in indicators.ts) | MACD | fast=12, slow=26, signal=9 | Moving Average Convergence Divergence |

## How to add a new momentum indicator

1. Create `logic/<indicator-name>.ts`
2. Export a function `(values: number[], period: number) => Series`
3. Add it to `logic/index.ts`

## How to remove

Delete the file from `logic/` and remove its export from `logic/index.ts`.