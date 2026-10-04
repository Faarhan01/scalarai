import { Request, Response } from "express";

export function registerSettingsRoutes(app: any, updateSettings: (params: any) => void, getSettings: () => any, triggerTest: () => void) {
  app.get("/api/settings", (req: Request, res: Response) => {
    res.json({ ...getSettings(), triggerWebRequestTest: false });
  });

  app.post("/api/settings", (req: Request, res: Response) => {
    updateSettings(req.body);
    res.json({ status: "ok", config: getSettings() });
  });

  app.post("/api/test-webrequest/trigger", (req: Request, res: Response) => {
    triggerTest();
    res.json({ status: "ok", testState: { status: "pending" } });
  });

  app.get("/api/test-webrequest/status", (req: Request, res: Response) => {
    res.json({ testState: { status: "idle", details: "Awaiting first WebRequest test trigger." }, suggestedUrl: "http://127.0.0.1:3000" });
  });

  app.post("/api/test-webrequest/report", (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });
}
