import { Request, Response } from "express";

export function registerStatusRoute(app: any, getStatus: () => any) {
  app.get("/api/status", (req: Request, res: Response) => {
    try {
      const status = getStatus();
      return res.json(status);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Failed to fetch status" });
    }
  });
}
