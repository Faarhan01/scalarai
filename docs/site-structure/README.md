# Site Structure

Canonical documentation of the actual file layout for backend and frontend.

These files are the **source of truth** for where code lives. If you are refactoring, adding features, or fixing bugs, consult these files first rather than inferring structure from older plan documents.

## Files

### Backend

| File | Purpose |
|------|---------|
| `backend/index.md` | Source of truth for `backend/src/` layout, bootstrap, AppStore, auth, data flow, dependency graph |
| `backend/routes.md` | All Express routes, endpoints, request/response shapes, auth requirements |
| `backend/websockets.md` | WebSocket servers (`/mt5-bridge`, `/ws/live`), protocols, message types |
| `backend/services.md` | Service layer details: AppStore, trade execution, strategy, market ingestion, knowledge, EA generator |
| `backend/middleware.md` | Middleware: auth, CORS, error handling, logging, rate limiting |
| `backend/utils.md` | Utilities: auth helpers, IP normalization, time functions, validators, response helpers |
| `backend/db.md` | SQLite layer: schema, migrations, repository, data retention, legacy JSON migration |
| `backend/mcp.md` | MCP JSON-RPC 2.0 server, all 25+ tools, McpContext interface |
| `backend/types.md` | Key TypeScript interfaces: TradeConfig, TradeRecord, Tick, FullStatusPayload, McpContext, etc. |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/index.md` | Source of truth for `frontend/src/` layout, App.tsx, state management, config, patterns |
| `frontend/hooks.md` | All custom hooks: useWebSocket, useSettings, useTradingControls, useChartData, etc. |
| `frontend/components.md` | Component architecture, barrel exports, component catalog |
| `frontend/services.md` | ApiClient and WebSocketClient classes |
| `frontend/tokens.md` | Design tokens: colors, spacing, typography, shadows |
| `frontend/styles.md` | CSS architecture: Tailwind config, component.css utility classes |
| `frontend/lib.md` | MQL5 EA generator: validateAppUrl, generateMql5Code |
| `frontend/types.md` | TypeScript interfaces: StatusResponse, AiStudyFeedResponse, ChartData, hook state types |

## Why This Exists

Previous refactors got confused because plan files (`knowledgebase/plans/backend/stage-*.md`) described target architectures that diverged from the actual committed code. When the AI saw plan files mentioning files like `backend/src/services/app-state.ts`, it tried to work with that shape even though the codebase had already moved to an `AppStore` class and deleted that intermediate file.

**Rule:** When in doubt, read `site-structure/` first, then read the actual file.

## How Things Work

### Backend (Express + WebSocket + SQLite)

1. **Bootstrap** — `backend/src/index.ts` creates an Express app, instantiates `AppStore`, loads state from SQLite, registers all routes and WebSocket servers.
2. **State Container** — `AppStore` (`services/app-store.ts`) holds ALL application state and mutation logic. Routes and WebSocket handlers receive store methods as callbacks.
3. **WebSocket Servers**:
   - `/mt5-bridge` — MT5 EA connects here to receive pending orders/commands
   - `/ws/live`, `/ws`, `/live-feed` — Dashboard/frontend connects here for real-time updates
4. **Data Flow**:
   - EA sends ticks via `POST /api/ea/tick` → `store.updateMarket()` → updates symbol state, AI knowledge, triggers strategy evaluation, broadcasts dashboards
   - Frontend receives updates via WebSocket and re-renders
   - Settings changes via `POST /api/settings` → persisted to SQLite + broadcast
5. **Background Workers**:
   - Analysis worker every 5 min: processes unprocessed telemetry, updates AI knowledge base
   - DB cleanup every 1 hour: deletes ticks older than 7 days, logs older than 30 days
6. **MCP Server** — `POST /mcp` accepts JSON-RPC 2.0 requests for AI/trading tools. Always requires Bearer auth.
7. **Auth**:
   - Regular routes: optional Bearer auth via `SCALARAI_MCP_API_KEY` env var
   - MCP route: always requires Bearer auth
   - Development without `SCALARAI_MCP_API_KEY`: all protected routes are open
8. **Persistence**:
   - SQLite via `better-sqlite3`
   - Singleton `scalarAiDb` from `db/index.ts`
   - Schema in `db/schema.sql`
   - Migrations + legacy JSON data migration in `db/migrate.ts`

### Frontend (React + Tailwind + Vite)

1. **Entry** — `main.tsx` mounts `App.tsx`
2. **Root Component** — `App.tsx` holds all state, orchestrates hooks and components. Not fully decomposed.
3. **State Management** — No global state library. Uses `useState` + custom hooks. Master state in `App.tsx`.
4. **Real-time Sync** — `useWebSocket.ts` connects to `/ws/live`, handles reconnection, ping/pong, dispatches messages by type.
5. **API Communication** — `services/api.ts` (`ApiClient`) for REST, `services/ws.ts` (`WebSocketClient`) for WebSocket.
6. **Chart Rendering** — `useChartData` transforms ticks/candles. `CandlestickChart` renders via lightweight-charts.
7. **AI Calibration Gate** — Automated trading blocked until `aiKnowledgeBase.totalObservations >= 20`.
8. **Design System** — Tailwind CSS with custom tokens in `tokens/` (colors, spacing, typography, shadows).
