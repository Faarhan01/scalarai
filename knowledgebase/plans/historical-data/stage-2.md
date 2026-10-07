# Historical Data Plan — Stage 2: Enhanced Database Schema

## Status: ❌ NOT DONE — Required for all subsequent stages

## Objective

Add tables for storing historical candles, AI observations, backtest results, and strategy templates. This is the foundation for all historical data functionality.

## Current Database State

### ✅ Existing Tables

**`market_ticks`** — Raw tick storage (7-day retention)
```sql
CREATE TABLE market_ticks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL DEFAULT 'Step Index',
  time INTEGER NOT NULL,          -- epoch ms
  price REAL NOT NULL,
  direction TEXT NOT NULL,         -- 'up', 'down', 'flat'
  open REAL, high REAL, low REAL, close REAL,
  velocity REAL,
  buy_locked INTEGER NOT NULL DEFAULT 0,
  sell_locked INTEGER NOT NULL DEFAULT 0,
  spread REAL,
  session TEXT
);
```
- **Indexes:** `idx_market_ticks_time`, `idx_market_ticks_symbol`
- **Retention:** 7 days (cleanup worker deletes old ticks)
- **Data quality:** Good — has direction, velocity, timestamps, symbol

**`strategies`** — Custom strategies
```sql
CREATE TABLE strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'CUSTOM',
  rules TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```
- **Missing:** No symbol column, no versioning, no performance tracking

**`ai_knowledge`** — Single-row AI state
```sql
CREATE TABLE ai_knowledge (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_observations INTEGER NOT NULL DEFAULT 0,
  global_average_speed REAL NOT NULL DEFAULT 0,
  peak_velocity_registered REAL NOT NULL DEFAULT 0,
  time_of_day_patterns TEXT NOT NULL DEFAULT '{}',
  last_updated TEXT NOT NULL
);
```
- **Missing:** No per-observation records, only aggregate counter

**`ai_strategy`** — Single AI strategy
```sql
CREATE TABLE ai_strategy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'AI Adaptive',
  description TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'AI_ADAPTIVE',
  rules TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```
- **Missing:** No versioning, no symbol dimension

### ❌ Missing Tables

These tables MUST be created for historical data functionality:

#### 1. `market_candles` — OHLC candle storage

**Purpose:** Long-term candle storage for backtesting and chart history. Retained indefinitely.

```sql
CREATE TABLE IF NOT EXISTS market_candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL DEFAULT 'Step Index',
  time INTEGER NOT NULL,           -- minute-aligned epoch ms
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL,
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down', 'flat')),
  minute_bucket INTEGER NOT NULL,  -- Math.floor(time / 60000)
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_market_candles_symbol_time ON market_candles(symbol, time);
```

**Why this is needed:**
- `market_ticks` has 7-day retention — candles provide long-term history
- Candle-based backtesting requires OHLC data
- Frontend chart can load historical candles for context
- 1-minute candles are small (~50 bytes each) — indefinite retention is feasible

#### 2. `observations` — Individual AI observation records

**Purpose:** Store individual market observations with metadata for AI analysis and strategy generation.

```sql
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL DEFAULT 'Step Index',
  timestamp INTEGER NOT NULL,      -- epoch ms
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down', 'flat')),
  velocity REAL NOT NULL,
  price REAL NOT NULL,
  candle_id INTEGER,                -- foreign key to market_candles
  tags TEXT NOT NULL DEFAULT '[]',  -- JSON array of tags
  metadata TEXT NOT NULL DEFAULT '{}',  -- JSON object for extensibility
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_observations_symbol_timestamp ON observations(symbol, timestamp);
```

**Why this is needed:**
- Current `ai_knowledge.total_observations` is just a counter — no per-observation data
- AI needs to query specific observation patterns (e.g., "high velocity bursts between 9-11 AM")
- Strategy creation from observations requires individual records
- `candle_id` links observations to candles for context

#### 3. `backtest_results` — Backtest result storage

**Purpose:** Persist backtest results for AI analysis and strategy comparison.

```sql
CREATE TABLE IF NOT EXISTS backtest_results (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  strategy_version_id TEXT,         -- nullable for legacy results
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

**Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_backtest_results_strategy ON backtest_results(strategy_id);
CREATE INDEX IF NOT EXISTS idx_backtest_results_symbol ON backtest_results(symbol);
```

**Why this is needed:**
- Current backtest results are ephemeral — lost after MCP call
- AI needs historical backtest data to optimize strategies
- Strategy comparison requires persistent results

#### 4. `strategy_templates` — Database-backed templates

**Purpose:** Store strategy templates in DB so AI can query and instantiate them via MCP.

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

**Why this is needed:**
- Current templates are hardcoded in `strategy-templates.ts`
- AI can't discover or modify templates via MCP
- New templates require code changes

#### 5. `strategy_versions` — Strategy evolution tracking

**Purpose:** Track strategy changes over time for rollback and analysis.

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

**Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_strategy_versions_strategy ON strategy_versions(strategy_id);
```

#### 6. `strategy_symbol_performance` — Per-symbol performance tracking

**Purpose:** Track how strategies perform on different symbols.

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

**Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_strategy_symbol_performance ON strategy_symbol_performance(strategy_id, symbol);
```

## Implementation Steps

1. **Update `backend/src/db/schema.sql`** — Add all 6 new tables + indexes
2. **Update `backend/src/db/migrate.ts`** — Add `CREATE TABLE IF NOT EXISTS` for new tables
3. **Update `backend/src/types/index.ts`** — Add row interfaces:
   - `MarketCandleRow`
   - `ObservationRow`
   - `BacktestResultRow`
   - `StrategyTemplateRow`
   - `StrategyVersionRow`
   - `StrategySymbolPerformanceRow`
4. **Update `backend/src/db/repository.ts`** — Add CRUD methods for all new tables
5. **Verify with `npx tsc --noEmit`** and test database creation

## Critical Fragility Warnings

### SCHEMA CHANGES ARE RISKY

1. **New tables require migration code**: Adding tables requires updating `backend/src/db/migrate.ts` with `CREATE TABLE IF NOT EXISTS` statements. The existing `schema.sql` is only used for initial database creation.

2. **Existing databases won't auto-create new tables**: The migration system only runs `ALTER TABLE` for existing databases. New tables must be added via `CREATE TABLE IF NOT EXISTS` in `migrate.ts`.

3. **Data retention affects historical data**: The cleanup worker deletes `market_ticks` older than 7 days. If you add a `market_candles` table, decide whether it should also be cleaned up or retained indefinitely. **Recommendation: retain `market_candles` indefinitely** — 1-minute candles are small and essential for backtesting.

4. **Foreign keys require WAL mode**: Already enabled (`PRAGMA foreign_keys = ON`), but adding FK constraints requires careful migration.

5. **Don't break existing data**: All new tables must use `IF NOT EXISTS` to avoid errors on existing databases.

## Verification

- [ ] Database schema updated with all new tables
- [ ] New tables accessible via repository
- [ ] TypeScript types compile cleanly
- [ ] Existing data preserved after migration
- [ ] New tables have proper indexes
