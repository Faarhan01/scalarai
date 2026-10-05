import { Request, Response } from "express";

export function registerSettingsRoutes(app: any, updateSettings: (params: any) => void, getSettings: () => any, triggerTest: () => void) {
  app.get("/api/settings", (req: Request, res: Response) => {
    try {
      res.json({ ...getSettings(), triggerWebRequestTest: false });
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
      res.json({ status: "ok", testState: { status: "pending" } });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to trigger test" });
    }
  });

  app.get("/api/test-webrequest/status", (req: Request, res: Response) => {
    try {
      res.json({ testState: { status: "idle", details: "Awaiting first WebRequest test trigger." }, suggestedUrl: "http://127.0.0.1:3000" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to get test status" });
    }
  });

  app.post("/api/test-webrequest/report", (req: Request, res: Response) => {
    try {
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
