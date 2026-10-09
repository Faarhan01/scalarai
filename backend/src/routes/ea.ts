import { Request, Response, NextFunction, Application } from "express";
import path from "path";
import fs from "fs";
import { generateMql5Code } from "../services/ea-generator";
import { saveCustomEaTemplate, resetCustomEaTemplate, isCustomTemplateActive, getCustomTemplateStatus } from "../services/ea-remote-update";
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

      const firstPending = pendingCommands.length > 0 ? pendingCommands[0] : null;

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
        // Legacy single-command backward-compatibility for all existing EAs:
        pendingAction: firstPending ? firstPending.action : "NONE",
        pendingLot: firstPending ? firstPending.lot : 0,
        pendingSL: firstPending ? firstPending.sl : 0,
        pendingTP: firstPending ? firstPending.tp : 0,
        pendingTicket: firstPending ? firstPending.ticket : 0,
        // Modern multi-command batch for v3+ EAs:
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
            mt5Ticket: c.mt5Ticket !== undefined ? Number(c.mt5Ticket) : undefined,
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
      const queryUrl = (req.query.url as string)?.trim();
      let appUrl = queryUrl || `${req.protocol}://${req.get("host")}`;
      appUrl = appUrl.replace(/\/$/, "");
      if (!appUrl) appUrl = "http://127.0.0.1:3000";

      const currentConfig = getConfig();
      const code = generateMql5Code(appUrl, currentConfig);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(code);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to fetch EA code" });
    }
  });

  app.get("/api/ea/install-script", (req: Request, res: Response) => {
    try {
      const queryUrl = (req.query.url as string)?.trim();
      let appUrl = queryUrl || `${req.protocol}://${req.get("host")}`;
      appUrl = appUrl.replace(/\/$/, "");
      if (!appUrl) appUrl = "http://127.0.0.1:3000";

      const script = `@echo off
setlocal enabledelayedexpansion
title Scalar AI - MT5 EA Auto-Installer
echo ====================================================
echo        Scalar AI MT5 Expert Advisor Auto-Installer
echo ====================================================
echo.
echo Searching for MetaTrader 5 Experts directory...
set "TARGET_DIR="

for /d %%D in ("%APPDATA%\\MetaQuotes\\Terminal\\*") do (
    if exist "%%D\\MQL5\\Experts" (
        set "TARGET_DIR=%%D\\MQL5\\Experts"
    )
)

if "!TARGET_DIR!"=="" (
    echo [NOTICE] Standard MT5 directory not found in APPDATA.
    echo Saving ScalarAI_MultiAsset_EA.mq5 to current directory...
    set "TARGET_DIR=%CD%"
) else (
    echo [FOUND] MT5 Experts directory:
    echo "!TARGET_DIR!"
)

echo.
echo Downloading latest EA from ${appUrl}...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('${appUrl}/api/ea/download', '!TARGET_DIR!\\ScalarAI_MultiAsset_EA.mq5')"

if exist "!TARGET_DIR!\\ScalarAI_MultiAsset_EA.mq5" (
    echo.
    echo ====================================================
    echo [SUCCESS] ScalarAI_MultiAsset_EA.mq5 installed!
    echo ====================================================
    echo.
    echo NEXT STEPS:
    echo 1. Open MetaTrader 5
    echo 2. Open Tools -^> Options -^> Expert Advisors
    echo    - Check "Allow WebRequest for listed URL"
    echo    - Add URL: ${appUrl}
    echo 3. In MT5 Navigator window, right-click "Experts" and click "Refresh"
    echo 4. Drag "ScalarAI_MultiAsset_EA" onto your chart!
    echo.
) else (
    echo.
    echo [ERROR] Download failed. Please download the .mq5 file directly from the web dashboard.
)
pause
`;
      res.setHeader("Content-Disposition", "attachment; filename=Install_ScalarAI_EA.bat");
      res.setHeader("Content-Type", "application/x-bat; charset=utf-8");
      res.send(script);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to generate installer script" });
    }
  });

  app.get("/api/ea/install-powershell", (req: Request, res: Response) => {
    try {
      const queryUrl = (req.query.url as string)?.trim();
      let appUrl = queryUrl || `${req.protocol}://${req.get("host")}`;
      appUrl = appUrl.replace(/\/$/, "");
      if (!appUrl) appUrl = "http://127.0.0.1:3000";

      const psScript = `# Scalar AI - MetaTrader 5 Expert Advisor Installer
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "    Scalar AI MT5 Expert Advisor PowerShell Setup   " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""

$appUrl = "${appUrl}"
$eaDownloadUrl = "$appUrl/api/ea/download"
$eaFileName = "ScalarAI_MultiAsset_EA.mq5"

Write-Host "Searching for MetaTrader 5 Terminal directories in APPDATA..." -ForegroundColor Yellow
$terminalBase = Join-Path $env:APPDATA "MetaQuotes\\Terminal"
$installedPaths = @()

if (Test-Path $terminalBase) {
    $dirs = Get-ChildItem -Path $terminalBase -Directory
    foreach ($dir in $dirs) {
        $expertsPath = Join-Path $dir.FullName "MQL5\\Experts"
        if (Test-Path $expertsPath) {
            $destFile = Join-Path $expertsPath $eaFileName
            try {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                Invoke-WebRequest -Uri $eaDownloadUrl -OutFile $destFile -UseBasicParsing
                Write-Host "[SUCCESS] Installed EA to: $destFile" -ForegroundColor Green
                $installedPaths += $destFile
            } catch {
                Write-Host "[WARNING] Could not write to $destFile : $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
}

if ($installedPaths.Count -eq 0) {
    $localDest = Join-Path (Get-Location) $eaFileName
    Write-Host "[NOTICE] Standard APPDATA MT5 folder not found. Downloading to current folder: $localDest" -ForegroundColor Yellow
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $eaDownloadUrl -OutFile $localDest -UseBasicParsing
    Write-Host "[SUCCESS] Saved EA to: $localDest" -ForegroundColor Green
    Write-Host "Please manually copy $eaFileName to your MT5 'MQL5\\Experts' folder." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "NEXT STEPS IN METATRADER 5:" -ForegroundColor Green
Write-Host "1. In MT5, open Tools -> Options -> Expert Advisors"
Write-Host "2. Check 'Allow WebRequest for listed URL'"
Write-Host "3. Add this exact URL: $appUrl" -ForegroundColor Cyan
Write-Host "4. Check 'Allow Algo Trading'"
Write-Host "5. Open Navigator (Ctrl+N), right-click 'Experts' -> 'Refresh'"
Write-Host "6. Drag 'ScalarAI_MultiAsset_EA' onto your Step Index chart!"
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host -Prompt "Press Enter to exit"
`;
      res.setHeader("Content-Disposition", "attachment; filename=Install_ScalarAI_EA.ps1");
      res.setHeader("Content-Type", "application/x-powershell; charset=utf-8");
      res.send(psScript);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to generate PowerShell installer script" });
    }
  });

  app.get("/api/ea/template-status", (req: Request, res: Response) => {
    try {
      const status = getCustomTemplateStatus();
      res.json(status);
    } catch (err: unknown) {
      res.status(500).json({ error: "Failed to read template status" });
    }
  });

  app.post("/api/ea/reset", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
    try {
      const reset = resetCustomEaTemplate();
      if (reset) {
        res.json({ status: "ok", message: "EA template reset to official production master code." });
      } else {
        res.status(500).json({ error: "Failed to reset EA template" });
      }
    } catch (err: unknown) {
      console.error("EA template reset error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/ea/code", authMiddleware || ((req: Request, res: Response, next: NextFunction) => next()), (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const code = typeof body.code === "string" ? body.code : "";
      
      const saveResult = saveCustomEaTemplate(code);
      if (!saveResult.success) {
        return res.status(400).json({ error: `Custom EA rejected: ${saveResult.error}` });
      }

      res.json({ status: "ok", message: "EA code validated and saved. Next download will use this version." });
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
