# Volatility Indicators

## How they work

Volatility indicators measure the magnitude of price fluctuations.
They help identify market regime (high/low volatility) and set stop/target levels.

## Current indicators

| File | Indicator | Params | Description |
|---|---|---|---|
| (in indicators.ts) | ATR | period=14 | Average True Range |
| (in indicators.ts) | Bollinger Bands | period=20, numStd=2.0 | Bollinger Bands (2 sigma) |

## How to add a new volatility indicator

1. Create `logic/<indicator-name>.ts`
2. Export a function `(values: number[], period: number) => Series`
3. Add it to `logic/index.ts`

## How to remove

Delete the file from `logic/` and remove its export from `logic/index.ts`.