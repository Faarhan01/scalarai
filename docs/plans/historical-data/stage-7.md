# Historical Data Plan — Stage 7: Strategy Creation & Backtesting

## Status: ⚠️ PARTIALLY IMPLEMENTED — Backtest engine exists; persistence and strategy generation incomplete

## What Exists

### `backend/src/services/strategy-backtest.ts` (211 lines)

**Class:** `BacktestEngine`

- `runBacktest(strategyMode, candles, config, initialBalance?): BacktestResult`
- Interfaces: `BacktestCandle`, `BacktestTrade`, `BacktestResult`
- Calculates: winRate, profitFactor, maxDrawdown, sharpeRatio, avgWin, avgLoss

### `backend/src/services/strategy.ts`

- `evaluateStrategyBacktest(mode, limit)` — runs against recent live ticks
- `buildContext()` — builds strategy context from ticks/knowledge

### `backend/src/services/strategy-templates.ts`

- 8 built-in strategy templates
- `createStrategyFromTemplate()` — creates strategy from template
- `getStrategyTemplateById()` — lookup by ID

### `backend/src/mcp_server.ts`

- `backtest_strategy` — backtest against recent ticks
- `backtest_strategy_with_history` — backtest with time range
- `list_strategy_templates` — list all templates
- `create_strategy_from_template` — create from template

## What's Missing

1. **Backtest results not persisted** — `BacktestEngine.runBacktest()` returns results but does not save to `backtest_results` table
2. **No `strategy-generator.ts`** — no automated strategy creation from observations
3. **No `strategy-optimizer.ts`** — optimization is in `strategy-research.ts` but not as a separate service
4. **No strategy versioning UI** — `strategy_versions` table exists but no frontend or MCP tools to manage versions
5. **No `create_strategy_from_observations` MCP tool** — observations exist but no automated rule generation

## Critical Fragility Warnings

### BACKTEST MUST NOT AFFECT LIVE STATE

1. **Backtest must run on copies, not live state**: The backtest engine operates on copies of candle data. No mutations to `AppStore` during backtest.

2. **Backtest results must not overwrite live strategy**: `backtest_results` table is separate from `ai_strategy` and `strategies` tables. A backtest is analysis, not a live strategy change.

3. **Strategy optimization suggestions are advisory only**: The optimizer should return suggestions, not automatically apply them. Human review is required before activating any optimized strategy.

## Implementation Steps

1. Add `saveResult()` to `BacktestEngine` to persist to `backtest_results` table
2. Create `backend/src/services/strategy-generator.ts` for AI-generated strategies
3. Create `backend/src/services/strategy-optimizer.ts` for optimization suggestions
4. Add MCP tools for strategy creation from observations
5. Add MCP tools for strategy versioning
6. Verify with tests

## Verification

- [x] Backtest runs against historical candles
- [ ] Results stored in `backtest_results` table
- [x] Time range queries work correctly
- [ ] Strategy generation from observations works
- [ ] Strategy versioning tracks changes
- [x] MCP tools expose strategy creation from templates
