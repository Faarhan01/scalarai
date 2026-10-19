# Historical Data Plan — Stage 2: Enhanced Database Schema

## Status: ✅ DONE

## Objective

Add tables for storing historical candles, AI observations, backtest results, and strategy templates. This is the foundation for all historical data functionality.

## Completed

### Schema Files

- `backend/src/db/schema.sql` — Full schema with 16 tables and multiple indexes
- `backend/src/db/migrate.ts` — Migration runner with schema migration + seedDefaults
- `backend/src/db/repository.ts` — `ScalarAiDb` repository class with full CRUD for all tables
- `backend/src/db/index.ts` — Database singleton

### Tables Implemented

All tables from the plan have been implemented:

- `market_candles` — OHLC candle storage with symbol, time, direction, volume
- `observations` — Individual AI observation records with tags, metadata, candle linkage
- `strategy_templates` — Built-in strategy templates (8 templates)
- `strategy_versions` — Strategy version history
- `backtest_results` — Backtest result storage
- `strategy_symbol_performance` — Per-symbol strategy performance tracking

### Indexes

All planned indexes implemented:
- `idx_market_candles_symbol_time`
- `idx_observations_symbol_timestamp`
- `idx_backtest_results_strategy`
- `idx_strategy_versions_strategy`
- `idx_strategy_symbol_performance`

## Verification

- Database file exists at `backend/data/scalarai.sqlite`
- All tables created successfully
- WAL journal mode and foreign keys enabled
- Repository methods accessible for all new tables
