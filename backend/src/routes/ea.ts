import { Request, Response, NextFunction, Application } from "express";
import path from "path";
import fs from "fs";
import { generateMql5Code } from "../services/ea-generator";
import { saveCustomEaTemplate } from "../services/ea-remote-update";
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

  app.get("/api/ea/download", (req: Request, res: Response) => {
    try {
      const queryUrl = (req.query.url as string)?.trim();
      let appUrl = queryUrl || `${req.protocol}://${req.get("host")}`;
      appUrl = appUrl.replace(/\/$/, "");
      if (!appUrl) appUrl = "http://127.0.0.1:3000";

      const currentConfig = getConfig();
      const mql5Code = generateMql5Code(appUrl, currentConfig);

      res.setHeader("Content-Disposition", "attachment; filename=ScalarAI_MultiAsset_EA.mq5");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(mql5Code);
    } catch (err: unknown) {
      console.error("EA download generator error:", err);
      res.status(500).send("// Failed to generate MQL5 EA");
    }
  });

  app.get("/api/ea/generator-source", (req: Request, res: Response) => {
    try {
      const currentConfig = getConfig();
      const appUrl = `${req.protocol}://${req.get("host")}`;
      const code = generateMql5Code(appUrl, currentConfig);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(code);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch generator source" });
    }
  });

  app.post("/api/ea/tick", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const account = body.account;
      if (!account || typeof account !== "string" || account.trim() === "") {
        return res.status(400).json({ error: "Missing account info" });
      }

      const symbol = body.symbol || "Step Index";
      const digits = body.digits !== undefined ? Number(body.digits) : null;
      const tickSize = body.tickSize !== undefined ? Number(body.tickSize) : null;
      
      if (digits !== null && (!Number.isInteger(digits) || digits < 0)) {
        return res.status(400).json({ error: "Invalid digits" });
      }
      if (tickSize !== null && (!isFinite(tickSize) || tickSize <= 0)) {
        return res.status(400).json({ error: "Invalid tickSize" });
      }

      const payload = {
        ...body,
        symbol,
        digits,
        tickSize,
        description: body.description || undefined,
      };

      const clientIp = (req as any).ip || (req as any).socket?.remoteAddress || "127.0.0.1";
      await onTick(payload, clientIp);
      const status = getStatus();
      const pendingCommands = getPendingEaCommands ? getPendingEaCommands() : [];

      const responsePayload: any = {
        isActive: status.config.isActive,
        selectedStrategy: status.config.selectedStrategy,
        lotSize: status.config.lotSize,
        takeProfitPoints: status.config.takeProfitPoints,
        stopLossPoints: status.config.stopLossPoints,
        trailingStopPoints: status.config.trailingStopPoints,
        useTrailingStop: status.config.useTrailingStop,
        maxTrades: status.config.maxTrades,
        tradingMode: status.config.tradingMode,
        isAiModeEnabled: status.config.isAiModeEnabled,
        selectedAssets: status.config.selectedAssets,
        pendingCommands: pendingCommands.map(cmd => {
          const base: any = {
            action: cmd.action,
            lot: cmd.lot,
            sl: cmd.sl,
            tp: cmd.tp,
            ticket: cmd.ticket,
            symbol: cmd.symbol,
            reason: cmd.reason,
            id: cmd.id,
          };
          if (cmd.action === "CONFIG_UPDATE") {
            base.configUpdate = (cmd as any).configUpdate;
          }
          return base;
        }),
      };
      
      res.json(responsePayload);
    } catch (err: unknown) {
      console.error("EA tick handler error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/ea/template", (req: Request, res: Response) => {
    const templateCode = `<chart>
id=134262721989799627
symbol=Step Index
description=Equal probability of up/down with fixed step size of 0.1
period_type=0
period_size=1
digits=1
tick_size=0.000000
position_time=1781804820
scale_fix=0
scale_fixed_min=7953.456657
scale_fixed_max=7958.686686
scale_fix11=0
scale_bar=0
scale_bar_val=1.000000
scale=32
mode=1
fore=0
grid=0
volume=0
scroll=1
shift=1
shift_size=37.550471
fixed_pos=0.000000
ticker=1
ohlc=0
one_click=0
one_click_btn=1
bidline=1
askline=0
lastline=0
days=0
descriptions=0
tradelines=1
tradehistory=0
window_left=-49
window_top=-16
window_right=1354
window_bottom=369
window_type=1
floating=0
floating_left=0
floating_top=0
floating_right=0
floating_bottom=0
floating_type=1
floating_toolbar=1
floating_tbstate=
background_color=4294967295
foreground_color=4294967295
barup_color=8125265
bardown_color=5592575
bullcandle_color=8125265
bearcandle_color=5264367
chartline_color=8125265
volumes_color=7451452
grid_color=4294967295
bidline_color=14772545
askline_color=16356285
lastline_color=9305073
stops_color=5264367
windows_total=1

<window>
height=100.000000
objects=1

<indicator>
name=Main
path=
apply=1
show_data=1
scale_inherit=0
scale_line=0
scale_line_percent=50
scale_line_value=0.000000
scale_fix_min=0
scale_fix_min_val=0.000000
scale_fix_max=0
scale_fix_max_val=0.000000
expertmode=0
fixed_height=-1
</indicator>
<object>
type=102
name=Spread&Bar
hidden=1
descr=Spread: 8.. Next Bar in 01:15
color=10777186
selectable=0
angle=0
pos_x=10
pos_y=2
fontsz=10
fontnm=Courier
anchorpos=4
refpoint=2
</object>

</window>
</chart>`;

    res.setHeader("Content-Disposition", "attachment; filename=step_index_chart.tpl");
    res.setHeader("Content-Type", "text/plain");
    res.send(templateCode);
  });

  app.post("/api/ea/confirm", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const confirmations = Array.isArray(body.confirmations) ? body.confirmations : [body];
      
      if (onEaConfirmation) {
        confirmations.forEach((c: any) => {
          onEaConfirmation({
            action: c.action,
            ticket: Number(c.ticket),
            success: Boolean(c.success),
            error: c.error || "",
            symbol: c.symbol || "Step Index",
            magic: Number(c.magic || 20260617),
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
          magic: Number(p.magic || 20260617),
          openTime: p.openTime || new Date().toISOString(),
        })));
      }
      
      res.json({ status: "ok", processed: positions.length });
    } catch (err: unknown) {
      console.error("EA positions handler error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/ea/version", (req: Request, res: Response) => {
    try {
      const code = generateMql5Code();
      const versionMatch = code.match(/#property\s+version\s+"([^"]+)"/);
      const version = versionMatch ? versionMatch[1] : "unknown";
      res.json({ version });
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch EA version" });
    }
  });

  app.get("/api/ea/code", (req: Request, res: Response) => {
    try {
      const code = generateMql5Code();
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(code);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch EA code" });
    }
  });

  app.post("/api/ea/code", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const code = typeof body.code === "string" ? body.code : "";
      
      if (!code || code.trim().length < 50) {
        return res.status(400).json({ error: "EA code appears too short or missing." });
      }

      const saved = saveCustomEaTemplate(code);
      
      if (!saved) {
        return res.status(500).json({ error: "Failed to persist EA code on server." });
      }

      res.json({ status: "ok", message: "EA code updated. Next download will use this version." });
    } catch (err: unknown) {
      console.error("EA code update error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/ea/config", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const config = body.config || body;
      
      if (!config || typeof config !== "object") {
        return res.status(400).json({ error: "Missing config object" });
      }

      if (queueEaConfigUpdate) {
        queueEaConfigUpdate(config as Record<string, unknown>);
      }
      
      res.json({ status: "ok", message: "Config update queued for EA." });
    } catch (err: unknown) {
      console.error("EA config update error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/ea/logs", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const logs = Array.isArray(body.logs) ? body.logs : [];
      
      if (onEaLogs) {
        onEaLogs(
          logs.map((log: any) => ({
            level: log.level || "INFO",
            message: typeof log.message === "string" ? log.message : String(log.message || ""),
            timestamp: log.timestamp || new Date().toISOString(),
            source: "EA",
          }))
        );
      }
      
      res.json({ status: "ok", processed: logs.length });
    } catch (err: unknown) {
      console.error("EA logs handler error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
