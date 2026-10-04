import { Request, Response, NextFunction } from "express";

export function errorMiddleware(err: any, req: Request, res: Response, next: NextFunction) {
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message || String(err) });
}
