import { Request, Response, NextFunction, Application } from "express";
import { isValidTradeType } from "../utils/validators";
import { requireApiKey } from "../middleware/auth";
import { TradeRecord } from "../types";

export interface TradeRouteHandlers {
  toggleTrade: (isActive: boolean) => void;
  resetStats: () => void;
  getTrades?: () => TradeRecord[];
  placeTrade?: (
    type: "BUY" | "SELL",
    reason: string,
    options?: { symbol?: string; lotSize?: number; sl?: number; tp?: number }
  ) => Promise<{ success: boolean; message: string; ticket?: number }>;
  closeTrade?: (tradeId: string) => Promise<{ success: boolean; message: string }>;
  closeAllTrades?: (symbol?: string) => Promise<{ success: boolean; closedCount: number; message: string }>;
  modifyTrade?: (tradeId: string, options: { sl?: number; tp?: number }) => Promise<{ success: boolean; message: string }>;
}

export function registerTradeRoutes(
  app: Application,
  handlers: ((isActive: boolean) => void) | TradeRouteHandlers,
  legacyResetStats?: () => void,
  apiKey?: string
) {
  // Support both legacy signature and object signature
  let toggleTrade: (isActive: boolean) => void;
  let resetStats: () => void;
  let getTrades: (() => TradeRecord[]) | undefined;
  let placeTrade: TradeRouteHandlers["placeTrade"];
  let closeTrade: TradeRouteHandlers["closeTrade"];
  let closeAllTrades: TradeRouteHandlers["closeAllTrades"];
  let modifyTrade: TradeRouteHandlers["modifyTrade"];

  if (typeof handlers === "function") {
    toggleTrade = handlers;
    resetStats = legacyResetStats || (() => {});
  } else {
    toggleTrade = handlers.toggleTrade;
    resetStats = handlers.resetStats;
    getTrades = handlers.getTrades;
    placeTrade = handlers.placeTrade;
    closeTrade = handlers.closeTrade;
    closeAllTrades = handlers.closeAllTrades;
    modifyTrade = handlers.modifyTrade;
  }

  const authMiddleware = apiKey ? requireApiKey(apiKey) : undefined;

  app.get("/api/trades", (req: Request, res: Response) => {
    try {
      if (getTrades) {
        const trades = getTrades();
        return res.json({ trades, count: trades.length });
      }
      res.json({ trades: [], count: 0 });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) || "Failed to fetch trades" });
    }
  });

  app.post("/api/trades", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), async (req: Request, res: Response) => {
    try {
      if (!placeTrade) {
        return res.status(501).json({ error: "Manual trade placement not configured" });
      }
      const body = req.body || {};
      const type = (body.type || "").toUpperCase();
      if (!["BUY", "SELL"].includes(type)) {
        return res.status(400).json({ error: "Type must be BUY or SELL" });
      }
      const result = await placeTrade(
        type as "BUY" | "SELL",
        body.reason || "Manual web execution",
        {
          symbol: body.symbol,
          lotSize: body.lotSize ? Number(body.lotSize) : undefined,
          sl: body.sl ? Number(body.sl) : undefined,
          tp: body.tp ? Number(body.tp) : undefined,
        }
      );
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) || "Failed to place trade" });
    }
  });

  app.post("/api/trades/modify", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), async (req: Request, res: Response) => {
    try {
      if (!modifyTrade) {
        return res.status(501).json({ error: "Trade modification not configured" });
      }
      const body = req.body || {};
      const tradeId = body.tradeId || body.id || String(body.ticket || "");
      if (!tradeId) {
        return res.status(400).json({ error: "tradeId or ticket required" });
      }
      const result = await modifyTrade(tradeId, {
        sl: body.sl !== undefined ? Number(body.sl) : undefined,
        tp: body.tp !== undefined ? Number(body.tp) : undefined,
      });
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) || "Failed to modify trade" });
    }
  });

  app.post("/api/trades/:id/modify", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), async (req: Request, res: Response) => {
    try {
      if (!modifyTrade) {
        return res.status(501).json({ error: "Trade modification not configured" });
      }
      const tradeId = req.params.id;
      const body = req.body || {};
      const result = await modifyTrade(tradeId, {
        sl: body.sl !== undefined ? Number(body.sl) : undefined,
        tp: body.tp !== undefined ? Number(body.tp) : undefined,
      });
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) || "Failed to modify trade" });
    }
  });

  app.post("/api/trades/close-all", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), async (req: Request, res: Response) => {
    try {
      if (!closeAllTrades) {
        return res.status(501).json({ error: "Close all trades not configured" });
      }
      const symbol = req.body?.symbol;
      const result = await closeAllTrades(symbol);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) || "Failed to close all trades" });
    }
  });

  app.post("/api/trades/:id/close", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), async (req: Request, res: Response) => {
    try {
      if (!closeTrade) {
        return res.status(501).json({ error: "Close trade not configured" });
      }
      const tradeId = req.params.id;
      const result = await closeTrade(tradeId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) || "Failed to close trade" });
    }
  });

  app.post("/api/toggle-trade", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
    try {
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ error: "Invalid isActive: must be boolean" });
      }
      toggleTrade(isActive);
      res.json({ status: "ok", config: { isActive } });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) || "Failed to toggle trading" });
    }
  });

  app.post("/api/reset-stats", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
    try {
      resetStats();
      res.json({ status: "ok" });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) || "Failed to reset stats" });
    }
  });
}
