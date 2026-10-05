import { Request, Response } from "express";

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
      updateSettings(req.body);
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
