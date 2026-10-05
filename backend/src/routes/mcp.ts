import { Request, Response } from "express";
import { createMcpHandler } from "../mcp_server";
import { McpContext } from "../types";

const TOOLS = [
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
    description: "Activate a strategy by ID or mode (TREND_FOLLOWING, MEAN_REVERSION, AI_ADAPTIVE).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Strategy ID for custom strategies" },
        mode: { type: "string", enum: ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE"] },
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
        mode: { type: "string", enum: ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE"] },
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
];

export function registerMcpRoute(app: any, ctx: McpContext, apiKey: string) {
  app.post("/mcp", (req: Request, res: Response) => {
    createMcpHandler(ctx, apiKey)(req, res);
  });
}

export { TOOLS };
