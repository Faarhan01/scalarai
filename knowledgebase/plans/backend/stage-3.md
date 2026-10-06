# Backend Plan — Stage 3: Hardcoded Values Cleanup

> **Canonical structure:** See `knowledgebase/site-structure/backend/index.md` for the actual committed file layout before editing anything.

## Objective

Remove hardcoded fallback values for ticket seeds, IP addresses, and URLs.

## Completed Work

### 1. Hardcoded ticket seed — FIXED

**Before:** `let nextTicket = 837201;` in `backend/src/index.ts`
**After:** `nextTicket` is initialized from DB max on startup.

**File:** `backend/src/services/app-store.ts`
```ts
constructor() {
  // ...
  this.nextTicket = { value: scalarAiDb.getMaxTicket() + 1 };
}
```

**DB method added:** `backend/src/db/repository.ts:322`
```ts
getMaxTicket(): number {
  const row = this.db.prepare(`SELECT MAX(ticket) as maxTicket FROM trades`).get() as { maxTicket: number | null };
  return row.maxTicket ?? 837201;
}
```

**Impact:** Server restarts no longer produce duplicate ticket numbers.

### 2. Client IP handling — NORMALIZED

**Utility added:** `backend/src/utils/ip.ts`
```ts
export function normalizeIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  return raw.replace(/^::ffff:/, "");
}
```

**Usage in `backend/src/services/app-store.ts`:**
```ts
const normalized = normalizeIp(clientIp);
activeState.connection.clientIp = normalized || "127.0.0.1";
```

**Impact:** IPv6-mapped IPv4 addresses like `::ffff:127.0.0.1` are normalized to `127.0.0.1`.

### 3. EA generator URL validation — ADDED

**Backend:** `backend/src/services/ea-generator.ts:3`
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

**Frontend mirrored:** `frontend/src/lib/mql5_generator.ts:3` — same validation logic.

**MQL5 escaping:** Backslashes are escaped when injecting URLs into MQL5 template strings.

### 4. Remaining localhost fallbacks

The EA generator still uses `"http://127.0.0.1:3000"` as a last-resort fallback in `backend/src/services/ea-generator.ts:29` and `frontend/src/lib/mql5_generator.ts:29`. This is intentional — when no host header is present, localhost is the only sensible default for development.

## Verification

- `npx tsc --noEmit` passes
- Dev server starts correctly
- Restarting server does not produce duplicate ticket numbers
- EA generator rejects invalid URLs in production
- EA tick endpoint correctly captures and normalizes real client IP
