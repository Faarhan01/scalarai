import { Request, Response } from "express";
import { scalarAiDb } from "../db";

export function registerStatusRoute(app: any, getStatus: () => any, switchSymbol: (symbol: string) => void) {
  app.get("/api/status", (req: Request, res: Response) => {
    try {
      const status = getStatus();
      return res.json(status);
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Failed to fetch status" });
    }
  });

  app.post("/api/status/switch-symbol", (req: Request, res: Response) => {
    try {
      const { symbol } = req.body;
      if (!symbol || typeof symbol !== "string") {
        return res.status(400).json({ error: "Symbol is required" });
      }
      switchSymbol(symbol);
      return res.json({ success: true, activeSymbol: symbol });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Failed to switch symbol" });
    }
  });

  app.get("/api/health", (req: Request, res: Response) => {
    try {
      const dbPath = process.cwd() + "/backend/data/scalarai.sqlite";
      const fs = require("fs");
      const dbExists = fs.existsSync(dbPath);
      return res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: dbExists ? "connected" : "missing",
        uptime: process.uptime(),
      });
    } catch (error: any) {
      return res.status(500).json({ status: "error", error: error.message });
    }
  });

  app.get("/poll", (req: Request, res: Response) => {
    try {
      const pendingTrades: any[] = [];
      res.json(pendingTrades);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Poll failed" });
    }
  });

  app.get("/get-pending-trades", (req: Request, res: Response) => {
    try {
      const pendingTrades: any[] = [];
      res.json(pendingTrades);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to get pending trades" });
    }
  });

  app.get("/api/get-pending-trades", (req: Request, res: Response) => {
    try {
      const pendingTrades: any[] = [];
      res.json(pendingTrades);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to get pending trades" });
    }
  });
}
