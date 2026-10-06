# Backend Utils

> Detailed reference for utility modules in `backend/src/utils/`.

## `auth.ts`

```ts
export function validateBearerToken(authHeader: string | undefined, expectedApiKey: string): boolean {
  if (!authHeader) return false;
  return authHeader.startsWith(`Bearer ${expectedApiKey}`);
}
```

Simple Bearer token validation helper.

## `index.ts`

```ts
export { isValidStrategyMode, isValidTradingMode, isValidTradeType } from "./validators";
```

Re-exports validators for convenient importing.

## `ip.ts`

```ts
export function normalizeIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  return raw.replace(/^::ffff:/, "");
}
```

Strips `::ffff:` prefix from IPv6-mapped IPv4 addresses. Used in `app-store.ts` when recording EA client IP.

## `time.ts`

Date/time utility functions:

- `toIso8601(date): string` — `date.toISOString()`
- `toEpochMs(date): number` — `date.getTime()`
- `fromEpochMs(epochMs): Date` — `new Date(epochMs)`
- `formatTime(epochMs): string` — `new Date(epochMs).toLocaleTimeString()`
- `formatDateTime(epochMs): string` — `new Date(epochMs).toLocaleString()`
- `getMinuteBucket(epochMs): number` — `Math.floor(epochMs / 60000)`
- `getHourBucket(epochMs): number` — `new Date(epochMs).getHours()`
- `isSameMinute(a, b): boolean` — compares minute buckets
- `timeAgo(epochMs): string` — human-readable relative time (`"5s ago"`, `"3m ago"`, `"2h ago"`, `"1d ago"`)
- `nowEpochMs(): number` — `Date.now()`
- `nowIso8601(): string` — current time as ISO string

## `response.ts`

```ts
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export function jsonSuccess<T>(res: Response, data: T, message?: string, statusCode = 200) {
  const response: ApiResponse<T> = { success: true, data, message };
  return res.status(statusCode).json(response);
}

export function jsonError(res: Response, message: string, statusCode = 400) {
  const response: ApiResponse = { success: false, error: message };
  return res.status(statusCode).json(response);
}
```

**Note:** This file is NOT empty. It contains `ApiResponse<T>`, `jsonSuccess()`, and `jsonError()`.

## `validators.ts`

Type guard functions:

- `isValidStrategyMode(value): value is "TREND_FOLLOWING" | "MEAN_REVERSION" | "AI_ADAPTIVE"` — checks against valid strategy modes
- `isValidTradingMode(value): value is "Scalping" | "Swing"` — checks against valid trading modes
- `isValidTradeType(value): value is "BUY" | "SELL"` — checks against valid trade types
