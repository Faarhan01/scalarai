# Backend MCP Server

> Detailed reference for the MCP JSON-RPC 2.0 server in `backend/src/mcp_server.ts`.

## Handler

```ts
export function createMcpHandler(ctx: McpContext, expectedApiKey: string) {
  return async (req, res) => { ... };
}
```

Returns Express middleware. Always requires Bearer auth regardless of `expectedApiKey`.

## Protocol

- **Protocol version:** `2024-11-05`
- **Server info:** `{ name: "scalarai-mcp", version: "2.0.0" }`

## Methods

### Lifecycle

| Method | Description |
|--------|-------------|
| `initialize` | Returns server capabilities |
| `initialized` | Acknowledges initialization |

### Tools

| Method | Description |
|--------|-------------|
| `tools/list` | Lists all available tools |
| `tools/call` | Executes a tool by name |

## Tool List

### System & Status

- **`get_system_status`** — Full system status: config, connection, trades, logs, stats, AI strategy, symbol states
- **`get_ai_knowledge_base`** — AI knowledge base with long-term market velocity observations, hourly patterns, peak speeds
- **`get_ai_strategy`** — Current active AI strategy including rules and parameters
- **`query_db`** — Read-only SQL query against SQLite. Returns rows as JSON.

  Input: `{ sql: string, params?: any[] }`

  Safety: Only SELECT queries allowed. Forbidden keywords: DROP, DELETE, UPDATE, INSERT, ALTER, CREATE, REPLACE, PRAGMA, ATTACH, DETACH, VACUUM, INDEX, TRIGGER, VIEW, TRANSACTION, SAVEPOINT, RELEASE, COMMIT, ROLLBACK. No semicolons or comments.

- **`get_trade_history`** — Trade list with optional status filter and limit
- **`get_system_logs`** — Logs with optional source/level filters and limit

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
- **`place_validated_trade`** — Place BUY/SELL with gatekeeper rules
- **`close_trade`** — Close open trade by ID
- **`reset_stats`** — Reset all trade statistics and history

### Analysis

- **`backtest_strategy`** — Backtest strategy against recent ticks (default 500)
- **`analyze_strategy_performance`** — Win rate, profit factor, avg win/loss, best/worst hours
- **`synthesize_ai_strategy`** — Refresh AI knowledge from recent telemetry
- **`get_knowledge_summary`** — Formatted knowledge summary with top active hours
- **`analyze_market`** — Comprehensive market analysis: trend, volatility, momentum, support/resistance, recommendation
- **`get_strategy_performance`** — Detailed performance with best/worst hours and recommendation
- **`optimize_strategy`** — Optimization suggestions based on historical performance
- **`recommend_strategy`** — Strategy recommendation based on volatility, trend, time of day

### Data Export

- **`export_data`** — Export trades, logs, or market data as JSON or CSV

  Input: `{ type: "trades" | "logs" | "market_data", limit?: number, format?: "json" | "csv" }`

### Market Data

- **`get_market_telemetry`** — Recent telemetry records (ticks with velocity) for active symbol
- **`get_recent_candles`** — Recent OHLC candles for active symbol

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
  placeTrade: (type: "BUY" | "SELL", reason?: string) => Promise<{ success: boolean; message: string }>;
  closeTrade: (tradeId: string) => Promise<{ success: boolean; message: string }>;
  resetStats: () => Promise<void>;
}
```

Built from `store.buildMcpContext()` in `backend/src/index.ts`.

## Exported Interfaces

- `McpTool` — name, description, inputSchema
- `McpToolCallResult` — content array with text type
- `McpToolCallParams` — name, arguments
