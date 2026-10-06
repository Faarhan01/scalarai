# Frontend Plan — Stage 1: God-Component Refactor

## Objective

Extract remaining layout orchestration and state aggregation from `frontend/src/App.tsx`.

## Current State

`frontend/src/App.tsx` is 631 lines (down from 692) and still manages:
- 25+ state variables
- WebSocket wiring
- RAF throttling for chart updates
- State aggregation from multiple hooks

## Completed Work

### 1. ErrorBoundary extracted to AppShell

**New file:** `frontend/src/components/layout/AppShell.tsx`
- Moved `ErrorBoundary` class from `App.tsx` lines 49–98
- Exported `AppShell` wrapper component

**Updated:** `frontend/src/components/index.ts`
- Added `AppShell` to barrel exports

**Updated:** `frontend/src/main.tsx`
- Now uses `<AppShell>` wrapper instead of inline `<ErrorBoundary>`

**Impact:** `App.tsx` reduced by ~50 lines; error boundary is now reusable.

### 2. Elapsed timer extracted to hook

**New file:** `frontend/src/hooks/useElapsedTimer.ts`
- Encapsulates session elapsed counter logic
- Exposes `{ elapsedTime, resetTimer }`

**Updated:** `frontend/src/App.tsx`
- Removed inline `elapsedTime` state, `startTimeRef`, and `useEffect`
- Now uses `const { elapsedTime } = useElapsedTimer()`

**Impact:** `App.tsx` reduced by ~15 lines; timer logic is now testable and reusable.

## Remaining Work

- **WebSocket callback aggregation** — `App.tsx` still defines inline `onInit`, `onTick`, `onTrades`, etc. callbacks (lines 252–318). Should be extracted to `useAppState.ts`.
- **State variable consolidation** — 25+ individual `useState` calls could be grouped into a reducer or context.
- **RAF throttling** — `scheduleChartUpdate` and related refs are still inline (lines 129–155).

## Verification

- `npx tsc --noEmit` passes
- `cd frontend; npx vite build` succeeds (302 KB JS, 52 KB CSS)
- Dev server running on `http://127.0.0.1:3000`
- Error boundary still catches React errors
- Elapsed timer updates every second
