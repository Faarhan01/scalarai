# Deployment Safety Notes

## Context
These are deploy-safety findings from the 2026-10-07 code review. The app is used locally, so these are not blocking, but they should be addressed before any production or multi-user deployment.

## Findings

### 1. EA Historical Candle Duplication Risk
- **File:** `backend/src/services/ea-generator.ts:121`
- **Issue:** `PushHistoricalCandles(1000)` is called on every EA connection without checking whether those candles already exist in the database.
- **Impact:** On reconnect, up to 1000 duplicate rows can be inserted per symbol, inflating `market_candles` and potentially skewing backtests and chart data.
- **Fix direction:** Add an upsert by `(symbol, time)` or check existing candle count before pushing.

### 2. No Feature Flags for New Features
- **File:** Multiple
- **Issue:** New REST endpoints (`/api/market/candles`, `/api/market/observations`), MCP tools, and observations storage are enabled unconditionally on server start.
- **Impact:** Any regression in the new code path (e.g., high-frequency observation writes, broken backtest metrics) affects all users immediately with no way to roll back without a deploy.
- **Fix direction:** Wrap new features behind config flags or environment variables so they can be disabled independently.

### 3. Database File Change in Diff
- **File:** `backend/data/scalarai.sqlite`
- **Issue:** The SQLite database file is modified in the working tree. If this contains new schema or seed data, it must be checked for compatibility with existing deployments.
- **Impact:** Binary DB changes are opaque; a schema mismatch can crash the app on startup for existing users.
- **Fix direction:** Do not commit database binaries. Use migrations for schema changes and seed scripts for reference data.

### 4. High-Frequency Observation Writes
- **File:** `backend/src/services/app-store.ts:306`
- **Issue:** Observations are written to SQLite on every tick where `velocity > 0.05`. Under normal market conditions this can fire hundreds of times per minute.
- **Impact:** SQLite write I/O pressure grows with observation count; sustained high frequency can degrade tick processing latency and eventually lock the database.
- **Fix direction:** Buffer observations in memory and flush asynchronously on an interval, or raise the velocity threshold.

---

*Generated from review: `2026-10-07`*
