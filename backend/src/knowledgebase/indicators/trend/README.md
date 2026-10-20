# Trend Indicators

## How they work

Trend indicators smooth price data to identify the direction of the trend.
They lag price but filter out noise, making them useful for trend-following strategies.

## Current indicators

| File | Indicator | Params | Description |
|---|---|---|---|
| (in indicators.ts) | SMA | period=20 | Simple Moving Average |
| (in indicators.ts) | EMA | period=14 | Exponential Moving Average |

## How to add a new trend indicator

1. Create `logic/<indicator-name>.ts`
2. Export a function `(values: number[], period: number) => Series`
3. Add it to `logic/index.ts`

## How to remove

Delete the file from `logic/` and remove its export from `logic/index.ts`.