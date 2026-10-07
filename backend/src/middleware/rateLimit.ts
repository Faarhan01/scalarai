import { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 3600;

const EXEMPT_PATHS = [
  "/api/update-market",
  "/api/ea/tick",
  "/api/market/bulk-candles",
  "/api/market/candles",
  "/api/market/history",
  "/api/status",
  "/api/poll",
  "/poll",
  "/get-pending-trades",
  "/api/get-pending-trades",
  "/api/health",
];

const store = new Map<string, RateLimitEntry>();

function getClientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function rateLimit(options?: { windowMs?: number; max?: number }) {
  const windowMs = options?.windowMs || RATE_LIMIT_WINDOW_MS;
  const max = options?.max || DEFAULT_MAX_REQUESTS;

  return (req: Request, res: Response, next: NextFunction) => {
    // Exempt streaming market ingestion and EA polling endpoints from blocking
    if (EXEMPT_PATHS.some((p) => req.path === p || req.path.startsWith("/api/market/"))) {
      return next();
    }

    const key = getClientKey(req);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ error: "Too many requests" });
    }

    next();
  };
}
