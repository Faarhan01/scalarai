import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import { corsMiddleware } from "./middleware/cors";
import { loggerMiddleware } from "./middleware/logger";
import { errorMiddleware } from "./middleware/error";
import { registerEaRoutes } from "./routes/ea";
import { registerMarketRoutes } from "./routes/market";
import { registerSettingsRoutes } from "./routes/settings";
import { registerTradeRoutes } from "./routes/trades";
import { registerAiRoutes } from "./routes/ai";
import { registerMcpRoute } from "./routes/mcp";
import { registerStatusRoute } from "./routes/status";
import { registerHealthRoutes } from "./routes/health";
import { registerStrategyRoutes } from "./routes/strategies";
import { createBridgeServer } from "./websockets/bridge";
import { createDashboardServer } from "./websockets/dashboard";
import { AppStore } from "./services/app-store";
import { closeSimulatedPosition } from "./services/trade-execution";
import { TradeRecord } from "./types";
import { getSymbolState } from "./services/market-ingestion";
import { scalarAiDb } from "./db";
import { rateLimit } from "./middleware/rateLimit";

dotenv.config();
process.env.PORT = process.env.PORT || "3000";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(corsMiddleware);
app.use(loggerMiddleware);
app.use(errorMiddleware);
app.use(rateLimit());

const store = new AppStore();

async function startServer() {
  store.loadFromDb();

  setInterval(() => {
    store.runBackgroundAnalysisWorker();
  }, 300000);

  setInterval(() => {
    try {
      const cleanup = scalarAiDb.cleanupOldData();
      if (cleanup.deletedTicks > 0 || cleanup.deletedLogs > 0) {
        store.addLog("SERVER", "INFO", `Database cleanup: removed ${cleanup.deletedTicks} old ticks, ${cleanup.deletedLogs} old logs`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      store.addLog("SERVER", "ERROR", `Database cleanup failed: ${message}`);
    }
  }, 3600000);

  registerEaRoutes(app, store.getFullStatusPayload.bind(store), () => store.config, store.updateMarket.bind(store), store.getPendingEaCommands.bind(store), store.handleEaConfirmation.bind(store), store.handleEaPositionsReport.bind(store), undefined, store.handleEaLogs.bind(store));
  registerMarketRoutes(
    app,
    store.updateMarket.bind(store),
    () => store.config,
    store.ingestBulkCandles.bind(store),
    () => store.getActiveSymbol()
  );
  registerSettingsRoutes(
    app,
    (params) => store.updateSettings(params),
    () => store.config,
    () => store.getWebRequestTest(),
    () => {
      store.updateWebRequestTest({ status: "pending", triggerTest: true, lastTested: new Date().toISOString(), details: "Verification probe initiated. Waiting for MT5 bridge..." });
      store.broadcastToDashboards({ type: "webrequest_test", testState: store.getWebRequestTest() });
    },
    (report) => {
      store.updateWebRequestTest({ status: report.status as "idle" | "pending" | "success" | "failed", error: report.error || "", details: report.details || "", lastTested: new Date().toISOString(), triggerTest: false });
      store.broadcastToDashboards({ type: "webrequest_test", testState: store.getWebRequestTest() });
      store.addLog("SERVER", report.status === "success" ? "SUCCESS" : "WARNING", `WebRequest verification report: ${report.status.toUpperCase()} - ${report.details}`);
    },
    process.env.SCALARAI_MCP_API_KEY
  );
  registerTradeRoutes(app, (isActive: boolean) => store.toggleTrading(isActive), () => store.resetStats(), process.env.SCALARAI_MCP_API_KEY);
  registerAiRoutes(app, () => ({
    status: store.getAiKnowledgeBase().totalObservations >= 20 ? "optimized" : "calibrating",
    message: store.getAiKnowledgeBase().totalObservations >= 20 ? "Quantitative baseline calibrated." : "AI is analyzing market speed baseline... Awaiting sufficient expert data stream from MetaTrader 5 terminal.",
    count: store.getAiKnowledgeBase().totalObservations,
    aiKnowledgeBase: store.getAiKnowledgeBase(),
    aiSynthesizedStrategy: store.getAiSynthesizedStrategy(),
    candleStream: getSymbolState(store.getSymbolStates(), store.getActiveSymbol()).ticks,
    averageVelocity: store.getAiKnowledgeBase().globalAverageSpeed,
  }));
  registerMcpRoute(app, store.buildMcpContext(), process.env.SCALARAI_MCP_API_KEY);
  registerStatusRoute(
    app,
    store.getFullStatusPayload.bind(store),
    (symbol: string) => {
      store.switchSymbol(symbol);
    },
    store.getAndClearPendingOrders.bind(store),
    process.env.SCALARAI_MCP_API_KEY
  );
  registerHealthRoutes(app);
  registerStrategyRoutes(app);

  app.all("/api/*", (req: Request, res: Response) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      root: path.resolve(process.cwd(), "frontend"),
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Step Index Scalper full-stack server running on http://localhost:${PORT}`);
  });

  const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:5173";

  createBridgeServer(
    server,
    (ws: WebSocket, rawMsg: string) => {
      try {
        const message = JSON.parse(rawMsg.toString());
        if (message.client) store.addLog("SERVER", "SUCCESS", `Bridge client registered: ${message.client} | Status: ${message.status}`);
        if (message.type === "request_history") {
          const symbol = message.payload?.symbol || "Step Index";
          const candles = scalarAiDb.getCandles(symbol, undefined, undefined, 1000);
          ws.send(JSON.stringify({ type: "history_response", payload: { symbol, candles, count: candles.length } }));
        }
      } catch {
        // Ignore malformed bridge messages
      }
    },
    (ws: WebSocket) => {
      store.addBridgeClient(ws);
    },
    (ws: WebSocket) => {
      store.removeBridgeClient(ws);
    },
    allowedOrigin
  );

  createDashboardServer(
    server,
    () => JSON.stringify({ type: "init", payload: store.getFullStatusPayload() }),
    (ws: WebSocket, rawMsg: string) => {
      try {
        const msg = JSON.parse(rawMsg.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", clientTime: msg.clientTime, serverTime: Date.now() }));
        } else if (msg.type === "toggle_trade") {
          store.toggleTrading(!store.config.isActive);
        } else if (msg.type === "close_all") {
          const tradeState = store.buildTradeState();
          store.trades.forEach((t: TradeRecord) => {
            if (t.status === "OPEN") closeSimulatedPosition(tradeState, t, "Closed from remote web dashboard.", store);
          });
          store.broadcastTradesUpdate();
        } else if (msg.type === "reset_stats") {
          store.resetStats();
        } else if (msg.type === "request_history") {
          const symbol = msg.payload?.symbol || "Step Index";
          const from = msg.payload?.from ? Number(msg.payload.from) : undefined;
          const to = msg.payload?.to ? Number(msg.payload.to) : undefined;
          const limit = Math.min(Number(msg.payload?.limit) || 1000, 10000);
          const candles = scalarAiDb.getCandles(symbol, from, to, limit);
          ws.send(JSON.stringify({ type: "history_response", payload: { symbol, candles, count: candles.length, from: from || null, to: to || null } }));
        }
      } catch {
        // Ignore malformed dashboard messages
      }
    },
    (ws: WebSocket) => {
      store.addDashboardClient(ws);
    },
    (ws: WebSocket) => {
      store.removeDashboardClient(ws);
    },
    allowedOrigin
  );

  process.on("uncaughtException", (err) => {
    store.addLog("SERVER", "ERROR", `Uncaught exception: ${err.message || err}`);
  });

  process.on("unhandledRejection", (reason) => {
    store.addLog("SERVER", "ERROR", `Unhandled rejection: ${reason}`);
  });
}

startServer();
