import { Request, Response } from "express";
import { isValidStrategyMode, isValidTradingMode } from "../utils/validators";

export function registerSettingsRoutes(
  app: any,
  updateSettings: (params: any) => void,
  getSettings: () => any,
  getWebRequestTest: () => { status: string; lastTested: string; error: string; details: string; triggerTest: boolean },
  triggerTest: () => void,
  reportTest: (report: { status: string; error?: string; details?: string }) => void
) {
  app.get("/api/settings", (req: Request, res: Response) => {
    try {
      const testState = getWebRequestTest();
      res.json({ ...getSettings(), triggerWebRequestTest: testState.triggerTest });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      if (body.selectedStrategy !== undefined && !isValidStrategyMode(body.selectedStrategy)) {
        return res.status(400).json({ error: "Invalid selectedStrategy" });
      }
      if (body.tradingMode !== undefined && !isValidTradingMode(body.tradingMode)) {
        return res.status(400).json({ error: "Invalid tradingMode" });
      }
      if (body.lotSize !== undefined && (typeof body.lotSize !== "number" || body.lotSize <= 0)) {
        return res.status(400).json({ error: "Invalid lotSize" });
      }
      if (body.takeProfitPoints !== undefined && (typeof body.takeProfitPoints !== "number" || body.takeProfitPoints <= 0)) {
        return res.status(400).json({ error: "Invalid takeProfitPoints" });
      }
      if (body.stopLossPoints !== undefined && (typeof body.stopLossPoints !== "number" || body.stopLossPoints <= 0)) {
        return res.status(400).json({ error: "Invalid stopLossPoints" });
      }
      if (body.trailingStopPoints !== undefined && (typeof body.trailingStopPoints !== "number" || body.trailingStopPoints < 0)) {
        return res.status(400).json({ error: "Invalid trailingStopPoints" });
      }
      if (body.maxTrades !== undefined && (!Number.isInteger(body.maxTrades) || body.maxTrades <= 0)) {
        return res.status(400).json({ error: "Invalid maxTrades" });
      }
      if (body.useTrailingStop !== undefined && typeof body.useTrailingStop !== "boolean") {
        return res.status(400).json({ error: "Invalid useTrailingStop" });
      }
      if (body.isAiModeEnabled !== undefined && typeof body.isAiModeEnabled !== "boolean") {
        return res.status(400).json({ error: "Invalid isAiModeEnabled" });
      }
      updateSettings(body);
      res.json({ status: "ok", config: getSettings() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update settings" });
    }
  });

  app.post("/api/test-webrequest/trigger", (req: Request, res: Response) => {
    try {
      triggerTest();
      const testState = getWebRequestTest();
      res.json({ status: "ok", testState });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to trigger test" });
    }
  });

  app.get("/api/test-webrequest/status", (req: Request, res: Response) => {
    try {
      const testState = getWebRequestTest();
      const host = req.get("host") || "127.0.0.1:3000";
      const protocol = req.protocol || "http";
      const suggestedUrl = `${protocol}://${host}`;
      res.json({ testState, suggestedUrl });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to get test status" });
    }
  });

  app.post("/api/test-webrequest/report", (req: Request, res: Response) => {
    try {
      const { status, error, details } = req.body || {};
      reportTest({ status: status || "success", error: error || "", details: details || "" });
      res.json({ status: "ok" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to process report" });
    }
  });

  app.get("/api/settings/db-retention", (req: Request, res: Response) => {
    try {
      res.json({
        tickRetentionDays: 7,
        logRetentionDays: 30,
        lastCleanup: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to get retention settings" });
    }
  });

  app.post("/api/settings/db-retention", (req: Request, res: Response) => {
    try {
      const { tickRetentionDays, logRetentionDays } = req.body;
      res.json({
        tickRetentionDays: tickRetentionDays || 7,
        logRetentionDays: logRetentionDays || 30,
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update retention settings" });
    }
  });
}
