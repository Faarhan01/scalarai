# Backend Middleware

> Detailed reference for middleware in `backend/src/middleware/`.

## `auth.ts`

```ts
export function requireApiKey(expectedApiKey?: string) {
  return (req, res, next) => {
    if (!expectedApiKey || expectedApiKey.trim() === "") return next();
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith(`Bearer ${expectedApiKey}`)) {
      return res.status(401).json({ error: "Unauthorized: Invalid or missing Bearer token" });
    }
    next();
  };
}
```

**Behavior:**
- If `expectedApiKey` is `undefined` or empty → passes through (no auth)
- If `expectedApiKey` is set → requires `Authorization: Bearer <key>`
- In development without `SCALARAI_MCP_API_KEY`, all protected routes are open

**Note:** `mcp_server.ts` has its own auth check — it always requires a valid Bearer token regardless of `expectedApiKey`.

## `cors.ts`

```ts
export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (origin) res.header("Access-Control-Allow-Origin", origin);
  else res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
}
```

Reflects request Origin, credentials allowed, handles OPTIONS preflight.

## `error.ts`

```ts
export function errorMiddleware(err, req, res, next) {
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: "Internal server error", message: err instanceof Error ? err.message : String(err) });
}
```

Centralized error handler. Logs to console, returns 500 JSON.

## `logger.ts`

```ts
export function loggerMiddleware(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
}
```

HTTP request/response logging with duration in ms.

## `rateLimit.ts`

```ts
export function rateLimit(options?: { windowMs?: number; max?: number }) {
  const windowMs = options?.windowMs || 60_000;
  const max = options?.max || 1200;
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) return res.status(429).json({ error: "Too many requests" });
    next();
  };
}
```

In-memory sliding-window rate limiter. Default: 1200 requests per minute per IP.

**Limitations:**
- In-memory store — does not persist across server restarts
- Does not share state across multiple server instances
- Store grows unbounded (consider cleanup for long-running servers)
