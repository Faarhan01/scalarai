# Historical Data Plan — Stage 2: Enhanced Database Schema

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
