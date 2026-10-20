import { Request, Response, Application } from "express";
import { GatewayManager } from "./gateway-manager";
import { mt5Bridge } from "./mt5-bridge";
import path from "path";
import { scalarAiDb } from "../db";
import fs from "fs";

export function registerGatewayRoutes(app: Application, gateway: GatewayManager) {
   // 1. Direct MT5 Python Bridge Status
   app.get("/api/gateway/bridge/status", async (req: Request, res: Response) => {
     try {
       const status = await mt5Bridge.getStatus();
       res.json(status);
     } catch (err: any) {
       res.status(500).json({ success: false, error: err.message });
     }
   });

  // 2. Direct MT5 Python Bridge Connect
  app.post("/api/gateway/bridge/connect", async (req: Request, res: Response) => {
    try {
      const result = await mt5Bridge.connect(req.body || {});
      await gateway.syncFromMt5Bridge();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Direct MT5 Python Bridge Disconnect
  app.post("/api/gateway/bridge/disconnect", async (req: Request, res: Response) => {
    try {
      const result = await mt5Bridge.disconnect();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Direct MT5 Account Info
  app.get("/api/gateway/bridge/account", async (req: Request, res: Response) => {
    try {
      const result = await mt5Bridge.getAccount();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Direct MT5 Terminal Info
  app.get("/api/gateway/bridge/terminal", async (req: Request, res: Response) => {
    try {
      const result = await mt5Bridge.getTerminal();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. Direct MT5 Positions
  app.get("/api/gateway/bridge/positions", async (req: Request, res: Response) => {
    try {
      const result = await mt5Bridge.getPositions();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7. Direct MT5 Deals History
  app.get("/api/gateway/bridge/deals", async (req: Request, res: Response) => {
    try {
      const days = Number(req.query.days || 30);
      const result = await mt5Bridge.getHistoryDeals(days);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Direct MT5 Symbols (All symbols provided by broker via mt5_pkg_bridge)
  app.get("/api/gateway/bridge/symbols", async (req: Request, res: Response) => {
    try {
      const group = req.query.group as string | undefined;
      const cached = gateway.getCachedBrokerSymbols();

      // Serve the catalogue from cache and refresh it in the background.
      // Reading all 731 symbols from the broker takes about 640 ms, and doing
      // that on every request put the cost on the bridge worker and made the
      // symbol page feel broken. The background sync keeps the cache warm.
      if (cached && cached.length > 0) {
        if (gateway.brokerSymbolsAgeMs() > 20000) {
          gateway.refreshBrokerSymbolsInBackground();
        }
        return res.json({
          success: true,
          count: cached.length,
          symbols: cached,
          source: "cache",
          age_ms: Math.round(gateway.brokerSymbolsAgeMs()),
        });
      }

      const result = await mt5Bridge.getSymbols(group);
      if (result && result.success && Array.isArray(result.symbols) && result.symbols.length > 0) {
        gateway.setCachedBrokerSymbols(result.symbols);
        return res.json(result);
      }
      if (cached && cached.length > 0) {
        return res.json({ success: true, count: cached.length, symbols: cached, source: "cached" });
      }
      const dbSymbols = scalarAiDb.getKnownSymbols();
      return res.json({
        success: true,
        count: dbSymbols.length,
        symbols: dbSymbols.map(s => ({ name: s, description: s, path: "Broker/" + s, trade_mode: 4, _trade_mode: "Full" })),
        source: "database",
        is_connected: gateway.isConnected(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Direct MT5 Symbol Info
  app.get("/api/gateway/bridge/symbol_info", async (req: Request, res: Response) => {
    try {
      const symbol = (req.query.symbol as string) || gateway.getActiveSymbol();
      if (!symbol) return res.status(400).json({ success: false, error: "Symbol is required" });
      const result = await mt5Bridge.getSymbolInfo(symbol);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Direct MT5 Rates / Candlestick bars
  app.get("/api/gateway/bridge/rates", async (req: Request, res: Response) => {
    try {
      const symbol = (req.query.symbol as string) || gateway.getActiveSymbol() || "Step Index";
      const timeframe = Number(req.query.timeframe || 1);
      const count = Number(req.query.count || 100);
      const result = await mt5Bridge.getRates(symbol, timeframe, count);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Direct MT5 Tick
  app.get("/api/gateway/bridge/tick", async (req: Request, res: Response) => {
    try {
      const symbol = (req.query.symbol as string) || gateway.getActiveSymbol() || "Step Index";
      const result = await mt5Bridge.getTick(symbol);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Direct Broker symbols alias
  app.get(["/api/symbols", "/api/broker/symbols"], async (req: Request, res: Response) => {
    try {
      const group = req.query.group as string | undefined;
      const bridgeSyms = await mt5Bridge.getSymbols(group);
      if (bridgeSyms && bridgeSyms.success && Array.isArray(bridgeSyms.symbols) && bridgeSyms.symbols.length > 0) {
        gateway.setCachedBrokerSymbols(bridgeSyms.symbols);
        return res.json(bridgeSyms);
      }
      const cached = gateway.getCachedBrokerSymbols();
      if (cached && cached.length > 0) {
        return res.json({ success: true, count: cached.length, symbols: cached });
      }
      const known = scalarAiDb.getKnownSymbols();
      return res.json({
        success: true,
        count: known.length,
        symbols: known.map(s => ({ name: s, description: s, path: "Broker/" + s })),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8. Trigger Bridge Sync
  app.post("/api/gateway/bridge/sync", async (req: Request, res: Response) => {
    try {
      const status = await gateway.syncFromMt5Bridge();
      res.json({ success: true, status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8b. Auto-discovered MT5 Bridge Functions
  app.get("/api/gateway/bridge/functions", async (req: Request, res: Response) => {
    try {
      const result = await mt5Bridge.listFunctions();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8c. Dynamic MT5 Function Execution
  app.post("/api/gateway/bridge/call", async (req: Request, res: Response) => {
    try {
      const { function: funcName, name, args = [], kwargs = {} } = req.body || {};
      const targetFunc = funcName || name;
      if (!targetFunc) {
        return res.status(400).json({ success: false, error: "Missing required 'function' parameter" });
      }
      const result = await mt5Bridge.executeFunction(targetFunc, args, kwargs);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8d. Direct MT5 Pending Orders
  app.get("/api/gateway/bridge/orders", async (req: Request, res: Response) => {
    try {
      const symbol = req.query.symbol as string;
      const result = await mt5Bridge.getOrders(symbol);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8e. Direct MT5 Position Modification
  app.post("/api/gateway/bridge/modify", async (req: Request, res: Response) => {
    try {
      const { ticket, sl, tp } = req.body || {};
      if (!ticket) {
        return res.status(400).json({ success: false, error: "Missing required 'ticket' parameter" });
      }
      const result = await mt5Bridge.modifyPosition(ticket, sl, tp);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8f. Direct MT5 Market Depth (Order Book)
  app.get("/api/gateway/bridge/marketbook/:symbol", async (req: Request, res: Response) => {
    try {
      const symbol = req.params.symbol;
      const result = await mt5Bridge.getMarketBook(symbol);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8g. Direct MT5 Totals
  app.get("/api/gateway/bridge/totals", async (req: Request, res: Response) => {
    try {
      const result = await mt5Bridge.getTotals();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 9. Legacy Heartbeat (kept for backward compatibility)
  app.post("/api/gateway/heartbeat", (req: Request, res: Response) => {
    try {
      const result = gateway.handleHeartbeat(req.body);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 10. Real-time Tick Ingestion
  app.post("/api/gateway/ticks", (req: Request, res: Response) => {
    try {
      const result = gateway.handleTick(req.body);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 11. Command Polling
  app.get("/api/gateway/commands", (req: Request, res: Response) => {
    try {
      const symbol = req.query.symbol as string;
      const magic = req.query.magic ? Number(req.query.magic) : undefined;
      const commands = gateway.getPendingCommands(symbol, magic);
      res.json({ commands, count: commands.length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 12. Execution Confirmation
  app.post("/api/gateway/confirm", (req: Request, res: Response) => {
    try {
      const result = gateway.handleConfirmation(req.body);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13. Open Positions Sync
  app.post("/api/gateway/positions", (req: Request, res: Response) => {
    try {
      const result = gateway.handlePositions(req.body);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 14. Closed Deals History Sync
  // OHLCV bars pushed by the EA
  app.post("/api/gateway/bars", (req: Request, res: Response) => {
    try {
      const result = gateway.handleBars(req.body);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/gateway/history", (req: Request, res: Response) => {
    try {
      const result = gateway.handleHistory(req.body);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 15. Gateway Status (combined bridge & platform telemetry)
  app.get("/api/gateway/status", (req: Request, res: Response) => {
    try {
      const status = gateway.getStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 16. Order Dispatch via Bridge
  app.post("/api/gateway/order", async (req: Request, res: Response) => {
    try {
      const { action, symbol, volume, sl, tp, ticket, reason } = req.body || {};
      if (!action) {
        return res.status(400).json({ error: "Missing required 'action' field (BUY, SELL, CLOSE, CLOSE_ALL, MODIFY)" });
      }
      const queued = await gateway.queueOrderCommand({
        action,
        symbol,
        volume: Number(volume) || 0.1,
        sl: sl !== undefined ? Number(sl) : undefined,
        tp: tp !== undefined ? Number(tp) : undefined,
        ticket,
        reason,
      });
      res.json({ success: true, ...queued });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 17. StrategyForge Download
  const handleStrategyForgeDownload = (req: Request, res: Response) => {
    const candidates = [
      path.resolve(process.cwd(), "ea", "StrategyForge.mq5"),
      path.resolve(process.cwd(), "backend", "src", "gateway", "mt5", "tools", "mql5", "StrategyForge.mq5"),
    ];
    let sfPath = "";
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        sfPath = c;
        break;
      }
    }
    if (!sfPath) {
      return res.status(404).send("StrategyForge.mq5 not found on server.");
    }
    res.setHeader("Content-Disposition", 'attachment; filename="StrategyForge.mq5"');
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    fs.createReadStream(sfPath).pipe(res);
  };

  app.get("/api/strategyforge/download", handleStrategyForgeDownload);
  app.get("/api/gateway/strategyforge/download", handleStrategyForgeDownload);
  // Default EA download points to StrategyForge
  app.get("/api/ea/download", handleStrategyForgeDownload);
  app.get("/api/gateway/ea/download", handleStrategyForgeDownload);
}
