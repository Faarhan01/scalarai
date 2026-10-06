import { Request, Response, NextFunction, Application } from "express";
import { isValidTradeType } from "../utils/validators";
import { requireApiKey } from "../middleware/auth";

export function registerTradeRoutes(app: Application, toggleTrade: (isActive: boolean) => void, resetStats: () => void, apiKey?: string) {
  const authMiddleware = apiKey ? requireApiKey(apiKey) : undefined;

  app.post("/api/toggle-trade", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
    try {
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ error: "Invalid isActive: must be boolean" });
      }
      toggleTrade(isActive);
      res.json({ status: "ok", config: { isActive } });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to toggle trading" });
    }
  });

  app.post("/api/reset-stats", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
    try {
      resetStats();
      res.json({ status: "ok" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to reset stats" });
    }
  });
}
