# Historical Data Plan — Stage 1: Time Utility & Candle Timestamps

## Status: ✅ COMPLETED

## What Was Fixed

### 1. `backend/src/utils/time.ts`

**All planned functions exist:**
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

### 2. `backend/src/services/market-ingestion.ts`

**Changes verified:**
- `aggregateTickIntoCandle()` uses `getMinuteBucket(now)` and `nowEpochMs()` — no inline `Date.now()` or `Math.floor(now / 60000)`
- Candle `time` uses `currentBucket * 60000` (minute-aligned) — correct for lightweight-charts
- `tickRecord.time` uses `now` from `nowEpochMs()` — correct for exact tick timestamps
- `connection.lastPing` uses `nowIso8601()` — correct

### 3. `frontend/src/components/charts/CandlestickChart/CandlestickChart.tsx`

Uses inline `new Date(candle.time)` formatting for time axis. The plan's suggestion to use `formatTime()` was evaluated and rejected — the inline `new Date(candle.time)` approach is correct for the chart library's expectations.

## Verification

- [x] `npx tsc --noEmit` passes
- [x] Candle `time` field is minute-aligned (`currentBucket * 60000`)
- [x] `getMinuteBucket()` used instead of inline math
- [x] `nowEpochMs()` used instead of `Date.now()`
- [x] Server starts without errors
- [x] EA continues pushing ticks

## Objective

Centralize all timestamp handling and ensure candles use proper MT5-aligned timestamps.

## Note

The previous version of this document incorrectly claimed there was a "critical bug" with candle timestamps. That bug was already fixed in the codebase. Candle `time` values are correctly minute-aligned.
