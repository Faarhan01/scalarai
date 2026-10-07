# Strategies Plan — Phase 1: Database Schema

## Objective

Add database tables for strategies, templates, backtest results, and strategy-symbol mappings so the AI can create and manage strategies via MCP without code changes.

## New Tables

### `strategy_templates`

Store parameterized strategy templates that AI can instantiate.

```sql
CREATE TABLE IF NOT EXISTS strategy_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'CUSTOM',
  category TEXT NOT NULL DEFAULT 'custom',
  rules TEXT NOT NULL DEFAULT '{}',
  default_config TEXT NOT NULL DEFAULT '{}',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### `strategy_versions`

Track strategy evolution over time.

```sql
CREATE TABLE IF NOT EXISTS strategy_versions (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  symbol TEXT NOT NULL DEFAULT 'Step Index',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'CUSTOM',
  rules TEXT NOT NULL DEFAULT '{}',
  config TEXT NOT NULL DEFAULT '{}',
  parent_version_id TEXT,
  created_by TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  FOREIGN KEY (strategy_id) REFERENCES strategies(id),
  FOREIGN KEY (parent_version_id) REFERENCES strategy_versions(id)
);
```

### `backtest_results`

Store backtest results for strategy evaluation.

```sql
CREATE TABLE IF NOT EXISTS backtest_results (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  strategy_version_id TEXT,
  symbol TEXT NOT NULL DEFAULT 'Step Index',
  from_time INTEGER NOT NULL,
  to_time INTEGER NOT NULL,
  initial_balance REAL NOT NULL DEFAULT 10000,
  final_balance REAL NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  win_rate REAL NOT NULL DEFAULT 0,
  profit_factor REAL NOT NULL DEFAULT 0,
  max_drawdown REAL NOT NULL DEFAULT 0,
  sharpe_ratio REAL NOT NULL DEFAULT 0,
  avg_win REAL NOT NULL DEFAULT 0,
  avg_loss REAL NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (strategy_id) REFERENCES strategies(id),
  FOREIGN KEY (strategy_version_id) REFERENCES strategy_versions(id)
);
```

### `strategy_symbol_performance`

Track per-symbol strategy performance for multi-symbol support.

```sql
CREATE TABLE IF NOT EXISTS strategy_symbol_performance (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  symbol TEXT NOT NULL DEFAULT 'Step Index',
  total_trades INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  win_rate REAL NOT NULL DEFAULT 0,
  total_profit REAL NOT NULL DEFAULT 0,
  avg_profit_per_trade REAL NOT NULL DEFAULT 0,
  max_drawdown REAL NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (strategy_id) REFERENCES strategies(id),
  UNIQUE(strategy_id, symbol)
);
```

### `market_candles`

Store aggregated OHLC candles for backtesting.

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

Store AI observations for strategy generation.

```sql
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL DEFAULT 'Step Index',
  timestamp INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down', 'flat')),
  velocity REAL NOT NULL,
  price REAL NOT NULL,
  candle_id INTEGER,
  tags TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_market_candles_symbol_time ON market_candles(symbol, time);
CREATE INDEX IF NOT EXISTS idx_observations_symbol_timestamp ON observations(symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_backtest_results_strategy ON backtest_results(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_versions_strategy ON strategy_versions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_symbol_performance ON strategy_symbol_performance(strategy_id, symbol);
```

## Implementation Steps

1. Update `backend/src/db/schema.sql` with new tables
2. Update `backend/src/db/migrate.ts` to run new migrations
3. Update `backend/src/types/index.ts` with new row interfaces
4. Update `backend/src/db/repository.ts` with new CRUD methods
5. Verify with `npx tsc --noEmit` and tests

## Critical Fragility Warnings

1. **New tables require migration code** — must be added via `CREATE TABLE IF NOT EXISTS` in `schema.sql` and `migrate.ts`
2. **Existing databases won't auto-create new tables** — migration only runs ALTER TABLE for existing databases
3. **Data retention affects historical data** — `market_ticks` older than 7 days are deleted. Decide retention policy for `market_candles` and `observations`.
4. **Foreign keys require WAL mode** — already enabled, but adding FK constraints requires careful migration.

## Verification

- Database schema updated
- New tables accessible via repository
- TypeScript types compile cleanly
- Existing data preserved after migration
