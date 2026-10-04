import { Request, Response } from "express";

export function registerMarketRoutes(app: any, updateMarket: (data: any) => void) {
  app.post("/api/update-market", async (req: Request, res: Response) => {
    const { price, velocity, buyLocked, sellLocked, symbol, open, high, low, close, volume, current_time } = req.body;
    updateMarket(req.body);
    res.json({
      status: "ok",
      isActive: false,
      selectedStrategy: "TREND_FOLLOWING",
      lotSize: 0.1,
      takeProfitPoints: 300,
      stopLossPoints: 150,
      trailingStopPoints: 100,
      useTrailingStop: true,
    });
  });
}
