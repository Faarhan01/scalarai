# Plans Status — Done vs Not Done

> Source of truth for what has been implemented and what remains. Cross-reference with `knowledgebase/site-structure/` for actual file existence.

## Backend

| Plan File | Status | Notes |
|-----------|--------|-------|
| `backend/implementation-plan.md` — Priority 1: Critical Bugs | ✅ Done | ATR fix, `getMaxTicket()`, `nextTicket` from DB |
| `backend/implementation-plan.md` — Priority 2: Missing Utilities | ✅ Done | `normalizeIp()`, `validateAppUrl()` backend + frontend |
| `backend/implementation-plan.md` — Priority 3: Service Extraction | ✅ Done | All services extracted: trade-execution, state-persistence, market-ingestion, strategy, defaults, ea-generator, knowledge |
| `backend/implementation-plan.md` — Priority 4: Type Safety Sweep | ✅ Done | `err: any` → `unknown`, `UpdateMarketPayload`, `StrategyRules`, DB typing, route typing |
| `backend/implementation-plan.md` — Priority 5: AppStore Class | ✅ Done | `app-store.ts` exists, `app-state.ts` deleted, `index.ts` thin bootstrap |
| `backend/stage-1.md` — Service Extraction | ✅ Done | All services extracted; `index.ts` is 192 lines (not 160 as plan states) |
| `backend/stage-2.md` — Type Safety Sweep | ✅ Done | All `: any` replaced in critical paths |
| `backend/stage-3.md` — Hardcoded Values Cleanup | ✅ Done | Ticket seed, IP normalization, URL validation all implemented |
| `backend/stage-4.md` — AppStore Class | ✅ Done | `app-store.ts` is 453 lines (not 441 as plan states); `app-state.ts` deleted |
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
| `database/stage-1.md` — Schema Implementation | ✅ Done | 10 tables, 5 indexes, WAL mode, foreign keys |
| `database/stage-2.md` — Migration & Cleanup | ✅ Done | JSON-to-SQLite migration, hourly cleanup, DB hydration |
| `database/stage-3.md` — Legacy File Removal | ⏳ Pending | JSON backup files still exist in `backend/data/backups/` |

## Style

| Plan File | Status | Notes |
|-----------|--------|-------|
| `style/stage-1.md` — Design Tokens | ✅ Done | colors, spacing, typography, shadows, index |
| `style/stage-2.md` — Semantic Classes | ✅ Done | components.css with all semantic classes |
| `style/stage-3.md` — Token Adoption | ✅ Done | UI primitives built and adopted |

## Historical Data

| Plan File | Status | Notes |
|-----------|--------|-------|
| `historical-data/stage-1.md` — Time Utility | ✅ Done | `time.ts` exists with all helpers |
| `historical-data/stage-2.md` — Enhanced Schema | ❌ Not Done | No `market_candles`, `observations`, `backtest_results`, or `strategy_templates` tables |
| `historical-data/stage-3.md` — EA History Support | ❌ Not Done | No history request handler in EA generator |
| `historical-data/stage-4.md` — Backend History Routes | ❌ Not Done | No `/api/ea/request-history`, `/api/market/candles`, or `/api/market/observations` |
| `historical-data/stage-5.md` — Observations Service | ❌ Not Done | No `backend/src/services/observations.ts` |
| `historical-data/stage-6.md` — Enhanced MCP Tools | ❌ Not Done | No `request_mt5_history`, `get_market_candles`, `get_market_observations`, etc. |
| `historical-data/stage-7.md` — Strategy Creation & Backtesting | ❌ Not Done | No `strategy-backtest.ts` or `strategy-optimizer.ts` |

## Other

| Item | Status | Notes |
|------|--------|-------|
| `knowledgebase/restructure.md` | Unknown | Needs review |
| `knowledgebase/info/aiconnection.md` | Unknown | Needs review |
| `knowledgebase/info/chart.md` | Unknown | Needs review |
| `plan.md` — Kilo Integration Plan | ✅ Done | All documented endpoints and WebSockets exist |

## Inaccurate Plan Claims

These plan documents contain claims that do not match the actual codebase:

1. **`backend/stage-1.md` and `backend/stage-4.md`**: Claim `index.ts` is 160 lines and `app-store.ts` is 441 lines. Actual: `index.ts` is 192 lines, `app-store.ts` is 453 lines.
2. **`backend/implementation-plan.md`**: Claims `UpdateMarketPayload` is applied to market/EA route handlers. Actual: Only used in `ea.ts` and `market.ts`, not in `settings.ts`, `status.ts`, etc.
3. **`frontend/stage-1.md`**: Claims `ErrorBoundary` was extracted to `AppShell`. Actual: `ErrorBoundary` IS in `AppShell.tsx` and IS working, but the remaining work items (WebSocket callbacks, state consolidation, RAF throttling) are NOT done.
4. **`backend/implementation-plan.md`**: Lists `frontend/src/types/api.ts` and `backend/src/utils/response.ts` as "dead/placeholder files" to remove. Actual: Both files are NOT empty and are actively imported (`api.ts` in `services/api.ts`, `response.ts` is not imported in routes but contains `jsonSuccess`/`jsonError` utilities).
5. **`style/stage-3.md`**: Claims all components adopted tokens. Actual: UI primitives exist and are adopted, but many components still use inline Tailwind utilities.
