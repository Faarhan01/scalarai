import { Request, Response } from "express";
import { scalarAiDb } from "../db";

export function registerMarketRoutes(app: any, updateMarket: (data: any) => void) {
  app.post("/api/update-market", async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const price = body.price !== undefined ? Number(body.price) : (body.close !== undefined ? Number(body.close) : null);

      if (price === null || !isFinite(price) || price <= 0) {
        return res.status(400).json({ error: "Invalid price" });
      }

      updateMarket(body);
      const status = updateMarket.toString().includes("getStatus") ? {} : {};
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
    } catch (err: any) {
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
    } catch (err: any) {
      console.error("Market history error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
