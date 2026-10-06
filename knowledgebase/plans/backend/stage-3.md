# Backend Plan — Stage 3: Hardcoded Values Cleanup

## Objective

Remove hardcoded fallback values for ticket seeds, IP addresses, and URLs.

## Issues

### 1. Hardcoded ticket seed

**File:** `backend/src/index.ts:57`
```ts
let nextTicket = 837201;
```

**Problem:** Resets on every server restart, causing duplicate ticket numbers.

**Fix:** Derive from DB max on startup.
```ts
let nextTicket = scalarAiDb.getMaxTicket() + 1;
```

**Required DB method:** Add `getMaxTicket()` to `backend/src/db/repository.ts`:
```ts
getMaxTicket(): number {
  const row = this.db.prepare(`SELECT MAX(ticket) as maxTicket FROM trades`).get() as { maxTicket: number | null };
  return row.maxTicket ?? 837201;
}
```

### 2. Client IP handling — `127.0.0.1` hardcoded in 5 places

#### Location A: `backend/src/index.ts:230`
```ts
activeState.connection.clientIp = clientIp || "127.0.0.1";
```
**Fix:** Normalize `::ffff:127.0.0.1` → `127.0.0.1`, keep EA-reported IP if present.
```ts
function normalizeIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  return raw.replace(/^::ffff:/, "");
}
// Then:
activeState.connection.clientIp = normalizeIp(clientIp);
```

#### Location B: `backend/src/routes/ea.ts:23`
```ts
if (!appUrl) appUrl = "http://127.0.0.1:3000";
```
**Fix:** Use `req.get("host")` derived URL, only fallback to `127.0.0.1:3000` if host is missing.
```ts
const host = req.get("host");
if (!appUrl && host) appUrl = `${req.protocol}://${host}`;
```

#### Location C: `backend/src/routes/ea.ts:76`
```ts
const clientIp = (req as any).ip || (req as any).socket?.remoteAddress || "127.0.0.1";
```
**Fix:** Use `req.ip` or `req.socket.remoteAddress` without hardcoded fallback, then normalize.
```ts
const clientIp = normalizeIp((req as Request).ip || (req.socket as any)?.remoteAddress);
```

#### Location D: `backend/src/services/ea-generator.ts:8`
```ts
const clientUrl = (appUrl && appUrl.trim() !== "") ? appUrl.trim().replace(/\/$/, "") : "http://127.0.0.1:3000";
```
**Fix:** Empty string fallback instead of hardcoded localhost.
```ts
const clientUrl = (appUrl && appUrl.trim() !== "") ? appUrl.trim().replace(/\/$/, "") : "";
```

#### Location E: `backend/src/routes/settings.ts:75`
```ts
const host = req.get("host") || "127.0.0.1:3000";
```
**Fix:** Allow null host and handle gracefully.
```ts
const host = req.get("host");
```

### 3. EA generator URL validation

**File:** `backend/src/services/ea-generator.ts:8`
**File:** `frontend/src/lib/mql5_generator.ts:8` (mirrored)

**Problem:** `appUrl` is injected directly into MQL5 string without sanitization.

**Required validation:**
```ts
function validateAppUrl(appUrl: string | undefined): string {
  const url = (appUrl || "").trim().replace(/\/$/, "");
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Only http/https URLs allowed");
    }
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname.startsWith("192.168.")) {
      // Allow in development, reject in production
      if (process.env.NODE_ENV === "production") {
        throw new Error("Localhost URLs not allowed in production");
      }
    }
    return url;
  } catch {
    return "";
  }
}
```

**MQL5 escaping:** When injecting into template string, escape backslashes:
```ts
const escapedUrl = url.replace(/\\/g, "\\\\");
```

## Implementation Steps

1. **Add `getMaxTicket()` to `backend/src/db/repository.ts`**
2. **Update `backend/src/index.ts:57`** — replace hardcoded ticket seed
3. **Add `normalizeIp()` utility** — either in `backend/src/utils/ip.ts` or inline in `index.ts`
4. **Update 5 hardcoded IP/URL locations** listed above
5. **Add `validateAppUrl()` to `backend/src/services/ea-generator.ts`**
6. **Mirror validation in `frontend/src/lib/mql5_generator.ts`**
7. **Verify with `npx tsc --noEmit` and `npm run test`**

## Verification

- `npx tsc --noEmit` passes
- `npm run test` passes
- Dev server starts correctly
- Restarting server does not produce duplicate ticket numbers
- EA generator rejects invalid URLs
- EA tick endpoint correctly captures real client IP
