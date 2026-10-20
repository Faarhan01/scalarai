# Custom Indicators

## How they work

Custom indicators are user-defined. They can combine existing indicators
or implement novel calculations.

## Current indicators

(none yet)

## How to add a new custom indicator

1. Create `logic/<indicator-name>.ts`
2. Export a function `(values: number[], ...params) => Series`
3. Add it to `logic/index.ts`
4. Optionally register in the `indicator_library` table via `add_indicator` MCP tool

## How to remove

Delete the file from `logic/` and remove its export from `logic/index.ts`.