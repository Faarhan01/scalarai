# AppStore Standardization Plan

> **Canonical structure:** See `knowledgebase/site-structure/backend/index.md` for the actual committed file layout before editing anything.

## Overview

`AppStore` is the single source of truth for all application state and business logic in the backend. It is instantiated once in `backend/src/index.ts` and passed to routes, WebSocket handlers, and the MCP server.

**File:** `backend/src/services/app-store.ts` — 453 lines

## Current Architecture

```
index.ts  →  new AppStore()  →  routes/websockets receive store methods/getters
```

`index.ts` (192 lines) is the ONLY consumer that directly accesses `AppStore` state fields. All other files — routes, WebSocket handlers, services — only receive callbacks.

## Current Problems

1. **Public mutable state** — all 17 fields are public and directly mutable (lines 11–27 in `app-store.ts`)
2. **No interface contract** — consumers depend on implementation details, not a declared contract
3. **No state machine** — trading state transitions are not enforced
4. **Direct field access in `index.ts`** — 25+ direct field reads/writes at lines 60–179

## Phases

- [phase1.md](phase1.md) — Private fields + getters
- [phase2.md](phase2.md) — Split `AppStoreReadOnly` interface
- [phase3.md](phase3.md) — XState trading state machine
- [phase4.md](phase4.md) — Freeze in development

## Contracts at Risk

These are the critical contracts that must not be broken during standardization:

| Contract | Location | Consumer |
|----------|----------|----------|
| `getFullStatusPayload()` shape | `app-store.ts:90-130` | Frontend `App.tsx` `onInit` handler |
| `updateMarket()` broadcast shape | `app-store.ts:223-238` | Frontend chart via WebSocket `tick` message |
| `getPendingEaCommand()` | `app-store.ts:138-142` | EA via `POST /api/ea/tick` response |
| `getAndClearPendingOrders()` | `app-store.ts:132-136` | EA via `GET /poll`, `/get-pending-trades` |
| `buildMcpContext()` methods | `app-store.ts:258-325` | All 25+ MCP tools |
| `broadcastToDashboards()` | `app-store.ts:72-84` | Frontend WebSocket updates |
| EA tick response fields | `routes/ea.ts:81-96` | MT5 EA reads `isActive`, `selectedStrategy`, `pendingAction`, etc. |

## Why This Matters

The AI has broken the site before by:
- Renaming state fields without updating `index.ts`
- Changing response shapes without updating the frontend
- Adding auth to EA routes, breaking tick ingestion
- Changing WebSocket message types without updating handlers

Standardizing `AppStore` prevents these classes of bugs.
