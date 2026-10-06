import { Request, Response, NextFunction, Application } from "express";
import { scalarAiDb } from "../db";
import { TradeConfig, UpdateMarketPayload } from "../types";
import { requireApiKey } from "../middleware/auth";

export function registerMarketRoutes(
  app: Application,
  updateMarket: (data: UpdateMarketPayload) => void,
  getConfig?: () => TradeConfig,
  apiKey?: string
) {
  const authMiddleware = apiKey ? requireApiKey(apiKey) : undefined;

  app.post("/api/update-market", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const price = body.price !== undefined ? Number(body.price) : (body.close !== undefined ? Number(body.close) : null);

      if (price === null || !isFinite(price) || price <= 0) {
        return res.status(400).json({ error: "Invalid price" });
      }

      if (body.symbol !== undefined && typeof body.symbol !== "string") {
        return res.status(400).json({ error: "Invalid symbol" });
      }

      updateMarket(body);
      const currentConfig = getConfig ? getConfig() : null;

      res.json({
        status: "ok",
        isActive: currentConfig ? currentConfig.isActive : false,
        selectedStrategy: currentConfig ? currentConfig.selectedStrategy : "TREND_FOLLOWING",
        lotSize: currentConfig ? currentConfig.lotSize : 0.1,
        takeProfitPoints: currentConfig ? currentConfig.takeProfitPoints : 300,
        stopLossPoints: currentConfig ? currentConfig.stopLossPoints : 150,
        trailingStopPoints: currentConfig ? currentConfig.trailingStopPoints : 100,
        useTrailingStop: currentConfig ? currentConfig.useTrailingStop : true,
        maxTrades: currentConfig ? currentConfig.maxTrades : 3,
        tradingMode: currentConfig ? currentConfig.tradingMode : "Scalping",
      });
    } catch (err: unknown) {
      console.error("Market update error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/market/history", (req: Request, res: Response) => {
    try {
      const symbol = (req.query.symbol as string) || "Step Index";
      const from = req.query.from ? Number(req.query.from) : undefined;
      const to = req.query.to ? Number(req.query.to) : undefined;
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 5000) : 500;

      let ticks;
      if (from && to) {
        ticks = scalarAiDb.rawQuery(
          "SELECT * FROM market_ticks WHERE time >= ? AND time <= ? AND (SELECT symbol FROM ea_connections WHERE id = 1) = ? ORDER BY time ASC LIMIT ?",
          [from, to, symbol, limit]
        );
      } else if (from) {
        ticks = scalarAiDb.rawQuery(
          "SELECT * FROM market_ticks WHERE time >= ? ORDER BY time ASC LIMIT ?",
          [from, limit]
        );
      } else {
        ticks = scalarAiDb.getTicks(limit);
      }

      res.json({
        symbol,
        ticks,
        count: ticks.length,
        from: from || null,
        to: to || null,
      });
    } catch (err: unknown) {
      console.error("Market history error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
