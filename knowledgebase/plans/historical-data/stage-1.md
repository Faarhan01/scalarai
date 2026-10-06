# Historical Data Plan — Stage 1: Time Utility & Candle Timestamps

## Objective

Centralize all timestamp handling and ensure candles use proper MT5-aligned timestamps.

## Completed

- Created `backend/src/utils/time.ts` with centralized timestamp helpers
- Functions available: `toIso8601`, `toEpochMs`, `fromEpochMs`, `formatTime`, `formatDateTime`, `getMinuteBucket`, `getHourBucket`, `isSameMinute`, `timeAgo`, `nowEpochMs`, `nowIso8601`

## Critical Fragility Warnings

### TIMESTAMP HANDLING

1. **Candles must use minute-aligned timestamps**: The `aggregateTickIntoCandle()` function in `market-ingestion.ts` creates 1-minute OHLC candles. The timestamp must align to minute boundaries (using `getMinuteBucket()`). Misaligned timestamps cause chart display issues.

2. **Frontend chart expects epoch seconds**: `lightweight-charts` expects `time` as epoch seconds (UTC). The frontend `useChartData` hook and `CandlestickChart` component expect this format.

3. **`formatTime()` is for display only**: This function returns `HH:MM` format for UI display. Do NOT use it for data storage or chart time axes.

4. **Timezone consistency**: All timestamps are stored as epoch milliseconds in the database and sent as epoch milliseconds to the frontend. The frontend converts to local time for display. Changing this convention breaks the chart.

## Next Steps

1. Replace scattered `Date.now()` calls in `backend/src/services/market-ingestion.ts` with `nowEpochMs()`
2. Replace scattered `new Date()` calls with `fromEpochMs()` / `formatDateTime()`
3. Update `aggregateTickIntoCandle()` to use `getMinuteBucket()` for minute alignment
4. Update `CandlestickChart.tsx` time axis to use `formatTime()` for labels

## Verification

- `npx tsc --noEmit` passes
- Candle timestamps align to minute boundaries
- Time axis labels show correct HH:MM format
