# Frontend Plan — Stage 1: God-Component Refactor

## Objective

Extract remaining layout orchestration and state aggregation from `frontend/src/App.tsx`.

## Current State

`frontend/src/App.tsx` is 597 lines and still manages:
- 25+ state variables
- WebSocket wiring
- RAF throttling for chart updates
- Elapsed timer
- State aggregation from multiple hooks

## Target Structure

```
frontend/src/
├── components/
│   └── layout/
│       └── AppShell.tsx       # ErrorBoundary + root layout orchestration
├── hooks/
│   ├── useElapsedTimer.ts     # session elapsed counter
│   └── useAppState.ts         # aggregate status/WS state into a single context
```

## Implementation Steps

1. Create `hooks/useElapsedTimer.ts` and extract elapsed counter
2. Create `hooks/useAppState.ts` and aggregate status/WS state
3. Create `components/layout/AppShell.tsx` with ErrorBoundary + layout
4. Verify app compiles and all features work after each extraction

## Verification

- `npx tsc --noEmit` passes
- `cd frontend; npx vite build` succeeds
- All tabs render correctly
- WebSocket updates still flow to components
- Elapsed timer updates every second
