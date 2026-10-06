# Historical Data Plan — Stage 7: Strategy Creation & Backtesting

## Status: ❌ NOT DONE

## Objective

Enable strategy creation from observations and backtesting with historical data.

## New Components

### Strategy Templates (`strategy_templates` table)
- Pre-built strategy templates (TREND_FOLLOWING, MEAN_REVERSION, etc.)
- Template rules and parameters
- Tags for categorization

### Backtest Engine
- Run strategy against historical candles
- Calculate: win rate, profit factor, max drawdown, Sharpe ratio
- Store results in `backtest_results` table

### Strategy Optimization
- Suggest parameter improvements based on backtest results
- AI-assisted rule generation from observations

## Critical Fragility Warnings

### BACKTEST MUST NOT AFFECT LIVE STATE

1. **Backtest must run on copies, not live state**: The backtest engine must operate on copies of `tradesList`, `symbolStates`, etc. from `AppStore`. Mutating live state during backtest causes real trades to execute incorrectly.

2. **Backtest results must not overwrite live strategy**: `backtest_results` table is separate from `ai_strategy` and `strategies` tables. A backtest is analysis, not a live strategy change.

3. **Strategy optimization suggestions are advisory only**: The optimizer should return suggestions, not automatically apply them. Human review is required before activating any optimized strategy.

## Implementation Steps

1. Create `backend/src/services/strategy-backtest.ts`
2. Create `backend/src/services/strategy-optimizer.ts`
3. Update `backend/src/services/strategy.ts` with backtest integration
4. Add MCP tools for strategy creation and backtesting
5. Add frontend UI for strategy management (optional)

## Verification

- Backtest runs against historical data
- Results stored and retrievable
- Strategy optimization suggestions work
- MCP tools expose strategy creation
