# Shape Patterns (M, W, Zigzag)

## How they work

Shape patterns are multi-bar formations detected via pivot structure (zigzag).
Unlike candlestick patterns (1-3 bars), shapes span 5-20 bars and represent
trend reversals or continuations.

## Detection logic

Each shape is a standalone detector in `detectors/`. A detector takes a bar
series and returns pivot indices where the shape was detected.

## Current detectors

| File | Pattern | Bars | Direction |
|---|---|---|---|
| (none yet) | M formation | 5-10 | BEARISH |
| (none yet) | W formation | 5-10 | BULLISH |

## How to add a new shape

1. Create `detectors/<shape-name>.ts`
2. Export a function `(bars: Bar[]) => number[]` (returns pivot indices)
3. Add it to `detectors/index.ts`
4. Run `check_pattern` MCP tool to validate

## How to remove a shape

Delete the file from `detectors/` and remove its export from `detectors/index.ts`.
Cached results in `dump/shape/` can be wiped independently.