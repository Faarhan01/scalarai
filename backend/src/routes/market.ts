import { Request, Response, NextFunction, Application } from "express";
import { scalarAiDb } from "../db";
import { TradeConfig, UpdateMarketPayload, MarketCandleRow, ObservationRow } from "../types";
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
          "SELECT * FROM market_ticks WHERE symbol = ? AND time >= ? AND time <= ? ORDER BY time ASC LIMIT ?",
          [symbol, from, to, limit]
        );
      } else if (from) {
        ticks = scalarAiDb.rawQuery(
          "SELECT * FROM market_ticks WHERE symbol = ? AND time >= ? ORDER BY time ASC LIMIT ?",
          [symbol, from, limit]
        );
      } else {
        ticks = scalarAiDb.getTicks(limit, symbol);
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

  app.get("/api/market/candles", (req: Request, res: Response) => {
    try {
      const symbol = (req.query.symbol as string) || "Step Index";
      const from = req.query.from ? new Date(req.query.from as string).getTime() : undefined;
      const to = req.query.to ? new Date(req.query.to as string).getTime() : undefined;
      const limit = Math.min(Number(req.query.limit) || 1000, 10000);

      const rows = scalarAiDb.getCandles(symbol, from, to, limit);
      const candles = rows.map((row: MarketCandleRow) => ({
        time: row.time,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        direction: row.direction,
      }));

      res.json({ symbol, candles, count: candles.length, from: from || null, to: to || null });
    } catch (err: unknown) {
      console.error("Market candles error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/market/observations", (req: Request, res: Response) => {
    try {
      const symbol = req.query.symbol as string | undefined;
      const from = req.query.from ? new Date(req.query.from as string).getTime() : undefined;
      const to = req.query.to ? new Date(req.query.to as string).getTime() : undefined;
      const direction = req.query.direction as string | undefined;
      const minVelocity = req.query.minVelocity ? Number(req.query.minVelocity) : undefined;
      const limit = Math.min(Number(req.query.limit) || 500, 5000);

      let rows = scalarAiDb.getObservations(symbol, from, to, limit);

      if (direction) {
        rows = rows.filter((row) => row.direction === direction);
      }
      if (minVelocity !== undefined && Number.isFinite(minVelocity)) {
        rows = rows.filter((row) => row.velocity >= minVelocity);
      }

      const observations = rows.map((row: ObservationRow) => {
        let tags: any[] = [];
        try { tags = JSON.parse(row.tags || "[]"); } catch { tags = []; }
        let metadata: Record<string, any> = {};
        try { metadata = JSON.parse(row.metadata || "{}"); } catch { metadata = {}; }
        return {
          id: row.id,
          timestamp: row.timestamp,
          direction: row.direction,
          velocity: row.velocity,
          price: row.price,
          tags,
          metadata,
        };
      });

      res.json({ symbol: symbol || null, observations, count: observations.length });
    } catch (err: unknown) {
      console.error("Market observations error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
