# Volume Indicators

## How they work

Volume indicators measure trading activity and participation.
They help confirm trend strength and identify potential reversals.

## Current indicators

| File | Indicator | Params | Description |
|---|---|---|---|
| (none yet) | OBV | — | On-Balance Volume |
| (none yet) | Volume SMA | period=20 | Volume Moving Average |

## How to add a new volume indicator

1. Create `logic/<indicator-name>.ts`
2. Export a function `(values: number[], period: number) => Series`
3. Add it to `logic/index.ts`

## How to remove

Delete the file from `logic/` and remove its export from `logic/index.ts`.