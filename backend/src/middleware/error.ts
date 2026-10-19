import { Request, Response, NextFunction } from "express";

export function errorMiddleware(err: unknown, req: Request, res: Response, next: NextFunction) {
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: "Internal server error", message: err instanceof Error ? err.message : String(err) });
}
