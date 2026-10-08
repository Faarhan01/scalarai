import { Request, Response, NextFunction, Application } from "express";
import { scalarAiDb } from "../db";
import { TradeConfig, UpdateMarketPayload, MarketCandleRow, ObservationRow } from "../types";
import { requireApiKey } from "../middleware/auth";

export function registerMarketRoutes(
  app: Application,
  updateMarket: (data: UpdateMarketPayload, clientIp?: string) => Promise<void>,
  getConfig?: () => TradeConfig,
  ingestBulkCandles?: (
    symbol: string,
    candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number; direction?: string }>,
    metadata?: { digits?: number; tickSize?: number }
  ) => void,
  getActiveSymbol?: () => string,
  apiKey?: string
) {
  const authMiddleware = apiKey ? requireApiKey(apiKey) : undefined;

  // Single tick / candle update from EA or dashboard
  app.post("/api/update-market", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), async (req: Request, res: Response) => {
    try {
      const body = req.body || {};

      // If EA sends a batch of candles in this endpoint, route to bulk ingestion
      if (Array.isArray(body.candles) && body.candles.length > 0 && ingestBulkCandles) {
        const symbol = typeof body.symbol === "string" && body.symbol.trim() ? body.symbol.trim() : (getActiveSymbol ? getActiveSymbol() : "Step Index");
        ingestBulkCandles(symbol, body.candles, {
          digits: body.digits !== undefined ? Number(body.digits) : undefined,
          tickSize: body.tickSize !== undefined ? Number(body.tickSize) : undefined,
        });
        return res.json({ status: "ok", count: body.candles.length, symbol });
      }

      const price = body.price !== undefined ? Number(body.price) : (body.close !== undefined ? Number(body.close) : null);

      if (price === null || !isFinite(price) || price <= 0) {
        return res.status(400).json({ error: "Invalid price" });
      }

      if (body.symbol !== undefined && typeof body.symbol !== "string") {
        return res.status(400).json({ error: "Invalid symbol" });
      }

      const clientIp = (req as any).ip || (req as any).socket?.remoteAddress || "127.0.0.1";
      await updateMarket(body, clientIp);
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

  // Dedicated high-speed bulk candle upload from MT5 EA on startup or symbol attach
  app.post("/api/market/bulk-candles", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const candles = Array.isArray(body.candles) ? body.candles : [];
      const symbol = typeof body.symbol === "string" && body.symbol.trim()
        ? body.symbol.trim()
        : (getActiveSymbol ? getActiveSymbol() : "Step Index");

      if (ingestBulkCandles) {
        ingestBulkCandles(symbol, candles, {
          digits: body.digits !== undefined ? Number(body.digits) : undefined,
          tickSize: body.tickSize !== undefined ? Number(body.tickSize) : undefined,
        });
      } else if (candles.length > 0) {
        const candleRows = candles.map((c: any) => {
          const timeMs = c.time > 1000000000000 ? Number(c.time) : Number(c.time) * 1000;
          return {
            symbol,
            time: timeMs,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: c.volume !== undefined ? Number(c.volume) : 0,
            direction: (c.direction || (Number(c.close) >= Number(c.open) ? "up" : "down")) as "up" | "down" | "flat",
            minute_bucket: Math.floor(timeMs / 60000) * 60000,
          };
        });
        scalarAiDb.insertCandlesBatch(candleRows);
      }

      res.json({
        status: "ok",
        symbol,
        count: candles.length,
        message: `Successfully saved ${candles.length} historical candles for ${symbol}`,
      });
    } catch (err: unknown) {
      console.error("Bulk candles error:", err);
      res.status(500).json({ error: "Failed to ingest bulk candles" });
    }
  });

  app.get("/api/market/history", (req: Request, res: Response) => {
    try {
      const symbol = (req.query.symbol as string) || (getActiveSymbol ? getActiveSymbol() : "") || "Step Index";
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
      const symbol = (req.query.symbol as string) || (getActiveSymbol ? getActiveSymbol() : "") || "Step Index";
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

  app.get("/api/market/symbols", (_req: Request, res: Response) => {
    try {
      const symbols = scalarAiDb.getKnownSymbols();
      const active = getActiveSymbol ? getActiveSymbol() : "";
      res.json({ symbols, activeSymbol: active });
    } catch (err: unknown) {
      console.error("Market symbols error:", err);
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
