import { Request, Response, NextFunction } from "express";

const ALLOWED_ORIGIN = process.env.FRONTEND_URL || "http://localhost:5173";

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin && origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: "Forbidden: origin not allowed" });
  }
  res.header("Access-Control-Allow-Origin", origin || ALLOWED_ORIGIN);
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
}
