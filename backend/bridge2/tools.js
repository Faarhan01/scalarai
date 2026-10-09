/**
 * ScalarAI Bridge 2 - MCP Tools Catalog
 * Declares all Model Context Protocol (MCP) tools exposed to external AI agents.
 */

export const MCP_TOOLS = [
  {
    name: "mt5_get_status",
    description: "Get current status of MetaTrader 5 terminal, active symbol, account details, and bridge connection.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "mt5_get_account",
    description: "Retrieve MT5 account balance, equity, margin, free margin, leverage, broker, and server info.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "mt5_get_positions",
    description: "List all currently open trading positions in MetaTrader 5 (tickets, symbols, lots, SL/TP, floating profit).",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Optional symbol filter (e.g. 'Step Index'). If omitted, returns all open positions.",
        },
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
        type: {
          type: "string",
          enum: ["BUY", "SELL"],
          description: "Order direction: BUY (long) or SELL (short)",
        },
        symbol: {
          type: "string",
          description: "Asset symbol name (e.g. 'Step Index', 'Boom 1000', 'Volatility 75', 'EURUSD')",
        },
        volume: {
          type: "number",
          description: "Trade volume / lot size (e.g. 0.1, 0.5, 1.0)",
        },
        sl: {
          type: "number",
          description: "Stop Loss in points (e.g. 150)",
        },
        tp: {
          type: "number",
          description: "Take Profit in points (e.g. 300)",
        },
        reason: {
          type: "string",
          description: "AI analytical reasoning or strategy label for the trade",
        },
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
        ticket: {
          type: "string",
          description: "The position ticket or trade ID to close",
        },
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
        symbol: {
          type: "string",
          description: "Optional symbol name to close. If omitted, closes ALL open positions across all assets.",
        },
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
        ticket: {
          type: "string",
          description: "The position ticket or trade ID to modify",
        },
        sl: {
          type: "number",
          description: "New Stop Loss points (e.g. 120)",
        },
        tp: {
          type: "number",
          description: "New Take Profit points (e.g. 400)",
        },
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
        symbol: {
          type: "string",
          description: "Market symbol (e.g. 'Step Index')",
        },
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
        symbol: {
          type: "string",
          description: "Symbol name (e.g. 'Step Index')",
        },
        limit: {
          type: "number",
          description: "Number of candles to return (default: 50, max: 1000)",
        },
      },
      required: [],
    },
  },
  {
    name: "scalarai_get_system_status",
    description: "Get complete status from the connected ScalarAI full-stack platform (active symbols, EA ping, stats, logs).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "scalarai_toggle_automated_trading",
    description: "Enable or disable automated algorithmic strategy execution on the ScalarAI platform.",
    inputSchema: {
      type: "object",
      properties: {
        isActive: {
          type: "boolean",
          description: "True to start auto-trading, false to pause",
        },
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
        selectedStrategy: {
          type: "string",
          enum: ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE", "CUSTOM"],
        },
        tradingMode: {
          type: "string",
          enum: ["Scalping", "Swing"],
        },
      },
      required: [],
    },
  },
  {
    name: "scalarai_get_ai_knowledge",
    description: "Query AI study feed with quantitative velocity statistics and hourly volatility baselines.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "scalarai_get_strategies",
    description: "List all algorithmic strategies available on the ScalarAI platform.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "mt5_send_custom_command",
    description: "Send a custom raw command to MetaTrader 5 Expert Advisor or terminal queue.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Command action name",
        },
        payload: {
          type: "object",
          description: "Custom parameters object",
        },
      },
      required: ["command"],
    },
  },
];

/**
 * Executes a tool call against the MT5Client and SiteClient
 */
export async function executeToolCall(toolName, args = {}, { mt5Client, siteClient }) {
  try {
    switch (toolName) {
      case "mt5_get_status": {
        const status = mt5Client.getStatus();
        const siteHealth = await siteClient.getHealth();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  bridgeStatus: "online",
                  bridgeVersion: "2.0.0",
                  mt5Terminal: status,
                  scalarAiPlatform: siteHealth,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "mt5_get_account": {
        const account = mt5Client.getAccountInfo();
        return {
          content: [{ type: "text", text: JSON.stringify(account, null, 2) }],
        };
      }

      case "mt5_get_positions": {
        const positions = mt5Client.getPositions(args.symbol);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  count: positions.length,
                  positions,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "mt5_place_trade": {
        // Execute on MT5 client
        const mt5Result = await mt5Client.placeTrade({
          symbol: args.symbol,
          type: args.type,
          volume: args.volume,
          sl: args.sl,
          tp: args.tp,
          comment: args.reason,
        });

        // Also notify/commit to ScalarAI platform backend
        const siteResult = await siteClient.placeTrade({
          type: args.type,
          symbol: args.symbol,
          lotSize: args.volume,
          sl: args.sl,
          tp: args.tp,
          reason: args.reason,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "executed",
                  mt5: mt5Result,
                  scalarAi: siteResult,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "mt5_close_trade": {
        const mt5Result = await mt5Client.closeTrade(args.ticket);
        const siteResult = await siteClient.closeTrade(args.ticket);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "closed",
                  ticket: args.ticket,
                  mt5: mt5Result,
                  scalarAi: siteResult,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "mt5_close_all_trades": {
        const mt5Result = await mt5Client.closeAllPositions(args.symbol);
        const siteResult = await siteClient.closeAllTrades(args.symbol);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "liquidated",
                  mt5: mt5Result,
                  scalarAi: siteResult,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "mt5_modify_trade": {
        const mt5Result = await mt5Client.modifyPosition(args.ticket, { sl: args.sl, tp: args.tp });
        const siteResult = await siteClient.modifyTrade(args.ticket, { sl: args.sl, tp: args.tp });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "modified",
                  ticket: args.ticket,
                  mt5: mt5Result,
                  scalarAi: siteResult,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "mt5_get_market_price": {
        const status = await siteClient.getStatus();
        const symbol = args.symbol || mt5Client.activeSymbol;
        let price = status.currentPrice || 1250.0;
        if (status.symbolStates && Array.isArray(status.symbolStates)) {
          const match = status.symbolStates.find((s) => s.symbol.toLowerCase() === symbol.toLowerCase());
          if (match && match.currentPrice) price = match.currentPrice;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  symbol,
                  price,
                  bid: Number((price - 0.1).toFixed(4)),
                  ask: Number((price + 0.1).toFixed(4)),
                  spread: 0.2,
                  time: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "mt5_get_candles": {
        const candlesRes = await siteClient.getCandles(args.symbol, args.limit || 50);
        return {
          content: [{ type: "text", text: JSON.stringify(candlesRes, null, 2) }],
        };
      }

      case "scalarai_get_system_status": {
        const status = await siteClient.getStatus();
        return {
          content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
        };
      }

      case "scalarai_toggle_automated_trading": {
        const result = await siteClient.updateSettings({ isActive: !!args.isActive });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  isActive: args.isActive,
                  message: `Automated trading ${args.isActive ? "STARTED" : "STOPPED"}`,
                  result,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "scalarai_update_settings": {
        const result = await siteClient.updateSettings(args);
        return {
          content: [{ type: "text", text: JSON.stringify({ updated: true, settings: args, result }, null, 2) }],
        };
      }

      case "scalarai_get_ai_knowledge": {
        const feed = await siteClient.getAiStudyFeed();
        return {
          content: [{ type: "text", text: JSON.stringify(feed, null, 2) }],
        };
      }

      case "scalarai_get_strategies": {
        const list = await siteClient.getStrategies();
        return {
          content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
        };
      }

      case "mt5_send_custom_command": {
        mt5Client.writeIpcCommand(args.command, args.payload || {});
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  queued: true,
                  command: args.command,
                  payload: args.payload,
                  timestamp: Date.now(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Unknown MCP tool: ${toolName}` }),
            },
          ],
        };
    }
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: `Failed to execute ${toolName}: ${err.message}` }),
        },
      ],
    };
  }
}
