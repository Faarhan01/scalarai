# Historical Data Plan — Stage 1: Time Utility & Candle Timestamps

## Objective

Centralize all timestamp handling and ensure candles use proper MT5-aligned timestamps.

## Completed

- Created `backend/src/utils/time.ts` with centralized timestamp helpers
- Functions available: `toIso8601`, `toEpochMs`, `fromEpochMs`, `formatTime`, `formatDateTime`, `getMinuteBucket`, `getHourBucket`, `isSameMinute`, `timeAgo`, `nowEpochMs`, `nowIso8601`

## Next Steps

1. Replace scattered `Date.now()` calls in `backend/src/services/market-ingestion.ts` with `nowEpochMs()`
2. Replace scattered `new Date()` calls with `fromEpochMs()` / `formatDateTime()`
3. Update `aggregateTickIntoCandle()` to use `getMinuteBucket()` for minute alignment
4. Update `CandlestickChart.tsx` time axis to use `formatTime()` for labels

## Verification

- `npx tsc --noEmit` passes
- Candle timestamps align to minute boundaries
- Time axis labels show correct HH:MM format
