import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import { corsMiddleware } from "./middleware/cors";
import { loggerMiddleware } from "./middleware/logger";
import { errorMiddleware } from "./middleware/error";
import { normalizeIp } from "./utils/ip";
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
import { McpContext } from "./types";
import {
  getDefaultTradeConfig,
  getDefaultAiKnowledgeBase,
  getDefaultAiSynthesizedStrategy,
  createSystemLog,
} from "./services/defaults";
import {
  StrategyMode,
  TradeRecord,
  AiSynthesizedStrategy,
  EAConnectionDetails,
  Tick,
  SystemLog,
  FullStatusPayload,
  UpdateMarketPayload,
  TradeConfig,
} from "./types";
import { scalarAiDb } from "./db";
import { evaluateStrategy, buildContext, evaluateStrategyBacktest } from "./services/strategy";
import {
  createSymbolStates,
  getSymbolState,
  updateMarket as updateMarketState,
  aggregateTickIntoCandle,
} from "./services/market-ingestion";
import { rateLimit } from "./middleware/rateLimit";
import {
  loadStateFromDb,
  persistTrade,
  persistLog,
  persistAiKnowledge,
  persistAiStrategy,
  persistSettings,
  persistEaConnection,
} from "./services/state-persistence";
import {
  evaluateSimulatedStrategy,
  openSimulatedPosition,
  closeSimulatedPosition,
  AppCallbacks,
} from "./services/trade-execution";
import {
  AppState,
  buildTradeState,
  loadAiSynthesizedStrategy,
  loadAiKnowledgeBase,
  runBackgroundAnalysisWorker,
  analyzeMarket,
  synthesizeStrategy,
  updateSettings,
  toggleTrading,
  placeTrade,
  closeTrade,
  resetStats,
  buildMcpContext,
} from "./services/app-state";

dotenv.config();
process.env.PORT = process.env.PORT || "3000";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(corsMiddleware);
app.use(loggerMiddleware);
app.use(errorMiddleware);
app.use(rateLimit());

const symbolStates = createSymbolStates("Step Index");

const webRequestTest: {
  status: "idle" | "pending" | "success" | "failed";
  lastTested: string;
  error: string;
  details: string;
  triggerTest: boolean;
} = {
  status: "idle",
  lastTested: "",
  error: "",
  details: "Awaiting first WebRequest test trigger.",
  triggerTest: false,
};

const mt5BridgeClients = new Set<WebSocket>();
const webDashboardClients = new Set<WebSocket>();

const appCallbacks: AppCallbacks = {
  addLog(source: "SERVER" | "EA" | "AI", level: "INFO" | "SUCCESS" | "WARNING" | "ERROR", message: string) {
    const newLog = createSystemLog(source, level, message);
    appState.systemLogs.unshift(newLog);
    if (appState.systemLogs.length > 80) appState.systemLogs.pop();
    persistLog(newLog);
  },
  broadcastToDashboards(payload: unknown) {
    const message = JSON.stringify(payload);
    webDashboardClients.forEach((client: WebSocket) => {
      if (client.readyState === 1) {
        try {
          client.send(message);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.error(`Dashboard broadcast failed: ${reason}`);
        }
      }
    });
  },
  broadcastTradesUpdate() {
    broadcastToDashboards({ type: "trades", trades: appState.tradesList, stats: getFullStatusPayload().stats });
  },
};

const appState: AppState = {
  tradeConfig: getDefaultTradeConfig(),
  tradesList: [],
  systemLogs: [],
  aiKnowledgeBase: getDefaultAiKnowledgeBase(),
  aiSynthesizedStrategy: getDefaultAiSynthesizedStrategy(),
  lastStrategySignal: null,
  symbolStates,
  activeSymbol: "Step Index",
  lastProcessedTelemetryIndex: 0,
  nextTicket: { value: scalarAiDb.getMaxTicket() + 1 },
  latestBuyLockedFromEa: false,
  latestSellLockedFromEa: false,
  pendingBridgeOrders: [],
  pendingEaCommand: null,
  mt5BridgeClients,
};

function getFullStatusPayload(): FullStatusPayload {
  const closedPositions = appState.tradesList.filter((t: TradeRecord) => t.status === "CLOSED");
  const wins = closedPositions.filter((t: TradeRecord) => t.profit > 0).length;
  const totalProfit = closedPositions.reduce((sum: number, t: TradeRecord) => sum + t.profit, 0);
  const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;
  const openPositions = appState.tradesList.filter((t: TradeRecord) => t.status === "OPEN");
  const activeState = getSymbolState(appState.symbolStates, appState.activeSymbol);

  return {
    config: appState.tradeConfig,
    connection: activeState.connection,
    isBridgeConnected: mt5BridgeClients.size > 0,
    logs: appState.systemLogs,
    trades: appState.tradesList,
    history: activeState.connection.isEaConnected ? activeState.ticks.slice(-50) : [],
    candles: activeState.connection.isEaConnected ? activeState.candles.slice(-100) : [],
    status: activeState.connection.isEaConnected ? "active" : "waiting",
    currentPrice: activeState.currentPrice,
    activeSymbol: appState.activeSymbol,
    symbolStates: Array.from(appState.symbolStates.map.entries()).map(([symbol, state]) => ({
      symbol,
      connection: state.connection,
      currentPrice: state.currentPrice,
      tickCount: state.ticks.length,
    })),
    aiSynthesizedStrategy: appState.aiSynthesizedStrategy,
    lastStrategySignal: appState.lastStrategySignal,
    stats: {
      totalProfit: Number(totalProfit.toFixed(2)),
      tradesCount: closedPositions.length,
      winRate: Math.round(winRate),
      activePositionsCount: openPositions.length,
      lastHeartbeatTime: activeState.connection.lastPing,
    },
    webRequestStatus: webRequestTest,
  };
}

function getMinuteBucket(ts: number): number {
  return Math.floor(ts / 60000);
}

function updateMarket(data: UpdateMarketPayload, clientIp?: string) {
  const result = updateMarketState(appState.symbolStates, data);
  const state = result.symbol;
  const symbol = data.symbol || appState.symbolStates.activeSymbol || "Step Index";

  if (result.switched) {
    appCallbacks.addLog("SERVER", "INFO", `Switched active symbol to: ${appState.symbolStates.activeSymbol}`);
  }

  const rawPrice = data.price !== undefined ? Number(data.price) : (data.close !== undefined ? Number(data.close) : state.currentPrice);
  if (!isFinite(rawPrice) || rawPrice <= 0) {
    return;
  }
  const targetPrice = rawPrice;

  const now = Date.now();

  if (state.ticks.length > 0 && Math.abs(targetPrice - state.currentPrice) < 0.0001 && state.telemetry.length > 0) {
    const lastTel = state.telemetry[state.telemetry.length - 1];
    const newVelocity = data.velocity !== undefined ? Number(data.velocity) : lastTel.velocity;
    if (Math.abs(newVelocity - lastTel.velocity) < 0.00001 && data.buyLocked === lastTel.buyLocked && data.sellLocked === lastTel.sellLocked) {
      return;
    }
  }

  const numVelocity = data.velocity !== undefined ? Number(data.velocity) : 0;
  if (!isFinite(numVelocity)) return;

  const isBuyLocked = data.buyLocked !== undefined ? Boolean(data.buyLocked) : false;
  const isSellLocked = data.sellLocked !== undefined ? Boolean(data.sellLocked) : false;
  appState.latestBuyLockedFromEa = isBuyLocked;
  appState.latestSellLockedFromEa = isSellLocked;

  const absVelocity = Math.abs(numVelocity);
  appState.aiKnowledgeBase.totalObservations += 1;
  const obs = appState.aiKnowledgeBase.totalObservations;
  appState.aiKnowledgeBase.globalAverageSpeed = Number((((obs - 1) * appState.aiKnowledgeBase.globalAverageSpeed + absVelocity) / obs).toFixed(4));
  if (absVelocity > appState.aiKnowledgeBase.peakVelocityRegistered) {
    appState.aiKnowledgeBase.peakVelocityRegistered = Number(absVelocity.toFixed(4));
  }
  if (obs % 25 === 0) {
    persistAiKnowledge(appState.aiKnowledgeBase);
  }

  aggregateTickIntoCandle(getSymbolState(appState.symbolStates, appState.activeSymbol), targetPrice);

  if (!getSymbolState(appState.symbolStates, appState.activeSymbol).connection.isEaConnected) {
    appCallbacks.addLog("EA", "SUCCESS", `${symbol} MT5 Expert Advisor linked! Real-time velocity baseline metric: ${numVelocity.toFixed(4)} pt/s.`);
  }

  const activeState = getSymbolState(appState.symbolStates, appState.activeSymbol);
  activeState.connection.isEaConnected = true;
  if (!activeState.connection.clientIp) {
    const normalized = normalizeIp(clientIp);
    activeState.connection.clientIp = normalized || "127.0.0.1";
  }
  activeState.connection.lastPing = new Date().toISOString();
  activeState.connection.broker = data.broker || "MetaTrader 5 Link";
  activeState.connection.accountNumber = activeState.connection.accountNumber || data.account || "Simulated MT5 Acc";
  activeState.connection.balance = data.balance !== undefined ? Number(data.balance) : (activeState.connection.balance || 1000.0);
  activeState.connection.symbol = symbol;
  activeState.connection.symbolDigits = data.digits !== undefined ? Number(data.digits) : null;
  activeState.connection.symbolTickSize = data.tickSize !== undefined ? Number(data.tickSize) : null;
  activeState.connection.symbolDescription = data.description || null;
  activeState.connection.spread = data.spread !== undefined ? Number(data.spread) : null;
  activeState.connection.session = data.session || null;
  activeState.connection.margin = data.margin !== undefined ? Number(data.margin) : null;
  activeState.connection.leverage = data.leverage !== undefined ? Number(data.leverage) : null;
  activeState.connection.swapLong = data.swapLong !== undefined ? Number(data.swapLong) : null;
  activeState.connection.swapShort = data.swapShort !== undefined ? Number(data.swapShort) : null;
  activeState.connection.profitCalcMode = data.profitCalcMode !== undefined ? Number(data.profitCalcMode) : null;

  if (appState.tradeConfig.isActive) {
    evaluateSimulatedStrategy(buildTradeState(appState, appCallbacks), appCallbacks).catch((err) => {
      console.error("Strategy evaluation error on tick:", err);
    });
  }

  broadcastToDashboards({
    type: "tick",
    symbol,
    tick: state.ticks[state.ticks.length - 1],
    currentPrice: state.currentPrice,
    connection: state.connection,
    candles: state.candles.slice(-100),
    stats: getFullStatusPayload().stats,
  });
}

function broadcastToDashboards(payload: unknown) {
  const message = JSON.stringify(payload);
  webDashboardClients.forEach((client: WebSocket) => {
    if (client.readyState === 1) {
      try {
        client.send(message);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`Dashboard broadcast failed: ${reason}`);
      }
    }
  });
}

const mcpContext = buildMcpContext(appState, appCallbacks);

async function startServer() {
  const loaded = loadStateFromDb();
  appState.tradeConfig = loaded.tradeConfig;
  appState.aiKnowledgeBase = loaded.aiKnowledgeBase;
  appState.aiSynthesizedStrategy = loaded.aiSynthesizedStrategy;
  appState.tradesList = loaded.trades;
  appState.systemLogs = loaded.logs;

  setInterval(() => {
    runBackgroundAnalysisWorker(appState, appCallbacks);
  }, 300000);

  setInterval(() => {
    try {
      const cleanup = scalarAiDb.cleanupOldData();
      if (cleanup.deletedTicks > 0 || cleanup.deletedLogs > 0) {
        appCallbacks.addLog("SERVER", "INFO", `Database cleanup: removed ${cleanup.deletedTicks} old ticks, ${cleanup.deletedLogs} old logs`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      appCallbacks.addLog("SERVER", "ERROR", `Database cleanup failed: ${message}`);
    }
  }, 3600000);

  const getAndClearPendingOrders = () => {
    const list = [...appState.pendingBridgeOrders];
    appState.pendingBridgeOrders = [];
    return list;
  };

  const getPendingEaCommand = () => {
    const cmd = appState.pendingEaCommand;
    appState.pendingEaCommand = null;
    return cmd;
  };

  registerEaRoutes(app, getFullStatusPayload, () => appState.tradeConfig, updateMarket, getPendingEaCommand, process.env.SCALARAI_MCP_API_KEY);
  registerMarketRoutes(app, updateMarket, () => appState.tradeConfig, process.env.SCALARAI_MCP_API_KEY);
  registerSettingsRoutes(
    app,
    (params: Partial<TradeConfig>) => updateSettings(appState, params, appCallbacks),
    () => appState.tradeConfig,
    () => webRequestTest,
    () => {
      webRequestTest.status = "pending";
      webRequestTest.triggerTest = true;
      webRequestTest.lastTested = new Date().toISOString();
      webRequestTest.details = "Verification probe initiated. Waiting for MT5 bridge...";
      appCallbacks.broadcastToDashboards({ type: "webrequest_test", testState: webRequestTest });
    },
    (report) => {
      webRequestTest.status = report.status as any;
      webRequestTest.error = report.error || "";
      webRequestTest.details = report.details || "";
      webRequestTest.lastTested = new Date().toISOString();
      webRequestTest.triggerTest = false;
      appCallbacks.broadcastToDashboards({ type: "webrequest_test", testState: webRequestTest });
      appCallbacks.addLog("SERVER", report.status === "success" ? "SUCCESS" : "WARNING", `WebRequest verification report: ${report.status.toUpperCase()} - ${report.details}`);
    },
    process.env.SCALARAI_MCP_API_KEY
  );
  registerTradeRoutes(app, (isActive: boolean) => toggleTrading(appState, isActive, appCallbacks), () => resetStats(appState, appCallbacks), process.env.SCALARAI_MCP_API_KEY);
  registerAiRoutes(app, () => ({
    status: appState.aiKnowledgeBase.totalObservations >= 20 ? "optimized" : "calibrating",
    message: appState.aiKnowledgeBase.totalObservations >= 20 ? "Quantitative baseline calibrated." : "AI is analyzing market speed baseline... Awaiting sufficient expert data stream from MetaTrader 5 terminal.",
    count: appState.aiKnowledgeBase.totalObservations,
    aiKnowledgeBase: appState.aiKnowledgeBase,
    aiSynthesizedStrategy: appState.aiSynthesizedStrategy,
    candleStream: getSymbolState(appState.symbolStates, appState.activeSymbol).ticks,
    averageVelocity: appState.aiKnowledgeBase.globalAverageSpeed,
  }));
  registerMcpRoute(app, mcpContext, process.env.SCALARAI_MCP_API_KEY);
  registerStatusRoute(app, getFullStatusPayload, (symbol: string) => { appState.activeSymbol = symbol; }, getAndClearPendingOrders, process.env.SCALARAI_MCP_API_KEY);
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
      if (message.client) appCallbacks.addLog("SERVER", "SUCCESS", `Bridge client registered: ${message.client} | Status: ${message.status}`);
    } catch {
      // Ignore malformed bridge messages
    }
  });

  createDashboardServer(server, () => JSON.stringify({ type: "init", payload: getFullStatusPayload() }), (ws: WebSocket, rawMsg: string) => {
    try {
      const msg = JSON.parse(rawMsg.toString());
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", clientTime: msg.clientTime, serverTime: Date.now() }));
      } else if (msg.type === "toggle_trade") {
        toggleTrading(appState, !appState.tradeConfig.isActive, appCallbacks);
      } else if (msg.type === "close_all") {
        const tradeState = buildTradeState(appState, appCallbacks);
        appState.tradesList.forEach((t: TradeRecord) => {
          if (t.status === "OPEN") closeSimulatedPosition(tradeState, t, "Closed from remote web dashboard.", appCallbacks);
        });
        appCallbacks.broadcastTradesUpdate();
      } else if (msg.type === "reset_stats") {
        resetStats(appState, appCallbacks);
      }
    } catch {
      // Ignore malformed dashboard messages
    }
  });

  process.on("uncaughtException", (err) => {
    appCallbacks.addLog("SERVER", "ERROR", `Uncaught exception: ${err.message || err}`);
  });

  process.on("unhandledRejection", (reason) => {
    appCallbacks.addLog("SERVER", "ERROR", `Unhandled rejection: ${reason}`);
  });
}

startServer();
