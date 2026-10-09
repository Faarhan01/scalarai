# Strategies Plan — Phase 1: Database Schema

## Status: ✅ DONE

## Objective

Add database tables for strategies, templates, backtest results, and strategy-symbol mappings so the AI can create and manage strategies via MCP without code changes.

## Completed

### Tables Implemented

All planned tables have been implemented in `backend/src/db/schema.sql` and `backend/src/db/migrate.ts`:

- `strategy_templates` — Built-in strategy templates (8 templates)
- `strategy_versions` — Strategy version history
- `backtest_results` — Backtest result storage
- `strategy_symbol_performance` — Per-symbol strategy performance tracking
- `market_candles` — OHLC candle storage
- `observations` — AI observation records

### Indexes

All planned indexes implemented:
- `idx_market_candles_symbol_time`
- `idx_observations_symbol_timestamp`
- `idx_backtest_results_strategy`
- `idx_strategy_versions_strategy`
- `idx_strategy_symbol_performance`

### Repository Methods

`backend/src/db/repository.ts` has CRUD methods for all new tables.

## Verification

- Database schema updated with all new tables
- New tables accessible via repository
- TypeScript types compile cleanly
- Existing data preserved after migration
