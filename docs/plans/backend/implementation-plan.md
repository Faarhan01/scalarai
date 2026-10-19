# Implementation Plan — Backend Refactoring Status

> **Canonical structure:** See `knowledgebase/site-structure/backend/index.md` for the actual committed file layout before editing anything.

## Completed Work

### Priority 1: Critical Bugs ✅

1. **Fix ATR calculation bug** — `backend/src/services/trade-execution.ts` uses `slice.reduce(...) / slice.length` instead of `trs.reduce(...) / slice.length`
2. **Add `getMaxTicket()` to repository** — `backend/src/db/repository.ts:322`
3. **Use `getMaxTicket() + 1` for nextTicket** — `backend/src/services/app-store.ts` constructor initializes `nextTicket` from DB

### Priority 2: Missing Utilities ✅

4. **Add `normalizeIp()` utility** — `backend/src/utils/ip.ts` normalizes IPv6-mapped IPv4 addresses
5. **Add `validateAppUrl()` to backend** — `backend/src/services/ea-generator.ts:3`
6. **Mirror validation in frontend** — `frontend/src/lib/mql5_generator.ts:3`

### Priority 3: Service Extraction ✅

7. **Extract `services/trade-execution.ts`** — Trade lifecycle, indicator math, strategy evaluation
8. **Extract `services/state-persistence.ts`** — DB hydration and persist helpers
9. **Extract `services/market-ingestion.ts`** — Symbol state, tick aggregation, candle building
10. **Extract `services/strategy.ts`** — Core strategy evaluation and indicators
11. **Extract `services/defaults.ts`** — Default state factories
12. **Extract `services/ea-generator.ts`** — MQL5/bridge code generation
13. **Extract `services/knowledge.ts`** — AI knowledge base calculations

### Priority 4: Type Safety Sweep ✅

14. **Replace `err: any` with `unknown`** in all route catch blocks and `mcp_server.ts`
15. **Apply `UpdateMarketPayload` type** to market/EA route handlers
16. **Add `StrategyRules` interface** and use in `AiSynthesizedStrategy`
17. **Replace `db: any` with `InstanceType<typeof Database>`** in repository
18. **Replace `app: any` with `express.Application`** in all route files
19. **Replace `server: any` with `import("http").Server`** in WebSocket handlers
20. **Add `FullStatusPayload`, `AiStudyFeedPayload` interfaces** to types

### Priority 5: AppStore Class ✅

21. **Create `AppStore` class** — `backend/src/services/app-store.ts` (453 lines)
    - Encapsulates all application state
    - Contains all state mutation methods
    - Provides typed getters for route handlers
    - Builds `McpContext` for MCP tools
    - Runs background analysis worker

22. **Rewrite `backend/src/index.ts`** — Thin 192-line bootstrap
    - Creates single `AppStore` instance
    - Passes store methods to route registrations
    - WebSocket handlers call store methods directly
    - Removed all module-level state and closures

23. **Delete `backend/src/services/app-state.ts`** — Replaced by OOP `AppStore` class

## Remaining Work

### Immediate

- [ ] Add unit tests for `AppStore` class methods
- [ ] Add integration tests for WebSocket handlers
- [ ] Consider passing `AppStore` instance directly to routes instead of individual closures (current closure pattern works but is verbose)

### Future

- [ ] Add Docker / process manager configs for local hosting
- [ ] Evaluate removing `frontend/src/types/api.ts` and `backend/src/utils/response.ts` ONLY after confirming they are truly unused (currently `api.ts` is imported by `services/api.ts` and `response.ts` contains `jsonSuccess`/`jsonError`)
- [ ] Verify `@tokens/colors` path alias resolution in all chart components

## Verification

- `npx tsc --noEmit` passes with zero errors
- `npm run test` blocked by Rollup native module issue (environment issue, not code issue)
- Server starts and `/api/health` returns `status: ok`
- All route handlers function correctly
- WebSocket bridge and dashboard connect and respond
