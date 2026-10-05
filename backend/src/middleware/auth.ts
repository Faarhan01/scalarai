import { Request, Response, NextFunction } from "express";

export function requireApiKey(expectedApiKey?: string) {
  if (!expectedApiKey) return (_req: Request, _res: Response, next: NextFunction) => next();
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith(`Bearer ${expectedApiKey}`)) {
      return res.status(401).json({ error: "Unauthorized: Invalid or missing Bearer token" });
    }
    next();
  };
}
