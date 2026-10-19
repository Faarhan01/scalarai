import { Request, Response, NextFunction, Application } from "express";
import path from "path";
import fs from "fs";
import { TradeConfig, UpdateMarketPayload, FullStatusPayload, EaCommand, EaConfirmation, EaPosition, EaLog } from "../types";
import { requireApiKey } from "../middleware/auth";

export function registerEaRoutes(
  app: Application,
  getStatus: () => FullStatusPayload,
  getConfig: () => TradeConfig,
  onTick: (data: UpdateMarketPayload, clientIp?: string) => Promise<void>,
  getPendingEaCommands?: () => EaCommand[],
  onEaConfirmation?: (confirmation: EaConfirmation) => void,
  onEaPositionsReport?: (positions: EaPosition[]) => void,
  queueEaConfigUpdate?: (config: Record<string, unknown>) => void,
  onEaLogs?: (logs: EaLog[]) => void,
  apiKey?: string
) {
  const authMiddleware = apiKey ? requireApiKey(apiKey) : undefined;

  // StrategyForge download endpoint
  const handleStrategyForgeDownload = (req: Request, res: Response) => {
    try {
      const sfCandidates = [
        path.resolve(process.cwd(), "ea", "StrategyForge.mq5"),
        path.resolve(process.cwd(), "backend", "src", "gateway", "mt5", "tools", "mql5", "StrategyForge.mq5"),
      ];
      let sfPath = "";
      for (const candidate of sfCandidates) {
        if (fs.existsSync(candidate)) {
          sfPath = candidate;
          break;
        }
      }
      if (!sfPath) {
        return res.status(404).send("// StrategyForge.mq5 not found on server");
      }
      res.setHeader("Content-Disposition", 'attachment; filename="StrategyForge.mq5"');
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      fs.createReadStream(sfPath).pipe(res);
    } catch (err: unknown) {
      console.error("StrategyForge download error:", err);
      res.status(500).send("// Failed to download StrategyForge.mq5");
    }
  };

  app.get("/api/strategyforge/download", handleStrategyForgeDownload);
  app.get("/api/ea/strategyforge/download", handleStrategyForgeDownload);
  app.get("/api/ea/download", handleStrategyForgeDownload);

  // StrategyForge source endpoint
  const handleStrategyForgeSource = (req: Request, res: Response) => {
    try {
      const candidates = [
        path.resolve(process.cwd(), "ea", "StrategyForge.mq5"),
        path.resolve(process.cwd(), "backend", "src", "gateway", "mt5", "tools", "mql5", "StrategyForge.mq5"),
      ];
      let sfPath = "";
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          sfPath = candidate;
          break;
        }
      }
      if (sfPath) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return fs.createReadStream(sfPath).pipe(res);
      }
      res.status(404).json({ error: "StrategyForge file not found" });
    } catch {
      res.status(500).json({ error: "Failed to read StrategyForge source" });
    }
  };

  app.get("/api/strategyforge/source", handleStrategyForgeSource);
  app.get("/api/ea/strategyforge/source", handleStrategyForgeSource);

  // Tick ingestion endpoint
  app.post("/api/ea/tick", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const clientIp = (req.headers && req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || "127.0.0.1";

      await onTick({
        symbol: body.symbol || "Step Index",
        bid: Number(body.bid ?? body.price ?? 0),
        ask: Number(body.ask ?? body.price ?? 0),
        spread: body.spread !== undefined ? Number(body.spread) : undefined,
        volume: body.volume !== undefined ? Number(body.volume) : undefined,
        balance: body.balance !== undefined ? Number(body.balance) : undefined,
        broker: body.broker,
        account: body.account ? String(body.account) : undefined,
        leverage: body.leverage !== undefined ? Number(body.leverage) : undefined,
        margin: body.margin !== undefined ? Number(body.margin) : undefined,
      }, clientIp);

      const status = getStatus ? getStatus() : ({} as any);
      const conf = getConfig ? getConfig() : (status?.config || {});
      const commands = getPendingEaCommands ? getPendingEaCommands() : [];
      res.json({
        success: true,
        received: true,
        serverTime: new Date().toISOString(),
        activeSymbol: status?.activeSymbol,
        tradingActive: conf?.isActive,
        isActive: conf?.isActive,
        selectedStrategy: conf?.selectedStrategy,
        pendingAction: commands[0]?.action || "NONE",
        pendingLot: commands[0]?.lot || conf?.lotSize || 0.1,
        pendingCommands: commands,
      });
    } catch (err: unknown) {
      console.error("EA tick ingestion error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Commands polling endpoint
  app.get("/api/ea/commands", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
    try {
      const commands = getPendingEaCommands ? getPendingEaCommands() : [];
      res.json({ commands, count: commands.length });
    } catch (err: unknown) {
      console.error("EA commands poll error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Confirmations endpoint
  app.post("/api/ea/confirm", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const confirmations = Array.isArray(body.confirmations) ? body.confirmations : [body];

      if (onEaConfirmation) {
        confirmations.forEach((c: any) => {
          onEaConfirmation({
            action: c.action,
            ticket: Number(c.ticket),
            mt5Ticket: c.mt5Ticket !== undefined ? Number(c.mt5Ticket) : undefined,
            success: Boolean(c.success),
            error: c.error || "",
            symbol: c.symbol || "Step Index",
            magic: Number(c.magic || 20260118),
            timestamp: Date.now(),
          });
        });
      }

      res.json({ status: "ok", processed: confirmations.length });
    } catch (err: unknown) {
      console.error("EA confirmation handler error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Positions endpoint
  app.post("/api/ea/positions", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const positions = Array.isArray(body.positions) ? body.positions : [];

      if (onEaPositionsReport) {
        onEaPositionsReport(positions.map((p: any) => ({
          ticket: Number(p.ticket),
          type: p.type,
          symbol: p.symbol || "Step Index",
          volume: Number(p.volume),
          openPrice: Number(p.openPrice),
          sl: Number(p.sl),
          tp: Number(p.tp),
          profit: Number(p.profit),
          magic: Number(p.magic || 20260118),
          openTime: p.openTime || new Date().toISOString(),
        })));
      }

      res.json({ status: "ok", processed: positions.length });
    } catch (err: unknown) {
      console.error("EA positions handler error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
