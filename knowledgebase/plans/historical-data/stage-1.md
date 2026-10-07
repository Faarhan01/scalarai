# Historical Data Plan — Stage 1: Time Utility & Candle Timestamps

## Status: ⚠️ PARTIALLY IMPLEMENTED — Integration incomplete

## Objective

Centralize all timestamp handling and ensure candles use proper MT5-aligned timestamps.

## What Was Built

### ✅ Completed

**`backend/src/utils/time.ts`** — All planned functions exist:
- `toIso8601(date: Date): string`
- `toEpochMs(date: Date): number`
- `fromEpochMs(epochMs: number): Date`
- `formatTime(epochMs: number): string` — returns `HH:MM` for UI display
- `formatDateTime(epochMs: number): string`
- `getMinuteBucket(epochMs: number): number` — returns `Math.floor(epochMs / 60000)`
- `getHourBucket(epochMs: number): number`
- `isSameMinute(a, b: number): boolean`
- `timeAgo(epochMs: number): string`
- `nowEpochMs(): number`
- `nowIso8601(): string`

## What's Missing / Bugs

### ❌ Critical Bug: Candle `time` field is NOT minute-aligned

**File:** `backend/src/services/market-ingestion.ts:66, 94`

When a new candle is created, its `time` is set to `Date.now()` (exact tick arrival time), not the start of the minute bucket. The plan explicitly states: "The timestamp must align to minute boundaries (using `getMinuteBucket()`)."

**Impact:** Frontend chart displays candles at incorrect x-positions. Lightweight-charts expects minute-aligned timestamps for proper rendering.

**Fix required:**
```typescript
// Current (wrong):
time: now,

// Should be:
time: currentBucket * 60000, // minute-aligned epoch ms
```

### ❌ `aggregateTickIntoCandle()` uses inline math instead of utility

**File:** `backend/src/services/market-ingestion.ts:61`

Uses `Math.floor(now / 60000)` directly instead of importing `getMinuteBucket()`. This defeats the purpose of centralization.

**Impact:** Low — functionally equivalent, but violates the plan's explicit instruction and creates maintenance burden.

### ❌ `Date.now()` scattered throughout `market-ingestion.ts`

**File:** `backend/src/services/market-ingestion.ts:60, 149, 184, 204`

Multiple direct `Date.now()` calls instead of using `nowEpochMs()`. Plan next-step #1 explicitly says to replace these.

### ❌ `CandlestickChart.tsx` doesn't use `formatTime()`

**File:** `frontend/src/components/charts/CandlestickChart/CandlestickChart.tsx:72-73`

Uses inline `new Date(candle.time)` formatting instead of importing `formatTime()` from utils.

## Implementation Steps to Complete

1. Replace `Date.now()` with `nowEpochMs()` in `market-ingestion.ts`
2. Replace inline `Math.floor(now / 60000)` with `getMinuteBucket(now)`
3. Fix new candle `time` to use `currentBucket * 60000` for minute alignment
4. Update `CandlestickChart.tsx` to import and use `formatTime()` for time axis labels
5. Verify chart renders candles at correct positions

## Critical Fragility Warnings

### TIMESTAMP HANDLING

1. **Candles must use minute-aligned timestamps**: The `time` field must be `currentBucket * 60000`, not `Date.now()`. Misaligned timestamps cause chart display issues.
2. **Frontend chart expects epoch seconds**: `lightweight-charts` expects `time` as epoch seconds (UTC). The frontend `useChartData` hook and `CandlestickChart` component expect this format.
3. **`formatTime()` is for display only**: Returns `HH:MM` format for UI display. Do NOT use it for data storage or chart time axes.
4. **Timezone consistency**: All timestamps are stored as epoch milliseconds in the database and sent as epoch milliseconds to the frontend. The frontend converts to local time for display.

## Verification

- [x] `npx tsc --noEmit` passes
- [ ] Candle timestamps align to minute boundaries
- [ ] Time axis labels show correct HH:MM format
- [ ] Chart renders candles at correct x-positions
