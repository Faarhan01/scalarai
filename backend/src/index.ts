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

  registerEaRoutes(app, store.getFullStatusPayload.bind(store), () => store.tradeConfig, store.updateMarket.bind(store), store.getPendingEaCommand.bind(store), process.env.SCALARAI_MCP_API_KEY);
  registerMarketRoutes(app, store.updateMarket.bind(store), () => store.tradeConfig, process.env.SCALARAI_MCP_API_KEY);
  registerSettingsRoutes(
    app,
    (params) => store.updateSettings(params),
    () => store.tradeConfig,
    () => store.webRequestTest,
    () => {
      store.webRequestTest.status = "pending";
      store.webRequestTest.triggerTest = true;
      store.webRequestTest.lastTested = new Date().toISOString();
      store.webRequestTest.details = "Verification probe initiated. Waiting for MT5 bridge...";
      store.broadcastToDashboards({ type: "webrequest_test", testState: store.webRequestTest });
    },
    (report) => {
      store.webRequestTest.status = report.status as any;
      store.webRequestTest.error = report.error || "";
      store.webRequestTest.details = report.details || "";
      store.webRequestTest.lastTested = new Date().toISOString();
      store.webRequestTest.triggerTest = false;
      store.broadcastToDashboards({ type: "webrequest_test", testState: store.webRequestTest });
      store.addLog("SERVER", report.status === "success" ? "SUCCESS" : "WARNING", `WebRequest verification report: ${report.status.toUpperCase()} - ${report.details}`);
    },
    process.env.SCALARAI_MCP_API_KEY
  );
  registerTradeRoutes(app, (isActive: boolean) => store.toggleTrading(isActive), () => store.resetStats(), process.env.SCALARAI_MCP_API_KEY);
  registerAiRoutes(app, () => ({
    status: store.aiKnowledgeBase.totalObservations >= 20 ? "optimized" : "calibrating",
    message: store.aiKnowledgeBase.totalObservations >= 20 ? "Quantitative baseline calibrated." : "AI is analyzing market speed baseline... Awaiting sufficient expert data stream from MetaTrader 5 terminal.",
    count: store.aiKnowledgeBase.totalObservations,
    aiKnowledgeBase: store.aiKnowledgeBase,
    aiSynthesizedStrategy: store.aiSynthesizedStrategy,
    candleStream: getSymbolState(store.symbolStates, store.activeSymbol).ticks,
    averageVelocity: store.aiKnowledgeBase.globalAverageSpeed,
  }));
  registerMcpRoute(app, store.buildMcpContext(), process.env.SCALARAI_MCP_API_KEY);
  registerStatusRoute(app, store.getFullStatusPayload.bind(store), (symbol: string) => { store.activeSymbol = symbol; }, store.getAndClearPendingOrders.bind(store), process.env.SCALARAI_MCP_API_KEY);
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

  createBridgeServer(server, (ws: WebSocket, rawMsg: string) => {
    try {
      const message = JSON.parse(rawMsg.toString());
      if (message.client) store.addLog("SERVER", "SUCCESS", `Bridge client registered: ${message.client} | Status: ${message.status}`);
    } catch {
      // Ignore malformed bridge messages
    }
  });

  createDashboardServer(server, () => JSON.stringify({ type: "init", payload: store.getFullStatusPayload() }), (ws: WebSocket, rawMsg: string) => {
    try {
      const msg = JSON.parse(rawMsg.toString());
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", clientTime: msg.clientTime, serverTime: Date.now() }));
      } else if (msg.type === "toggle_trade") {
        store.toggleTrading(!store.tradeConfig.isActive);
      } else if (msg.type === "close_all") {
        const tradeState = store.buildTradeState();
        store.tradesList.forEach((t: TradeRecord) => {
          if (t.status === "OPEN") closeSimulatedPosition(tradeState, t, "Closed from remote web dashboard.", store);
        });
        store.broadcastTradesUpdate();
      } else if (msg.type === "reset_stats") {
        store.resetStats();
      }
    } catch {
      // Ignore malformed dashboard messages
    }
  });

  process.on("uncaughtException", (err) => {
    store.addLog("SERVER", "ERROR", `Uncaught exception: ${err.message || err}`);
  });

  process.on("unhandledRejection", (reason) => {
    store.addLog("SERVER", "ERROR", `Unhandled rejection: ${reason}`);
  });
}

startServer();
