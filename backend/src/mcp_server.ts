import { Request, Response } from "express";
import { McpContext, StrategyMode, TradeRecord, SystemLog } from "./types";
import { scalarAiDb } from "./db";
import { evaluateStrategyBacktest } from "./knowledgebase/strategies/strategy";
import { BacktestEngine } from "./knowledgebase/strategies/backtest";
import { updateKnowledgeBaseFromTelemetry, formatKnowledgeBase, getKnowledgeSummary, formatKnowledgeSummary, recordPatternResult, getPatternStats } from "./knowledgebase/knowledge";
import { checkPattern } from "./knowledgebase/patterns/pattern-checker";
import { shuffleNull } from "./knowledgebase/core/common";
import { PatternResultRow } from "./types";
import { analyzeMarket, analyzeStrategyPerformance, suggestStrategyOptimizations, recommendStrategyForConditions } from "./knowledgebase/strategies/research";
import { parseTimestamp, parseLimit } from "./utils/time";
// Static import: these were `require()`d inside tools/call, but this module is
// ESM (loaded through tsx), so require is not defined and both
// list_strategy_templates and create_strategy_from_template failed every call
// with "Internal error: require is not defined".
import {
  STRATEGY_TEMPLATES,
  createStrategyFromTemplate,
  getStrategyTemplateById,
  getStrategiesByCategory,
} from "./knowledgebase/strategies/templates";
// Shared StrategyForge result store. research.ts owns the array so the REST
// routes and MCP are two views of one list rather than two lists that drift.
import {
  getStrategyForgeResults,
  parseStrategyForgeCsv,
  recordStrategyForgeResult,
} from "./core/server/research";
import { mt5Bridge } from "./gateway/mt5-bridge";

/**
 * Protocol versions this server understands, newest first.
 *
 * The handler previously hardcoded "2024-11-05" regardless of what the client
 * asked for. Spec-compliant clients send their own version and expect either
 * that version back or one they can accept, so echo the client's when we
 * support it and otherwise offer the newest we do.
 */
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

function negotiateProtocolVersion(requested?: unknown): string {
  if (typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    return requested;
  }
  return DEFAULT_PROTOCOL_VERSION;
}

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
    name: "modify_trade_sl_tp",
    description: "Modify Stop Loss (SL) and/or Take Profit (TP) points on an open trade or MT5 ticket. Propagates command to MT5 EA.",
    inputSchema: {
      type: "object",
      properties: {
        tradeId: { type: "string", description: "Trade ID or ticket number" },
        sl: { type: "number", description: "New Stop Loss in points (optional)" },
        tp: { type: "number", description: "New Take Profit in points (optional)" },
      },
      required: ["tradeId"],
    },
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
    name: "ingest_strategyforge_csv",
    description:
      "Record a StrategyForge CSV report from an MT5 Strategy Tester run so it becomes visible in the site and MCP. " +
      "This is the ONLY way tester results reach the platform: the EA cannot post them itself, because " +
      "WebRequest is unavailable in the Strategy Tester (error 4014) regardless of the MT5 allow-list. " +
      "Pass the contents of StrategyForge_<tag>.csv, which the EA writes to " +
      "%APPDATA%\\MetaQuotes\\Terminal\\Common\\Files\\.",
    inputSchema: {
      type: "object",
      properties: {
        csvContent: { type: "string", description: "Full contents of a StrategyForge_<tag>.csv report, header row first." },
      },
      required: ["csvContent"],
    },
  },
  {
    name: "get_strategyforge_results",
    description:
      "List recorded StrategyForge results, newest first, with score, trades, win rate, profit, " +
      "profit factor and drawdown. Same data as the scalarai://tester/results resource.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum results to return (default 20)" },
        symbol: { type: "string", description: "Optional symbol filter" },
      },
      required: [],
    },
  },
  {
    name: "run_strategy_tester",
    description:
      "Run the native MT5 Strategy Tester for ANY compiled EA (.ex5) installed in the terminal. " +
      "Launches terminal64.exe with a [Tester] block, waits for completion, and returns the report. " +
      "Works with any EA, not just StrategyForge.",
    inputSchema: {
      type: "object",
      properties: {
        expert: { type: "string", description: "EA path relative to MQL5/Experts (e.g. Bots\\\\StrategyForge). MT5 prepends 'Experts\\\\' automatically. Any compiled .ex5 works." },
        symbol: { type: "string", description: "Symbol to test on (default: Step Index)" },
        period: { type: "string", description: "Timeframe: M1, M5, M15, M30, H1, H4, D1 (default: M15)" },
        from: { type: "string", description: "Start date YYYY.MM.DD (default: 90 days ago)" },
        to: { type: "string", description: "End date YYYY.MM.DD (default: today)" },
        model: { type: "string", description: "Tick model: real-ticks, every-tick, minute-ohlc, open-only, math (default: real-ticks)" },
        deposit: { type: "number", description: "Initial deposit (default: 10000)" },
        currency: { type: "string", description: "Account currency (default: USD)" },
        leverage: { type: "number", description: "Leverage (default: 100)" },
        inputs: { type: "object", description: "EA input overrides as key-value pairs" },
        visual: { type: "boolean", description: "Show tester window (default: false)" },
        shutdown: { type: "boolean", description: "Shutdown terminal after test (default: true)" },
        timeout: { type: "number", description: "Max wait time in seconds (default: 300)" },
        tag: { type: "string", description: "Tag for CSV report filename (default: test)" },
      },
      required: ["expert"],
    },
  },
  {
    name: "check_pattern",
    description:
      "Run a statistical pattern check on historical bars. Scans for a pattern, " +
      "computes forward returns, runs Welch's t-test vs baseline, compares against " +
      "a null (shuffled) baseline, checks split-half agreement, and returns a verdict: " +
      "EDGE, NO EDGE, or INCONCLUSIVE. Result is stored in pattern_results table.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol to analyze (default: Step Index)" },
        timeframe: { type: "string", description: "Timeframe: M1, M5, M15, M30, H1, H4, D1 (default: M15)" },
        pattern_name: { type: "string", description: "Pattern to check: engulfing, hammer, doji, consecutive, inside_bar, double_top" },
        bars: { type: "number", description: "Number of historical bars to scan (default: 1000)" },
        forward_bars: { type: "number", description: "Bars forward to measure return (default: 5)" },
        cost_points: { type: "number", description: "Spread cost in points (default: 0)" },
        min_trades: { type: "number", description: "Minimum occurrences for verdict (default: 30)" },
      },
      required: ["pattern_name"],
    },
  },
  {
    name: "ingest_history",
    description:
      "Pull historical bars from MetaTrader 5 and store them in market_candles " +
      "so the knowledgebase can test against them. This is how chart history " +
      "reaches the pattern checker: ingest first, then check_all_patterns.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol to pull (e.g. EURUSD, Step Index)" },
        timeframe: { type: "string", description: "Timeframe: M1, M5, M15, M30, H1, H4, D1 (default: M15)" },
        count: { type: "number", description: "Bars to pull (default 1000, max 60000)" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "check_all_patterns",
    description:
      "Run EVERY known pattern against one bar set and store each result. " +
      "This is the batch entry point: one call fetches the history, runs the " +
      "whole pattern suite, and records a verdict per pattern.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol to analyze (default: Step Index)" },
        timeframe: { type: "string", description: "Timeframe: M1, M5, M15, M30, H1, H4, D1 (default: M15)" },
        bars: { type: "number", description: "Number of historical bars (default: 1000)" },
        forward_bars: { type: "number", description: "Bars forward to measure return (default: 5)" },
        cost_points: { type: "number", description: "Spread cost in points (default: 0)" },
        min_trades: { type: "number", description: "Minimum occurrences for verdict (default: 30)" },
      },
      required: [],
    },
  },
  {
    name: "get_pattern_results",
    description:
      "List stored pattern test results with verdicts. Filter by symbol, timeframe, or verdict.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Optional symbol filter" },
        timeframe: { type: "string", description: "Optional timeframe filter" },
        verdict: { type: "string", enum: ["EDGE", "NO EDGE", "INCONCLUSIVE"], description: "Optional verdict filter" },
        limit: { type: "number", description: "Maximum results (default: 50)" },
      },
      required: [],
    },
  },
  {
    name: "get_null_control",
    description:
      "Run a null (shuffled) baseline for a symbol/timeframe. Returns the t-statistic " +
      "and p-value of the shuffled baseline for comparison against pattern results.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol to analyze (default: Step Index)" },
        timeframe: { type: "string", description: "Timeframe (default: M15)" },
        bars: { type: "number", description: "Number of bars (default: 1000)" },
        iterations: { type: "number", description: "Shuffle iterations (default: 1000)" },
      },
      required: [],
    },
  },
  {
    name: "list_indicators",
    description: "List all indicator library entries. Optionally filter by category (trend, momentum, volatility, volume, custom).",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Optional category filter" },
      },
      required: [],
    },
  },
  {
    name: "add_indicator",
    description: "Add a custom indicator to the indicator library. Formula is a JSON object with parameter names and defaults.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Indicator name" },
        category: { type: "string", enum: ["trend", "momentum", "volatility", "volume", "custom"], description: "Category" },
        formula: { type: "object", description: "JSON with parameter names, defaults, and description" },
      },
      required: ["name", "category"],
    },
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
    description: "Get recent OHLC candles for any symbol and timeframe (M1, M5, M15, M30, H1, H4, D1) directly from MetaTrader 5 or database. Useful for chart analysis and pattern recognition.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol to query (default: active symbol)" },
        timeframe: { type: "string", description: "Timeframe: M1, M5, M15, M30, H1, H4, D1, W1 (default: M1)" },
        limit: { type: "number", description: "Number of candles to return (default 50, max 500)" },
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
  {
    name: "mt5_get_bridge_status",
    description: "Get connection status and metadata from the direct Python MetaTrader 5 bridge (mt5_pkg_bridge).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "mt5_connect_bridge",
    description: "Initiate direct connection to MetaTrader 5 terminal via mt5_pkg_bridge.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Optional path to terminal64.exe" },
        login: { type: "number", description: "Optional MT5 account login" },
        server: { type: "string", description: "Optional broker server name" },
        password: { type: "string", description: "Optional MT5 password" },
      },
      required: [],
    },
  },
  {
    name: "mt5_disconnect_bridge",
    description: "Disconnect active MetaTrader 5 bridge connection.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "mt5_get_account_info",
    description: "Fetch live account equity, balance, leverage, margin, and broker info directly from MetaTrader 5 via bridge.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "mt5_get_terminal_info",
    description: "Fetch terminal build, connected broker server, paths, ping, and status directly from MetaTrader 5.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "mt5_get_symbols",
    description: "List all instruments and symbols available in the connected MetaTrader 5 terminal.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "mt5_get_symbol_info",
    description: "Get detailed symbol contract specifications (spread, digits, contract size, margin rate) from MT5.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol name" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "mt5_get_positions",
    description: "Get all open positions directly from MetaTrader 5 via bridge.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "mt5_get_rates",
    description: "Fetch historical candlestick rates directly from MetaTrader 5 via bridge.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol name" },
        timeframe: { type: "number", description: "Timeframe in minutes" },
        count: { type: "number", description: "Number of bars to fetch" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "mt5_get_history_deals",
    description: "Fetch closed deal history directly from MetaTrader 5 via bridge.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Days of history (default 30)" },
      },
      required: [],
    },
  },
  {
    name: "mt5_get_history_orders",
    description: "Fetch closed order history directly from MetaTrader 5 via bridge.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Days of history (default 30)" },
      },
      required: [],
    },
  },
  {
    name: "mt5_buy",
    description: "Execute a live BUY order directly on MetaTrader 5 through mt5_pkg_bridge.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol to trade" },
        volume: { type: "number", description: "Volume in lots" },
        sl: { type: "number", description: "Stop loss price or points" },
        tp: { type: "number", description: "Take profit price or points" },
        comment: { type: "string", description: "Order comment" },
      },
      required: ["symbol", "volume"],
    },
  },
  {
    name: "mt5_sell",
    description: "Execute a live SELL order directly on MetaTrader 5 through mt5_pkg_bridge.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol to trade" },
        volume: { type: "number", description: "Volume in lots" },
        sl: { type: "number", description: "Stop loss price or points" },
        tp: { type: "number", description: "Take profit price or points" },
        comment: { type: "string", description: "Order comment" },
      },
      required: ["symbol", "volume"],
    },
  },
  {
    name: "mt5_close_position",
    description: "Close an open MetaTrader 5 position by ticket. Supports full close or partial lot closure.",
    inputSchema: {
      type: "object",
      properties: {
        ticket: { type: "number", description: "Unique ticket number of the open position to close" },
        volume: { type: "number", description: "Volume in lots to close. If omitted or 0, closes the entire position." },
      },
      required: ["ticket"],
    },
  },
  {
    name: "mt5_close_all",
    description: "Emergency liquidation: Close all open positions immediately or all open positions for a designated symbol.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol filter (e.g. 'EURUSD'), or 'ALL' to liquidate entire portfolio." },
      },
      required: [],
    },
  },
  {
    name: "mt5_call_function",
    description: "Dynamically execute ANY public MetaTrader 5 API function or MT5Engine method via the auto-discovering bridge.",
    inputSchema: {
      type: "object",
      properties: {
        function: { type: "string", description: "Name of the MT5 function or engine method to call" },
        args: { type: "array", description: "Positional arguments" },
        kwargs: { type: "object", description: "Keyword arguments" },
      },
      required: ["function"],
    },
  },
  {
    name: "mt5_list_functions",
    description: "List all auto-discovered MetaTrader 5 functions and engine operations available through mt5_pkg_bridge.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_mt5_bridge_status",
    description: "Get connection status and metadata from the direct Python MetaTrader 5 bridge (mt5_pkg_bridge).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "connect_mt5_bridge",
    description: "Initiate direct connection to MetaTrader 5 terminal via mt5_pkg_bridge.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Optional path to terminal64.exe" },
        login: { type: "number", description: "Optional MT5 account login" },
        server: { type: "string", description: "Optional broker server name" },
        password: { type: "string", description: "Optional MT5 password" },
      },
    },
  },
  {
    name: "disconnect_mt5_bridge",
    description: "Disconnect active MetaTrader 5 bridge connection.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_mt5_account_info",
    description: "Fetch live account equity, balance, leverage, margin, and broker info directly from MetaTrader 5 via bridge.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_mt5_terminal_info",
    description: "Fetch terminal build, connected broker server, paths, ping, and status directly from MetaTrader 5.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_mt5_symbols",
    description: "List all instruments and symbols available in the connected MetaTrader 5 terminal.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_mt5_symbol_info",
    description: "Get detailed symbol contract specifications (spread, digits, contract size, margin rate) from MT5.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol name" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_mt5_positions",
    description: "Get all open positions directly from MetaTrader 5 via bridge.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_mt5_rates",
    description: "Fetch historical candlestick rates directly from MetaTrader 5 via bridge.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol name" },
        timeframe: { type: "number", description: "Timeframe in minutes" },
        count: { type: "number", description: "Number of bars to fetch" },
      },
      required: ["symbol"],
    },
  },
   {
     name: "get_mt5_history_deals",
     description: "Fetch closed deal history directly from MetaTrader 5 via bridge.",
     inputSchema: {
       type: "object",
       properties: {
         days: { type: "number", description: "Days of history (default 30)" },
       },
     },
   },
   {
     name: "get_mt5_history_orders",
     description: "Fetch closed order history directly from MetaTrader 5 via bridge.",
     inputSchema: {
       type: "object",
       properties: {
         days: { type: "number", description: "Days of history (default 30)" },
       },
     },
   },
   {
     name: "execute_mt5_bridge_order",
    description: "Execute a live order (BUY, SELL, CLOSE, CLOSE_ALL) directly on MetaTrader 5 through mt5_pkg_bridge.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["BUY", "SELL", "CLOSE", "CLOSE_ALL"] },
        symbol: { type: "string", description: "Symbol to trade" },
        volume: { type: "number", description: "Volume in lots" },
        sl: { type: "number", description: "Stop loss price or points" },
        tp: { type: "number", description: "Take profit price or points" },
        ticket: { type: "number", description: "Ticket number to close" },
        comment: { type: "string", description: "Order comment" },
      },
      required: ["action"],
    },
  },
  {
    name: "call_mt5_function",
    description: "Dynamically execute ANY public MetaTrader 5 API function or MT5Engine method via the auto-discovering bridge (e.g. copy_ticks_from, copy_ticks_range, symbol_info_tick, market_book_get, order_calc_margin, order_calc_profit, positions_get, orders_get, etc.). Automatically exposes all capabilities provided by the MetaTrader5 package.",
    inputSchema: {
      type: "object",
      properties: {
        function: { type: "string", description: "Name of the MT5 function or engine method to call" },
        args: { type: "array", description: "Positional arguments" },
        kwargs: { type: "object", description: "Keyword arguments (named parameters)" },
      },
      required: ["function"],
    },
  },
  {
    name: "list_mt5_bridge_functions",
    description: "List all auto-discovered MetaTrader 5 functions and engine operations available through mt5_pkg_bridge.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "modify_mt5_position",
    description: "Modify Stop Loss (SL) and/or Take Profit (TP) of an open MetaTrader 5 position directly through the bridge.",
    inputSchema: {
      type: "object",
      properties: {
        ticket: { type: "number", description: "MT5 Position ticket number" },
        sl: { type: "number", description: "New Stop Loss price" },
        tp: { type: "number", description: "New Take Profit price" },
      },
      required: ["ticket"],
    },
  },
  {
    name: "get_mt5_orders",
    description: "Fetch pending limit/stop orders directly from MetaTrader 5 via the bridge.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Optional symbol filter" },
      },
    },
  },
  {
    name: "get_mt5_tick",
    description: "Fetch the latest real-time tick (bid, ask, last, spread, volume, time) for a symbol directly from MetaTrader 5 via the bridge.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol name (e.g. EURUSD, Step Index)" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_mt5_market_depth",
    description: "Fetch real-time Market Depth (Order Book) for a symbol directly from MetaTrader 5 via the bridge.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol name" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "calc_mt5_margin",
    description: "Calculate required margin for an order directly via MetaTrader 5 bridge.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["BUY", "SELL"] },
        symbol: { type: "string", description: "Symbol name" },
        volume: { type: "number", description: "Lot volume" },
        price: { type: "number", description: "Order price (optional)" },
      },
      required: ["action", "symbol", "volume"],
    },
  },
  {
    name: "calc_mt5_profit",
    description: "Calculate profit or loss for an order if price moves from openPrice to closePrice, directly via MetaTrader 5 bridge.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["BUY", "SELL"] },
        symbol: { type: "string", description: "Symbol name" },
        volume: { type: "number", description: "Lot volume" },
        openPrice: { type: "number", description: "Opening price" },
        closePrice: { type: "number", description: "Closing price" },
      },
      required: ["action", "symbol", "volume", "openPrice", "closePrice"],
    },
  },
  {
    name: "get_mt5_totals",
    description: "Get MT5 terminal counters in one call: total symbols, total positions, and total pending orders.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

export function isReadOnlySql(sql: string): boolean {
  if (!sql || typeof sql !== "string") return false;
  const trimmed = sql.trim();
  if (!/^\s*SELECT\b/i.test(trimmed)) return false;
  if (/;|--|\/\*/.test(trimmed)) return false;
  // Use word boundary check so symbol names like 'Step Index' or 'Volatility Index' are never false-positively blocked
  const forbiddenDdl = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|REPLACE|PRAGMA|ATTACH|DETACH|VACUUM|TRIGGER)\b/i;
  return !forbiddenDdl.test(trimmed);
}

//=== Resources ============================================================
//
// Resources are context the client attaches up front, rather than things the
// agent has to guess a tool name for. Before these existed, an agent wanting
// the knowledge base or the strategy catalogue had to try
// get_ai_knowledge_base or list_strategies and hope. Resources make that
// discovery automatic.

export interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export const RESOURCES: McpResource[] = [
  { uri: "scalarai://status", name: "System status", description: "Full platform state: config, connection, symbols, stats and active strategy.", mimeType: "application/json" },
  { uri: "scalarai://config", name: "Trading configuration", description: "Current lot size, TP/SL, trailing stop, max trades, trading mode and AI toggle.", mimeType: "application/json" },
  { uri: "scalarai://strategy/active", name: "Active AI strategy", description: "The strategy currently driving automated decisions, including rules and parameters.", mimeType: "application/json" },
  { uri: "scalarai://strategies", name: "Strategy catalogue", description: "Every built-in and custom strategy available, with descriptions.", mimeType: "application/json" },
  { uri: "scalarai://strategy-templates", name: "Strategy templates", description: "Reusable strategy templates with default configuration, by trading style.", mimeType: "application/json" },
  { uri: "scalarai://knowledge/base", name: "AI knowledge base", description: "Long-term market observations: velocity clusters, hourly patterns, peak speeds.", mimeType: "application/json" },
  { uri: "scalarai://knowledge/patterns", name: "Pattern results", description: "All pattern test results with verdicts (EDGE, NO EDGE, INCONCLUSIVE).", mimeType: "application/json" },
  { uri: "scalarai://knowledge/edge", name: "Edge patterns", description: "Only patterns with EDGE verdict, sorted by net_after_cost.", mimeType: "application/json" },
  { uri: "scalarai://symbols", name: "Connected symbols", description: "All symbols reporting from the MT5 EA, with price, connection state and tick counts.", mimeType: "application/json" },
  { uri: "scalarai://trades/open", name: "Open positions", description: "Currently open trades with entry, SL/TP and unrealised result.", mimeType: "application/json" },
  { uri: "scalarai://trades/recent", name: "Recent trade history", description: "Most recently closed trades, newest first.", mimeType: "application/json" },
  { uri: "scalarai://logs/recent", name: "Recent system logs", description: "Latest server, EA and AI log entries for diagnosing behaviour.", mimeType: "application/json" },
  { uri: "scalarai://tester/results", name: "StrategyForge tester results", description: "Native MT5 Strategy Tester results reported by the StrategyForge EA, newest first.", mimeType: "application/json" },
  { uri: "scalarai://guides/backtesting", name: "Backtesting guide", description: "How to backtest properly here: use MT5's native tester, not the in-app engine.", mimeType: "text/markdown" },
  { uri: "scalarai://bridge/status", name: "MT5 Bridge Status", description: "Direct MetaTrader 5 Python bridge status, package metadata, and terminal connection state.", mimeType: "application/json" },
  { uri: "scalarai://bridge/functions", name: "MT5 Bridge Functions", description: "All public MetaTrader 5 functions and engine operations available dynamically via the bridge.", mimeType: "application/json" },
  { uri: "scalarai://bridge/positions", name: "MT5 Live Positions", description: "Open positions currently reported by MetaTrader 5 via the bridge.", mimeType: "application/json" },
  { uri: "scalarai://bridge/symbols", name: "MT5 Broker Symbols", description: "All tradable symbols and instruments available in the broker terminal via MT5 bridge.", mimeType: "application/json" },
  { uri: "scalarai://bridge/deals", name: "MT5 History Deals", description: "Realized closed trades and execution deals directly from MetaTrader 5.", mimeType: "application/json" },
];

export const RESOURCE_TEMPLATES = [
  {
    uriTemplate: "scalarai://candles/{symbol}",
    name: "Candles for a symbol",
    description: "Recent OHLC candles for one symbol, oldest first.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "scalarai://rates/{symbol}/{timeframe}",
    name: "Candlestick rates from MT5",
    description: "Historical candlestick rates directly from MetaTrader 5 via bridge (e.g. M1, M5, H1, D1).",
    mimeType: "application/json",
  },
  {
    uriTemplate: "scalarai://observations/{symbol}",
    name: "AI observations for a symbol",
    description: "Recorded direction and velocity observations for one symbol.",
    mimeType: "application/json",
  },
];

//=== Prompts ==============================================================
//
// Prompts give the client ready-made workflows. This is the difference between
// an agent that checks risk before trading and one that does not, because the
// workflow is advertised rather than rediscovered from tool names.

export interface McpPrompt {
  name: string;
  description: string;
  arguments: Array<{ name: string; description: string; required?: boolean }>;
}

export const PROMPTS: McpPrompt[] = [
  {
    name: "assess_risk",
    description: "Review current exposure and decide whether it is safe to trade or modify positions.",
    arguments: [{ name: "symbol", description: "Optional symbol to focus on" }],
  },
  {
    name: "review_strategy",
    description: "Assess a strategy's realised performance and recommend adjustments.",
    arguments: [{ name: "mode", description: "TREND_FOLLOWING | MEAN_REVERSION | AI_ADAPTIVE | CUSTOM", required: true }],
  },
  {
    name: "research_market",
    description: "Analyse current market conditions for a symbol before committing to a trade.",
    arguments: [{ name: "symbol", description: "Symbol to analyse" }],
  },
  {
    name: "summarise_session",
    description: "Summarise the current trading session: results, open risk and what changed.",
    arguments: [],
  },
  {
    name: "validate_strategy",
    description: "Evaluate a strategy before enabling it, using native MT5 tester evidence rather than in-app backtests.",
    arguments: [{ name: "mode", description: "Strategy mode to evaluate", required: true }],
  },
];

/** Render a prompt's messages, interpolating its arguments. */
function renderPrompt(name: string, args: Record<string, any> | undefined): string | null {
  const a = args || {};
  switch (name) {
    case "assess_risk":
      return [
        `Assess trading risk${a.symbol ? ` for ${a.symbol}` : " across all symbols"}.`,
        "",
        "1. Read the scalarai://status and scalarai://trades/open resources.",
        "2. Run get_symbols to see which markets are actually connected.",
        "3. Report total open exposure, largest single risk, whether every position has TP/SL, and whether limits allow another entry.",
        "4. Conclude with SAFE TO TRADE, REDUCE RISK, or NO NEW ENTRIES, and justify it.",
        "",
        "Do not place or close anything without first stating the intended change.",
      ].join("\n");

    case "review_strategy":
      return [
        `Review the ${a.mode || "TREND_FOLLOWING"} strategy.`,
        "",
        "1. Run analyze_strategy_performance and get_strategy_performance for that mode.",
        "2. Read scalarai://trades/recent to inspect actual outcomes.",
        "3. Run optimize_strategy for suggested parameter changes.",
        "4. State win rate, profit factor, sample size and expectancy.",
        "5. Flag explicitly if the sample is too small to conclude from (<30 closed trades).",
      ].join("\n");

    case "research_market":
      return [
        `Research the market${a.symbol ? ` for ${a.symbol}` : " on the active symbol"}.`,
        "",
        "1. Run analyze_market, then get_recent_candles for structure.",
        "2. Run recommend_strategy with the volatility, trend and time of day you observed.",
        "3. Report trend, volatility, key levels, and whether conditions suit the active strategy.",
        "",
        "Analysis only. Do not trade.",
      ].join("\n");

    case "summarise_session":
      return [
        "Summarise the current trading session.",
        "",
        "1. Read scalarai://status, scalarai://trades/open and scalarai://logs/recent.",
        "2. Report realised P&L, open risk, trade count, win rate, and any EA errors.",
        "3. Call out anything needing the operator's attention.",
      ].join("\n");

    case "validate_strategy":
      return [
        `Validate the ${a.mode || "TREND_FOLLOWING"} strategy before enabling it.`,
        "",
        "Prefer native MT5 Strategy Tester evidence over in-app backtests.",
        "1. Confirm the result set is non-empty and that trades, win rate and profit factor are mutually consistent.",
        "2. Treat a low trade count as inconclusive rather than negative.",
        "3. Check the date range used, and flag if it is the same window used to choose parameters (overfitting).",
        "4. Only then recommend activate_strategy or toggle_automated_trading.",
      ].join("\n");

    default:
      return null;
  }
}

const BACKTESTING_GUIDE = [
  "# Backtesting on ScalarAI",
  "",
  "## Use MT5's native Strategy Tester, not the in-app engine",
  "",
  "The `backtest_strategy` and `backtest_strategy_with_history` tools run a",
  "simplified in-process model. They are fine for a quick sanity check or for",
  "comparing strategies against each other, but they are not evidence.",
  "",
  "For anything you intend to trade:",
  "",
  "1. Compile: `MetaEditor64.exe /compile:<src>.mq5 /log:<log>` and read",
  "   `Result: N errors, M warnings` from the log. The log is UTF-16LE with a BOM.",
  "2. Install the .ex5 into the terminal data directory under `MQL5\\Experts\\`.",
  "3. Run one pass: `terminal64.exe /config:<file>.ini` with a `[Tester]` block.",
  "4. Pass EA inputs through a `.set` file in `MQL5\\Profiles\\Tester\\`,",
  "   referenced from `ExpertParameters` by BARE FILE NAME. A path containing",
  "   directories, or an absolute path, is silently ignored and the compiled",
  "   defaults are used instead.",
  "5. Read the result: the EA writes `StrategyForge_<tag>.csv` via FILE_COMMON,",
  "   and MT5 records its own copy under `<data dir>\\Tester\\cache\\`.",
  "",
  "## What quietly ruins a backtest",
  "",
  "- `Model=0` generates ticks. Use `Model=4` (real ticks) for any accuracy claim.",
  "- Fitting and evaluating on the same window is overfitting. Optimise on one",
  "  period, validate on another you have not looked at.",
  "- Confirm inputs landed: the tester log echoes them under `started with inputs:`.",
  "- Check `wins + losses == trades` before trusting any other statistic.",
  "",
  "## WebRequest does not work in the tester",
  "",
  "Results cannot be posted from the Strategy Tester; the platform returns error",
  "4014 regardless of the allow-list. The EA's CSV is the only channel out of a",
  "test run. Live reporting works when the EA runs on a chart.",
].join("\n");

/**
 * Resolve a resource URI to its content.
 *
 * Templated URIs are matched by prefix so `scalarai://candles/Step Index`
 * works even though the symbol contains spaces and must not be percent-encoded
 * by the client.
 */
async function readResource(ctx: McpContext, uri: string): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> } | { error: string }> {
  const j = (v: unknown) => JSON.stringify(v, null, 2);
  const active = ctx.getStatus()?.activeSymbol || "Step Index";

  const known = RESOURCES.find((r) => r.uri === uri);
  if (!known) {
    const candles = uri.startsWith("scalarai://candles/");
    const observations = uri.startsWith("scalarai://observations/");
    const rates = uri.startsWith("scalarai://rates/");
    if (!candles && !observations && !rates) return { error: `Unknown resource: ${uri}` };

    if (rates) {
      const rest = decodeURIComponent(uri.slice("scalarai://rates/".length));
      const parts = rest.split("/");
      const sym = parts[0] || active;
      const tf = parts[1] || "M1";
      const ratesRes = await mt5Bridge.getRates(sym, tf, 100);
      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: j({ symbol: sym, timeframe: tf, data: ratesRes }),
        }],
      };
    }

    const symbol = decodeURIComponent(uri.slice(uri.indexOf("/", "scalarai://".length) + 1))
      || active;
    const data = candles
      ? scalarAiDb.getCandles(symbol, undefined, undefined, 500)
      : scalarAiDb.getObservations(symbol, undefined, undefined, 500);
    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: j({ symbol, kind: candles ? "candles" : "observations", count: data.length, data }),
      }],
    };
  }

  switch (uri) {
    case "scalarai://status":
      return { contents: [{ uri, mimeType: "application/json", text: j(ctx.getStatus()) }] };
    case "scalarai://config":
      return { contents: [{ uri, mimeType: "application/json", text: j(ctx.getConfig()) }] };
    case "scalarai://strategy/active":
      return { contents: [{ uri, mimeType: "application/json", text: j(ctx.getAiStrategy()) }] };
    case "scalarai://knowledge/base":
      return { contents: [{ uri, mimeType: "application/json", text: j(ctx.getAiKnowledgeBase()) }] };
    case "scalarai://knowledge/patterns":
      return { contents: [{ uri, mimeType: "application/json", text: j(scalarAiDb.getPatternResults()) }] };
    case "scalarai://knowledge/edge":
      return { contents: [{ uri, mimeType: "application/json", text: j(scalarAiDb.getPatternResults(undefined, undefined, "EDGE")) }] };
    case "scalarai://symbols":
      return { contents: [{ uri, mimeType: "application/json", text: j(ctx.getSymbols()) }] };
    case "scalarai://trades/open":
      return { contents: [{ uri, mimeType: "application/json", text: j(ctx.getTrades().filter((t) => t.status === "OPEN")) }] };
    case "scalarai://trades/recent":
      return { contents: [{ uri, mimeType: "application/json", text: j(ctx.getTrades().slice(0, 50)) }] };
    case "scalarai://logs/recent":
      return { contents: [{ uri, mimeType: "application/json", text: j(ctx.getLogs().slice(0, 50)) }] };
    case "scalarai://strategies":
      return {
        contents: [{
          uri, mimeType: "application/json",
          text: j(scalarAiDb.getAllStrategies()),
        }],
      };
    case "scalarai://strategy-templates":
      return {
        contents: [{
          uri, mimeType: "application/json",
          text: j(STRATEGY_TEMPLATES.map((t) => ({
            id: t.id, name: t.name, description: t.description,
            mode: t.mode, category: t.category, tags: t.tags,
          }))),
        }],
      };
    case "scalarai://tester/results":
      // Real store, shared with GET /api/research/strategyforge-results.
      return {
        contents: [{
          uri, mimeType: "application/json",
          text: j(getStrategyForgeResults()),
        }],
      };
    case "scalarai://guides/backtesting":
      return { contents: [{ uri, mimeType: "text/markdown", text: BACKTESTING_GUIDE }] };
    case "scalarai://bridge/status":
      return { contents: [{ uri, mimeType: "application/json", text: j(await mt5Bridge.getStatus()) }] };
    case "scalarai://bridge/functions":
      return { contents: [{ uri, mimeType: "application/json", text: j(await mt5Bridge.listFunctions()) }] };
    case "scalarai://bridge/positions":
      return { contents: [{ uri, mimeType: "application/json", text: j(await mt5Bridge.getPositions()) }] };
    case "scalarai://bridge/symbols":
      return { contents: [{ uri, mimeType: "application/json", text: j(await mt5Bridge.getSymbols()) }] };
    case "scalarai://bridge/deals":
      return { contents: [{ uri, mimeType: "application/json", text: j(await mt5Bridge.getHistoryDeals(30)) }] };
    default:
      return { error: `Unhandled resource: ${uri}` };
  }
}
/**
 * Run one JSON-RPC request and return its response object.
 *
 * Split out from the Express handler so the same logic serves single requests,
 * batches, and both the JSON and SSE framings without duplicating the dispatch.
 */
async function handleRpc(ctx: McpContext, req: any): Promise<any> {
  const id = req?.id ?? null;
  const method = req?.method;

  if (!req || req.jsonrpc !== "2.0") {
    return { jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } };
  }

  // Notifications carry no id and expect no response body.
  if (method === "notifications/initialized" || method === "initialized" ||
      String(method || "").startsWith("notifications/")) {
    return null;
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (method === "initialize") {
    const version = negotiateProtocolVersion(req.params?.protocolVersion);
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: version,
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: { name: "scalarai-mcp", version: "3.0.0" },
        instructions:
          "ScalarAI exposes a live MT5 trading platform. Read scalarai://status and " +
          "scalarai://trades/open before acting. For backtesting, prefer native MT5 " +
          "Strategy Tester evidence (see the scalarai://guides/backtesting resource) " +
          "over the in-app backtest tools. Placing or closing trades affects a real " +
          "broker account, so state the intended change before doing it.",
      },
    };
  }

  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }

  if (method === "resources/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: { resources: RESOURCES.map((r) => ({ ...r })) },
    };
  }

  if (method === "resources/templates/list") {
    return { jsonrpc: "2.0", id, result: { resourceTemplates: RESOURCE_TEMPLATES } };
  }

  if (method === "resources/read") {
    const uri = req.params?.uri;
    if (typeof uri !== "string" || !uri) {
      return { jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid params: uri is required" } };
    }
    const read = await readResource(ctx, uri);
    if ("error" in read) {
      return { jsonrpc: "2.0", id, error: { code: -32602, message: read.error } };
    }
    return { jsonrpc: "2.0", id, result: read };
  }

  if (method === "prompts/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        prompts: PROMPTS.map((p) => ({
          name: p.name,
          description: p.description,
          arguments: p.arguments,
        })),
      },
    };
  }

  if (method === "prompts/get") {
    const name = req.params?.name;
    const def = PROMPTS.find((p) => p.name === name);
    if (!def) {
      return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown prompt: ${name}` } };
    }
    const missing = def.arguments.filter((a) => a.required && !(a.name in (req.params?.arguments || {})));
    if (missing.length) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: `Missing required argument(s): ${missing.map((m) => m.name).join(", ")}` },
      };
    }
    const text = renderPrompt(name, req.params?.arguments || {});
    if (text === null) {
      return { jsonrpc: "2.0", id, error: { code: -32602, message: `Prompt not renderable: ${name}` } };
    }
    return {
      jsonrpc: "2.0",
      id,
      result: {
        description: def.description,
        messages: [{ role: "user", content: { type: "text", text } }],
      },
    };
  }

  if (method === "tools/call") {
    return { jsonrpc: "2.0", id, result: await callTool(ctx, req.params || {}) };
  }

  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

/**
 * Dispatch one tools/call.
 *
 * `toolResult` carries the early-return cases: a tool that wants to answer
 * with a JSON-RPC error (invalid params, entity not found) instead of a tool
 * result, as the spec requires for protocol-level failures.
 */
async function callTool(ctx: McpContext, params: { name?: string; arguments?: Record<string, any> }) {
  const args = params.arguments || {};
  const toolResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

  switch (params.name) {
          case "get_system_status": {
            return toolResult(JSON.stringify(ctx.getStatus(), null, 2));
          }
          case "get_trading_state": {
            return toolResult(JSON.stringify(ctx.getTradingState(), null, 2));
          }
          case "get_bridge_state": {
            return toolResult(JSON.stringify(ctx.getBridgeState(), null, 2));
          }
          case "get_calibration_state": {
            return toolResult(JSON.stringify(ctx.getCalibrationState(), null, 2));
          }
          case "get_ai_knowledge_base": {
            return toolResult(JSON.stringify(ctx.getAiKnowledgeBase(), null, 2));
          }
          case "get_ai_strategy": {
            return toolResult(JSON.stringify(ctx.getAiStrategy(), null, 2));
          }
          case "list_strategies": {
            const strategies = [
              { id: "trend_following", name: "Trend Following", mode: "TREND_FOLLOWING", description: "EMA cross + RSI filter" },
              { id: "mean_reversion", name: "Mean Reversion", mode: "MEAN_REVERSION", description: "Bollinger Bands + RSI" },
              { id: "ai_adaptive", name: "AI Adaptive", mode: "AI_ADAPTIVE", description: "Velocity + acceleration + EMA trend confirmation" },
            ];
            const customStrategies = scalarAiDb.getAllStrategies();
            return toolResult(JSON.stringify([...strategies, ...customStrategies], null, 2));
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
            return toolResult(JSON.stringify({ success: true, strategy: newStrategy }, null, 2));
          }
          case "update_strategy": {
            const existing = scalarAiDb.getStrategyById(args.id);
            if (!existing) {
              throw new RpcError(-32602, `Strategy not found: ${args.id}`);
            }
            const updated = {
              ...existing,
              name: args.name ?? existing.name,
              description: args.description ?? existing.description,
              rules: args.rules ?? existing.rules,
              updatedAt: new Date().toISOString(),
            };
            scalarAiDb.updateStrategy(args.id, updated);
            return toolResult(JSON.stringify({ success: true, strategy: updated }, null, 2));
          }
          case "delete_strategy": {
            scalarAiDb.deleteStrategy(args.id);
            return toolResult(JSON.stringify({ success: true, message: `Strategy ${args.id} deleted` }, null, 2));
          }
          case "activate_strategy": {
            if (args.mode && ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE"].includes(args.mode)) {
              await ctx.updateSettings({ selectedStrategy: args.mode });
              return toolResult(JSON.stringify({ success: true, activeStrategy: args.mode }, null, 2));
            } else if (args.id) {
              const strategy = scalarAiDb.getStrategyById(args.id);
              if (!strategy) {
                throw new RpcError(-32602, `Strategy not found: ${args.id}`);
              }
              await ctx.updateSettings({ selectedStrategy: StrategyMode.CUSTOM });
              return toolResult(JSON.stringify({ success: true, activeStrategy: strategy }, null, 2));
            } else {
              throw new RpcError(-32602, "Provide id or mode");
            }
            break;
          }
          case "backtest_strategy": {
            const backtestResult = evaluateStrategyBacktest(args.mode, args.limit || 500);
            return toolResult(JSON.stringify(backtestResult, null, 2));
          }
          case "query_db": {
            if (!isReadOnlySql(args.sql)) {
              throw new RpcError(-32602, "Only read-only SELECT queries are allowed");
            }
            try {
              const rows = scalarAiDb.rawQuery(args.sql, args.params || []);
              return toolResult(JSON.stringify(rows, null, 2));
             } catch (err: unknown) {
               const message = err instanceof Error ? err.message : String(err);
               throw new RpcError(-32603, `Query failed: ${message}`);
             }
            break;
          }
          case "update_trading_settings": {
            const config = await ctx.updateSettings(args);
            return toolResult(JSON.stringify(config, null, 2));
          }
          case "toggle_automated_trading": {
            const config = await ctx.toggleTrading(typeof args.isActive === "boolean" ? args.isActive : !ctx.getConfig().isActive);
            return toolResult(`Trading toggled to ${config.isActive ? "STARTED" : "STOPPED"}`);
          }
          case "get_trade_history": {
            let trades = ctx.getTrades();
            if (args.status) trades = trades.filter((t: TradeRecord) => t.status === args.status);
            if (args.symbol) trades = trades.filter((t: TradeRecord) => t.symbol?.toLowerCase() === args.symbol.toLowerCase());
            const limit = typeof args.limit === "number" ? args.limit : 100;
            return toolResult(JSON.stringify(trades.slice(0, limit), null, 2));
          }
          case "get_system_logs": {
            let logs = ctx.getLogs();
            if (args.source) logs = logs.filter((l: SystemLog) => l.source === args.source);
            if (args.level) logs = logs.filter((l: SystemLog) => l.level === args.level);
            const limit = typeof args.limit === "number" ? args.limit : 50;
            return toolResult(JSON.stringify(logs.slice(0, limit), null, 2));
          }
          case "place_validated_trade": {
            if (!args.type || !["BUY", "SELL"].includes(args.type)) {
              throw new RpcError(-32602, "Invalid params: type must be BUY or SELL");
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
            return toolResult(JSON.stringify(tradeResult, null, 2));
          }
          case "close_trade": {
            if (!args.tradeId) {
              throw new RpcError(-32602, "Invalid params: tradeId is required");
            }
            const closeResult = await ctx.closeTrade(args.tradeId);
            return toolResult(JSON.stringify(closeResult, null, 2));
          }
          case "modify_trade_sl_tp": {
            if (!args.tradeId) {
              throw new RpcError(-32602, "Invalid params: tradeId is required");
            }
            const modifyResult = await ctx.modifyTrade(String(args.tradeId), {
              sl: typeof args.sl === "number" ? args.sl : undefined,
              tp: typeof args.tp === "number" ? args.tp : undefined,
            });
            return toolResult(JSON.stringify(modifyResult, null, 2));
          }
          case "close_all_trades": {
            const closeAllResult = await ctx.closeAllTrades(args.symbol);
            return toolResult(JSON.stringify(closeAllResult, null, 2));
          }
          case "get_symbols": {
            let symbolsList = ctx.getSymbols();
            if (symbolsList.length <= 1) {
              try {
                const bridgeSyms = await mt5Bridge.getSymbols();
                if (bridgeSyms && bridgeSyms.success && Array.isArray(bridgeSyms.symbols) && bridgeSyms.symbols.length > 0) {
                  return toolResult(JSON.stringify({
                    activeSymbol: ctx.getStatus().activeSymbol,
                    count: bridgeSyms.symbols.length,
                    source: "mt5_bridge",
                    symbols: bridgeSyms.symbols,
                  }, null, 2));
                }
              } catch {
                // quiet
              }
            }
            const activeSymbol = ctx.getStatus().activeSymbol;
            return toolResult(JSON.stringify({ activeSymbol, symbols: symbolsList, count: symbolsList.length }, null, 2));
          }
          case "switch_active_symbol": {
            if (!args.symbol) {
              throw new RpcError(-32602, "Invalid params: symbol is required");
            }
            ctx.switchSymbol(args.symbol);
            return toolResult(JSON.stringify({ success: true, activeSymbol: args.symbol }, null, 2));
          }
          case "get_ea_telemetry": {
            const status = ctx.getStatus();
            const targetSymbol = (args.symbol && args.symbol.trim()) || status.activeSymbol;
            const symState = status.symbolStates.find((s: any) => s.symbol === targetSymbol);
            const connection = symState?.connection || status.connection;
            return toolResult(JSON.stringify({ symbol: targetSymbol, connection, isBridgeConnected: status.isBridgeConnected }, null, 2));
          }
          case "reset_stats": {
            await ctx.resetStats();
            return toolResult("Stats reset successfully.");
          }
          case "ingest_strategyforge_csv": {
          const item = parseStrategyForgeCsv(
            String(args.csvContent || ""),
            ctx.getStatus()?.activeSymbol || "EURUSD",
          );
          if (!item) {
            throw new RpcError(-32602, "CSV must contain a header row and at least one data row");
          }
          recordStrategyForgeResult(item);
          return toolResult(JSON.stringify({
            recorded: true,
            id: item.id,
            tag: item.tag,
            symbol: item.symbol,
            modeName: item.modeName,
            score: item.score,
            trades: item.trades,
            wins: item.wins,
            losses: item.losses,
            winRate: Number(item.winRate.toFixed(2)),
            profit: item.profit,
            netPips: item.netPips,
            profitFactor: item.profitFactor,
            sharpe: item.sharpe,
            drawdown: item.drawdown,
            drawdownPct: item.drawdownPct,
            totalStored: getStrategyForgeResults().length,
          }, null, 2));
        }
        case "get_strategyforge_results": {
          let list = getStrategyForgeResults();
          if (args.symbol) {
            const want = String(args.symbol).toLowerCase();
            list = list.filter((r) => r.symbol.toLowerCase() === want);
          }
          const limit = typeof args.limit === "number" ? args.limit : 20;
          return toolResult(JSON.stringify({ count: list.length, results: list.slice(0, limit) }, null, 2));
        }
        case "run_strategy_tester": {
          const expert = args.expert;
          if (!expert || typeof expert !== "string") {
            return toolResult(JSON.stringify({ success: false, error: "expert is required (e.g. 'Bots\\\\StrategyForge')" }, null, 2));
          }
          const result = await mt5Bridge.runTester({
            expert,
            symbol: args.symbol || undefined,
            period: args.period || undefined,
            from: args.from || undefined,
            to: args.to || undefined,
            model: args.model || undefined,
            deposit: typeof args.deposit === "number" ? args.deposit : undefined,
            currency: args.currency || undefined,
            leverage: typeof args.leverage === "number" ? args.leverage : undefined,
            inputs: args.inputs || undefined,
            visual: args.visual === true,
            shutdown: args.shutdown !== false,
            timeout: typeof args.timeout === "number" ? args.timeout : 300,
            tag: args.tag || "test",
          });
          return toolResult(JSON.stringify(result, null, 2));
        }
        case "check_pattern": {
          const symbol = (args.symbol && args.symbol.trim()) || ctx.getStatus().activeSymbol || "Step Index";
          const timeframe = args.timeframe || "M15";
          const patternName = args.pattern_name;
          if (!patternName || typeof patternName !== "string") {
            return toolResult(JSON.stringify({ success: false, error: "pattern_name is required" }, null, 2));
          }
          const bars = typeof args.bars === "number" ? Math.min(args.bars, 5000) : 1000;
          const forwardBars = typeof args.forward_bars === "number" ? args.forward_bars : 5;
          const minTrades = typeof args.min_trades === "number" ? args.min_trades : 30;

          // Fetch candles from DB or MT5
          let candleBars: any[] = [];
          try {
            const dbCandles = scalarAiDb.getCandles(symbol, undefined, undefined, bars, timeframe);
            if (dbCandles && dbCandles.length > 0) {
              candleBars = dbCandles.map((c: any) => ({
                time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
                volume: c.volume ?? 0, spread: c.spread ?? 0,
              }));
            }
          } catch (e) {
            // Fall through to MT5 bridge
          }

          if (candleBars.length === 0) {
            try {
              const ratesRes = await mt5Bridge.getRates(symbol, timeframe, bars);
              if (ratesRes && ratesRes.success && Array.isArray(ratesRes.rates)) {
                candleBars = ratesRes.rates.map((r: any) => ({
                  time: r.time, open: r.open, high: r.high, low: r.low, close: r.close,
                  volume: r.tick_volume ?? 0, spread: r.spread ?? 0,
                }));
              }
            } catch (e) {
              // No data available
            }
          }

          if (candleBars.length < 10) {
            return toolResult(JSON.stringify({ success: false, error: "Insufficient bar data for pattern check" }, null, 2));
          }

          // Cost. When the caller does not say, use the spread the stored bars
          // actually carry -- the raw bridge rows have it per bar and it was
          // being thrown away on the way in.
          const storedSpreads = candleBars.map((c: any) => c.spread ?? 0).filter((s: number) => s > 0).sort((a: number, b: number) => a - b);
          const medianSpread = storedSpreads.length ? storedSpreads[Math.floor(storedSpreads.length / 2)] : 0;
          const costPoints = typeof args.cost_points === "number" ? args.cost_points : medianSpread;

          // Run the pattern checker
          const { checkPattern } = await import("./knowledgebase/patterns/pattern-checker");
          const result = checkPattern({
            symbol,
            timeframe,
            pattern_name: patternName,
            bars: candleBars,
            forward_bars: forwardBars,
            cost_points: costPoints,
            min_trades: minTrades,
          });

          // Store result
          try {
            const { recordPatternResult } = await import("./knowledgebase/knowledge");
            const id = `pat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            recordPatternResult({
              id,
              symbol: result.symbol,
              timeframe: result.timeframe,
              pattern_name: result.pattern_name,
              pattern_category: "candlestick",
              occurrences: result.occurrences,
              forward_return_mean: result.forward_return_mean,
              forward_return_sd: result.forward_return_sd,
              t_statistic: result.t_statistic,
              p_value: result.p_value,
              win_rate: result.win_rate,
              expectancy: result.expectancy,
              net_after_cost: result.net_after_cost,
              spread_points: result.spread_points,
              verdict: result.verdict,
              null_comparison: JSON.stringify(result.null_comparison),
              split_half_agree: result.split_half_agree ? 1 : 0,
              split_half_t1: result.split_half_t1,
              split_half_t2: result.split_half_t2,
              min_trades_threshold: result.min_trades_threshold,
              bars_analyzed: result.bars_analyzed,
              created_at: new Date().toISOString(),
            });
          } catch (e) {
            // Storage failed but result is still returned
          }

          return toolResult(JSON.stringify(result, null, 2));
        }
        case "ingest_history": {
          const symbol = args.symbol;
          if (!symbol || typeof symbol !== "string") {
            return toolResult(JSON.stringify({ success: false, error: "symbol is required" }, null, 2));
          }
          const timeframe = args.timeframe || "M15";
          const count = typeof args.count === "number" ? Math.min(args.count, 60000) : 1000;

          const ratesRes = await mt5Bridge.getRates(symbol, timeframe, count);
          if (!ratesRes || !ratesRes.success || !Array.isArray(ratesRes.rates) || ratesRes.rates.length === 0) {
            return toolResult(JSON.stringify({
              success: false,
              error: ratesRes?.error || "no rates returned from MT5",
              symbol, timeframe, count,
            }, null, 2));
          }

          // The bridge returns seconds; the store uses milliseconds. The
          // spread comes along too and was being dropped, which is what left
          // the knowledgebase costing patterns on a hand-passed guess.
          const rows = ratesRes.rates.map((r: any) => {
            const timeMs = typeof r.time === "number"
              ? (r.time < 10000000000 ? r.time * 1000 : r.time)
              : Date.now();
            return {
              symbol,
              timeframe,
              time: timeMs,
              open: r.open,
              high: r.high,
              low: r.low,
              close: r.close,
              volume: r.tick_volume ?? r.volume ?? 0,
              spread: r.spread ?? 0,
              direction: (r.close > r.open ? "up" : r.close < r.open ? "down" : "flat") as "up" | "down" | "flat",
              minute_bucket: Math.floor(timeMs / 60000) * 60000,
            };
          });

          scalarAiDb.insertCandlesBatch(rows);

          const stored = scalarAiDb.getCandles(symbol, undefined, undefined, count, timeframe);
          return toolResult(JSON.stringify({
            success: true,
            symbol,
            timeframe,
            requested: count,
            pulled: ratesRes.rates.length,
            stored: stored.length,
            first: rows.length ? new Date(rows[0].time).toISOString() : null,
            last: rows.length ? new Date(rows[rows.length - 1].time).toISOString() : null,
          }, null, 2));
        }
        case "check_all_patterns": {
          const symbol = (args.symbol && args.symbol.trim()) || ctx.getStatus().activeSymbol || "Step Index";
          const timeframe = args.timeframe || "M15";
          const bars = typeof args.bars === "number" ? Math.min(args.bars, 5000) : 1000;
          const forwardBars = typeof args.forward_bars === "number" ? args.forward_bars : 5;
          const minTrades = typeof args.min_trades === "number" ? args.min_trades : 30;

          // Fetch candles once, then run the whole suite against them.
          let candleBars: any[] = [];
          try {
            const dbCandles = scalarAiDb.getCandles(symbol, undefined, undefined, bars, timeframe);
            if (dbCandles && dbCandles.length > 0) {
              candleBars = dbCandles.map((c: any) => ({
                time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
                volume: c.volume ?? 0, spread: c.spread ?? 0,
              }));
            }
          } catch (e) { /* fall through to bridge */ }

          if (candleBars.length < 10) {
            try {
              const ratesRes = await mt5Bridge.getRates(symbol, timeframe, bars);
              if (ratesRes && ratesRes.success && Array.isArray(ratesRes.rates)) {
                candleBars = ratesRes.rates.map((r: any) => ({
                  time: r.time, open: r.open, high: r.high, low: r.low, close: r.close,
                  volume: r.tick_volume ?? 0, spread: r.spread ?? 0,
                }));
              }
            } catch (e) { /* no data */ }
          }

          if (candleBars.length < 10) {
            return toolResult(JSON.stringify({ success: false, error: "Insufficient bar data" }, null, 2));
          }

          // Cost defaults to the spread the bars themselves carry.
          const storedSpreads = candleBars.map((c: any) => c.spread ?? 0).filter((s: number) => s > 0).sort((a: number, b: number) => a - b);
          const medianSpread = storedSpreads.length ? storedSpreads[Math.floor(storedSpreads.length / 2)] : 0;
          const costPoints = typeof args.cost_points === "number" ? args.cost_points : medianSpread;

          const { runPatternSuite } = await import("./knowledgebase/patterns/suite");
          const suite = runPatternSuite({
            symbol, timeframe, bars: candleBars,
            forward_bars: forwardBars, cost_points: costPoints, min_trades: minTrades,
          });

          // Store every result.
          const { recordPatternResult } = await import("./knowledgebase/knowledge");
          for (const r of suite.results) {
            try {
              recordPatternResult({
                id: `pat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                symbol: r.symbol,
                timeframe: r.timeframe,
                pattern_name: r.pattern_name,
                pattern_category: "candlestick",
                occurrences: r.occurrences,
                forward_return_mean: r.forward_return_mean,
                forward_return_sd: r.forward_return_sd,
                t_statistic: r.t_statistic,
                p_value: r.p_value,
                win_rate: r.win_rate,
                expectancy: r.expectancy,
                net_after_cost: r.net_after_cost,
                spread_points: r.spread_points,
                verdict: r.verdict,
                null_comparison: JSON.stringify(r.null_comparison),
                split_half_agree: r.split_half_agree ? 1 : 0,
                split_half_t1: r.split_half_t1,
                split_half_t2: r.split_half_t2,
                min_trades_threshold: r.min_trades_threshold,
                bars_analyzed: r.bars_analyzed,
                created_at: new Date().toISOString(),
              });
            } catch (e) { /* storage failed, result still returned */ }
          }

          return toolResult(JSON.stringify(suite, null, 2));
        }
        case "get_pattern_results": {
          const symbol = args.symbol || undefined;
          const timeframe = args.timeframe || undefined;
          const verdict = args.verdict || undefined;
          const limit = typeof args.limit === "number" ? args.limit : 50;
          const results = scalarAiDb.getPatternResults(symbol, timeframe, verdict, limit);
          return toolResult(JSON.stringify({ count: results.length, results }, null, 2));
        }
        case "get_null_control": {
          const symbol = (args.symbol && args.symbol.trim()) || ctx.getStatus().activeSymbol || "Step Index";
          const timeframe = args.timeframe || "M15";
          const bars = typeof args.bars === "number" ? Math.min(args.bars, 5000) : 1000;
          const iterations = typeof args.iterations === "number" ? args.iterations : 1000;

          let candleBars: any[] = [];
          try {
            const dbCandles = scalarAiDb.getCandles(symbol, undefined, undefined, bars);
            if (dbCandles && dbCandles.length > 0) {
              candleBars = dbCandles.map((c: any) => c.close - (c.open || c.close));
            }
          } catch (e) { /* fall through */ }

          if (candleBars.length === 0) {
            try {
              const ratesRes = await mt5Bridge.getRates(symbol, timeframe, bars);
              if (ratesRes && ratesRes.success && Array.isArray(ratesRes.rates)) {
                candleBars = ratesRes.rates.map((r: any) => r.close - r.open);
              }
            } catch (e) { /* no data */ }
          }

          if (candleBars.length < 10) {
            return toolResult(JSON.stringify({ success: false, error: "Insufficient bar data" }, null, 2));
          }

          const { shuffleNull } = await import("./knowledgebase/core/common");
          const result = shuffleNull(candleBars, iterations);
          return toolResult(JSON.stringify({ symbol, timeframe, bars: candleBars.length, iterations, ...result }, null, 2));
        }
        case "list_indicators": {
          const category = args.category || undefined;
          const indicators = scalarAiDb.getAllIndicatorLibrary();
          const filtered = category ? indicators.filter((i: any) => i.category === category) : indicators;
          return toolResult(JSON.stringify({ count: filtered.length, indicators: filtered }, null, 2));
        }
        case "add_indicator": {
          const name = args.name;
          if (!name || typeof name !== "string") {
            return toolResult(JSON.stringify({ success: false, error: "name is required" }, null, 2));
          }
          const category = args.category || "custom";
          const formula = args.formula ? JSON.stringify(args.formula) : "{}";
          const id = `ind_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          scalarAiDb.upsertIndicatorLibrary({
            id,
            name,
            category,
            formula,
            is_builtin: 0,
            created_at: new Date().toISOString(),
          });
          return toolResult(JSON.stringify({ success: true, id, name, category }, null, 2));
        }
        case "get_market_telemetry": {
            const limit = typeof args.limit === "number" ? args.limit : 100;
            const activeSymbol = ctx.getStatus().activeSymbol;
            const symbol = (args.symbol && args.symbol.trim()) || activeSymbol || "Step Index";
            const state = scalarAiDb.getAiKnowledge();
            const ticks = scalarAiDb.getTicks(limit, symbol);
            return toolResult(JSON.stringify({ symbol, telemetryCount: state?.totalObservations || 0, recentTicksCount: ticks.length, knowledge: state }, null, 2));
          }
          case "get_recent_candles": {
            const limit = typeof args.limit === "number" ? Math.min(args.limit, 500) : 50;
            const activeSymbol = ctx.getStatus().activeSymbol;
            const symbol = (args.symbol && args.symbol.trim()) || activeSymbol || "Step Index";
            const timeframe = args.timeframe || "M1";

            // If MT5 bridge is available, query real rates
            try {
              const ratesRes = await mt5Bridge.getRates(symbol, timeframe, limit);
              if (ratesRes && ratesRes.success && Array.isArray(ratesRes.rates) && ratesRes.rates.length > 0) {
                return toolResult(JSON.stringify({
                  source: "mt5_bridge",
                  symbol,
                  timeframe,
                  count: ratesRes.rates.length,
                  candles: ratesRes.rates.map((r: any) => ({
                    time: typeof r.time === "number" ? (r.time < 10000000000 ? r.time * 1000 : r.time) : r.time,
                    open: r.open,
                    high: r.high,
                    low: r.low,
                    close: r.close,
                    volume: r.tick_volume || r.volume || 100,
                  })),
                }, null, 2));
              }
            } catch {
              // quiet fallback
            }

            const candles = scalarAiDb.getCandles(symbol, undefined, undefined, limit);
            if (candles.length > 0) {
              return toolResult(JSON.stringify({ source: "database", symbol, timeframe, candles, count: candles.length }, null, 2));
            } else {
              const ticks = scalarAiDb.getTicks(limit, symbol);
              return toolResult(JSON.stringify({ source: "ticks", symbol, timeframe, ticks, count: ticks.length }, null, 2));
            }
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
            return toolResult(JSON.stringify({ mode, tradesAnalyzed: closed.length, winRate, totalProfit: Number(totalProfit.toFixed(2)), avgWin: Number(avgWin.toFixed(2)), avgLoss: Number(avgLoss.toFixed(2)), profitFactor: Number(profitFactor.toFixed(2)), wins: wins.length, losses: losses.length, }, null, 2));
          }
          case "synthesize_ai_strategy": {
            const activeSymbol = ctx.getStatus().activeSymbol;
            const symbol = (args.symbol && args.symbol.trim()) || activeSymbol || "Step Index";
            const state2 = scalarAiDb.getAiKnowledge();
            if (!state2) {
              return toolResult("No knowledge base found. Initialize it first.");
            }
            const telemetry = scalarAiDb.rawQuery("SELECT velocity, timestamp FROM market_ticks ORDER BY timestamp DESC LIMIT 500", []) as Array<{ velocity: number; timestamp: number }>;
            const updateResult = updateKnowledgeBaseFromTelemetry(symbol, telemetry.reverse());
            return toolResult(JSON.stringify({ success: true, message: "Knowledge base updated from live telemetry", updateResult, knowledgeSummary: formatKnowledgeBase(state2), }, null, 2));
          }
          case "get_knowledge_summary": {
            const summary = getKnowledgeSummary();
            return toolResult(formatKnowledgeSummary(summary));
          }
          case "analyze_market": {
            const activeSymbol = ctx.getStatus().activeSymbol;
            const symbol = (args.symbol && args.symbol.trim()) || activeSymbol || "Step Index";
            const knowledge = scalarAiDb.getAiKnowledge();
            if (!knowledge) {
              return toolResult("No knowledge base found. Initialize it first.");
            }
            const analysis = analyzeMarket(symbol, knowledge);
            return toolResult(JSON.stringify(analysis, null, 2));
          }
          case "get_strategy_performance": {
            const mode = args.mode || "TREND_FOLLOWING";
            const limit = typeof args.limit === "number" ? args.limit : 100;
            const performance = analyzeStrategyPerformance(mode, limit);
            return toolResult(JSON.stringify(performance, null, 2));
          }
          case "optimize_strategy": {
            const mode = args.mode || "TREND_FOLLOWING";
            const suggestions = suggestStrategyOptimizations(mode);
            return toolResult(JSON.stringify({ mode, suggestions }, null, 2));
          }
          case "recommend_strategy": {
            const { volatility, trend, timeOfDay } = args;
            if (!volatility || !trend || !timeOfDay) {
              return toolResult("Missing required params: volatility, trend, timeOfDay");
            }
            const recommendation = recommendStrategyForConditions(volatility, trend, timeOfDay);
            return toolResult(JSON.stringify(recommendation, null, 2));
          }
          case "list_strategy_templates": {
            const category = typeof args.category === "string" ? args.category : undefined;
            const templates = category ? getStrategiesByCategory(category as any) : STRATEGY_TEMPLATES;
            const list = templates.map(t => ({
              id: t.id,
              name: t.name,
              description: t.description,
              mode: t.mode,
              category: t.category,
              tags: t.tags,
              defaultConfig: t.defaultConfig,
            }));
            return toolResult(JSON.stringify(list, null, 2));
          }
          case "create_strategy_from_template": {
            const templateId = args.templateId;
            if (!templateId) {
              return toolResult("Missing required param: templateId");
            }
            try {
              const strategy = createStrategyFromTemplate(templateId, args.overrides);
              scalarAiDb.upsertAiStrategy(strategy);
              return toolResult(JSON.stringify({ success: true, strategy }, null, 2));
             } catch (err: unknown) {
               const message = err instanceof Error ? err.message : String(err);
               return toolResult(`Error: ${message}`);
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
              return toolResult([headers, ...rows].join("\n"));
            } else {
              return toolResult(JSON.stringify(data, null, 2));
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
            return toolResult(JSON.stringify({ symbol, candles, count: candles.length, from: args.from, to: args.to }, null, 2));
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
            return toolResult(JSON.stringify({ symbol: symbol || "all", observations: parsed, count: parsed.length }, null, 2));
          }
          case "generate_observation_insights": {
            const activeSymbol = ctx.getStatus().activeSymbol;
            const symbol = (args.symbol && args.symbol.trim()) || activeSymbol || "Step Index";
            const from = parseTimestamp(args.from);
            const to = parseTimestamp(args.to);
            const insights = ctx.generateInsights(symbol, from, to);
            return toolResult(JSON.stringify(insights, null, 2));
          }
          case "backtest_strategy_with_history": {
            const strategyId = args.strategyId;
            const activeSymbol = ctx.getStatus().activeSymbol;
            const symbol = (args.symbol && args.symbol.trim()) || activeSymbol || "Step Index";
            const from = parseTimestamp(args.from);
            const to = parseTimestamp(args.to);
            const initialBalance = typeof args.initialBalance === "number" ? args.initialBalance : 10000;
            if (!strategyId || !from || !to) {
              throw new RpcError(-32602, "Missing required params: strategyId, from, to");
            }
            const candles = scalarAiDb.getCandles(symbol, from, to, 10000);
            if (candles.length === 0) {
              throw new RpcError(-32602, "No candles found for the specified time range");
            }
            const strategy = scalarAiDb.getStrategyById(strategyId);
            if (!strategy) {
              throw new RpcError(-32602, `Strategy not found: ${strategyId}`);
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
            return toolResult(JSON.stringify(backtestResult, null, 2));
          }
                    case "mt5_get_bridge_status":
          case "get_mt5_bridge_status": {
            const status = await mt5Bridge.getStatus();
            return toolResult(JSON.stringify(status, null, 2));
          }
          case "mt5_connect_bridge":
          case "connect_mt5_bridge": {
            const result = await mt5Bridge.connect(args || {});
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "mt5_disconnect_bridge":
          case "disconnect_mt5_bridge": {
            const result = await mt5Bridge.disconnect();
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "mt5_get_account_info":
          case "get_mt5_account_info": {
            const acc = await mt5Bridge.getAccount();
            return toolResult(JSON.stringify(acc, null, 2));
          }
          case "mt5_get_terminal_info":
          case "get_mt5_terminal_info": {
            const term = await mt5Bridge.getTerminal();
            return toolResult(JSON.stringify(term, null, 2));
          }
          case "mt5_get_symbols":
          case "get_mt5_symbols": {
            const syms = await mt5Bridge.getSymbols();
            return toolResult(JSON.stringify(syms, null, 2));
          }
          case "mt5_get_symbol_info":
          case "get_mt5_symbol_info": {
            if (!args.symbol) throw new RpcError(-32602, "Symbol is required");
            const info = await mt5Bridge.getSymbolInfo(args.symbol);
            return toolResult(JSON.stringify(info, null, 2));
          }
          case "mt5_get_positions":
          case "get_mt5_positions": {
            const pos = await mt5Bridge.getPositions();
            return toolResult(JSON.stringify(pos, null, 2));
          }
          case "mt5_get_rates":
          case "get_mt5_rates": {
            const sym = args.symbol || ctx.getStatus().activeSymbol || "Step Index";
            const tf = Number(args.timeframe || 1);
            const count = Number(args.count || 100);
            const rates = await mt5Bridge.getRates(sym, tf, count);
            return toolResult(JSON.stringify(rates, null, 2));
          }
          case "mt5_get_history_deals":
          case "get_mt5_history_deals": {
            const days = Number(args.days || 30);
            const deals = await mt5Bridge.getHistoryDeals(days);
             return toolResult(JSON.stringify(deals, null, 2));
           }
           case "mt5_get_history_orders":
          case "get_mt5_history_orders": {
             const days = Number(args.days || 30);
             const orders = await mt5Bridge.getHistoryOrders(days);
             return toolResult(JSON.stringify(orders, null, 2));
           }
                     case "mt5_buy": {
            const symbol = args.symbol || ctx.getStatus().activeSymbol || "Step Index";
            const volume = Number(args.volume || 0.1);
            const sl = typeof args.sl === "number" ? args.sl : undefined;
            const tp = typeof args.tp === "number" ? args.tp : undefined;
            const comment = args.comment || "MCP AI BUY";
            const result = await mt5Bridge.buy({ symbol, volume, sl, tp, comment });
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "mt5_sell": {
            const symbol = args.symbol || ctx.getStatus().activeSymbol || "Step Index";
            const volume = Number(args.volume || 0.1);
            const sl = typeof args.sl === "number" ? args.sl : undefined;
            const tp = typeof args.tp === "number" ? args.tp : undefined;
            const comment = args.comment || "MCP AI SELL";
            const result = await mt5Bridge.sell({ symbol, volume, sl, tp, comment });
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "mt5_close_position": {
            if (!args.ticket) throw new RpcError(-32602, "Ticket is required");
            const result = await mt5Bridge.close(Number(args.ticket));
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "mt5_close_all": {
            const result = await mt5Bridge.closeAll();
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "execute_mt5_bridge_order": {
            const action = (args.action || "").toUpperCase();
            const symbol = args.symbol || ctx.getStatus().activeSymbol || "Step Index";
            const volume = Number(args.volume || 0.1);
            const sl = typeof args.sl === "number" ? args.sl : undefined;
            const tp = typeof args.tp === "number" ? args.tp : undefined;
            const comment = args.comment || "MCP Direct MT5 Bridge Order";

            let result: any;
            if (action === "BUY") {
              result = await mt5Bridge.buy({ symbol, volume, sl, tp, comment });
            } else if (action === "SELL") {
              result = await mt5Bridge.sell({ symbol, volume, sl, tp, comment });
            } else if (action === "CLOSE") {
              if (!args.ticket) throw new RpcError(-32602, "Ticket is required for CLOSE action");
              result = await mt5Bridge.close(Number(args.ticket));
            } else if (action === "CLOSE_ALL") {
              result = await mt5Bridge.closeAll();
            } else {
              throw new RpcError(-32602, `Invalid action: ${action}. Expected BUY, SELL, CLOSE, or CLOSE_ALL`);
            }
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "mt5_call_function":
          case "call_mt5_function": {
            const func = args.function;
            if (!func) throw new RpcError(-32602, "Missing required 'function' argument");
            const callArgs = Array.isArray(args.args) ? args.args : [];
            const callKwargs = typeof args.kwargs === "object" && args.kwargs !== null ? args.kwargs : {};
            const result = await mt5Bridge.executeFunction(func, callArgs, callKwargs);
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "mt5_list_functions":
          case "list_mt5_bridge_functions": {
            const result = await mt5Bridge.listFunctions();
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "modify_mt5_position": {
            if (!args.ticket) throw new RpcError(-32602, "Ticket is required to modify position");
            const sl = typeof args.sl === "number" ? args.sl : undefined;
            const tp = typeof args.tp === "number" ? args.tp : undefined;
            const result = await mt5Bridge.modifyPosition(Number(args.ticket), sl, tp);
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "get_mt5_orders": {
            const result = await mt5Bridge.getOrders(args.symbol);
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "get_mt5_tick": {
            if (!args.symbol) throw new RpcError(-32602, "Symbol is required");
            const result = await mt5Bridge.getTick(args.symbol);
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "get_mt5_market_depth": {
            if (!args.symbol) throw new RpcError(-32602, "Symbol is required");
            const result = await mt5Bridge.getMarketBook(args.symbol);
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "calc_mt5_margin": {
            if (!args.action || !args.symbol || args.volume === undefined) {
              throw new RpcError(-32602, "action, symbol, and volume are required");
            }
            const result = await mt5Bridge.calcMargin(args.action, args.symbol, Number(args.volume), Number(args.price || 0));
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "calc_mt5_profit": {
            if (!args.action || !args.symbol || args.volume === undefined || args.openPrice === undefined || args.closePrice === undefined) {
              throw new RpcError(-32602, "action, symbol, volume, openPrice, and closePrice are required");
            }
            const result = await mt5Bridge.calcProfit(args.action, args.symbol, Number(args.volume), Number(args.openPrice), Number(args.closePrice));
            return toolResult(JSON.stringify(result, null, 2));
          }
          case "get_mt5_totals": {
            const result = await mt5Bridge.getTotals();
            return toolResult(JSON.stringify(result, null, 2));
          }
          default:
            throw new RpcError(-32601, `Method not found: ${params.name}`);
  }
}
/**
 * Protocol-level error, so a tool can answer with a JSON-RPC error rather than
 * a tool result. The spec wants invalid params and missing entities reported
 * this way; the previous implementation returned them from inside the Express
 * handler, which is not reachable once the dispatch is a plain function.
 */
class RpcError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

function acceptHeader(req: Request): string {
  const raw = req.headers["accept"] as string | string[] | undefined;
  return Array.isArray(raw) ? raw.join(",") : raw || "";
}

/**
 * Create the Express handler for POST /mcp.
 *
 * Speaks Streamable HTTP: a client that advertises `text/event-stream` gets
 * the response as a single SSE event, a plain JSON client gets ordinary JSON.
 * Also handles JSON-RPC batches and notifications (which take 202 with no
 * body, per spec).
 */
export function createMcpHandler(ctx: McpContext, expectedApiKey: string) {
  return async (req: Request, res: Response) => {
    if (expectedApiKey && expectedApiKey.trim().length > 0) {
      const authHeader = req.headers.authorization || "";
      if (!authHeader.startsWith(`Bearer ${expectedApiKey}`)) {
        return res.status(401).json({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32001, message: "Unauthorized: Invalid or missing Bearer token" },
        });
      }
    }

    const wantsSse = acceptHeader(req).includes("text/event-stream");
    const send = (payload: unknown) => {
      if (wantsSse) {
        res.status(200).set({
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
        return res.end();
      }
      return res.json(payload);
    };

    const body = req.body;

    if (Array.isArray(body)) {
      if (body.length === 0) {
        return send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
      }
      const responses = (await Promise.all(body.map((r) => handleRpc(ctx, r)))).filter(Boolean);
      if (responses.length === 0) {
        res.status(202).end();
        return;
      }
      return send(responses);
    }

    let response: unknown;
    try {
      response = await handleRpc(ctx, body || {});
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // RpcError carries the protocol-level code the tool intended (invalid
      // params, unknown entity, unknown tool). Re-wrapping it as -32603 would
      // tell the client "internal error" for what is really a caller mistake.
      const code = error instanceof RpcError ? error.code : -32603;
      response = {
        jsonrpc: "2.0",
        id: (body as any)?.id ?? null,
        error: { code, message },
      };
    }

    if (response === null) {
      res.status(202).end();
      return;
    }
    return send(response);
  };
}
