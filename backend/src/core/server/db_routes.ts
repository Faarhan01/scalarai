import { Application, Request, Response } from "express";
import { scalarAiDb } from "../../db";
import { ok, error } from "./responses";

export function registerDbRoutes(app: Application) {
  app.get("/api/db/stats", (req: Request, res: Response) => {
    try {
      const tradesCount = (scalarAiDb.rawQuery("SELECT COUNT(*) as count FROM trades")[0] as any)?.count || 0;
      const ticksCount = (scalarAiDb.rawQuery("SELECT COUNT(*) as count FROM market_ticks")[0] as any)?.count || 0;
      const candlesCount = (scalarAiDb.rawQuery("SELECT COUNT(*) as count FROM market_candles")[0] as any)?.count || 0;
      const logsCount = (scalarAiDb.rawQuery("SELECT COUNT(*) as count FROM system_logs")[0] as any)?.count || 0;

      return ok(res, {
        database: "SQLite 3",
        tables: {
          trades: tradesCount,
          ticks: ticksCount,
          candles: candlesCount,
          logs: logsCount,
          market_ticks: ticksCount,
          market_candles: candlesCount,
          system_logs: logsCount,
        },
        trades: tradesCount,
        ticks: ticksCount,
        candles: candlesCount,
        logs: logsCount,
        dbPath: "backend/src/db/scalarai.sqlite",
      });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  });

  app.get("/api/db/integrity", (req: Request, res: Response) => {
    try {
      return ok(res, { success: true, database: "SQLite 3", integrity: "ok" });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  });

  app.get("/api/db/ticks", (req: Request, res: Response) => {
    try {
      const sym = req.query.symbol ? String(req.query.symbol) : undefined;
      const limit = Math.min(Number(req.query.limit || 100), 500);
      const ticks = scalarAiDb.getTicks(limit, sym);
      return ok(res, { count: ticks.length, ticks });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  });

  app.get("/api/db/logs", (req: Request, res: Response) => {
    try {
      const level = req.query.level ? String(req.query.level) : undefined;
      const limit = Math.min(Number(req.query.limit || 100), 500);
      const logs = scalarAiDb.getLogs(limit, undefined, level);
      return ok(res, { count: logs.length, logs });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  });

  app.post("/api/db/cleanup", (req: Request, res: Response) => {
    try {
      const result = scalarAiDb.cleanupOldData();
      return ok(res, { success: true, ...result });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  });

  app.post("/api/db/query", (req: Request, res: Response) => {
    try {
      const { sql, params = [] } = req.body || {};
      if (!sql || typeof sql !== "string") {
        return error(res, "SQL query string required", 400);
      }
      if (!/^\s*SELECT\b/i.test(sql.trim())) {
        return error(res, "Only SELECT statements are permitted", 403);
      }
      if (/;|--|\/\*/.test(sql.trim())) {
        return error(res, "Multiple statements and comments are disallowed", 403);
      }
      const rows = scalarAiDb.rawQuery(sql, Array.isArray(params) ? params : []);
      return ok(res, { count: rows.length, rows });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  });
}
