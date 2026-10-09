# Frontend Plan — Stage 2: Extended History UI

## Status: ❌ NOT DONE

## Objective

Add frontend history panel with date range picker, CSV export, and retention policy controls.

## Current State

Backend `GET /api/market/history` exists but no frontend panel uses it.

## What Exists

- Backend `GET /api/market/history` endpoint exists (max 5000 ticks)
- Backend `GET/POST /api/settings/db-retention` endpoints exist
- Frontend `useChartData` hook exists but no history panel
- Backend cleanup runs every 1 hour (ticks deleted after 7 days, logs after 30 days)

## What Is Missing

- `frontend/src/components/settings/HistoryPanel.tsx` — does not exist
- Date range picker UI — not implemented
- CSV export functionality — not implemented
- Retention policy selector — not implemented in frontend
- Frontend wiring to history endpoint — not implemented

## Critical Fragility Warnings

### DATA RETENTION IS TIME-LIMITED

1. **Ticks are deleted after 7 days**: The backend `cleanupOldData()` runs every hour and deletes `market_ticks` older than 7 days. If the user tries to export history older than 7 days, the data is already gone.

2. **Logs are deleted after 30 days**: Same cleanup also deletes `system_logs` older than 30 days.

3. **History endpoint has limits**: `GET /api/market/history` accepts `limit` query param with max 5000. Requesting more returns an error.

### FRONTEND DEPENDENCIES

4. **Chart data flow depends on WebSocket**: The live chart gets data from WebSocket `tick` messages, not from the history endpoint. The history panel would be a separate read-only view.

5. **`useChartData` is coupled to candle/tick shapes**: Any history panel that displays charts must use the same `{time, open, high, low, close}` shape for candles or `{time, price, open, high, low, close}` for ticks.

## Implementation Steps

1. Create `frontend/src/components/settings/HistoryPanel.tsx`
2. Add date range picker and CSV export button
3. Add retention policy selector (7d/30d/90d/forever)
4. Wire to `GET /api/market/history` endpoint
5. Add retention policy settings UI

## Verification

- `npx tsc --noEmit` passes
- `cd frontend; npx vite build` succeeds
- History panel loads data from backend
- CSV export downloads correctly
- Retention policy changes persist
