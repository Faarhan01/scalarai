# Frontend Plan — Stage 1: God-Component Refactor

> **Canonical structure:** See `knowledgebase/site-structure/frontend/index.md` for the actual committed file layout before editing anything.

## Objective

Extract remaining layout orchestration and state aggregation from `frontend/src/App.tsx`.

## Current State

`frontend/src/App.tsx` is 631 lines (down from 692) and still manages:
- 25+ state variables
- WebSocket wiring
- RAF throttling for chart updates
- State aggregation from multiple hooks

## Completed Work

### 1. ErrorBoundary extracted to AppShell ✅

**New file:** `frontend/src/components/layout/AppShell.tsx`
- Moved `ErrorBoundary` class from `App.tsx` to `AppShell.tsx`
- Exported `AppShell` wrapper component

**Updated:** `frontend/src/components/index.ts`
- Added `AppShell` to barrel exports

**Updated:** `frontend/src/main.tsx`
- Now uses `<AppShell>` wrapper instead of inline `<ErrorBoundary>`

**Impact:** Error boundary is now reusable and separated from root component.

### 2. Elapsed timer extracted to hook ✅

**New file:** `frontend/src/hooks/useElapsedTimer.ts`
- Encapsulates session elapsed counter logic
- Exposes `{ elapsedTime, resetTimer }`

**Updated:** `frontend/src/App.tsx`
- Uses `const { elapsedTime } = useElapsedTimer()`

**Impact:** Timer logic is now testable and reusable.

## Remaining Work

- **WebSocket callback aggregation** ❌ — `App.tsx` still defines inline `onInit`, `onTick`, `onTrades`, etc. callbacks. Should be extracted to `useAppState.ts` or similar.
- **State variable consolidation** ❌ — 25+ individual `useState` calls could be grouped into a reducer or context.
- **RAF throttling extraction** ❌ — `scheduleChartUpdate` and related refs are still inline in `App.tsx`.

## Critical Fragility Warnings

### WEBSOCKET MESSAGE CONTRACTS ARE FRAGILE

1. **Message types are contracts with the backend**: The frontend `useWebSocket.ts` expects these exact message types from the backend:
   - `init` with `payload` (full `FullStatusPayload`)
   - `tick` with `currentPrice`, `tick`, `candles`, `stats`, `connection`, `symbolStates`
   - `trades` with `trades`, `stats`
   - `log` with `log`
   - `config` with `config`
   - `connection` with `isBridgeConnected`
   - `webrequest_test` with `testState`
   - `ai_strategy` with `aiSynthesizedStrategy`
   - `pong` with `clientTime`, `serverTime`
   
   **DO NOT rename, remove, or change the shape of any of these message types** without updating both `backend/src/services/app-store.ts` (sender) and `frontend/src/hooks/useWebSocket.ts` + `frontend/src/App.tsx` (receivers).

2. **`init` message must contain full `FullStatusPayload`**: When the dashboard WebSocket connects, the backend sends `{type: "init", payload: <FullStatusPayload>}`. The frontend `onInit` handler expects ALL fields: `config`, `connection`, `isBridgeConnected`, `logs`, `trades`, `history`, `candles`, `status`, `currentPrice`, `activeSymbol`, `symbolStates`, `aiSynthesizedStrategy`, `lastStrategySignal`, `stats`, `webRequestStatus`. Missing any field causes undefined errors in the UI.

3. **`tick` message shape is critical for the chart**: The chart depends on receiving:
   - `msg.currentPrice` — updates price display
   - `msg.tick` — appends to history array (must have `time`, `price`, `open`, `high`, `low`, `close`)
   - `msg.candles` — replaces candle array (must have `time`, `open`, `high`, `low`, `close`)
   - `msg.connection` — updates connection status
   - `msg.stats` — updates trade stats
   
   If you stop sending `candles` or `history`, the chart will break.

### FRONTEND STATE IS COUPLED TO BACKEND CONTRACTS

4. **`App.tsx` state variable names are coupled to backend payloads**: The `onInit` and `onTick` handlers destructure specific fields from WebSocket messages. If you rename a field in the backend payload, you must update the corresponding `setX()` call in `App.tsx`.

5. **`useChartData` expects specific shapes**: This hook expects `candles` as `{time, open, high, low, close}[]` or `history` as `Tick[]`. If you change the shape of data sent from backend, update `useChartData` accordingly.

6. **`useSettings` depends on `TradeConfig` shape**: The settings form expects specific fields: `lotSize`, `takeProfitPoints`, `stopLossPoints`, `trailingStopPoints`, `maxTrades`, `useTrailingStop`, `tradingMode`, `selectedAssets`, `isAiModeEnabled`. Renaming any breaks the settings UI.

### AUTHENTICATION IMPACT ON FRONTEND

7. **Frontend depends on optional auth**: When `SCALARAI_MCP_API_KEY` is set, the frontend MUST send Bearer tokens for state-changing requests. Currently the frontend does NOT send auth headers. If you enable auth on routes the frontend uses, the site will break unless you also update `services/api.ts` to include auth.

8. **WebSocket has no auth**: The dashboard WebSocket (`/ws/live`) has no authentication. Any client can connect and receive full server state. Do NOT add auth to WebSocket without updating the frontend connection logic.

### WHAT HAPPENS WHEN THINGS BREAK

- **Graph/chart breaks**: If WebSocket `tick` messages stop containing `candles` or `history`, `useChartData` receives empty arrays and the chart shows nothing. The `requestAnimationFrame` throttling in `App.tsx` will also stop firing chart updates.
- **Site stops receiving EA updates**: If EA routes get auth, the EA can't send ticks → no `updateMarket()` calls → no broadcasts → dashboard freezes.
- **Settings stop working**: If auth is added to `/api/settings` without updating frontend, settings changes silently fail.
- **Reconnection storms**: If the backend is down, the frontend reconnects every 2500ms. This is by design but can look like a broken site.

## Verification

- `npx tsc --noEmit` passes
- `cd frontend; npx vite build` succeeds
- Dev server running on `http://127.0.0.1:3000`
- Error boundary still catches React errors
- Elapsed timer updates every second
