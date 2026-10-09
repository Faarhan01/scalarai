# Strategies Plan — Phase 4: Backtest Engine with Historical Data

## Status: ⚠️ PARTIALLY IMPLEMENTED — Engine exists; persistence and UI incomplete

## What Exists

- `backend/src/services/strategy-backtest.ts` — `BacktestEngine` class (211 lines)
- `BacktestCandle`, `BacktestTrade`, `BacktestResult` interfaces
- `runBacktest(strategyMode, candles, config, initialBalance?)` method
- MCP tools: `backtest_strategy`, `backtest_strategy_with_history`

## What's Missing

- Backtest results not persisted to `backtest_results` table
- No `saveResult()` method in `BacktestEngine`
- No frontend backtest UI
- No strategy comparison UI

## Critical Fragility Warnings

1. **Backtest must not affect live state** — run on copies
2. **Candle quality matters** — gaps in data cause incorrect backtest results
3. **Backtest results must be stored** — for AI analysis and comparison

## Verification

- [x] Backtest runs against historical candles
- [ ] Results stored in `backtest_results` table
- [x] MCP tool returns correct data
- [ ] No live state mutation during backtest
