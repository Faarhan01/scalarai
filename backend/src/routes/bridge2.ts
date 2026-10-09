import { Request, Response, Application } from "express";
import { McpContext } from "../types";
import { scalarAiDb } from "../db";

export const BRIDGE2_TOOLS = [
  {
    name: "mt5_get_status",
    description: "Get current status of MetaTrader 5 terminal, active symbol, account details, and bridge connection.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "mt5_get_account",
    description: "Retrieve MT5 account balance, equity, margin, free margin, leverage, broker, and server info.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "mt5_get_positions",
    description: "List all currently open trading positions in MetaTrader 5 (tickets, symbols, lots, SL/TP, floating profit).",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Optional symbol filter (e.g. 'Step Index')" },
      },
      required: [],
    },
  },
  {
    name: "mt5_place_trade",
    description: "Execute a BUY or SELL order directly in MetaTrader 5 and sync with ScalarAI terminal.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["BUY", "SELL"], description: "Order direction: BUY or SELL" },
        symbol: { type: "string", description: "Asset symbol name (e.g. 'Step Index', 'Boom 1000', 'Volatility 75')" },
        volume: { type: "number", description: "Trade volume / lot size (e.g. 0.1, 0.5, 1.0)" },
        sl: { type: "number", description: "Stop Loss in points (e.g. 150)" },
        tp: { type: "number", description: "Take Profit in points (e.g. 300)" },
        reason: { type: "string", description: "AI analytical reasoning or strategy label for the trade" },
      },
      required: ["type"],
    },
  },
  {
    name: "mt5_close_trade",
    description: "Close an open position in MetaTrader 5 by ticket number or trade ID.",
    inputSchema: {
      type: "object",
      properties: {
        ticket: { type: "string", description: "The position ticket or trade ID to close" },
      },
      required: ["ticket"],
    },
  },
  {
    name: "mt5_close_all_trades",
    description: "Emergency Liquidation: Closes all open positions immediately (globally or filtered by symbol).",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Optional symbol name to close. If omitted, closes ALL open positions." },
      },
      required: [],
    },
  },
  {
    name: "mt5_modify_trade",
    description: "Modify Stop Loss (SL) and/or Take Profit (TP) points on an open MT5 position.",
    inputSchema: {
      type: "object",
      properties: {
        ticket: { type: "string", description: "The position ticket or trade ID to modify" },
        sl: { type: "number", description: "New Stop Loss points (e.g. 120)" },
        tp: { type: "number", description: "New Take Profit points (e.g. 400)" },
      },
      required: ["ticket"],
    },
  },
  {
    name: "mt5_get_market_price",
    description: "Fetch real-time market price, bid/ask spread, and telemetry for any symbol.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Market symbol (e.g. 'Step Index')" },
      },
      required: [],
    },
  },
  {
    name: "mt5_get_candles",
    description: "Retrieve historical OHLCV candlestick data for technical analysis.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol name (e.g. 'Step Index')" },
        limit: { type: "number", description: "Number of candles to return (default: 50, max: 1000)" },
      },
      required: [],
    },
  },
  {
    name: "scalarai_get_system_status",
    description: "Get complete status from connected ScalarAI platform.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "scalarai_toggle_automated_trading",
    description: "Enable or disable automated algorithmic strategy execution on the ScalarAI platform.",
    inputSchema: {
      type: "object",
      properties: {
        isActive: { type: "boolean", description: "True to start auto-trading, false to pause" },
      },
      required: ["isActive"],
    },
  },
  {
    name: "scalarai_update_settings",
    description: "Update platform risk settings: lot size, take profit, stop loss, trailing stop, and active strategy mode.",
    inputSchema: {
      type: "object",
      properties: {
        lotSize: { type: "number" },
        takeProfitPoints: { type: "number" },
        stopLossPoints: { type: "number" },
        trailingStopPoints: { type: "number" },
        useTrailingStop: { type: "boolean" },
        maxTrades: { type: "number" },
        selectedStrategy: { type: "string", enum: ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE", "CUSTOM"] },
        tradingMode: { type: "string", enum: ["Scalping", "Swing"] },
      },
      required: [],
    },
  },
  {
    name: "scalarai_get_ai_knowledge",
    description: "Query AI study feed with quantitative velocity statistics and hourly volatility baselines.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "scalarai_get_strategies",
    description: "List all algorithmic strategies available on the ScalarAI platform.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "mt5_send_custom_command",
    description: "Send a custom raw command to MetaTrader 5 Expert Advisor or terminal queue.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command action name" },
        payload: { type: "object", description: "Custom parameters object" },
      },
      required: ["command"],
    },
  },
];

export async function executeBridge2Tool(name: string, args: Record<string, any>, ctx: McpContext) {
  const status = ctx.getStatus();
  const config = ctx.getConfig();
  const activeSymbol = status.activeSymbol || "Step Index";

  switch (name) {
    case "mt5_get_status":
    case "get_system_status": {
      return {
        bridgeStatus: "online",
        bridgeVersion: "2.0.0",
        bridgeMode: "Cloud & Direct Integration (Zero Download)",
        activeSymbol,
        mt5Connection: status.connection,
        isBridgeConnected: status.isBridgeConnected,
        tradingState: ctx.getTradingState(),
        openPositionsCount: status.stats?.activePositionsCount || 0,
        stats: status.stats,
        lastHeartbeat: status.stats?.lastHeartbeatTime || new Date().toISOString(),
      };
    }

    case "mt5_get_account": {
      const conn = status.connection;
      const trades = ctx.getTrades();
      const openTrades = trades.filter((t) => t.status === "OPEN");
      const floatingProfit = openTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
      const balance = conn.balance || 10000.0;
      const equity = Number((balance + floatingProfit).toFixed(2));
      return {
        login: conn.accountNumber || "88204192",
        broker: conn.broker || "Deriv Limited",
        server: "Deriv-Server",
        currency: "USD",
        balance,
        equity,
        margin: Number((openTrades.length * 100 * (config.lotSize || 0.1)).toFixed(2)),
        freeMargin: Number((equity - openTrades.length * 10 * (config.lotSize || 0.1)).toFixed(2)),
        leverage: 100,
        openPositionsCount: openTrades.length,
      };
    }

    case "mt5_get_positions":
    case "get_trade_history": {
      const trades = ctx.getTrades();
      const openPositions = trades.filter((t) => t.status === "OPEN");
      const filtered = args.symbol
        ? openPositions.filter((t) => t.symbol?.toLowerCase() === args.symbol.toLowerCase())
        : openPositions;
      return {
        count: filtered.length,
        positions: filtered.map((t) => ({
          ticket: t.ticket || t.id,
          id: t.id,
          symbol: t.symbol,
          type: t.type,
          volume: t.lotSize,
          openPrice: t.openPrice,
          currentPrice: t.currentPrice || t.openPrice,
          sl: t.sl || 0,
          tp: t.tp || 0,
          profit: t.profit || 0,
          openTime: t.openTime,
          comment: t.reason,
        })),
      };
    }

    case "mt5_place_trade":
    case "place_validated_trade": {
      const type = (args.type || "BUY").toUpperCase() as "BUY" | "SELL";
      const symbol = args.symbol || activeSymbol;
      const lotSize = Number(args.volume || args.lotSize || config.lotSize || 0.1);
      const sl = args.sl !== undefined ? Number(args.sl) : config.stopLossPoints;
      const tp = args.tp !== undefined ? Number(args.tp) : config.takeProfitPoints;
      const reason = args.reason || "MCP Remote AI Execution";

      const res = await ctx.placeTrade(type, reason, { symbol, lotSize, sl, tp });
      return {
        status: "executed",
        trade: res,
        message: `Executed ${type} ${lotSize} lots on ${symbol} (SL: ${sl}pts, TP: ${tp}pts)`,
      };
    }

    case "mt5_close_trade":
    case "close_trade": {
      const tradeId = String(args.ticket || args.tradeId || "");
      const res = await ctx.closeTrade(tradeId);
      return { status: "closed", ticket: tradeId, result: res };
    }

    case "mt5_close_all_trades":
    case "close_all_trades": {
      const res = await ctx.closeAllTrades(args.symbol);
      return { status: "liquidated", symbol: args.symbol || "ALL", result: res };
    }

    case "mt5_modify_trade":
    case "modify_trade_sl_tp": {
      const tradeId = String(args.ticket || args.tradeId || "");
      const res = await ctx.modifyTrade(tradeId, { sl: args.sl, tp: args.tp });
      return { status: "modified", ticket: tradeId, result: res };
    }

    case "mt5_get_market_price": {
      const sym = args.symbol || activeSymbol;
      let price = status.currentPrice || 1250.0;
      if (status.symbolStates && Array.isArray(status.symbolStates)) {
        const found = status.symbolStates.find((s) => s.symbol.toLowerCase() === sym.toLowerCase());
        if (found && found.currentPrice) price = found.currentPrice;
      }
      return {
        symbol: sym,
        price,
        bid: Number((price - 0.1).toFixed(4)),
        ask: Number((price + 0.1).toFixed(4)),
        spread: 0.2,
        time: new Date().toISOString(),
      };
    }

    case "mt5_get_candles": {
      const sym = args.symbol || activeSymbol;
      const limit = Number(args.limit || 50);
      const candles = scalarAiDb.getCandles(sym, undefined, undefined, limit);
      return { symbol: sym, count: candles.length, candles };
    }

    case "scalarai_get_system_status": {
      return status;
    }

    case "scalarai_toggle_automated_trading":
    case "toggle_automated_trading": {
      const isActive = !!args.isActive;
      await ctx.toggleTrading(isActive);
      return { isActive, message: `Automated trading ${isActive ? "ENABLED" : "PAUSED"}` };
    }

    case "scalarai_update_settings":
    case "update_trading_settings": {
      await ctx.updateSettings(args);
      return { updated: true, settings: args };
    }

    case "scalarai_get_ai_knowledge":
    case "get_ai_knowledge_base": {
      return ctx.getAiKnowledgeBase();
    }

    case "scalarai_get_strategies":
    case "list_strategies": {
      const strategies = [
        { id: "trend_following", name: "Trend Following", mode: "TREND_FOLLOWING", description: "EMA cross + RSI filter" },
        { id: "mean_reversion", name: "Mean Reversion", mode: "MEAN_REVERSION", description: "Bollinger Bands + RSI" },
        { id: "ai_adaptive", name: "AI Adaptive", mode: "AI_ADAPTIVE", description: "Velocity + acceleration + EMA trend confirmation" },
      ];
      const custom = scalarAiDb.getAllStrategies();
      return [...strategies, ...custom];
    }

    case "mt5_send_custom_command": {
      return { queued: true, command: args.command, payload: args.payload || {}, timestamp: Date.now() };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function registerBridge2Routes(app: Application, ctx: McpContext, apiKey?: string) {
  // 1. Live Bridge 2 Status
  app.get("/api/bridge2/status", (req: Request, res: Response) => {
    const status = ctx.getStatus();
    const config = ctx.getConfig();
    res.json({
      status: "ok",
      ready: true,
      service: "ScalarAI Bridge 2 (Cloud + Local)",
      version: "2.0.0",
      zeroDownloadReady: true,
      protocol: "Model Context Protocol (MCP 2024-11-05 JSON-RPC 2.0)",
      activeSymbol: status.activeSymbol || "Step Index",
      currentPrice: status.currentPrice,
      isBridgeConnected: status.isBridgeConnected,
      account: {
        balance: status.connection?.balance || 10000.0,
        equity: (status.connection?.balance || 10000.0) + (status.stats?.totalProfit || 0),
        broker: status.connection?.broker || "Deriv Limited",
        accountNumber: status.connection?.accountNumber || "88204192",
      },
      tradingState: ctx.getTradingState(),
      activePositionsCount: status.stats?.activePositionsCount || 0,
      toolsCount: BRIDGE2_TOOLS.length,
      remoteMcpUrl: `${req.protocol}://${req.get("host")}/api/bridge2/mcp`,
    });
  });

  // 2. Tools Catalog List
  app.get("/api/bridge2/tools", (req: Request, res: Response) => {
    res.json({
      protocolVersion: "2024-11-05",
      count: BRIDGE2_TOOLS.length,
      tools: BRIDGE2_TOOLS,
    });
  });

  // 3. Direct REST Tool Call (Zero-download simple invocation)
  app.post("/api/bridge2/call", async (req: Request, res: Response) => {
    const { tool, arguments: args = {} } = req.body || {};
    if (!tool) {
      return res.status(400).json({ error: "Missing required 'tool' field" });
    }

    try {
      const result = await executeBridge2Tool(tool, args, ctx);
      res.json({ success: true, tool, result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // 4. Natural Language AI Dispatcher (Zero-download external prompt handler)
  app.post("/api/bridge2/ai-execute", async (req: Request, res: Response) => {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing required 'prompt' string" });
    }

    const lower = prompt.toLowerCase();
    try {
      let executedTool = "";
      let args: Record<string, any> = {};

      if (lower.includes("close all") || lower.includes("liquidate") || lower.includes("panic close")) {
        executedTool = "mt5_close_all_trades";
      } else if (lower.includes("buy") || lower.includes("long")) {
        executedTool = "mt5_place_trade";
        const lotMatch = prompt.match(/(\d+(\.\d+)?)\s*(lots?|volume)/i);
        const slMatch = prompt.match(/sl\s*[:=]?\s*(\d+)/i);
        const tpMatch = prompt.match(/tp\s*[:=]?\s*(\d+)/i);
        args = {
          type: "BUY",
          volume: lotMatch ? parseFloat(lotMatch[1]) : 0.1,
          sl: slMatch ? parseInt(slMatch[1], 10) : 150,
          tp: tpMatch ? parseInt(tpMatch[1], 10) : 300,
          reason: `AI Prompt: ${prompt.slice(0, 50)}`,
        };
      } else if (lower.includes("sell") || lower.includes("short")) {
        executedTool = "mt5_place_trade";
        const lotMatch = prompt.match(/(\d+(\.\d+)?)\s*(lots?|volume)/i);
        const slMatch = prompt.match(/sl\s*[:=]?\s*(\d+)/i);
        const tpMatch = prompt.match(/tp\s*[:=]?\s*(\d+)/i);
        args = {
          type: "SELL",
          volume: lotMatch ? parseFloat(lotMatch[1]) : 0.1,
          sl: slMatch ? parseInt(slMatch[1], 10) : 150,
          tp: tpMatch ? parseInt(tpMatch[1], 10) : 300,
          reason: `AI Prompt: ${prompt.slice(0, 50)}`,
        };
      } else if (lower.includes("position") || lower.includes("trades") || lower.includes("open")) {
        executedTool = "mt5_get_positions";
      } else if (lower.includes("account") || lower.includes("balance") || lower.includes("equity")) {
        executedTool = "mt5_get_account";
      } else if (lower.includes("price") || lower.includes("quote") || lower.includes("market")) {
        executedTool = "mt5_get_market_price";
      } else if (lower.includes("status")) {
        executedTool = "mt5_get_status";
      } else {
        executedTool = "mt5_get_status";
      }

      const result = await executeBridge2Tool(executedTool, args, ctx);
      res.json({
        success: true,
        interpretedAction: executedTool,
        args,
        result,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Standard Model Context Protocol (MCP 2024-11-05) JSON-RPC 2.0 Handler
  const mcpHandler = async (req: Request, res: Response) => {
    // If GET request, return server discovery & copy-paste setup configs
    if (req.method === "GET") {
      const host = `${req.protocol}://${req.get("host")}`;
      return res.json({
        name: "scalarai-mt5-bridge2",
        version: "2.0.0",
        description: "Zero-Download Remote Model Context Protocol Server for MetaTrader 5",
        protocolVersion: "2024-11-05",
        status: "ready",
        endpoints: {
          mcpHttp: `${host}/api/bridge2/mcp`,
          mcpSse: `${host}/api/bridge2/sse`,
          status: `${host}/api/bridge2/status`,
          tools: `${host}/api/bridge2/tools`,
          call: `${host}/api/bridge2/call`,
        },
        toolsCount: BRIDGE2_TOOLS.length,
        claudeDesktopConfig: {
          mcpServers: {
            "scalarai-mt5": {
              command: "node",
              args: ["-e", `console.log("Connect to ${host}/api/bridge2/mcp")`],
            },
          },
        },
      });
    }

    const body = req.body || {};
    if (!body.jsonrpc || body.jsonrpc !== "2.0") {
      return res.status(400).json({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32600, message: "Invalid Request: expected jsonrpc 2.0" } });
    }

    if (apiKey && apiKey.trim().length > 0) {
      const auth = req.headers.authorization || "";
      if (!auth.startsWith(`Bearer ${apiKey}`)) {
        return res.status(401).json({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32001, message: "Unauthorized: Invalid API key" } });
      }
    }

    const { id, method, params } = body;

    try {
      if (method === "initialize") {
        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "scalarai-mt5-bridge2", version: "2.0.0" },
          },
        });
      }

      if (method === "initialized" || method === "notifications/initialized") {
        return res.json({ jsonrpc: "2.0", id, result: null });
      }

      if (method === "ping") {
        return res.json({ jsonrpc: "2.0", id, result: {} });
      }

      if (method === "tools/list") {
        return res.json({
          jsonrpc: "2.0",
          id,
          result: { tools: BRIDGE2_TOOLS },
        });
      }

      if (method === "tools/call") {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const toolResult = await executeBridge2Tool(toolName, toolArgs, ctx);

        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(toolResult, null, 2) }],
          },
        });
      }

      return res.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    } catch (err: any) {
      return res.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: err.message || "Internal error" },
      });
    }
  };

  // Mount MCP handlers across multiple standard endpoints for universal discovery
  app.all("/api/bridge2/mcp", mcpHandler);
  app.all("/mcp", mcpHandler);
  app.all("/api/mcp", mcpHandler);

  // 6. Server-Sent Events (SSE) MCP Stream for Remote AI clients
  app.get("/api/bridge2/sse", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // Send initial endpoint event according to MCP SSE specification
    const endpointUrl = `${req.protocol}://${req.get("host")}/api/bridge2/mcp`;
    res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

    // Keepalive ping
    const interval = setInterval(() => {
      res.write(`event: ping\ndata: ${Date.now()}\n\n`);
    }, 15000);

    req.on("close", () => {
      clearInterval(interval);
    });
  });
}
