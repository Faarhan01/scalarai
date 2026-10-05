import { Request, Response } from "express";
import { McpContext } from "./types";
import { scalarAiDb } from "./db";
import { evaluateStrategyBacktest } from "./services/strategy";
import { updateKnowledgeBaseFromTelemetry, formatKnowledgeBase } from "./services/knowledge";
import { analyzeMarket, analyzeStrategyPerformance, suggestStrategyOptimizations, recommendStrategyForConditions } from "./services/strategy-research";

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

const TOOLS: McpTool[] = [
  {
    name: "get_system_status",
    description: "Get full ScalarAI system status: config, connection, trades, logs, stats, AI strategy, and symbol states.",
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
    description: "Place a BUY or SELL trade. Gatekeeper rules and strategy rules are applied automatically.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["BUY", "SELL"] },
        reason: { type: "string" },
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
];

function isReadOnlySql(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  const forbidden = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "CREATE", "REPLACE", "PRAGMA"];
  return !forbidden.some(keyword => trimmed.startsWith(keyword));
}

export function createMcpHandler(ctx: McpContext, expectedApiKey: string) {
  return async (req: Request, res: Response) => {
    const body = req.body || {};

    if (!body.jsonrpc || body.jsonrpc !== "2.0") {
      return res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" } });
    }

    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith(`Bearer ${expectedApiKey}`)) {
      return res.status(401).json({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32001, message: "Unauthorized: Invalid or missing Bearer token" } });
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
              await ctx.updateSettings({ selectedStrategy: "CUSTOM" });
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
            } catch (err: any) {
              return res.json({ jsonrpc: "2.0", id, error: { code: -32603, message: `Query failed: ${err.message}` } });
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
            if (args.status) trades = trades.filter((t: any) => t.status === args.status);
            const limit = typeof args.limit === "number" ? args.limit : 100;
            result = { content: [{ type: "text", text: JSON.stringify(trades.slice(0, limit), null, 2) }] };
            break;
          }
          case "get_system_logs": {
            let logs = ctx.getLogs();
            if (args.source) logs = logs.filter((l: any) => l.source === args.source);
            if (args.level) logs = logs.filter((l: any) => l.level === args.level);
            const limit = typeof args.limit === "number" ? args.limit : 50;
            result = { content: [{ type: "text", text: JSON.stringify(logs.slice(0, limit), null, 2) }] };
            break;
          }
          case "place_validated_trade": {
            if (!args.type || !["BUY", "SELL"].includes(args.type)) {
              return res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid params: type must be BUY or SELL" } });
            }
            const tradeResult = await ctx.placeTrade(args.type, typeof args.reason === "string" ? args.reason : "MCP initiated trade");
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
          case "reset_stats": {
            await ctx.resetStats();
            result = { content: [{ type: "text", text: "Stats reset successfully." }] };
            break;
          }
          case "get_market_telemetry": {
            const limit = typeof args.limit === "number" ? args.limit : 100;
            const symbol = args.symbol || "Step Index";
            const state = scalarAiDb.getAiKnowledge();
            result = { content: [{ type: "text", text: JSON.stringify({ symbol, telemetryCount: state?.totalObservations || 0, knowledge: state }, null, 2) }] };
            break;
          }
          case "get_recent_candles": {
            const limit = typeof args.limit === "number" ? args.limit : 50;
            const candles = scalarAiDb.rawQuery("SELECT * FROM market_ticks ORDER BY time DESC LIMIT ?", [limit]);
            result = { content: [{ type: "text", text: JSON.stringify({ candles: candles.reverse() }, null, 2) }] };
            break;
          }
          case "analyze_strategy_performance": {
            const mode = args.mode || "TREND_FOLLOWING";
            const limit = typeof args.limit === "number" ? args.limit : 100;
            const allTrades = scalarAiDb.getTrades();
            const modeTrades = allTrades.filter((t: any) => t.strategy === mode).slice(0, limit);
            const closed = modeTrades.filter((t: any) => t.status === "CLOSED");
            const wins = closed.filter((t: any) => t.profit > 0);
            const losses = closed.filter((t: any) => t.profit <= 0);
            const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
            const totalProfit = closed.reduce((sum: number, t: any) => sum + t.profit, 0);
            const avgWin = wins.length > 0 ? wins.reduce((sum: number, t: any) => sum + t.profit, 0) / wins.length : 0;
            const avgLoss = losses.length > 0 ? losses.reduce((sum: number, t: any) => sum + t.profit, 0) / losses.length : 0;
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
            const symbol = args.symbol || "Step Index";
            const state2 = scalarAiDb.getAiKnowledge();
            if (!state2) {
              result = { content: [{ type: "text", text: "No knowledge base found. Initialize it first." }] };
              break;
            }
            const telemetry = scalarAiDb.rawQuery("SELECT velocity, timestamp FROM market_ticks ORDER BY timestamp DESC LIMIT 500", []);
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
            const symbol = args.symbol || "Step Index";
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
            const { STRATEGY_TEMPLATES } = require("./services/strategy-templates");
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
              const { createStrategyFromTemplate } = require("./services/strategy-templates");
              const strategy = createStrategyFromTemplate(templateId, args.overrides);
              scalarAiDb.upsertAiStrategy(strategy);
              result = { content: [{ type: "text", text: JSON.stringify({ success: true, strategy }, null, 2) }] };
            } catch (err: any) {
              result = { content: [{ type: "text", text: `Error: ${err.message}` }] };
            }
            break;
          }
          case "export_data": {
            const type = args.type || "trades";
            const limit = typeof args.limit === "number" ? args.limit : 500;
            const format = args.format || "json";
            
            let data: any;
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
          default: {
            return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${toolName}` } });
          }
        }

        return res.json({ jsonrpc: "2.0", id, result });
      }

      return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
    } catch (error: any) {
      return res.json({ jsonrpc: "2.0", id, error: { code: -32603, message: `Internal error: ${error.message || error}` } });
    }
  };
}
