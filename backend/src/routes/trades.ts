import { Request, Response } from "express";
import { isValidTradeType } from "../utils/validators";

export function registerTradeRoutes(app: any, toggleTrade: (isActive: boolean) => void, resetStats: () => void) {
  app.post("/api/toggle-trade", (req: Request, res: Response) => {
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

  app.post("/api/reset-stats", (req: Request, res: Response) => {
    try {
      resetStats();
      res.json({ status: "ok" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to reset stats" });
    }
  });
}
