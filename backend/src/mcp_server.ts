import { Request, Response } from "express";
import { McpContext, StrategyMode, TradeRecord, SystemLog } from "./types";
import { scalarAiDb } from "./db";
import { evaluateStrategyBacktest } from "./services/strategy";
import { BacktestEngine } from "./services/strategy-backtest";
import { updateKnowledgeBaseFromTelemetry, formatKnowledgeBase } from "./services/knowledge";
import { analyzeMarket, analyzeStrategyPerformance, suggestStrategyOptimizations, recommendStrategyForConditions } from "./services/strategy-research";
import { parseTimestamp, parseLimit } from "./utils/time";
import { STRATEGY_TEMPLATES, createStrategyFromTemplate } from "./services/strategy-templates";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpToolCallResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export interface McpToolCallParams {
  name: string;
  arguments: Record<string, any>;
}

export const TOOLS: McpTool[] = [
  {
    name: "get_system_status",
    description: "Get full ScalarAI system status: config, connection, trades, logs, stats, AI strategy, and symbol states.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_trading_state",
    description: "Get current trading state machine value (idle | active).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_bridge_state",
    description: "Get current EA bridge connection state (disconnected | connected).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_calibration_state",
    description: "Get current AI calibration state (calibrating | optimized). Automated trading is blocked until optimized.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_ai_knowledge_base",
    description: "Get AI knowledge base with long-term market velocity observations, hourly patterns, and peak speeds.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_ai_strategy",
    description: "Get the current active AI strategy including rules and parameters.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_strategies",
    description: "List all available strategies (built-in and custom).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_strategy",
    description: "Create a new custom strategy with a name, description, mode, and rules.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Strategy name" },
        description: { type: "string", description: "Strategy description" },
        mode: { type: "string", enum: ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE", "CUSTOM"] },
        rules: { type: "array", description: "Array of strategy rules" },
      },
      required: ["name", "mode"],
    },
  },
  {
    name: "update_strategy",
    description: "Update an existing custom strategy by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Strategy ID" },
        name: { type: "string" },
        description: { type: "string" },
        rules: { type: "array" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_strategy",
    description: "Delete a custom strategy by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Strategy ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "activate_strategy",
    description: "Activate a strategy by ID or mode (TREND_FOLLOWING, MEAN_REVERSION, AI_ADAPTIVE, CUSTOM).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Strategy ID for custom strategies" },
        mode: { type: "string", enum: ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE", "CUSTOM"] },
      },
      required: [],
    },
  },
  {
    name: "backtest_strategy",
    description: "Backtest a strategy against recent market data and return performance metrics.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE", "CUSTOM"] },
        limit: { type: "number", description: "Number of ticks to backtest (default 500)" },
      },
      required: ["mode"],
    },
  },
  {
    name: "query_db",
    description: "Execute a read-only SQL query against the SQLite database. Returns rows as JSON. Use for flexible analysis of trades, logs, ticks, etc.",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SELECT-only SQL query" },
        params: { type: "array", description: "Optional parameters for ? placeholders" },
      },
      required: ["sql"],
    },
  },
  {
    name: "update_trading_settings",
    description: "Update trading parameters such as lot size, TP, SL, strategy mode, and trading mode.",
    inputSchema: {
      type: "object",
      properties: {
        selectedStrategy: { type: "string", enum: ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE", "CUSTOM"] },
        lotSize: { type: "number" },
        takeProfitPoints: { type: "number" },
        stopLossPoints: { type: "number" },
        trailingStopPoints: { type: "number" },
        useTrailingStop: { type: "boolean" },
        maxTrades: { type: "number" },
        tradingMode: { type: "string", enum: ["Scalping", "Swing"] },
        isAiModeEnabled: { type: "boolean" },
      },
      required: [],
    },
  },
  {
    name: "toggle_automated_trading",
    description: "Start or stop automated trading execution.",
    inputSchema: { type: "object", properties: { isActive: { type: "boolean" } }, required: ["isActive"] },
  },
  {
    name: "get_trade_history",
    description: "Get the list of all trades, including open and closed positions.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["OPEN", "CLOSED"] },
        limit: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "get_system_logs",
    description: "Get recent system logs filtered by source and level.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", enum: ["SERVER", "EA", "AI"] },
        level: { type: "string", enum: ["INFO", "SUCCESS", "WARNING", "ERROR"] },
        limit: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "place_validated_trade",
    description: "Place a BUY or SELL trade. Supports custom symbol, lot size, SL, and TP. Dispatches signal to MT5 EA and dashboard.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["BUY", "SELL"], description: "Order direction: BUY or SELL" },
        symbol: { type: "string", description: "Target symbol name (default: current active symbol)" },
        lotSize: { type: "number", description: "Lot volume to trade (default: configured lot size)" },
        sl: { type: "number", description: "Stop loss in points (optional)" },
        tp: { type: "number", description: "Take profit in points (optional)" },
        reason: { type: "string", description: "AI rationale for the trade execution" },
      },
      required: ["type"],
    },
  },
  {
    name: "close_trade",
    description: "Close an open trade by its ID.",
    inputSchema: { type: "object", properties: { tradeId: { type: "string" } }, required: ["tradeId"] },
  },
  {
    name: "close_all_trades",
    description: "Close all open positions immediately (globally or for a specific symbol).",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Optional symbol to liquidate (if omitted, liquidates all symbols)" },
      },
      required: [],
    },
  },
  {
    name: "get_symbols",
    description: "Get all market symbols connected to the MT5 EA with prices, connection status, digits, and tick counts.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "switch_active_symbol",
    description: "Switch the active market symbol on the platform dashboard.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol name to activate" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_ea_telemetry",
    description: "Get real-time MetaTrader 5 Expert Advisor connection metrics: account login, company/broker, balance, equity, margin, spread, digits, ping.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Optional symbol to query EA connection for (default: active symbol)" },
      },
      required: [],
    },
  },
  {
    name: "reset_stats",
    description: "Reset all trade statistics and clear the trade history log.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_market_telemetry",
    description: "Get recent market telemetry (ticks with velocity) for the active symbol. Useful for AI analysis of price movement patterns.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of telemetry records to return (default 100)" },
        symbol: { type: "string", description: "Symbol to query (default: active symbol)" },
      },
      required: [],
    },
  },
  {
    name: "get_recent_candles",
    description: "Get recent OHLC candles for the active symbol. Useful for chart analysis and pattern recognition.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of candles to return (default 50)" },
        symbol: { type: "string", description: "Symbol to query (default: active symbol)" },
      },
      required: [],
    },
  },
  {
    name: "analyze_strategy_performance",
    description: "Analyze performance of a strategy mode from historical trades. Returns win rate, profit factor, avg win/loss, and best/worst hours.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE", "CUSTOM"] },
        limit: { type: "number", description: "Number of recent trades to analyze (default 100)" },
      },
      required: ["mode"],
    },
  },
  {
    name: "synthesize_ai_strategy",
    description: "Force refresh the AI knowledge base from recent telemetry and recompile the active AI strategy.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol to analyze (default: active symbol)" },
      },
      required: [],
    },
  },
  {
    name: "get_knowledge_summary",
    description: "Get a formatted summary of the AI knowledge base including peak speeds and top active hours.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "analyze_market",
    description: "Perform comprehensive market analysis including trend, volatility, momentum, support/resistance, and trading recommendation.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol to analyze (default: Step Index)" },
      },
      required: [],
    },
  },
  {
    name: "get_strategy_performance",
    description: "Get detailed performance analysis for a strategy including win rate, profit factor, best/worst hours, and recommendations.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE", "CUSTOM"] },
        limit: { type: "number", description: "Number of trades to analyze (default 100)" },
      },
      required: ["mode"],
    },
  },
  {
    name: "optimize_strategy",
    description: "Get optimization suggestions for a strategy based on historical performance.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE", "CUSTOM"] },
      },
      required: ["mode"],
    },
  },
  {
    name: "recommend_strategy",
    description: "Get strategy recommendation based on current market conditions (volatility, trend, time of day).",
    inputSchema: {
      type: "object",
      properties: {
        volatility: { type: "string", enum: ["low", "medium", "high"] },
        trend: { type: "string", enum: ["bullish", "bearish", "neutral"] },
        timeOfDay: { type: "string", description: "Current time in HH:MM format" },
      },
      required: ["volatility", "trend", "timeOfDay"],
    },
  },
  {
    name: "list_strategy_templates",
    description: "List all available strategy templates for different trading styles (scalping, day trading, momentum, breakout, etc.).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_strategy_from_template",
    description: "Create a new strategy from a template with optional parameter overrides.",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string", description: "Template ID from list_strategy_templates" },
        name: { type: "string", description: "Custom name (optional)" },
        overrides: { type: "object", description: "Parameter overrides" },
      },
      required: ["templateId"],
    },
  },
  {
    name: "export_data",
    description: "Export trading data as JSON for external analysis. Returns trades, logs, or market data.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["trades", "logs", "market_data"] },
        limit: { type: "number", description: "Maximum records to export (default 500)" },
        format: { type: "string", enum: ["json", "csv"], description: "Export format (default json)" },
      },
      required: ["type"],
    },
  },
  {
    name: "get_market_candles",
    description: "Get OHLC candles with time range from SQLite market_candles table.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol name (default: Step Index)" },
        from: { type: "string", description: "Start timestamp (ISO 8601 or epoch ms)" },
        to: { type: "string", description: "End timestamp (ISO 8601 or epoch ms)" },
        limit: { type: "number", description: "Max candles (default 1000, max 10000)" },
      },
      required: [],
    },
  },
  {
    name: "get_market_observations",
    description: "Get AI observations with filters.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        direction: { type: "string", enum: ["up", "down", "flat"] },
        minVelocity: { type: "number" },
        limit: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "generate_observation_insights",
    description: "Generate insights from observations for a symbol/time range.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol name (default: Step Index)" },
        from: { type: "string", description: "Start timestamp (optional)" },
        to: { type: "string", description: "End timestamp (optional)" },
      },
      required: [],
    },
  },
  {
    name: "backtest_strategy_with_history",
    description: "Backtest a strategy against historical candle data.",
    inputSchema: {
      type: "object",
      properties: {
        strategyId: { type: "string", description: "Strategy ID to backtest" },
        symbol: { type: "string", description: "Symbol to backtest on (default: Step Index)" },
        from: { type: "string", description: "Start timestamp (ISO 8601)" },
        to: { type: "string", description: "End timestamp (ISO 8601)" },
        initialBalance: { type: "number", description: "Initial balance (default 10000)" },
      },
      required: ["strategyId", "from", "to"],
    },
  },
];

export function isReadOnlySql(sql: string): boolean {
  const normalized = sql.trim().replace(/\s+/g, " ").toUpperCase();
  if (!normalized.startsWith("SELECT")) return false;
  if (normalized.includes(";")) return false;
  if (normalized.includes("--")) return false;
  if (normalized.includes("/*")) return false;
  const forbidden = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "CREATE", "REPLACE", "PRAGMA", "ATTACH", "DETACH", "VACUUM", "INDEX", "TRIGGER", "VIEW", "TRANSACTION", "SAVEPOINT", "RELEASE", "COMMIT", "ROLLBACK"];
  return !forbidden.some(keyword => normalized.includes(keyword));
}

export function createMcpHandler(ctx: McpContext, expectedApiKey: string) {
  return async (req: Request, res: Response) => {
    const body = req.body || {};

    if (!body.jsonrpc || body.jsonrpc !== "2.0") {
      return res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" } });
    }

    if (expectedApiKey && expectedApiKey.trim().length > 0) {
      const authHeader = req.headers.authorization || "";
      if (!authHeader.startsWith(`Bearer ${expectedApiKey}`)) {
        return res.status(401).json({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32001, message: "Unauthorized: Invalid or missing Bearer token" } });
      }
    }

    const id = body.id ?? null;
    const method = body.method;

    try {
      if (method === "initialize") {
        return res.json({
          jsonrpc: "2.0",
          id,
          result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "scalarai-mcp", version: "2.0.0" } },
        });
      }

      if (method === "initialized") {
        return res.json({ jsonrpc: "2.0", id, result: null });
      }

      if (method === "tools/list") {
        return res.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      }

      if (method === "tools/call") {
        const params: McpToolCallParams = body.params || {};
        const toolName = params.name;
        const args = params.arguments || {};
        let result: McpToolCallResult;

        switch (toolName) {
          case "get_system_status": {
            result = { content: [{ type: "text", text: JSON.stringify(ctx.getStatus(), null, 2) }] };
            break;
          }
          case "get_trading_state": {
            result = { content: [{ type: "text", text: JSON.stringify(ctx.getTradingState(), null, 2) }] };
            break;
          }
          case "get_bridge_state": {
            result = { content: [{ type: "text", text: JSON.stringify(ctx.getBridgeState(), null, 2) }] };
            break;
          }
          case "get_calibration_state": {
            result = { content: [{ type: "text", text: JSON.stringify(ctx.getCalibrationState(), null, 2) }] };
            break;
          }
          case "get_ai_knowledge_base": {
            result = { content: [{ type: "text", text: JSON.stringify(ctx.getAiKnowledgeBase(), null, 2) }] };
            break;
          }
          case "get_ai_strategy": {
            result = { content: [{ type: "text", text: JSON.stringify(ctx.getAiStrategy(), null, 2) }] };
            break;
          }
          case "list_strategies": {
            const strategies = [
              { id: "trend_following", name: "Trend Following", mode: "TREND_FOLLOWING", description: "EMA cross + RSI filter" },
              { id: "mean_reversion", name: "Mean Reversion", mode: "MEAN_REVERSION", description: "Bollinger Bands + RSI" },
              { id: "ai_adaptive", name: "AI Adaptive", mode: "AI_ADAPTIVE", description: "Velocity + acceleration + EMA trend confirmation" },
            ];
            const customStrategies = scalarAiDb.getAllStrategies();
            result = { content: [{ type: "text", text: JSON.stringify([...strategies, ...customStrategies], null, 2) }] };
            break;
          }
          case "create_strategy": {
            const newStrategy = {
              id: `custom_${Date.now()}`,
              name: args.name || "Untitled Strategy",
              description: args.description || "",
              mode: args.mode || "CUSTOM",
              rules: args.rules || [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            scalarAiDb.insertStrategy(newStrategy);
            result = { content: [{ type: "text", text: JSON.stringify({ success: true, strategy: newStrategy }, null, 2) }] };
            break;
          }
          case "update_strategy": {
            const existing = scalarAiDb.getStrategyById(args.id);
            if (!existing) {
              return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: `Strategy not found: ${args.id}` } });
            }
            const updated = {
              ...existing,
              name: args.name ?? existing.name,
              description: args.description ?? existing.description,
              rules: args.rules ?? existing.rules,
              updatedAt: new Date().toISOString(),
            };
            scalarAiDb.updateStrategy(args.id, updated);
            result = { content: [{ type: "text", text: JSON.stringify({ success: true, strategy: updated }, null, 2) }] };
            break;
          }
          case "delete_strategy": {
            scalarAiDb.deleteStrategy(args.id);
            result = { content: [{ type: "text", text: JSON.stringify({ success: true, message: `Strategy ${args.id} deleted` }, null, 2) }] };
            break;
          }
          case "activate_strategy": {
            if (args.mode && ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE"].includes(args.mode)) {
              await ctx.updateSettings({ selectedStrategy: args.mode });
              result = { content: [{ type: "text", text: JSON.stringify({ success: true, activeStrategy: args.mode }, null, 2) }] };
            } else if (args.id) {
              const strategy = scalarAiDb.getStrategyById(args.id);
              if (!strategy) {
                return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: `Strategy not found: ${args.id}` } });
              }
              await ctx.updateSettings({ selectedStrategy: StrategyMode.CUSTOM });
              result = { content: [{ type: "text", text: JSON.stringify({ success: true, activeStrategy: strategy }, null, 2) }] };
            } else {
              return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Provide id or mode" } });
            }
            break;
          }
          case "backtest_strategy": {
            const backtestResult = evaluateStrategyBacktest(args.mode, args.limit || 500);
            result = { content: [{ type: "text", text: JSON.stringify(backtestResult, null, 2) }] };
            break;
          }
          case "query_db": {
            if (!isReadOnlySql(args.sql)) {
              return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Only read-only SELECT queries are allowed" } });
            }
            try {
              const rows = scalarAiDb.rawQuery(args.sql, args.params || []);
              result = { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
             } catch (err: unknown) {
               const message = err instanceof Error ? err.message : String(err);
               return res.json({ jsonrpc: "2.0", id, error: { code: -32603, message: `Query failed: ${message}` } });
             }
            break;
          }
          case "update_trading_settings": {
            const config = await ctx.updateSettings(args);
            result = { content: [{ type: "text", text: JSON.stringify(config, null, 2) }] };
            break;
          }
          case "toggle_automated_trading": {
            const config = await ctx.toggleTrading(typeof args.isActive === "boolean" ? args.isActive : !ctx.getConfig().isActive);
            result = { content: [{ type: "text", text: `Trading toggled to ${config.isActive ? "STARTED" : "STOPPED"}` }] };
            break;
          }
          case "get_trade_history": {
            let trades = ctx.getTrades();
            if (args.status) trades = trades.filter((t: TradeRecord) => t.status === args.status);
            if (args.symbol) trades = trades.filter((t: TradeRecord) => t.symbol?.toLowerCase() === args.symbol.toLowerCase());
            const limit = typeof args.limit === "number" ? args.limit : 100;
            result = { content: [{ type: "text", text: JSON.stringify(trades.slice(0, limit), null, 2) }] };
            break;
          }
          case "get_system_logs": {
            let logs = ctx.getLogs();
            if (args.source) logs = logs.filter((l: SystemLog) => l.source === args.source);
            if (args.level) logs = logs.filter((l: SystemLog) => l.level === args.level);
            const limit = typeof args.limit === "number" ? args.limit : 50;
            result = { content: [{ type: "text", text: JSON.stringify(logs.slice(0, limit), null, 2) }] };
            break;
          }
          case "place_validated_trade": {
            if (!args.type || !["BUY", "SELL"].includes(args.type)) {
              return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid params: type must be BUY or SELL" } });
            }
            const activeSymbol = ctx.getStatus().activeSymbol;
            const targetSymbol = (args.symbol && args.symbol.trim()) || activeSymbol || "Step Index";
            const tradeResult = await ctx.placeTrade(
              args.type,
              typeof args.reason === "string" ? args.reason : "MCP AI automated trade execution",
              {
                symbol: targetSymbol,
                lotSize: typeof args.lotSize === "number" ? args.lotSize : undefined,
                sl: typeof args.sl === "number" ? args.sl : undefined,
                tp: typeof args.tp === "number" ? args.tp : undefined,
              }
            );
            result = { content: [{ type: "text", text: JSON.stringify(tradeResult, null, 2) }] };
            break;
          }
          case "close_trade": {
            if (!args.tradeId) {
              return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid params: tradeId is required" } });
            }
            const closeResult = await ctx.closeTrade(args.tradeId);
            result = { content: [{ type: "text", text: JSON.stringify(closeResult, null, 2) }] };
            break;
          }
          case "close_all_trades": {
            const closeAllResult = await ctx.closeAllTrades(args.symbol);
            result = { content: [{ type: "text", text: JSON.stringify(closeAllResult, null, 2) }] };
            break;
          }
          case "get_symbols": {
            const symbolsList = ctx.getSymbols();
            const activeSymbol = ctx.getStatus().activeSymbol;
            result = { content: [{ type: "text", text: JSON.stringify({ activeSymbol, symbols: symbolsList, count: symbolsList.length }, null, 2) }] };
            break;
          }
          case "switch_active_symbol": {
            if (!args.symbol) {
              return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid params: symbol is required" } });
            }
            ctx.switchSymbol(args.symbol);
            result = { content: [{ type: "text", text: JSON.stringify({ success: true, activeSymbol: args.symbol }, null, 2) }] };
            break;
          }
          case "get_ea_telemetry": {
            const status = ctx.getStatus();
            const targetSymbol = (args.symbol && args.symbol.trim()) || status.activeSymbol;
            const symState = status.symbolStates.find((s: any) => s.symbol === targetSymbol);
            const connection = symState?.connection || status.connection;
            result = { content: [{ type: "text", text: JSON.stringify({ symbol: targetSymbol, connection, isBridgeConnected: status.isBridgeConnected }, null, 2) }] };
            break;
          }
          case "reset_stats": {
            await ctx.resetStats();
            result = { content: [{ type: "text", text: "Stats reset successfully." }] };
            break;
          }
          case "get_market_telemetry": {
            const limit = typeof args.limit === "number" ? args.limit : 100;
            const activeSymbol = ctx.getStatus().activeSymbol;
            const symbol = (args.symbol && args.symbol.trim()) || activeSymbol || "Step Index";
            const state = scalarAiDb.getAiKnowledge();
            const ticks = scalarAiDb.getTicks(limit, symbol);
            result = { content: [{ type: "text", text: JSON.stringify({ symbol, telemetryCount: state?.totalObservations || 0, recentTicksCount: ticks.length, knowledge: state }, null, 2) }] };
            break;
          }
          case "get_recent_candles": {
            const limit = typeof args.limit === "number" ? args.limit : 50;
            const activeSymbol = ctx.getStatus().activeSymbol;
            const symbol = (args.symbol && args.symbol.trim()) || activeSymbol || "Step Index";
            const candles = scalarAiDb.getCandles(symbol, undefined, undefined, limit);
            if (candles.length > 0) {
              result = { content: [{ type: "text", text: JSON.stringify({ symbol, candles, count: candles.length }, null, 2) }] };
            } else {
              const ticks = scalarAiDb.getTicks(limit, symbol);
              result = { content: [{ type: "text", text: JSON.stringify({ symbol, ticks, count: ticks.length }, null, 2) }] };
            }
            break;
          }
          case "analyze_strategy_performance": {
            const mode = args.mode || "TREND_FOLLOWING";
            const limit = typeof args.limit === "number" ? args.limit : 100;
            const allTrades = scalarAiDb.getTrades();
            const modeTrades = allTrades.filter((t: TradeRecord) => t.strategy === mode).slice(0, limit);
            const closed = modeTrades.filter((t: TradeRecord) => t.status === "CLOSED");
            const wins = closed.filter((t: TradeRecord) => t.profit > 0);
            const losses = closed.filter((t: TradeRecord) => t.profit <= 0);
            const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
            const totalProfit = closed.reduce((sum: number, t: TradeRecord) => sum + t.profit, 0);
            const avgWin = wins.length > 0 ? wins.reduce((sum: number, t: TradeRecord) => sum + t.profit, 0) / wins.length : 0;
            const avgLoss = losses.length > 0 ? losses.reduce((sum: number, t: TradeRecord) => sum + t.profit, 0) / losses.length : 0;
            const profitFactor = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;
            result = { content: [{ type: "text", text: JSON.stringify({
              mode,
              tradesAnalyzed: closed.length,
              winRate,
              totalProfit: Number(totalProfit.toFixed(2)),
              avgWin: Number(avgWin.toFixed(2)),
              avgLoss: Number(avgLoss.toFixed(2)),
              profitFactor: Number(profitFactor.toFixed(2)),
              wins: wins.length,
              losses: losses.length,
            }, null, 2) }] };
            break;
          }
          case "synthesize_ai_strategy": {
            const activeSymbol = ctx.getStatus().activeSymbol;
            const symbol = (args.symbol && args.symbol.trim()) || activeSymbol || "Step Index";
            const state2 = scalarAiDb.getAiKnowledge();
            if (!state2) {
              result = { content: [{ type: "text", text: "No knowledge base found. Initialize it first." }] };
              break;
            }
            const telemetry = scalarAiDb.rawQuery("SELECT velocity, timestamp FROM market_ticks ORDER BY timestamp DESC LIMIT 500", []) as Array<{ velocity: number; timestamp: number }>;
            const updateResult = updateKnowledgeBaseFromTelemetry(symbol, telemetry.reverse());
            result = { content: [{ type: "text", text: JSON.stringify({
              success: true,
              message: "Knowledge base updated from live telemetry",
              updateResult,
              knowledgeSummary: formatKnowledgeBase(state2),
            }, null, 2) }] };
            break;
          }
          case "get_knowledge_summary": {
            const kb = scalarAiDb.getAiKnowledge();
            if (!kb) {
              result = { content: [{ type: "text", text: "No knowledge base found." }] };
              break;
            }
            result = { content: [{ type: "text", text: formatKnowledgeBase(kb) }] };
            break;
          }
          case "analyze_market": {
            const activeSymbol = ctx.getStatus().activeSymbol;
            const symbol = (args.symbol && args.symbol.trim()) || activeSymbol || "Step Index";
            const knowledge = scalarAiDb.getAiKnowledge();
            if (!knowledge) {
              result = { content: [{ type: "text", text: "No knowledge base found. Initialize it first." }] };
              break;
            }
            const analysis = analyzeMarket(symbol, knowledge);
            result = { content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }] };
            break;
          }
          case "get_strategy_performance": {
            const mode = args.mode || "TREND_FOLLOWING";
            const limit = typeof args.limit === "number" ? args.limit : 100;
            const performance = analyzeStrategyPerformance(mode, limit);
            result = { content: [{ type: "text", text: JSON.stringify(performance, null, 2) }] };
            break;
          }
          case "optimize_strategy": {
            const mode = args.mode || "TREND_FOLLOWING";
            const suggestions = suggestStrategyOptimizations(mode);
            result = { content: [{ type: "text", text: JSON.stringify({ mode, suggestions }, null, 2) }] };
            break;
          }
          case "recommend_strategy": {
            const { volatility, trend, timeOfDay } = args;
            if (!volatility || !trend || !timeOfDay) {
              result = { content: [{ type: "text", text: "Missing required params: volatility, trend, timeOfDay" }] };
              break;
            }
            const recommendation = recommendStrategyForConditions(volatility, trend, timeOfDay);
            result = { content: [{ type: "text", text: JSON.stringify(recommendation, null, 2) }] };
            break;
          }
          case "list_strategy_templates": {
            const templates = STRATEGY_TEMPLATES.map(t => ({
              id: t.id,
              name: t.name,
              description: t.description,
              mode: t.mode,
              category: t.category,
              tags: t.tags,
              defaultConfig: t.defaultConfig,
            }));
            result = { content: [{ type: "text", text: JSON.stringify(templates, null, 2) }] };
            break;
          }
          case "create_strategy_from_template": {
            const templateId = args.templateId;
            if (!templateId) {
              result = { content: [{ type: "text", text: "Missing required param: templateId" }] };
              break;
            }
            try {
              const strategy = createStrategyFromTemplate(templateId, args.overrides);
              scalarAiDb.upsertAiStrategy(strategy);
              result = { content: [{ type: "text", text: JSON.stringify({ success: true, strategy }, null, 2) }] };
             } catch (err: unknown) {
               const message = err instanceof Error ? err.message : String(err);
               result = { content: [{ type: "text", text: `Error: ${message}` }] };
             }
            break;
          }
          case "export_data": {
            const type = args.type || "trades";
            const limit = typeof args.limit === "number" ? args.limit : 500;
            const format = args.format || "json";

            let data: TradeRecord[] | SystemLog[] | unknown[];
            switch (type) {
              case "trades":
                data = scalarAiDb.getTrades().slice(0, limit);
                break;
              case "logs":
                data = scalarAiDb.getLogs(limit);
                break;
              case "market_data":
                data = scalarAiDb.rawQuery("SELECT * FROM market_ticks ORDER BY time DESC LIMIT ?", [limit]);
                break;
              default:
                data = [];
            }
            
            if (format === "csv" && data.length > 0) {
              const headers = Object.keys(data[0]).join(",");
              const rows = data.map(row => Object.values(row).map(v => `"${v}"`).join(","));
              result = { content: [{ type: "text", text: [headers, ...rows].join("\n") }] };
            } else {
              result = { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
            }
            break;
          }
          case "get_market_candles": {
            const activeSymbol = ctx.getStatus().activeSymbol;
            const symbol = (args.symbol && args.symbol.trim()) || activeSymbol || "Step Index";
            const from = parseTimestamp(args.from);
            const to = parseTimestamp(args.to);
            const limit = parseLimit(args.limit, 1000, 10000);
            const candles = scalarAiDb.getCandles(symbol, from, to, limit);
            result = { content: [{ type: "text", text: JSON.stringify({ symbol, candles, count: candles.length, from: args.from, to: args.to }, null, 2) }] };
            break;
          }
          case "get_market_observations": {
            const symbol = args.symbol;
            const from = parseTimestamp(args.from);
            const to = parseTimestamp(args.to);
            const limit = parseLimit(args.limit, 500, 5000);
            let observations = scalarAiDb.getObservations(symbol, from, to, limit);
            if (args.direction) {
              observations = observations.filter(o => o.direction === args.direction);
            }
            if (typeof args.minVelocity === "number") {
              observations = observations.filter(o => o.velocity >= args.minVelocity);
            }
            const parsed = observations.map(o => {
              let tags: any[] = [];
              try { tags = JSON.parse(o.tags || "[]"); } catch { tags = []; }
              let metadata: Record<string, any> = {};
              try { metadata = JSON.parse(o.metadata || "{}"); } catch { metadata = {}; }
              return {
                id: o.id,
                symbol: o.symbol,
                timestamp: o.timestamp,
                direction: o.direction,
                velocity: o.velocity,
                price: o.price,
                tags,
                metadata,
                createdAt: o.created_at,
              };
            });
            result = { content: [{ type: "text", text: JSON.stringify({ symbol: symbol || "all", observations: parsed, count: parsed.length }, null, 2) }] };
            break;
          }
          case "generate_observation_insights": {
            const activeSymbol = ctx.getStatus().activeSymbol;
            const symbol = (args.symbol && args.symbol.trim()) || activeSymbol || "Step Index";
            const from = parseTimestamp(args.from);
            const to = parseTimestamp(args.to);
            const insights = ctx.generateInsights(symbol, from, to);
            result = { content: [{ type: "text", text: JSON.stringify(insights, null, 2) }] };
            break;
          }
          case "backtest_strategy_with_history": {
            const strategyId = args.strategyId;
            const activeSymbol = ctx.getStatus().activeSymbol;
            const symbol = (args.symbol && args.symbol.trim()) || activeSymbol || "Step Index";
            const from = parseTimestamp(args.from);
            const to = parseTimestamp(args.to);
            const initialBalance = typeof args.initialBalance === "number" ? args.initialBalance : 10000;
            if (!strategyId || !from || !to) {
              return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Missing required params: strategyId, from, to" } });
            }
            const candles = scalarAiDb.getCandles(symbol, from, to, 10000);
            if (candles.length === 0) {
              return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "No candles found for the specified time range" } });
            }
            const strategy = scalarAiDb.getStrategyById(strategyId);
            if (!strategy) {
              return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: `Strategy not found: ${strategyId}` } });
            }
            const engine = new BacktestEngine();
            const backtestMode = strategy.mode as unknown as StrategyMode;
            const engineResult = engine.runBacktest(backtestMode, candles.map(c => ({
              time: c.time,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              direction: c.direction,
              volume: c.volume || undefined,
            })), ctx.getConfig());

            engine.saveResult(engineResult);
            const backtestResult = {
              strategyId,
              symbol,
              from: args.from,
              to: args.to,
              totalTrades: engineResult.totalTrades,
              wins: engineResult.wins,
              losses: engineResult.losses,
              winRate: engineResult.winRate,
              profitFactor: engineResult.profitFactor,
              maxDrawdown: engineResult.maxDrawdown,
              avgWin: engineResult.avgWin,
              avgLoss: engineResult.avgLoss,
              finalBalance: engineResult.finalBalance,
              trades: engineResult.trades,
            };
            result = { content: [{ type: "text", text: JSON.stringify(backtestResult, null, 2) }] };
            break;
          }
          default: {
            return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${toolName}` } });
          }
        }

        return res.json({ jsonrpc: "2.0", id, result });
      }

      return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.json({ jsonrpc: "2.0", id, error: { code: -32603, message: `Internal error: ${message}` } });
    }
  };
}
