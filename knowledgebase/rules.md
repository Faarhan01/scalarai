# ScalarAI Knowledgebase — Editing Rules

These rules are mandatory when making changes to the ScalarAI codebase. Violating them can break the MT5 EA integration, the dashboard, the MCP interface, or data integrity.

## Rule 1: Understand Before Changing

Never make a change without first understanding how the affected code works end-to-end.

- Routes are not independent. Changing a route signature in `backend/src/routes/` requires updating the corresponding registration call in `backend/src/index.ts`.
- WebSocket message types are contracts between backend and frontend. Adding or renaming a message type requires updating both `backend/src/websockets/dashboard.ts` and `frontend/src/hooks/useWebSocket.ts`.
- The MT5 EA is a separate process that consumes HTTP responses and WebSocket messages. Changing the shape of `POST /api/ea/tick` responses or `/mt5-bridge` messages without updating the EA generator will break live trading.

## Rule 2: The EA Bridge Protocol Is Fragile

The MT5 Expert Advisor communicates with the backend via two channels:

1. **HTTP:** `POST /api/ea/tick` every 3 seconds (configurable via `InpSyncIntervalSec`). The EA sends tick data, account info, and lock flags. The response contains `pendingAction`, `pendingLot`, `pendingSL`, `pendingTP`.
2. **WebSocket:** `WS /mt5-bridge` for receiving trade commands from the backend. The backend sends `{ action, symbol, volume, sl, tp, ticket }` objects.

**Do NOT:**
- Rename `pendingAction`, `pendingLot`, `pendingSL`, `pendingTP` in the `/api/ea/tick` response without regenerating the EA.
- Change the WebSocket `/mt5-bridge` message format without updating `backend/src/services/ea-generator.ts` and `frontend/src/lib/mql5_generator.ts`.
- Remove or alter the ping/keepalive on `/mt5-bridge` without considering MT5 WebRequest timeout behavior.

## Rule 3: MCP Interface Changes Must Be Documented

The MCP server (`POST /mcp`) is consumed by external tools such as Kilo. It uses JSON-RPC 2.0 and exposes 25+ tools.

- Adding or removing a tool requires updating `backend/src/mcp_server.ts` and `knowledgebase/site-structure/backend/mcp.md`.
- Changing a tool's input schema or return shape is a breaking change for any client that calls it.
- The `McpContext` interface is built from `store.buildMcpContext()`. If you add a new store method that MCP tools need, add it to `McpContext` in `backend/src/types/index.ts` and wire it in `backend/src/index.ts`.

## Rule 4: State Lives in `AppStore`

`backend/src/services/app-store.ts` is the single source of truth for all application state. Do not create new state containers, global stores, or duplicate state in routes or WebSocket handlers.

- If a route needs new state, add it to `AppStore` and pass a getter/method to the route registration call in `index.ts`.
- If you need to persist new data, add it to the SQLite schema in `backend/src/db/schema.sql`, add queries in `backend/src/db/repository.ts`, and wire it in `backend/src/services/state-persistence.ts`.
- Do not store state in module-level variables outside `AppStore`.

## Rule 5: Database Changes Require Migration

The SQLite database uses WAL mode with foreign keys enabled. Schema changes go through `backend/src/db/migrate.ts`.

- New tables or columns must be added via ALTER TABLE in `migrate.ts`, not by editing `schema.sql` alone.
- `schema.sql` is the canonical CREATE TABLE reference. `migrate.ts` applies incremental changes on startup.
- Do not delete or rename columns without a data migration path. Existing `scalarai.sqlite` files in production will break otherwise.
- Data retention (ticks deleted after 7 days, logs after 30 days) is enforced by `scalarAiDb.cleanupOldData()` called every hour. Do not alter retention logic without updating `knowledgebase/site-structure/backend/db.md`.

## Rule 6: Frontend State Is Hook-Based

The frontend has no global state library. State is managed through React hooks in `frontend/src/hooks/` and lifted to `App.tsx`.

- Do not introduce Redux, Zustand, Jotai, or any external global state library.
- New shared state belongs in a custom hook or in `App.tsx` props.
- WebSocket message dispatch is handled by `useWebSocket.ts`. If you add a new message type from the backend, add a new callback option to the hook and wire it in `App.tsx`.

## Rule 7: Path Aliases Are Strict

The frontend uses these path aliases configured in both `tsconfig.json` and `vite.config.ts`:

| Alias | Resolves To |
|-------|-------------|
| `@/*` | `frontend/src/*` |
| `frontend/*` | `frontend/src/*` |
| `@tokens/*` | `frontend/src/tokens/*` |
| `@styles/*` | `frontend/src/styles/*` |

- Do not import using relative paths that bypass these aliases (e.g., `../../../../tokens/colors`).
- Do not add new aliases without updating both config files.

## Rule 8: Auth Behavior Is Intentional

`SCALARAI_MCP_API_KEY` controls optional Bearer auth on most routes. The MCP route always requires Bearer auth.

- In development without `SCALARAI_MCP_API_KEY`, all non-MCP routes are open. This is intentional for local development.
- Do not change `middleware/auth.ts` to require auth by default without updating all route registrations in `index.ts`.
- The EA generator and bridge do not use Bearer auth. They rely on the `/api/ea/tick` endpoint being accessible.

## Rule 9: AI Calibration Gate Is a Safety Mechanism

Automated trading is blocked until `aiKnowledgeBase.totalObservations >= 20`. This is enforced in two places:

- Backend: `backend/src/index.ts` returns `"calibrating"` or `"optimized"` status based on observation count.
- Frontend: `App.tsx` blocks trade execution until the AI status is `"optimized"` or `"active"`.

- Do not remove or bypass this gate without understanding the risk of trading on uncalibrated signals.
- If you change the threshold, update both backend and frontend documentation in `site-structure/`.

## Rule 10: Do Not Delete Files Without Checking Dependencies

Before deleting any file:

- Grep for imports of that file across the codebase.
- Check `site-structure/` for references to the file.
- Check `knowledgebase/plans/` for references to the file.
- Verify no build step, test, or external process depends on the file path.

Known files that must NOT be deleted:
- `backend/src/services/app-store.ts` — state container
- `backend/src/utils/response.ts` — NOT empty, contains `ApiResponse<T>`, `jsonSuccess()`, `jsonError()`
- `backend/src/utils/time.ts` — date/time utilities
- `frontend/src/types/api.ts` — NOT empty, contains API response interfaces
- `frontend/src/components/index.ts` — barrel export, must stay in sync with component folder
