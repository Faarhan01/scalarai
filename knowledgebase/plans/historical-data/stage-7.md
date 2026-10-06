# Historical Data Plan — Stage 7: Strategy Creation & Backtesting

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
