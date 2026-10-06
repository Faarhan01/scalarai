# Implementation Plan — Backend Stages 1-4 Completion

## Priority 1: Critical Bugs (Do First)

### 1. Fix ATR calculation bug
**File:** `backend/src/services/trade-execution.ts:80`
**Issue:** `trs.reduce(...) / slice.length` should be `slice.reduce(...) / slice.length`
**Impact:** ATR returns wrong value when tick count exceeds period

### 2. Add getMaxTicket() to repository
**File:** `backend/src/db/repository.ts`
**Issue:** Stage 3 plan requires `getMaxTicket()` but it doesn't exist
**Impact:** Cannot derive next ticket from DB, hardcoded seed remains

### 3. Use getMaxTicket() + 1 for nextTicket
**File:** `backend/src/index.ts:143`
**Issue:** Hardcoded `nextTicket: { value: 837201 }` resets on restart
**Fix:** Call `scalarAiDb.getMaxTicket() + 1` during startup

## Priority 2: Missing Utilities (Do Second)

### 4. Add normalizeIp() utility
**File:** `backend/src/utils/ip.ts` (new)
**Issue:** Stage 3 plan requires IP normalization for IPv6-mapped IPv4 addresses
**Impact:** `::ffff:127.0.0.1` not normalized to `127.0.0.1`

### 5. Add validateAppUrl() to backend
**File:** `backend/src/services/ea-generator.ts`
**Issue:** `appUrl` injected into MQL5 without sanitization
**Fix:** Validate protocol, reject localhost in production, escape backslashes

### 6. Mirror validateAppUrl() in frontend
**File:** `frontend/src/lib/mql5_generator.ts`
**Issue:** Same URL injection risk in frontend-generated EA code

## Priority 3: Complete Stage 1 Extraction (Do Third)

### 7. Extract remaining functions from index.ts
**Target:** Move to `services/app-state.ts` or `services/state-persistence.ts`
- `getFullStatusPayload()` — lines 151–187
- `updateMarket()` — lines 193–279
- `broadcastToDashboards()` — lines 281–293
- `appCallbacks` object — lines 108–131
- `appState` object literal — lines 133–149
- `getAndClearPendingOrders()` — lines 321–325
- `getPendingEaCommand()` — lines 327–331

## Priority 4: Complete Stage 2 Type Safety (Do Fourth)

### 8. Apply UpdateMarketPayload type
**File:** `backend/src/index.ts:193`
**Change:** `function updateMarket(data: any, ...)` → `function updateMarket(data: UpdateMarketPayload, ...)`

### 9. Add StrategyRules interface
**File:** `backend/src/types/index.ts`
**Change:** Replace `rules: Record<string, any>` in `AiSynthesizedStrategy`

### 10. Replace remaining : any types in routes
**Files:** All `backend/src/routes/*.ts`
**Change:** `app: any` → `app: express.Application`

### 11. Replace remaining : any types in websockets
**Files:** `backend/src/websockets/*.ts`
**Change:** `server: any` → `server: import("http").Server`

### 12. Replace remaining : any in mcp_server.ts
**File:** `backend/src/mcp_server.ts`
**Change:** `t: any` → `TradeRecord`, `l: any` → `SystemLog`

## Priority 5: Tests (Do Last)

### 13. Fix existing tests
- Update test imports for new file paths
- Add tests for new services (app-state, trade-execution, state-persistence)

## Verification

After each priority block:
- Run `npx tsc --noEmit`
- Run `npm run test`
- Verify server starts and `/api/health` returns `status: ok`
