# Backend Database

> Detailed reference for the database layer in `backend/src/db/`.

## Stack

- **Engine:** SQLite via `better-sqlite3`
- **Pattern:** Singleton — `scalarAiDb` exported from `db/index.ts`
- **Path:** `backend/data/scalarai.sqlite`
- **Journal:** WAL mode enabled
- **Foreign keys:** Enabled

## Files

### `index.ts`

```ts
import { openDb, migrate } from "./migrate";
import { ScalarAiDb } from "./repository";

const db = openDb();
migrate(db);
export const scalarAiDb = new ScalarAiDb(db);
```

Creates DB connection, runs migrations, exports singleton.

### `migrate.ts`

- `openDb(): InstanceType<typeof Database>` — opens SQLite DB at `backend/data/scalarai.sqlite`
- `migrate(db)` — executes `schema.sql`, runs ALTER TABLE migrations, seeds defaults, migrates legacy JSON data

**Legacy JSON migration:**
- Reads `backend/data/ai_knowledge_profile.json` (or backup) and migrates to `ai_knowledge` table if SQLite has fewer observations
- Reads `backend/data/ai_synthesized_strategy.json` (or backup) and migrates to `ai_strategy` table if current name is "AI Adaptive"

**Seed defaults:**
- Inserts default settings, AI knowledge, AI strategy if tables are empty

### `repository.ts` — ScalarAiDb Class

**Trades:**
- `insertTrade(trade)` — INSERT INTO trades
- `updateTrade(id, updates)` — partial UPDATE trades
- `mapTradeRow(row): TradeRecord` — maps DB row to domain type
- `getTrades(status?, symbol?): TradeRecord[]` — SELECT with optional filters
- `getOpenTrades(): TradeRecord[]` — SELECT WHERE status = 'OPEN'
- `closeTrade(id, closePrice, profit)` — UPDATE trades SET status = 'CLOSED'
- `resetTrades()` — DELETE FROM trades

**Logs:**
- `insertLog(log)` — INSERT INTO system_logs
- `getLogs(limit, source?, level?): SystemLog[]` — SELECT with optional filters

**Market Ticks:**
- `insertTick(tick, symbol?)` — INSERT INTO market_ticks with symbol
- `getTicks(limit, symbol?): Tick[]` — SELECT with optional symbol filter
- `getTicksSince(timestamp, symbol?): Tick[]` — SELECT WHERE time >= timestamp

**AI Knowledge:**
- `getAiKnowledge(): AiKnowledgeBase | null` — SELECT FROM ai_knowledge WHERE id = 1
- `upsertAiKnowledge(knowledge)` — INSERT OR UPDATE on conflict

**AI Strategy:**
- `getAiStrategy(): AiSynthesizedStrategy | null` — SELECT FROM ai_strategy WHERE id = 1
- `upsertAiStrategy(strategy)` — INSERT OR UPDATE on conflict

**Settings:**
- `getSettings(): TradeConfig | null` — SELECT FROM settings WHERE id = 1
- `upsertSettings(config)` — INSERT OR UPDATE on conflict

**EA Connection:**
- `getEaConnection(): EAConnectionDetails | null` — SELECT FROM ea_connections WHERE id = 1
- `upsertEaConnection(conn)` — INSERT OR UPDATE, also upserts symbol_connections
- `upsertSymbolConnection(conn)` — INSERT OR UPDATE on symbol
- `getAllSymbolConnections(): EAConnectionDetails[]` — SELECT ALL FROM symbol_connections

**Symbol Metadata:**
- `upsertSymbolMetadata(symbol, data)` — INSERT OR UPDATE
- `getSymbolMetadata(symbol)` — SELECT by symbol

**Strategies:**
- `insertStrategy(strategy)` — INSERT INTO strategies
- `getAllStrategies(): StrategyRow[]` — SELECT ALL ORDER BY updated_at DESC
- `getStrategyById(id)` — SELECT by id
- `updateStrategy(id, updates)` — UPDATE by id
- `deleteStrategy(id)` — DELETE by id

**Utilities:**
- `getMaxTicket(): number` — MAX(ticket) FROM trades, defaults to 837201
- `rawQuery(sql, params): unknown[]` — read-only SELECT queries with safety checks
- `cleanupOldData()` — DELETE ticks older than 7 days, logs older than 30 days
- `getDbStats()` — returns tick count, log count, trade count, DB file size

## Schema

See `schema.sql` for full table definitions. Key tables:

| Table | Purpose |
|-------|---------|
| `trades` | Trade records with OPEN/CLOSED status |
| `system_logs` | System logs with source/level |
| `market_ticks` | Tick data with OHLC, velocity, lock flags |
| `ai_knowledge` | AI knowledge base (singleton id=1) |
| `ai_strategy` | AI synthesized strategy (singleton id=1) |
| `settings` | Trade config (singleton id=1) |
| `ea_connections` | EA connection details (singleton id=1) |
| `symbol_connections` | Per-symbol EA connection details |
| `symbol_metadata` | Per-symbol metadata (digits, tick size, etc.) |
| `strategies` | Custom strategies |

**Indexes:**
- `idx_trades_status`, `idx_trades_open_time`, `idx_trades_symbol`
- `idx_system_logs_timestamp`, `idx_system_logs_source`
- `idx_market_ticks_time`, `idx_market_ticks_symbol`
- `idx_strategies_mode`

## Data Retention

- Ticks: deleted after 7 days (background cleanup every 1 hour)
- Logs: deleted after 30 days (background cleanup every 1 hour)
- Trades, strategies, knowledge, settings: retained indefinitely

## Legacy Data Migration

On first run, `migrate.ts` attempts to migrate from legacy JSON files:
- `backend/data/ai_knowledge_profile.json` → `ai_knowledge` table
- `backend/data/ai_synthesized_strategy.json` → `ai_strategy` table
- Backups in `backend/data/backups/` are used as fallback

Migration only occurs if SQLite has less data than the JSON file.
