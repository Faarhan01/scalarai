import { Application, Request, Response } from "express";
import { AppStore } from "../../services/app-store";
import { ok, error } from "./responses";

export function registerBotRoutes(app: Application, store: AppStore) {
  app.get("/api/bot/state", (req: Request, res: Response) => {
    const status = store.getFullStatusPayload();
    return ok(res, {
      isActive: status.config.isActive,
      selectedStrategy: status.config.selectedStrategy,
      lotSize: status.config.lotSize,
      takeProfitPoints: status.config.takeProfitPoints,
      stopLossPoints: status.config.stopLossPoints,
      useTrailingStop: status.config.useTrailingStop,
      trailingStopPoints: status.config.trailingStopPoints,
      maxTrades: status.config.maxTrades,
      tradingState: store.getTradingState(),
      aiKnowledgeBase: store.getAiKnowledgeBase(),
      lastStrategySignal: store.getAiSynthesizedStrategy(),
    });
  });

  app.post("/api/bot/start", (req: Request, res: Response) => {
    try {
      store.toggleTrading(true);
      return ok(res, { success: true, message: "Bot automated execution started", state: "active" });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  });

  app.post("/api/bot/stop", (req: Request, res: Response) => {
    try {
      store.toggleTrading(false);
      return ok(res, { success: true, message: "Bot execution paused", state: "idle" });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  });

  app.post("/api/bot/config", (req: Request, res: Response) => {
    try {
      const updates = req.body || {};
      store.updateSettings(updates);
      return ok(res, { success: true, updatedConfig: store.config });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  });

  app.get("/api/bot/signals", (req: Request, res: Response) => {
    return ok(res, {
      strategy: store.config.selectedStrategy,
      signal: store.getAiSynthesizedStrategy(),
      activeSymbol: store.getActiveSymbol(),
      timestamp: new Date().toISOString(),
    });
  });
}
