# Plans Status — Done vs Not Done

> Source of truth for what has been implemented and what remains. Cross-reference with `knowledgebase/site-structure/` for actual file existence.

## Backend

| Plan File | Status | Notes |
|-----------|--------|-------|
| `backend/implementation-plan.md` — Priority 1: Critical Bugs | ✅ Done | ATR fix, `getMaxTicket()`, `nextTicket` from DB |
| `backend/implementation-plan.md` — Priority 2: Missing Utilities | ✅ Done | `normalizeIp()`, `validateAppUrl()` backend + frontend |
| `backend/implementation-plan.md` — Priority 3: Service Extraction | ✅ Done | All services extracted: trade-execution, state-persistence, market-ingestion, strategy, defaults, ea-generator, knowledge |
| `backend/implementation-plan.md` — Priority 4: Type Safety Sweep | ✅ Done | `err: any` → `unknown`, `UpdateMarketPayload`, `StrategyRules`, DB typing, route typing |
| `backend/implementation-plan.md` — Priority 5: AppStore Class | ✅ Done | `app-store.ts` exists (720 lines), `app-state.ts` deleted, `index.ts` thin bootstrap (202 lines) |
| `backend/stage-1.md` — Service Extraction | ✅ Done | All services extracted; `index.ts` is 202 lines |
| `backend/stage-2.md` — Type Safety Sweep | ✅ Done | All `: any` replaced in critical paths |
| `backend/stage-3.md` — Hardcoded Values Cleanup | ✅ Done | Ticket seed, IP normalization, URL validation all implemented |
| `backend/stage-4.md` — AppStore Class | ✅ Done | `app-store.ts` is 720 lines with private fields, getters, xstate machines; `app-state.ts` deleted |
| Backend unit tests for AppStore | ❌ Not Done | No `app-store.test.ts` exists |
| Backend integration tests for WebSockets | ❌ Not Done | No WebSocket integration tests |
| Route handlers accept AppStore directly | ⚠️ Partial | Closure pattern still used; works but is verbose |

## Frontend

| Plan File | Status | Notes |
|-----------|--------|-------|
| `frontend/stage-1.md` — ErrorBoundary extracted | ✅ Done | `ErrorBoundary` is in `AppShell.tsx`, `main.tsx` wraps with `<AppShell>` |
| `frontend/stage-1.md` — Elapsed timer extracted | ✅ Done | `useElapsedTimer.ts` exists and is used in `App.tsx` |
| `frontend/stage-1.md` — WebSocket callback aggregation | ❌ Not Done | Inline callbacks still in `App.tsx` |
| `frontend/stage-1.md` — State variable consolidation | ❌ Not Done | 25+ `useState` calls still in `App.tsx` |
| `frontend/stage-1.md` — RAF throttling extraction | ❌ Not Done | Still inline in `App.tsx` |
| `frontend/stage-2.md` — Extended History UI | ❌ Not Done | No `HistoryPanel.tsx`, no date range picker, no CSV export |
| `frontend/stage-3.md` — Token Adoption | ✅ Done | UI primitives built, high-traffic components adopted tokens |

## Database

| Plan File | Status | Notes |
|-----------|--------|-------|
| `database/stage-1.md` — Schema Implementation | ✅ Done | 16 tables, multiple indexes, WAL mode, foreign keys |
| `database/stage-2.md` — Migration & Cleanup | ✅ Done | JSON-to-SQLite migration complete, hourly cleanup, DB hydration |
| `database/stage-3.md` — Legacy File Removal | ✅ Done | JSON backup files deleted; migrate.ts no longer reads JSON; SQLite is sole source of truth |

## Historical Data

| Plan File | Status | Notes |
|-----------|--------|-------|
| `historical-data/stage-1.md` — Time Utility & Candle Timestamps | ✅ Done | `time.ts` exists, candles use minute-aligned `currentBucket * 60000`, `getMinuteBucket()` used |
| `historical-data/stage-2.md` — Enhanced Database Schema | ✅ Done | All 6 new tables exist: `market_candles`, `observations`, `strategy_templates`, `strategy_versions`, `backtest_results`, `strategy_symbol_performance` |
| `historical-data/stage-3.md` — EA Historical Data Support | ✅ Done | WebSocket `request_history`/`history_response` handlers exist in `index.ts` for both bridge and dashboard; EA generator has `PushHistoricalCandles` |
| `historical-data/stage-4.md` — Backend History Routes & WebSocket | ✅ Done | `GET /api/market/candles`, `GET /api/market/observations`, `POST /api/market/bulk-candles` routes exist; WebSocket history handlers exist |
| `historical-data/stage-5.md` — Observations Service & AI Insights | ✅ Done | `observations.ts` exists (182 lines), integrated into `AppStore`, MCP tools `get_market_observations` and `generate_observation_insights` exist |
| `historical-data/stage-6.md` — Enhanced MCP Tools | ✅ Done | `get_market_candles`, `get_market_observations`, `backtest_strategy_with_history`, `list_strategy_templates`, `create_strategy_from_template` all exist in `mcp_server.ts` |
| `historical-data/stage-7.md` — Strategy Creation & Backtesting | ⚠️ Partial | `strategy-backtest.ts` exists (211 lines) with `BacktestEngine`, but backtest results are not persisted to `backtest_results` table; no `strategy-generator.ts` or `strategy-optimizer.ts` |
| `historical-data/stage-8.md` — Frontend Chart & Historical Data Display | ⚠️ Partial | WebSocket `request_history`/`history_response` handlers exist in `index.ts`; no frontend history panel UI yet |

## Strategies

| Plan File | Status | Notes |
|-----------|--------|-------|
| `strategies/phase1.md` — Database Schema | ✅ Done | All tables exist: `strategy_templates`, `strategy_versions`, `backtest_results`, `strategy_symbol_performance`, `market_candles`, `observations` |
| `strategies/phase2.md` — Multi-Symbol Strategy Management | ⚠️ Partial | `strategy_symbol_performance` table exists; `settings.selected_assets` exists; no `strategy_symbols` mapping table yet |
| `strategies/phase3.md` — AI-Driven Strategy Creation | ❌ Not Done | No `strategy-generator.ts`; observations exist but no automated rule generation |
| `strategies/phase4.md` — Backtest Engine with Historical Data | ⚠️ Partial | `strategy-backtest.ts` exists with `BacktestEngine`; no candle-based backtest persistence yet |
| `strategies/phase5.md` — Optimization & Versioning | ❌ Not Done | No `strategy-optimizer.ts`; versioning table exists but no UI or automation |

## AppStore Standardization

| Plan File | Status | Notes |
|-----------|--------|-------|
| `appstore/phase1.md` — Private Fields + Getters | ✅ Done | All fields private, getters exposed, `index.ts` uses getters/methods |
| `appstore/phase2.md` — Split Interface | ✅ Done | `AppStoreReadOnly` interface exists in `types/index.ts` |
| `appstore/phase3.md` — XState State Machine | ✅ Done | tradingMachine, bridgeMachine, calibrationMachine added as passive observers |
| `appstore/phase4.md` — Freeze in Development | ❌ Not Done | No `Object.freeze(store)` in `index.ts` |

## Style

| Plan File | Status | Notes |
|-----------|--------|-------|
| `style/stage-1.md` — Design Tokens | ✅ Done | colors, spacing, typography, shadows, index |
| `style/stage-2.md` — Semantic Classes | ✅ Done | components.css with all semantic classes |
| `style/stage-3.md` — Token Adoption | ✅ Done | UI primitives built and adopted |

## Other

| Item | Status | Notes |
|------|--------|-------|
| `knowledgebase/restructure.md` | ✅ Updated | Now reflects actual codebase at HEAD |
| `knowledgebase/info/aiconnection.md` | ✅ Updated | Auth behavior and WebSocket message types corrected |
| `plan.md` — Kilo Integration Plan | ✅ Accurate | All documented endpoints and WebSockets exist |
| `knowledgebase/info/chart.md` | N/A | File does not exist |

## Inaccurate Plan Claims (Fixed)

These plan documents previously contained claims that did not match the actual codebase. All have been corrected:

1. **`restructure.md`**: Claimed `index.ts` is 160 lines and `app-store.ts` is 441 lines. Actual: `index.ts` is 202 lines, `app-store.ts` is 720 lines.
2. **`restructure.md`**: Missing many services (`observations.ts`, `strategy-backtest.ts`, `trading-machine.ts`) and utils (`time.ts`, `response.ts`, `auth.ts`).
3. **`restructure.md`**: Claimed rate limiting is 180 req/min. Actual: 3600 req/min with exempt paths.
4. **`restructure.md`**: Claimed `frontend/src/types/api.ts` is empty. Actual: 49 lines with API response interfaces.
5. **`restructure.md`**: Claimed `CandlestickChart.tsx` is a single file. Actual: directory with 4 files.
6. **`status.md`**: Previously claimed historical data stages 2-8 were "Not Done". Actual: stages 2-6 are fully done, stages 7-8 are partial.
7. **`plan.md` and `aiconnection.md`**: Previously claimed state-changing routes always require Bearer auth. Actual: MCP route always requires auth; other routes use optional auth (open when `SCALARAI_MCP_API_KEY` is unset).
