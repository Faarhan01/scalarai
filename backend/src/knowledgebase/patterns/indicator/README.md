# Indicator Patterns

## How they work

Indicator patterns are signals derived from technical indicators (RSI, MACD,
Bollinger, etc.) rather than raw price action. They detect overbought/oversold
conditions, divergences, or crossovers.

## Detection logic

Each indicator pattern is a standalone detector in `detectors/`. A detector
takes indicator values and returns signal indices.

## Current detectors

| File | Pattern | Indicator | Direction |
|---|---|---|---|
| (none yet) | RSI oversold bounce | RSI | BULLISH |
| (none yet) | MACD crossover | MACD | BULLISH/BEARISH |
| (none yet) | Bollinger band touch | Bollinger | BULLISH/BEARISH |

## How to add a new indicator pattern

1. Create `detectors/<pattern-name>.ts`
2. Export a function `(bars: Bar[], indicatorValues: number[]) => number[]`
3. Add it to `detectors/index.ts`
4. Run `check_pattern` MCP tool to validate

## How to remove

Delete the file from `detectors/` and remove its export from `detectors/index.ts`.
Cached results in `dump/indicator/` can be wiped independently.