# Frontend Plan — Stage 2: Extended History UI

## Objective

Add frontend history panel with date range picker, CSV export, and retention policy controls.

## Current State

Backend `GET /api/market/history` exists but no frontend panel uses it.

## Implementation Steps

1. Create `frontend/src/components/settings/HistoryPanel.tsx`
2. Add date range picker and CSV export button
3. Add retention policy selector (7d/30d/90d/forever)
4. Wire to `GET /api/market/history` endpoint
5. Add retention policy settings routes if missing

## Verification

- `npx tsc --noEmit` passes
- `cd frontend; npx vite build` succeeds
- History panel loads data from backend
- CSV export downloads correctly
- Retention policy changes persist
