# ScalarAI MCP Commands & Bridge Capabilities

This document lists all available commands and capabilities exposed via the ScalarAI MCP (Model Context Protocol) server, the underlying MetaTrader 5 Python bridge (`mt5_pkg_bridge`), and the bridge CLI. It serves as a reference for AI agents and developers to understand what operations can be performed.

## Table of Contents
1. [MCP Tools](#mcp-tools)
2. [Friendly Alias Tools (mt5_*)](#friendly-alias-tools-mt5_)
3. [Bridge Methods (TypeScript)](#bridge-methods-typescript)
4. [Bridge CLI Commands (Python)](#bridge-cli-commands-python)
5. [MCP Resources](#mcp-resources)
6. [Usage Examples](#usage-examples)
7. [Notes](#notes)

---

## MCP Tools

The MCP server exposes the following tools via JSON-RPC 2.0 at `POST /mcp`. Each tool has a name, description, and input schema.

| Tool Name | Description | Required Parameters |
|-----------|-------------|---------------------|
| `get_system_status` | Get full ScalarAI system status: config, connection, trades, logs, stats, AI strategy, and symbol states. | - |
| `get_trading_state` | Get current trading state machine value (idle \| active). | - |
| `get_bridge_state` | Get current EA bridge connection state (disconnected \| connected). | - |
| `get_calibration_state` | Get current AI calibration state (calibrating \| optimized). Automated trading is blocked until optimized. | - |
| `get_ai_knowledge_base` | Get AI knowledge base with long-term market velocity observations, hourly patterns, and peak speeds. | - |
| `get_ai_strategy` | Get the current active AI strategy including rules and parameters. | - |
| `list_strategies` | List all available strategies (built-in and custom). | - |
| `create_strategy` | Create a new custom strategy with a name, description, mode, and rules. | `name`, `mode` |
| `update_strategy` | Update an existing custom strategy by ID. | `id` |
| `delete_strategy` | Delete a custom strategy by ID. | `id` |
| `activate_strategy` | Activate a strategy by ID or mode (TREND_FOLLOWING, MEAN_REVERSION, AI_ADAPTIVE, CUSTOM). | `id` or `mode` |
| `backtest_strategy` | Backtest a strategy against recent market data and return performance metrics. | `mode` |
| `query_db` | Execute a read-only SQL query against the SQLite database. Returns rows as JSON. Use for flexible analysis of trades, logs, ticks, etc. | `sql` |
| `update_trading_settings` | Update trading parameters such as lot size, TP, SL, strategy mode, and trading mode. | - |
| `toggle_automated_trading` | Start or stop automated trading execution. | `isActive` |
| `get_trade_history` | Get the list of all trades, including open and closed positions. | - |
| `get_system_logs` | Get recent system logs filtered by source and level. | - |
| `place_validated_trade` | Place a BUY or SELL trade. Supports custom symbol, lot size, SL, and TP. Dispatches signal to MT5 EA and dashboard. | `type` |
| `close_trade` | Close an open trade by its ID. | `tradeId` |
| `modify_trade_sl_tp` | Modify Stop Loss (SL) and/or Take Profit (TP) points on an open trade or MT5 ticket. Propagates command to MT5 EA. | `tradeId` |
| `close_all_trades` | Close all open positions immediately (globally or for a specific symbol). | - |
| `get_symbols` | Get all market symbols connected to the MT5 EA with prices, connection status, digits, and tick counts. | - |
| `switch_active_symbol` | Switch the active market symbol on the platform dashboard. | `symbol` |
| `get_ea_telemetry` | Get real-time MetaTrader 5 Expert Advisor connection metrics: account login, company/broker, balance, equity, margin, spread, digits, ping. | - |
| `reset_stats` | Reset all trade statistics and clear the trade history log. | - |
| `ingest_strategyforge_csv` | Record a StrategyForge CSV report from an MT5 Strategy Tester run so it becomes visible in the site and MCP. | `csvContent` |
| `get_strategyforge_results` | List recorded StrategyForge results, newest first, with score, trades, win rate, profit, profit factor and drawdown. | - |
| `get_market_telemetry` | Get recent market telemetry (ticks with velocity) for the active symbol. Useful for AI analysis of price movement patterns. | - |
| `get_recent_candles` | Get recent OHLC candles for the active symbol. Useful for chart analysis and pattern recognition. | - |
| `analyze_strategy_performance` | Analyze performance of a strategy mode from historical trades. Returns win rate, profit factor, avg win/loss, and best/worst hours. | `mode` |
| `synthesize_ai_strategy` | Force refresh the AI knowledge base from recent telemetry and recompile the active AI strategy. | - |
| `get_knowledge_summary` | Get a formatted summary of the AI knowledge base including peak speeds and top active hours. | - |
| `analyze_market` | Perform comprehensive market analysis including trend, volatility, momentum, support/resistance, and trading recommendation. | - |
| `get_strategy_performance` | Get detailed performance analysis for a strategy including win rate, profit factor, best/worst hours, and recommendations. | `mode` |
| `optimize_strategy` | Get optimization suggestions for a strategy based on historical performance. | `mode` |
| `recommend_strategy` | Get strategy recommendation based on current market conditions (volatility, trend, time of day). | `volatility`, `trend`, `timeOfDay` |
| `list_strategy_templates` | List all available strategy templates for different trading styles (scalping, day trading, momentum, breakout, etc.). | - |
| `create_strategy_from_template` | Create a new strategy from a template with optional parameter overrides. | `templateId` |
| `export_data` | Export trading data as JSON for external analysis. Returns trades, logs, or market data. | `type` |
| `get_market_candles` | Get OHLC candles with time range from SQLite market_candles table. | - |
| `get_market_observations` | Get AI observations with filters. | - |
| `generate_observation_insights` | Generate insights from observations for a symbol/time range. | - |
| `backtest_strategy_with_history` | Backtest a strategy against historical candle data. | `strategyId`, `from`, `to` |
| `get_mt5_bridge_status` | Get connection status and metadata from the direct Python MetaTrader 5 bridge (mt5_pkg_bridge). | - |
| `connect_mt5_bridge` | Initiate direct connection to MetaTrader 5 terminal via mt5_pkg_bridge. | - |
| `disconnect_mt5_bridge` | Disconnect active MetaTrader 5 bridge connection. | - |
| `get_mt5_account_info` | Fetch live account equity, balance, leverage, margin, and broker info directly from MetaTrader 5 via bridge. | - |
| `get_mt5_terminal_info` | Fetch terminal build, connected broker server, paths, ping, and status directly from MetaTrader 5. | - |
| `get_mt5_symbols` | List all instruments and symbols available in the connected MetaTrader 5 terminal. | - |
| `get_mt5_symbol_info` | Get detailed symbol contract specifications (spread, digits, contract size, margin rate) from MT5. | `symbol` |
| `get_mt5_positions` | Get all open positions directly from MetaTrader 5 via bridge. | - |
| `get_mt5_rates` | Fetch historical candlestick rates directly from MetaTrader 5 via bridge. | `symbol`, `timeframe`, `count` |
| `get_mt5_history_deals` | Fetch closed deal history directly from MetaTrader 5 via bridge. | `days` |
| `execute_mt5_bridge_order` | Execute a live order (BUY, SELL, CLOSE, CLOSE_ALL) directly on MetaTrader 5 through mt5_pkg_bridge. | `action` |
| `call_mt5_function` | Dynamically execute ANY public MetaTrader 5 API function or MT5Engine method via the auto-discovering bridge (e.g. copy_ticks_from, copy_ticks_range, symbol_info_tick, market_book_get, order_calc_margin, order_calc_profit, positions_get, orders_get, etc.). Automatically exposes all capabilities provided by the MetaTrader5 package. | `function` |
| `list_mt5_bridge_functions` | List all auto-discovered MetaTrader 5 functions and engine operations available through mt5_pkg_bridge. | - |
| `modify_mt5_position` | Modify Stop Loss (SL) and/or Take Profit (TP) of an open MetaTrader 5 position directly through the bridge. | `ticket` |
| `get_mt5_orders` | Fetch pending limit/stop orders directly from MetaTrader 5 via the bridge. | `symbol` |
| `get_mt5_tick` | Fetch the latest real-time tick (bid, ask, last, spread, volume, time) for a symbol directly from MetaTrader 5 via the bridge. | `symbol` |
| `get_mt5_market_depth` | Fetch real-time Market Depth (Order Book) for a symbol directly from MetaTrader 5 via the bridge. | `symbol` |
| `calc_mt5_margin` | Calculate required margin for an order directly via MetaTrader 5 bridge. | `action`, `symbol`, `volume` |
| `calc_mt5_profit` | Calculate profit or loss for an order if price moves from openPrice to closePrice, directly via MetaTrader 5 bridge. | `action`, `symbol`, `volume`, `openPrice`, `closePrice` |
| `get_mt5_totals` | Get MT5 terminal counters in one call: total symbols, total positions, and total pending orders. | - |
| `get_mt5_history_orders` | Fetch closed order history directly from MetaTrader 5 via bridge. | `days` |

*All tools return a JSON-RPC 2.0 response with `result.content` containing an array of text objects.*

---

## Friendly Alias Tools (mt5_*)

For improved usability and discoverability, the MCP also provides friendly alias tools with the `mt5_` prefix that mirror the bridge method names. These aliases delegate to the corresponding MCP tools (or directly to the bridge) and have identical input/output behavior.

| Alias Tool Name | Maps to MCP Tool | Description |
|-----------------|------------------|-------------|
| mt5_get_account_info | get_mt5_account_info | Fetch live account equity, balance, leverage, margin, and broker info directly from MetaTrader 5 via bridge. |
| mt5_get_terminal_info | get_mt5_terminal_info | Fetch terminal build, connected broker server, paths, ping, and status directly from MetaTrader 5. |
| mt5_get_symbols | get_mt5_symbols | List all instruments and symbols available in the connected MetaTrader 5 terminal. |
| mt5_get_symbol_info | get_mt5_symbol_info | Get detailed symbol contract specifications (spread, digits, contract size, margin rate) from MT5. |
| mt5_get_tick | get_mt5_tick | Fetch the latest real-time tick (bid, ask, last, spread, volume, time) for a symbol directly from MetaTrader 5 via the bridge. |
| mt5_get_rates | get_mt5_rates | Fetch historical candlestick rates directly from MetaTrader 5 via bridge. |
| mt5_get_positions | get_mt5_positions | Get all open positions directly from MetaTrader 5 via bridge. |
| mt5_get_history_deals | get_mt5_history_deals | Fetch closed deal history directly from MetaTrader 5 via bridge. |
| mt5_get_history_orders | get_mt5_history_orders | Fetch closed order history directly from MetaTrader 5 via bridge. |
| mt5_buy | execute_mt5_bridge_order (action: BUY) | Execute a live BUY order directly on MetaTrader 5 through mt5_pkg_bridge. |
| mt5_sell | execute_mt5_bridge_order (action: SELL) | Execute a live SELL order directly on MetaTrader 5 through mt5_pkg_bridge. |
| mt5_close | execute_mt5_bridge_order (action: CLOSE) | Close an open MetaTrader 5 position by ticket. Supports full close or partial lot closure. |
| mt5_close_all | execute_mt5_bridge_order (action: CLOSE_ALL) | Emergency liquidation: Close all open positions immediately or all open positions for a designated symbol. |
| mt5_modify_position | modify_mt5_position | Modify Stop Loss (SL) and/or Take Profit (TP) of an open MetaTrader 5 position directly through the bridge. |
| mt5_get_orders | get_mt5_orders | Fetch pending limit/stop orders directly from MetaTrader 5 via the bridge. |
| mt5_get_market_depth | get_mt5_market_depth | Fetch real-time Market Depth (Order Book) for a symbol directly from MetaTrader 5 via the bridge. |
| mt5_get_totals | get_mt5_totals | Get MT5 terminal counters in one call: total symbols, total positions, and total pending orders. |
| mt5_list_functions | list_mt5_bridge_functions | List all auto-discovered MetaTrader 5 functions and engine operations available through mt5_pkg_bridge. |
| mt5_execute_function | call_mt5_function | Dynamically execute ANY public MetaTrader 5 API function or MT5Engine method via the auto-discovering bridge. |
| mt5_calc_margin | calc_mt5_margin | Calculate required margin for an order directly via MetaTrader 5 bridge. |
| mt5_calc_profit | calc_mt5_profit | Calculate profit or loss for an order if price moves from openPrice to closePrice, directly via MetaTrader 5 bridge. |

*Friendly aliases follow the same JSON-RPC 2.0 format and error handling as standard tools.*

---

## Bridge Methods (TypeScript)

The `Mt5BridgeService` class in `backend/src/gateway/mt5-bridge.ts` provides the following public methods that the MCP tools wrap:

| Method | Return Type | Description |
|--------|-------------|-------------|
| `getStatus()` | `Promise<Mt5BridgeStatus>` | Executes the `status` command on the bridge. |
| `connect(config: Record<string, unknown> = {})` | `Promise<any>` | Executes the `connect` command. |
| `disconnect()` | `Promise<any>` | Executes the `disconnect` command. |
| `getAccount()` | `Promise<any>` | Executes the `account` command. |
| `getTerminal()` | `Promise<any>` | Executes the `terminal` command. |
| `getSymbols()` | `Promise<any>` | Executes the `symbols` command. |
| `getSymbolInfo(symbol: string)` | `Promise<any>` | Executes the `symbol_info` command. |
| `getTick(symbol: string)` | `Promise<any>` | Executes the `tick` command. |
| `getRates(symbol: string, timeframe = 1, count = 100)` | `Promise<any>` | Executes the `rates` command. |
| `getPositions()` | `Promise<any>` | Executes the `positions` command. |
| `getHistoryDeals(days = 30)` | `Promise<any>` | Executes the `history_deals` command. |
| `getHistoryOrders(days = 30)` | `Promise<any>` | Executes the `history_orders` command. |
| `buy(params: { symbol: string; volume: number; sl?: number; tp?: number; comment?: string })` | `Promise<any>` | Executes the `buy` command. |
| `sell(params: { symbol: string; volume: number; sl?: number; tp?: number; comment?: string })` | `Promise<any>` | Executes the `sell` command. |
| `close(ticket: number \| string)` | `Promise<any>` | Executes the `close` command. |
| `closeAll()` | `Promise<any>` | Executes the `close_all` command. |
| `modifyPosition(ticket: number \| string, sl?: number, tp?: number)` | `Promise<any>` | Executes the `modify` command. |
| `getOrders(symbol?: string)` | `Promise<any>` | Executes the `orders` command. |
| `getMarketBook(symbol: string)` | `Promise<any>` | Executes the `market_book` command. |
| `getTotals()` | `Promise<any>` | Executes the `totals` command. |
| `listFunctions()` | `Promise<any>` | Executes the `functions` command. |
| `executeFunction(functionName: string, args: any[] = [], kwargs: Record<string, any> = {})` | `Promise<any>` | Executes the `call` command. |
| `calcMargin(action: string, symbol: string, volume: number, price = 0)` | `Promise<any>` | Executes the `calc_margin` command. |
| `calcProfit(action: string, symbol: string, volume: number, openPrice: number, closePrice: number)` | `Promise<any>` | Executes the `calc_profit` command. |

The `Mt5BridgeStatus` interface includes:
- `success: boolean`
- `bridge: string` (e.g., "mt5_pkg_bridge")
- `version: string` (e.g., "1.2.0")
- `bridge_available: boolean`
- `is_connected: boolean`
- `connection_info?: Record<string, unknown>`
- `account?: any`
- `terminal?: any`
- `server_time?: string`
- `python_version?: string`
- `error?: string`

---

## Bridge CLI Commands (Python)

The `mt5_bridge_cli.py` script in `backend/src/gateway/mt5_bridge_cli.py` supports the following commands (called as `python mt5_bridge_cli.py <command> [json_args]`):

| Command | Description |
|---------|-------------|
| `status` | Returns bridge status, version, availability, connection state, account, terminal, server time, and Python version. |
| `check` | Alias for `status`. |
| `connect` | Initiates connection to MetaTrader 5 terminal. Accepts JSON args for login, password, server, etc. |
| `disconnect` | Disconnects from MetaTrader 5 terminal. |
| `account` | Returns account information (login, balance, equity, margin, etc.). |
| `terminal` | Returns terminal information (build, broker, etc.). |
| `symbols` | Returns list of all available symbols. |
| `symbol_info <symbol>` | Returns detailed contract specifications for a symbol. |
| `tick <symbol>` | Returns the latest tick (bid, ask, last, spread, volume, time) for a symbol. |
| `rates <symbol> [timeframe] [count]` | Returns historical candlestick rates (default timeframe=1 minute, count=100). |
| `positions` | Returns all open positions. |
| `history_deals [days]` | Returns closed deal history (default 30 days). |
| `history_orders [days]` | Returns closed order history (default 30 days). |
| `buy <args>` | Places a BUY order. Args: symbol, volume, sl, tp, comment, magic. |
| `sell <args>` | Places a SELL order. Args: symbol, volume, sl, tp, comment, magic. |
| `close <ticket>` | Closes a position by ticket. |
| `close_all` | Closes all open positions. |
| `modify <ticket> [sl] [tp>` | Modifies SL/TP of an open position. |
| `orders [symbol]` | Returns pending limit/stop orders (optional symbol filter). |
| `market_book <symbol>` | Returns market depth (order book) for a symbol. |
| `totals` | Returns terminal counters (symbols, positions, pending orders). |
| `functions` | Lists all auto-discovered MT5 functions and engine operations. |
| `call <function> [args] [kwargs]` | Dynamically executes any MT5 function or engine method. |
| `calc_margin <args>` | Calculates required margin for an order. |
| `calc_profit <args>` | Calculates profit/loss for an order given open/close prices. |

All commands return a JSON object on stdout. Example status output:
```json
{
  "success": true,
  "bridge": "mt5_pkg_bridge",
  "version": "1.2.0",
  "bridge_available": true,
  "is_connected": false,
  "connection_info": {},
  "account": null,
  "terminal": null,
  "server_time": "",
  "python_version": "3.11.9"
}
```

---

## MCP Resources

The MCP server also exposes resources (context data) that clients can read via `resources/read`. Available resources include:

- `scalarai://status` - Full system status (same as `get_system_status` tool)
- `scalarai://config` - Trading configuration
- `scalarai://strategy/active` - Active AI strategy
- `scalarai://knowledge/base` - AI knowledge base
- `scalarai://symbols` - Connected symbols
- `scalarai://trades/open` - Open positions
- `scalarai://trades/recent` - Recent trade history
- `scalarai://logs/recent` - Recent system logs
- `scalarai://tester/results` - StrategyForge tester results
- `scalarai://guides/backtesting` - Backtesting guide (markdown)
- `scalarai://bridge/status` - MT5 bridge status (same as `get_mt5_bridge_status`)
- `scalarai://bridge/functions` - MT5 bridge functions (same as `list_mt5_bridge_functions`)
- `scalarai://bridge/positions` - MT5 live positions (same as `get_mt5_positions`)
- Plus templated resources: `scalarai://candles/{symbol}` and `scalarai://observations/{symbol}`

---

## Usage Examples

### 1. Check Bridge Status
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_mt5_bridge_status",
    "arguments": {}
  }
}
```

### 2. Get Live Tick for EURUSD (using friendly alias)
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "mt5_get_tick",
    "arguments": { "symbol": "EURUSD" }
  }
}
```

### 3. Get Historical Orders (last 14 days)
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_mt5_history_orders",
    "arguments": { "days": 14 }
  }
}
```

### 4. Place a Trade (using friendly alias)
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "mt5_buy",
    "arguments": {
      "symbol": "EURUSD",
      "volume": 0.01,
      "sl": 1.0800,
      "tp": 1.0900,
      "comment": "AI momentum signal"
    }
  }
}
```

### 5. List Available MT5 Functions
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "mt5_list_functions",
    "arguments": {}
  }
}
```

### 6. Execute Arbitrary MT5 Function (e.g., get symbol info)
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "mt5_execute_function",
    "arguments": {
      "function": "symbol_info",
      "args": [],
      "kwargs": { "symbol": "EURUSD" }
    }
  }
}
```

---

## Notes

- The MCP provides a **stable, typed, and discoverable interface** for AI agents.
- All tools validate input and return structured JSON-RPC responses.
- The bridge itself is lightweight and can be used directly via CLI or Python import, but MCP adds:
  - Authentication (Bearer token)
  - Protocol versioning
  - Resource-based context discovery
  - Standardized error handling
- For AI agents, using MCP tools (especially the friendly `mt5_*` aliases) is **safer and more convenient** than constructing low-level bridge commands, as it handles connection management, reconnection, and data normalization.
- The friendly alias tools are purely for ergonomics; they do not add new functionality and are safe to use.
- The missing bridge method `getHistoryOrders` is now exposed via `get_mt5_history_orders` and its alias `mt5_get_history_orders`.
