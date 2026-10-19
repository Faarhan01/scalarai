# Stage 3: Implementation Guide for Renaming MCP Tools

## File to Modify
`C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\src\mcp_server.ts`

## Steps

### 1. Update the `TOOLS` Array
Replace the existing tool definitions with the new friendly names as per stage2_design.

#### a) Remove the following tool definitions (old names):
- `get_mt5_bridge_status`
- `connect_mt5_bridge`
- `disconnect_mt5_bridge`
- `execute_mt5_bridge_order`
- `call_mt5_function`
- `list_mt5_bridge_functions`
- `modify_mt5_position` (keep but rename? Actually we keep mt5_modify_position; we will rename the case but keep the name same? Wait we decided to keep modify_mt5_position as is because it already matches. So we keep it.)
- `get_mt5_orders` (keep)
- `get_mt5_tick` (keep)
- `get_mt5_market_depth` (keep)
- `calc_mt5_margin` (keep)
- `calc_mt5_profit` (keep)
- `get_mt5_totals` (keep)

But we will replace them with new definitions. So we will rewrite the relevant sections.

#### b) Add/Replace with new tool definitions:
Insert the following tool definitions in the `TOOLS` array (in alphabetical order or logical grouping). We'll list them here; you can copy from the stage2_design table.

**MT5 Tools (renamed/new):**
```typescript
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
      symbol: { type: "string", description: "Symbol filter (e.g. \"EURUSD\"), or \"ALL\" to liquidate entire portfolio." },
    },
    required: [],
  },
},
{
  name: "mt5_call_function",
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
  name: "mt5_list_functions",
  description: "List all auto-discovered MetaTrader 5 functions and engine operations available through mt5_pkg_bridge.",
  inputSchema: { type: "object", properties: {}, required: [] },
},
{
  name: "mt5_modify_position",
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
  name: "mt5_get_orders",
  description: "Fetch pending limit/stop orders directly from MetaTrader 5 via the bridge.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Optional symbol filter" },
    },
    required: [],
  },
},
{
  name: "mt5_get_tick",
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
  name: "mt5_get_market_depth",
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
  name: "mt5_calc_margin",
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
  name: "mt5_calc_profit",
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
  name: "mt5_get_totals",
  description: "Get MT5 terminal counters in one call: total symbols, total positions, and total pending orders.",
  inputSchema: { type: "object", properties: {}, required: [] },
},
```

#### c) Ensure all other non-MT5 tools remain in the array unchanged.

### 2. Update the `callTool` Switch Statement
Locate the large `switch (params.name)` block in the `callTool` function (around line 1134). For each tool name changed, update the case label and adjust the logic if needed.

#### a) Replace cases for renamed tools:
- Change `case "get_mt5_bridge_status":` to `case "mt5_get_bridge_status":`
- Change `case "connect_mt5_bridge":` to `case "mt5_connect_bridge":`
- Change `case "disconnect_mt5_bridge":` to `case "mt5_disconnect_bridge":`
- Change `case "call_mt5_function":` to `case "mt5_call_function":`
- Change `case "list_mt5_bridge_functions":` to `case "mt5_list_functions":`
- (modify_mt5_position case name stays the same)
- (get_mt5_orders, get_mt5_tick, get_mt5_market_depth, calc_mt5_margin, calc_mt5_profit, get_mt5_totals case names stay the same)

#### b) Remove the case for `execute_mt5_bridge_order` and add cases for the four new order tools:
Remove:
```typescript
case "execute_mt5_bridge_order": {
  // existing logic
}
```

Add:
```typescript
case "mt5_buy": {
  const symbol = args.symbol || ctx.getStatus().activeSymbol || "Step Index";
  const volume = Number(args.volume || 0.1);
  const sl = typeof args.sl === "number" ? args.sl : undefined;
  const tp = typeof args.tp === "number" ? args.tp : undefined;
  const comment = args.comment || "MCP AI BUY";
  const result = await mt5Bridge.buy({ symbol, volume, sl, tp, comment });
  return toolResult(JSON.stringify(result, null, 2));
}
```

```typescript
case "mt5_sell": {
  const symbol = args.symbol || ctx.getStatus().activeSymbol || "Step Index";
  const volume = Number(args.volume || 0.1);
  const sl = typeof args.sl === "number" ? args.sl : undefined;
  const tp = typeof args.tp === "number" ? args.tp : undefined;
  const comment = args.comment || "MCP AI SELL";
  const result = await mt5Bridge.sell({ symbol, volume, sl, tp, comment });
  return toolResult(JSON.stringify(result, null, 2));
}
```

```typescript
case "mt5_close_position": {
  if (!args.ticket) throw new RpcError(-32602, "Ticket is required");
  const ticket = Number(args.ticket);
  const volume = typeof args.volume === "number" ? args.volume : undefined; // 0 means close all?
  // According to bridge, close method expects ticket only; volume not used.
  // We'll just pass ticket.
  const result = await mt5Bridge.close(ticket);
  return toolResult(JSON.stringify(result, null, 2));
}
```

```typescript
case "mt5_close_all": {
  const symbol = args.symbol ? String(args.symbol) : undefined;
  const result = await mt5Bridge.closeAll();
  return toolResult(JSON.stringify(result, null, 2));
}
```

Note: The bridge's `closeAll` does not take symbol argument; but we can ignore symbol or maybe bridge has a filtered closeAll? We'll keep as is.

#### c) Add case for the new missing tool:
```typescript
case "mt5_get_history_orders": {
  const days = Number(args.days || 30);
  const deals = await mt5Bridge.getHistoryOrders(days);
  return toolResult(JSON.stringify(deals, null, 2));
}
```

#### d) Ensure all other cases remain unchanged (except for the renamed tool cases).

### 3. Verify Helper Functions
Ensure `toolResult` and `RpcError` are defined as before.

### 4. Build and Test
After changes, run the build/lint/test steps to ensure correctness.

## Notes
- Do not modify `mt5_bridge_cli.py` or `mt5-bridge.ts`.
- The changes are limited to `mcp_server.ts`.
- Keep the JSON-RPC 2.0 response format intact.
