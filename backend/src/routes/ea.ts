import { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { generateMql5Code } from "../services/ea-generator";
import { TradeConfig } from "../types";
import { requireApiKey } from "../middleware/auth";

export function registerEaRoutes(
  app: any,
  getStatus: () => any,
  getConfig: () => TradeConfig,
  onTick: (data: any, clientIp?: string) => void,
  getPendingEaCommand?: () => { action: string; lot: number; sl: number; tp: number } | null,
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

      res.setHeader("Content-Disposition", "attachment; filename=StepIndex_AI_Scalper_EA.mq5");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(mql5Code);
    } catch (err: any) {
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
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch generator source" });
    }
  });

  app.post("/api/ea/tick", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
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
      onTick(payload, clientIp);
      const status = getStatus();
      const pendingCmd = getPendingEaCommand ? getPendingEaCommand() : null;

      res.json({
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
        pendingAction: pendingCmd ? pendingCmd.action : "NONE",
        pendingLot: pendingCmd ? pendingCmd.lot : 0,
        pendingSL: pendingCmd ? pendingCmd.sl : 0,
        pendingTP: pendingCmd ? pendingCmd.tp : 0,
      });
    } catch (err: any) {
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
}
