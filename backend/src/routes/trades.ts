import { Request, Response } from "express";

export function registerTradeRoutes(app: any, toggleTrade: (isActive: boolean) => void, resetStats: () => void) {
  app.post("/api/toggle-trade", (req: Request, res: Response) => {
    const { isActive } = req.body;
    toggleTrade(!!isActive);
    res.json({ status: "ok", config: { isActive: !!isActive } });
  });

  app.post("/api/reset-stats", (req: Request, res: Response) => {
    resetStats();
    res.json({ status: "ok" });
  });
}
