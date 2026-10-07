import { Request, Response, NextFunction } from "express";

const ALLOWED_ORIGIN = process.env.FRONTEND_URL;

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGIN && origin && origin !== ALLOWED_ORIGIN && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
    return res.status(403).json({ error: "Forbidden: origin not allowed" });
  }
  res.header("Access-Control-Allow-Origin", origin || "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
}
