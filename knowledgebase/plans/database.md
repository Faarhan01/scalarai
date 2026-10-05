# Database Plan — SQLite 3 Migration

## Current State

- Persistence was handled via flat JSON files:
  - `backend/data/ai_knowledge_profile.json`
  - `backend/data/ai_synthesized_strategy.json`
- Data was loaded into memory at startup and written back to disk on changes.
- No relational structure, no querying, no transactions, no schema enforcement.

## Status: ✅ DONE

SQLite 3 migration is **fully implemented and operational**.

### Implemented Files

- `backend/src/db/schema.sql` — Full schema with 8 tables and 5 indexes
- `backend/src/db/migrate.ts` — Migration runner with JSON-to-SQLite data migration
- `backend/src/db/repository.ts` — `ScalarAiDb` repository class with full CRUD
- `backend/src/db/index.ts` — Database singleton
- `backend/data/scalarai.sqlite` — Active database file

### Implemented Schema

- `trades` — Trade records with status, profit, strategy, reason
- `system_logs` — Structured logs with level, source, timestamp
- `market_ticks` — Tick history with price, direction, velocity, lock states
- `ai_knowledge` — Singleton AI knowledge base
- `ai_strategy` — Singleton AI synthesized strategy
- `settings` — Singleton trade configuration
- `ea_connections` — Singleton EA connection state
- `symbol_metadata` — Per-symbol metadata registry

### Implemented Features

- WAL journal mode and foreign keys enabled
- Automatic JSON-to-SQLite migration on first run
- Periodic cleanup of old ticks (>7 days) and logs (>30 days)
- Full integration with `backend/src/index.ts` for state hydration and persistence

### Remaining Items

- Remove legacy JSON files after validation period:
  - `backend/data/ai_knowledge_profile.json`
  - `backend/data/ai_synthesized_strategy.json`
