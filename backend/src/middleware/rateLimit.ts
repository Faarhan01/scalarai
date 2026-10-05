import { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 1200;

const stores = new WeakMap<Request, Map<string, RateLimitEntry>>();

function getClientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function rateLimit(options?: { windowMs?: number; max?: number }) {
  const windowMs = options?.windowMs || RATE_LIMIT_WINDOW_MS;
  const max = options?.max || DEFAULT_MAX_REQUESTS;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = getClientKey(req);
    const now = Date.now();
    let store = stores.get(req);
    if (!store) {
      store = new Map();
      stores.set(req, store);
    }

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
