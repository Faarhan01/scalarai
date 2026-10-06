# Historical Data Plan — Stage 2: Enhanced Database Schema

## Status: ❌ NOT DONE

## Objective

Add tables for storing historical candles, AI observations, backtest results, and strategy templates.

## New Tables

### `market_candles`
```sql
CREATE TABLE IF NOT EXISTS market_candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL DEFAULT 'Step Index',
  time INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL,
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down', 'flat')),
  minute_bucket INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### `observations`
```sql
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL DEFAULT 'Step Index',
  timestamp INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down', 'flat')),
  velocity REAL NOT NULL,
  price REAL NOT NULL,
  candle_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### `backtest_results`
```sql
CREATE TABLE IF NOT EXISTS backtest_results (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  symbol TEXT NOT NULL DEFAULT 'Step Index',
  from_time INTEGER NOT NULL,
  to_time INTEGER NOT NULL,
  initial_balance REAL NOT NULL,
  final_balance REAL NOT NULL,
  total_trades INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  win_rate REAL NOT NULL,
  profit_factor REAL NOT NULL,
  max_drawdown REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### `strategy_templates`
```sql
CREATE TABLE IF NOT EXISTS strategy_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'CUSTOM',
  rules TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## Critical Fragility Warnings

### SCHEMA CHANGES ARE RISKY

1. **New tables require migration code**: Adding tables requires updating `backend/src/db/migrate.ts` with `CREATE TABLE IF NOT EXISTS` statements. The existing `schema.sql` is only used for initial database creation.

2. **Existing databases won't auto-create new tables**: The migration system only runs ALTER TABLE for existing databases. New tables must be added via `CREATE TABLE IF NOT EXISTS` in `migrate.ts`.

3. **Data retention affects historical data**: The cleanup worker deletes `market_ticks` older than 7 days. If you add a `market_candles` table, decide whether it should also be cleaned up or retained indefinitely.

4. **Frontend must be updated to consume new data**: Adding tables is useless without frontend components to display the data. History panel, observations viewer, and backtest results UI are not implemented yet.

## Implementation Steps

1. Update `backend/src/db/schema.sql` with new tables
2. Update `backend/src/db/migrate.ts` to run new migrations
3. Update `backend/src/types/index.ts` with new row interfaces
4. Update `backend/src/db/repository.ts` with new CRUD methods
5. Verify with `npx tsc --noEmit` and tests

## Verification

- Database schema updated
- New tables accessible via repository
- TypeScript types compile cleanly
