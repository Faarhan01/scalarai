# Site Improvement Plan

## Current State Summary

The ScalarAI trading application is partially restructured and functional:
- Backend is modularized under `backend/src/` with routes, services, websockets, and DB layers
- SQLite 3 database is implemented and operational
- Multi-symbol backend state is supported via `symbolStates` Map
- Frontend is still a single 2981-line `App.tsx` file
- Header and graph titles hardcode "STEP INDEX"
- Styling is entirely inline Tailwind utilities
- Legacy JSON files still exist alongside SQLite

## Completed Improvements

### Backend hardening
- Removed duplicate dead MCP `TOOLS` array in `backend/src/routes/mcp.ts`
- Removed hardcoded `SCALARAI_MCP_API_KEY` fallback in `backend/src/index.ts`
- Hardened `query_db` read-only SQL checks against multi-statement and comment injection
- Added input validation to `/api/settings`, `/api/ea/tick`, `/api/update-market`, `/api/toggle-trade`
- Made `insertTick` failures visible in logs instead of silently swallowing them
- Removed unused duplicate indicator/strategy modules
- Removed dead placeholder modules: `backend/src/services/ai.ts`, `backend/src/services/market.ts`, `backend/src/services/index.ts`
- Sanitized `.env.example` GitHub OAuth placeholders
- Replaced generated Node.js bridge dependency on `axios` with built-in `https`/`http`
- Fixed `useChartData` large-array min/max overflow risk
- Added `vitest` unit tests for strategy evaluation, DB repository, and MCP SQL guard

## Improvement Areas

### 1. Frontend Component Split

**Problem:** `frontend/src/App.tsx` is a 2981-line monolith containing layout, charts, trades, AI panels, settings, and bridge download logic.

**Goal:** Split into logical component folders for maintainability and team collaboration.

**Proposed Structure:**
```
frontend/src/
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── MobileDrawer.tsx
│   │   └── StatusBar.tsx
│   ├── dashboard/
│   │   ├── PriceChart.tsx
│   │   ├── TradePanel.tsx
│   │   └── StatsCards.tsx
│   ├── charts/
│   │   ├── CandlestickChart.tsx
│   │   └── TelemetryStream.tsx
│   ├── trades/
│   │   ├── TradeList.tsx
│   │   ├── TradeRow.tsx
│   │   └── TradeFilters.tsx
│   ├── ai/
│   │   ├── AiStudyFeed.tsx
│   │   ├── StrategyPanel.tsx
│   │   └── KnowledgeBase.tsx
│   ├── settings/
│   │   ├── SettingsForm.tsx
│   │   ├── AssetSelector.tsx
│   │   └── WebRequestTest.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Badge.tsx
│       ├── Card.tsx
│       └── Modal.tsx
├── hooks/
│   ├── useWebSocket.ts
│   ├── useSymbolState.ts
│   └── useChartData.ts
├── services/
│   ├── api.ts
│   └── ws.ts
├── stores/
│   └── useAppStore.ts
├── utils/
│   └── chart.ts
├── types/
│   ├── index.ts
│   └── api.ts
└── styles/
    ├── globals.css
    ├── components.css
    └── index.css
```

**Implementation Order:**
1. Create `components/layout/` and extract Header, MobileDrawer, StatusBar
2. Create `components/dashboard/` and extract PriceChart, TradePanel, StatsCards
3. Create `components/trades/` and extract TradeList, TradeRow, TradeFilters
4. Create `components/ai/` and extract AiStudyFeed, StrategyPanel, KnowledgeBase
5. Create `components/settings/` and extract settings forms
6. Create `components/ui/` for shared presentational components
7. Extract custom hooks from `App.tsx` into `hooks/`
8. Verify app compiles and all features work after each extraction

---

### 2. Dynamic Symbol Display

**Problem:** Header badge hardcodes "STEP INDEX" and graph title hardcodes "LIVE STEP INDEX REAL-TIME STREAM (M1)" regardless of actual connected symbol.

**Goal:** Display the actual `activeSymbol` from backend state everywhere.

**Current Hardcoded Locations:**
- Line 998: `<span>STEP INDEX</span>` in header badge
- Line 2061: `LIVE STEP INDEX REAL-TIME STREAM (M1)` in graph title
- Line 2974: `Step Index (Synthetic M1)` in footer/status

**Changes Needed:**
1. Frontend receives `activeSymbol` from `/api/status` response
2. Replace hardcoded strings with `activeSymbol` or `connection.symbolDescription`
3. Show symbol name in header, graph title, and status areas
4. Fallback to "No Symbol" when EA is disconnected

**Backend Status:** ✅ Already implemented — `activeSymbol` and `symbolStates[]` are in the status payload.

---

### 3. Multi-Symbol UI

**Problem:** Backend supports multiple symbols via `symbolStates` Map, but frontend has no symbol switcher or per-symbol panels.

**Goal:** Allow users to view and switch between multiple connected symbols.

**Changes Needed:**
1. Add symbol switcher dropdown in header showing all active symbols from `symbolStates[]`
2. Display per-symbol stats: price, tick count, connection status
3. Allow switching active symbol to view its chart, trades, and telemetry
4. Update chart title and data when switching symbols
5. Show connection status per symbol in status bar

**Backend Status:** ✅ Already implemented — `symbolStates[]` summary is in the status payload.

---

### 4. Extended Tick History

**Problem:** DB cleanup deletes ticks older than 7 days. No mechanism to request or preserve longer historical periods.

**Goal:** Allow users to store and retrieve extended tick history for analysis.

**Changes Needed:**
1. Add `GET /api/market/history` endpoint with query params:
   - `symbol` — symbol name
   - `from` — start timestamp
   - `to` — end timestamp
   - `interval` — aggregation interval (1m, 5m, 15m, 1h)
2. Add frontend history panel with date range picker
3. Allow exporting history as CSV
4. Add retention policy settings (7d, 30d, 90d, forever)
5. Show tick count and DB stats in settings

**Backend Status:** ⏳ Partial — `getTicksSince()` exists in repository, but no route or frontend UI.

---

### 5. Broader Data Capture

**Problem:** Current EA payload only captures basic tick/telemetry. Missing data that MT5 can provide.

**Goal:** Expand what the EA exposes to the server for richer analysis.

**Current EA Payload:**
- price, velocity, buyLocked, sellLocked, broker, account, balance, digits, tickSize, description

**Missing Data to Capture:**
- spread (current spread in points)
- session (Asia/London/New York)
- symbol registry (list of all available symbols from broker)
- indicator values (EMA, RSI, ATR from EA)
- order book depth (if available)
- trade history from MT5 directly (not just simulated)
- margin/leverage info
- swap rates
- profit calculation mode (forex, CFD, futures)

**Changes Needed:**
1. Update EA MQL5 code to include additional fields in WebRequest payload
2. Update backend `updateMarket()` to accept and store new fields
3. Add `market_telemetry` table for time-series indicator data
4. Expose new fields in `/api/status` and WebSocket broadcasts
5. Update frontend to display new data

---

### 6. Legacy JSON Cleanup

**Problem:** Old JSON files still exist alongside SQLite, causing confusion and potential data divergence.

**Files to Clean Up:**
- `backend/data/ai_knowledge_profile.json` — migrated to `ai_knowledge` table
- `backend/data/ai_synthesized_strategy.json` — migrated to `ai_strategy` table

**Cleanup Plan:**
1. After 2 weeks of stable SQLite operation, archive JSON files to `backend/data/backups/`
2. Update `migrate.ts` to skip migration if JSON files are missing
3. Remove JSON read/write from `backend/src/index.ts`
4. Update documentation to reference SQLite only

**Status:** ⏳ Not started — SQLite is operational but JSON files remain.

---

### 7. Design Tokens & Styling System

**Problem:** Styling is entirely inline Tailwind utilities in a 2981-line file. No centralized design tokens.

**Goal:** Introduce token-driven design system with proper global styling.

**Implementation Plan:**
1. Create `frontend/src/tokens/` with `colors.ts`, `spacing.ts`, `typography.ts`, `shadows.ts`
2. Rewrite `frontend/src/styles/globals.css` with `@theme` tokens and `@layer base`
3. Create `frontend/src/styles/components.css` with shared component classes
4. Update `frontend/src/styles/index.css` to import globals + components
5. Gradually migrate `App.tsx` to use semantic classes
6. Add `globals.d.ts` for TypeScript CSS module support

**Status:** ⏳ Not started — only base font families are centralized.

---

## Priority Order

| Priority | Improvement | Effort | Impact | Status |
|----------|-------------|--------|--------|--------|
| P0 | Backend validation, MCP cleanup, secrets hygiene | Medium | High | ✅ Done |
| P0 | Frontend component split | High | High | ⏳ In progress |
| P0 | Dynamic symbol display | Low | High | ⏳ In progress |
| P1 | Multi-symbol UI | Medium | High | ⏳ In progress |
| P1 | Design tokens & styling | Medium | Medium | ✅ Done |
| P2 | Extended tick history | Medium | Medium | Pending |
| P2 | Broader data capture | High | Medium | Pending |
| P3 | Legacy JSON cleanup | Low | Low | Pending |

## What's Left

### High priority
1. **Backend god-file refactor** — `backend/src/index.ts` still mixes state, indicators, strategy, trade execution, and route wiring. Extract at least:
   - market ingestion / symbol state management
   - trade execution / strategy evaluation
   - state persistence / DB hydration
2. **Frontend god-component refactor** — `frontend/src/App.tsx` still manages 25+ state variables and embeds bridge-download generation. Extract:
   - `useDownloadBridge.ts`
   - `useTradingControls.ts`
   - shared `AppStateContext` if needed
3. **CORS restriction** — switch from `*` to configured frontend origin
4. **Auth on state-changing routes** — protect `/api/settings`, `/api/toggle-trade`, `/api/reset-stats`, `/api/status/switch-symbol`, etc.
5. **`process.env.PORT` override fix** — currently forced to `"3000"`, breaking non-default deployments

### Medium priority
6. **Type safety sweep** — replace remaining `any` types in backend `McpContext`, `AiSynthesizedStrategy.rules`, frontend component props, and status/websocket payloads
7. **Silent error handling** — convert empty `catch {}` and swallowed network failures into logged/visible errors
8. **Client IP handling** — stop hardcoding `127.0.0.1` for EA connections; use real socket/EA-reported IP when available
9. **`Math.random()` trade IDs** — migrate to `crypto.randomUUID()` or ULIDs
10. **URL validation in EA generator** — sanitize `appUrl` before injecting into MQL5
11. **Generated bridge hardening** — prefer `execFile` with array args over `exec()` with shell strings

### Lower priority
12. **Global mutable state** — wrap module-level state into a testable store/class
13. **Hardcoded ticket seed** — derive next ticket from DB max on startup
14. **Frontend fetch error UX** — show stale-data warnings instead of silently failing
15. **Rate limiting / schema validation middleware** for public routes
16. **Extended history UI** — date-range picker, CSV export, retention policy controls
17. **Broader EA telemetry** — spread, session, indicator values, order book, margin/leverage, swap rates

## Non-Goals

- Do not implement CSS modules or styled-components
- Do not add runtime theming engine yet
- Do not migrate every single utility class to semantic classes
- Do not add remote MCP server until needed
