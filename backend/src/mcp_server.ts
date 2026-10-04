import { Request, Response } from "express";
import { McpContext } from "./types";

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
    description: "Get the full ScalarAI system status including connection, config, trades, logs, stats, and AI strategy.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_ai_knowledge_base",
    description: "Get the AI knowledge base containing long-term market velocity observations, hourly patterns, and peak speeds.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_ai_strategy",
    description: "Get the current AI synthesized strategy rules and rationale.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "analyze_market",
    description: "Trigger a Gemini AI market analysis report based on recent price history and current strategy.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "synthesize_strategy",
    description: "Synthesize a new AI strategy based on current market telemetry, knowledge base, and trade performance.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "update_trading_settings",
    description: "Update trading parameters such as lot size, TP, SL, strategy mode, and trading mode.",
    inputSchema: {
      type: "object",
      properties: {
        selectedStrategy: { type: "string", enum: ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE"] },
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
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["OPEN", "CLOSED"] } }, required: [] },
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
    description: "Place a BUY or SELL trade. If AI mode is enabled, the trade will be verified by the Gemini cognitive engine before execution.",
    inputSchema: { type: "object", properties: { type: { type: "string", enum: ["BUY", "SELL"] }, reason: { type: "string" } }, required: ["type"] },
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
          result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "scalarai-mcp", version: "1.0.0" } },
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
          case "analyze_market": {
            const report = await ctx.analyzeMarket();
            result = { content: [{ type: "text", text: report || "No report returned." }] };
            break;
          }
          case "synthesize_strategy": {
            const strategy = await ctx.synthesizeStrategy();
            result = { content: [{ type: "text", text: JSON.stringify(strategy, null, 2) }] };
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
            result = { content: [{ type: "text", text: JSON.stringify(trades, null, 2) }] };
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
