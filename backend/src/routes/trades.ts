import { Request, Response } from "express";

export function registerTradeRoutes(app: any, toggleTrade: (isActive: boolean) => void, resetStats: () => void) {
  app.post("/api/toggle-trade", (req: Request, res: Response) => {
    try {
      const { isActive } = req.body;
      toggleTrade(!!isActive);
      res.json({ status: "ok", config: { isActive: !!isActive } });
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
