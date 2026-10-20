# Candlestick Patterns

## How they work

Candlestick patterns are geometric shapes formed by 1-3 consecutive bars. Each
pattern makes a directional claim (bullish, bearish, or neutral) based on the
relationship between open, high, low, and close prices.

## Detection logic

Each pattern is a standalone detector in `detectors/`. A detector takes a bar
(or 2-3 bars) and returns a `PatternMatch` with:
- `pattern`: name (e.g. "Bullish Engulfing")
- `direction`: BULLISH / BEARISH / NEUTRAL
- `confidence`: measured, not hardcoded
- `index`: bar index where the pattern was detected

## Current detectors

| File | Pattern | Bars | Direction |
|---|---|---|---|
| `engulfing.ts` | Bullish/Bearish Engulfing | 2 | BULLISH/BEARISH |
| `hammer.ts` | Hammer / Bullish Pinbar | 1 | BULLISH |
| `shooting-star.ts` | Shooting Star / Bearish Pinbar | 1 | BEARISH |
| `doji.ts` | Doji | 1 | NEUTRAL |

## How to add a new pattern

1. Create `detectors/<pattern-name>.ts`
2. Export a function `(bars: Bar[], i: number) => PatternMatch | null`
3. Add it to `detectors/index.ts`
4. Run `check_pattern` MCP tool to validate with t-test, null control, split-half

## How to remove a pattern

Delete the file from `detectors/` and remove its export from `detectors/index.ts`.
The pattern checker and dump results for that pattern can be cleaned via
`deletePatternResult(id)` or by wiping `dump/candlestick/`.

## Test results

Cached results live in `dump/candlestick/`. Delete the folder to force re-test.