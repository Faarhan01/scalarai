import { Request, Response } from "express";
import path from "path";
import fs from "fs";

export function registerEaRoutes(app: any, getStatus: () => any, onTick: (data: any) => void) {
  app.get("/api/ea/download", (req: Request, res: Response) => {
    const queryUrl = (req.query.url as string)?.trim();
    let appUrl = queryUrl || "http://127.0.0.1:3000";
    appUrl = appUrl.replace(/\/$/, "");
    if (!appUrl) appUrl = "http://127.0.0.1:3000";
    res.setHeader("Content-Disposition", "attachment; filename=StepIndex_AI_Scalper_EA.mq5");
    res.setHeader("Content-Type", "text/plain");
    res.send(`// MQL5 EA placeholder for ${appUrl}`);
  });

  app.get("/api/ea/generator-source", (req: Request, res: Response) => {
    res.status(404).json({ error: "mql5_generator.ts file not found" });
  });

  app.post("/api/ea/tick", (req: Request, res: Response) => {
    console.log("MT5 WebRequest received. Body:", JSON.stringify(req.body), "Headers:", req.headers);
    const { account, broker, balance, profit, bid, ask, strategy, version } = req.body;
    if (account) {
      const originIp = req.ip || "127.0.0.1";
      onTick(req.body);
      res.json({
        isActive: false,
        selectedStrategy: "TREND_FOLLOWING",
        lotSize: 0.1,
        takeProfitPoints: 300,
        stopLossPoints: 150,
        trailingStopPoints: 100,
        useTrailingStop: true,
        pendingAction: "NONE",
        pendingLot: 0.1,
        pendingSL: 150,
        pendingTP: 300,
      });
    } else {
      res.status(400).json({ error: "Missing account info" });
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
