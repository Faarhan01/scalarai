# Backend MCP Server

> Detailed reference for the MCP JSON-RPC 2.0 server in `backend/src/mcp_server.ts`.

## Handler

```ts
export function createMcpHandler(ctx: McpContext, expectedApiKey: string) {
  return async (req, res) => { ... };
}
```

Returns Express middleware. Auth is only enforced when `expectedApiKey` is set and non-empty; otherwise requests pass through. This matches `middleware/auth.ts` behavior.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/mcp` | Conditional | MCP JSON-RPC 2.0 handler |
| `POST` | `/api/mcp` | Conditional | MCP JSON-RPC 2.0 handler (alternate path) |
| `GET` | `/mcp` | No | Server info: name, version, status, toolsCount, protocol, endpoint |
| `GET` | `/api/mcp` | No | Server info (alternate path) |

Server info response:
```json
{
  "name": "scalarai-mcp",
  "version": "2.0.0",
  "status": "ready",
  "toolsCount": 33,
  "protocol": "JSON-RPC 2.0",
  "endpoint": "/mcp"
}
```

## Protocol

- **Protocol version:** `2024-11-05`
- **Server info:** `{ name: "scalarai-mcp", version: "2.0.0" }`
- **Request shape:** JSON-RPC 2.0 with `jsonrpc`, `id`, `method`, `params`
- **Response shape:** `{ jsonrpc: "2.0", id, result }` or `{ jsonrpc: "2.0", id, error }`

## Methods

### Lifecycle

| Method | Description |
|--------|-------------|
| `initialize` | Returns server capabilities: `protocolVersion`, `capabilities: { tools: {} }`, `serverInfo` |
| `initialized` | Acknowledges initialization, returns `null` |

### Tool Discovery

| Method | Description |
|--------|-------------|
| `tools/list` | Returns the full `TOOLS` array with all 33 tool definitions |

### Tool Execution

| Method | Description |
|--------|-------------|
| `tools/call` | Executes a tool by name with arguments |

## Tool List (33 total)

### System & Status

- **`get_system_status`** — Full system status: config, connection, trades, logs, stats, AI strategy, symbol states
- **`get_trading_state`** — Current trading state machine value (`idle` | `active`)
- **`get_bridge_state`** — Current EA bridge connection state (`disconnected` | `connected`)
- **`get_calibration_state`** — Current AI calibration state (`calibrating` | `optimized`). Automated trading is blocked until `optimized`.
- **`get_ai_knowledge_base`** — AI knowledge base with long-term market velocity observations, hourly patterns, peak speeds
- **`get_ai_strategy`** — Current active AI strategy including rules and parameters
- **`query_db`** — Read-only SQL query against SQLite. Returns rows as JSON.

  Input: `{ sql: string, params?: any[] }`

  Safety: Only SELECT queries allowed. Forbidden keywords: DROP, DELETE, UPDATE, INSERT, ALTER, CREATE, REPLACE, PRAGMA, ATTACH, DETACH, VACUUM, INDEX, TRIGGER, VIEW, TRANSACTION, SAVEPOINT, RELEASE, COMMIT, ROLLBACK. No semicolons or comments.

- **`get_trade_history`** — Trade list with optional `status`, `symbol`, and `limit` filters
- **`get_system_logs`** — Logs with optional `source`, `level`, and `limit` filters

### Strategy Management

- **`list_strategies`** — All strategies (built-in + custom)
- **`create_strategy`** — Create custom strategy with name, description, mode, rules
- **`update_strategy`** — Update existing custom strategy by ID
- **`delete_strategy`** — Delete custom strategy by ID
- **`activate_strategy`** — Activate strategy by mode or custom ID
- **`list_strategy_templates`** — All 8 built-in strategy templates
- **`create_strategy_from_template`** — Create strategy from template with optional overrides

### Trading

- **`update_trading_settings`** — Update config: strategy, lot size, TP, SL, trailing stop, max trades, trading mode, AI mode
- **`toggle_automated_trading`** — Start/stop automated trading
- **`place_validated_trade`** — Place BUY/SELL with gatekeeper rules, supports `symbol`, `lotSize`, `sl`, `tp`
- **`close_trade`** — Close open trade by ID
- **`close_all_trades`** — Close all open positions, optionally for a specific symbol
- **`reset_stats`** — Reset all trade statistics and history

### Market Data & Analysis

- **`get_market_telemetry`** — Recent telemetry records (ticks with velocity) for a symbol. Returns knowledge base + recent ticks.
- **`get_recent_candles`** — Recent OHLC candles for a symbol. Falls back to ticks if no candles exist. Accepts optional `symbol` param.
- **`get_market_candles`** — OHLC candles from `market_candles` table with time range (`from`, `to`) and `limit` (default 1000, max 10000)
- **`get_market_observations`** — AI observations with filters: `symbol`, `from`, `to`, `direction` (`up`/`down`/`flat`), `minVelocity`, `limit`
- **`generate_observation_insights`** — Generate insights from observations for a symbol/time range: direction distribution, peak velocity, suggested strategies
- **`backtest_strategy`** — Backtest a strategy mode against recent ticks (default 500)
- **`backtest_strategy_with_history`** — Backtest a saved strategy against historical candle data. Requires `strategyId`, `from`, `to`. Optional `initialBalance` (default 10000).

### Analysis & Recommendations

- **`analyze_strategy_performance`** — Win rate, profit factor, avg win/loss, best/worst hours for a strategy mode
- **`get_strategy_performance`** — Detailed performance with best/worst hours and recommendation
- **`analyze_market`** — Comprehensive market analysis: trend, volatility, momentum, support/resistance, recommendation
- **`synthesize_ai_strategy`** — Force refresh AI knowledge base from recent telemetry
- **`get_knowledge_summary`** — Formatted knowledge summary with peak speeds and top active hours
- **`optimize_strategy`** — Optimization suggestions based on historical performance
- **`recommend_strategy`** — Strategy recommendation based on volatility, trend, time of day

### EA & Symbols

- **`get_symbols`** — All market symbols connected to the MT5 EA with prices, connection status, digits, tick counts
- **`switch_active_symbol`** — Switch the active market symbol on the platform dashboard
- **`get_ea_telemetry`** — Real-time MT5 EA connection metrics: account login, company/broker, balance, equity, margin, spread, digits, ping

### Data Export

- **`export_data`** — Export trades, logs, or market data as JSON or CSV

  Input: `{ type: "trades" | "logs" | "market_data", limit?: number, format?: "json" | "csv" }`

## McpContext Interface

```ts
export interface McpContext {
  getStatus: () => FullStatusPayload;
  getAiStudyFeed: () => Promise<AiStudyFeedPayload>;
  getTrades: () => TradeRecord[];
  getLogs: () => SystemLog[];
  getConfig: () => TradeConfig;
  getConnection: () => EAConnectionDetails;
  getAiStrategy: () => AiSynthesizedStrategy;
  getAiKnowledgeBase: () => AiKnowledgeBase;
  analyzeMarket: () => Promise<string>;
  synthesizeStrategy: () => Promise<AiSynthesizedStrategy>;
  updateSettings: (params: Partial<TradeConfig>) => Promise<TradeConfig>;
  toggleTrading: (isActive: boolean) => Promise<TradeConfig>;
  placeTrade: (
    type: "BUY" | "SELL",
    reason?: string,
    options?: { symbol?: string; lotSize?: number; sl?: number; tp?: number }
  ) => Promise<{ success: boolean; message: string; ticket?: number }>;
  closeTrade: (tradeId: string) => Promise<{ success: boolean; message: string }>;
  closeAllTrades: (symbol?: string) => Promise<{ success: boolean; closedCount: number; message: string }>;
  switchSymbol: (symbol: string) => void;
  getSymbols: () => Array<{
    symbol: string;
    isConnected: boolean;
    currentPrice: number;
    tickCount: number;
    digits?: number | null;
    tickSize?: number | null;
  }>;
  resetStats: () => Promise<void>;
  getTradingState: () => TradingState;
  getBridgeState: () => BridgeState;
  getCalibrationState: () => CalibrationState;
  getObservations: (filters?: ObservationFilters) => Observation[];
  generateInsights: (symbol: string, from?: number, to?: number) => ObservationInsights;
  backtestStrategyWithHistory: (
    strategyId: string,
    symbol: string,
    from: number,
    to: number,
    initialBalance?: number
  ) => any;
}
```

Built from `store.buildMcpContext()` in `backend/src/index.ts`.

## Route Registration

```ts
// index.ts
registerMcpRoute(app, store.buildMcpContext(), process.env.SCALARAI_MCP_API_KEY);
```

When `SCALARAI_MCP_API_KEY` is unset or empty, the MCP handler allows all requests without auth.

## Exported Interfaces

- `McpTool` — name, description, inputSchema
- `McpToolCallResult` — content array with text type
- `McpToolCallParams` — name, arguments
- `TOOLS` — array of all 33 registered `McpTool` definitions
- `isReadOnlySql(sql: string): boolean` — validates SELECT-only queries
