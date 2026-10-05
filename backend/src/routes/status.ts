import { Request, Response } from "express";

export function registerStatusRoute(
  app: any,
  getStatus: () => any,
  switchSymbol: (symbol: string) => void,
  getAndClearPendingOrders?: () => any[]
) {
  app.get("/api/status", (req: Request, res: Response) => {
    try {
      const status = getStatus();
      return res.json(status);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Failed to fetch status" });
    }
  });

  app.post("/api/status/switch-symbol", (req: Request, res: Response) => {
    try {
      const { symbol } = req.body;
      if (!symbol || typeof symbol !== "string") {
        return res.status(400).json({ error: "Symbol is required" });
      }
      switchSymbol(symbol);
      return res.json({ success: true, activeSymbol: symbol });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Failed to switch symbol" });
    }
  });

  // Polling endpoints for MT5 bridge client
  const handlePendingTrades = (req: Request, res: Response) => {
    try {
      const pendingTrades = getAndClearPendingOrders ? getAndClearPendingOrders() : [];
      res.json(pendingTrades);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to get pending trades" });
    }
  };

  app.get("/poll", handlePendingTrades);
  app.get("/get-pending-trades", handlePendingTrades);
  app.get("/api/get-pending-trades", handlePendingTrades);
}
