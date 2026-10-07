# Historical Data Plan — Stage 6: Enhanced MCP Tools

## Status: ❌ NOT DONE — Depends on stages 2-5

## Objective

Add MCP tools for historical data requests, observation queries, and strategy creation via MCP.

## Current MCP Tools (Relevant to Historical Data)

**Existing tools:**
- `get_market_telemetry` — Returns AI knowledge base object (not per-observation records)
- `get_recent_candles` — Returns `market_ticks` rows (misleading name — returns ticks, not candles)
- `backtest_strategy` — Backtests against recent live ticks (no time range, no candle support)
- `query_db` — Generic SQL query tool (can query any table, including future `market_candles`)

**Missing tools (per plan):**
- `request_mt5_history` — Request historical data from MT5 EA
- `get_market_candles` — Get OHLC candles with time range from SQLite
- `get_market_observations` — Get AI observations with filters
- `backtest_strategy_with_history` — Backtest strategy using historical data
- `create_strategy_from_observation` — Create strategy from AI observations
- `request_mt5_ticks` — Request tick-level history from MT5

## Required New MCP Tools

### 1. `get_market_candles`

Get OHLC candles with time range from `market_candles` table.

**Input:**
```json
{
  "symbol": "Step Index",
  "from": "2026-09-01T00:00:00Z",
  "to": "2026-10-07T00:00:00Z",
  "limit": 5000
}
```

**Output:**
```json
{
  "symbol": "Step Index",
  "candles": [
    {
      "time": 1727740800000,
      "open": 1234.56,
      "high": 1235.00,
      "low": 1234.00,
      "close": 1234.80,
      "volume": 1234,
      "direction": "up"
    }
  ],
  "count": 5000,
  "from": "2026-09-01T00:00:00Z",
  "to": "2026-10-07T00:00:00Z"
}
```

**Implementation:**
```typescript
case "get_market_candles": {
  const symbol = args.symbol || "Step Index";
  const from = args.from ? new Date(args.from).getTime() : undefined;
  const to = args.to ? new Date(args.to).getTime() : undefined;
  const limit = Math.min(typeof args.limit === "number" ? args.limit : 1000, 10000);
  
  const candles = scalarAiDb.getCandles(symbol, from, to, limit);
  result = { content: [{ type: "text", text: JSON.stringify({ symbol, candles, count: candles.length, from, to }, null, 2) }] };
  break;
}
```

### 2. `get_market_observations`

Get AI observations with filters.

**Input:**
```json
{
  "symbol": "Step Index",
  "from": "2026-09-01T00:00:00Z",
  "to": "2026-10-07T00:00:00Z",
  "direction": "up",
  "minVelocity": 0.5,
  "limit": 500
}
```

**Output:**
```json
{
  "symbol": "Step Index",
  "observations": [...],
  "count": 500
}
```

### 3. `backtest_strategy_with_history`

Backtest strategy using historical candle data.

**Input:**
```json
{
  "strategyId": "uuid",
  "symbol": "Step Index",
  "from": "2026-09-01T00:00:00Z",
  "to": "2026-10-07T00:00:00Z",
  "initialBalance": 10000
}
```

**Output:**
```json
{
  "strategyId": "uuid",
  "symbol": "Step Index",
  "from": "2026-09-01T00:00:00Z",
  "to": "2026-10-07T00:00:00Z",
  "totalTrades": 42,
  "wins": 26,
  "losses": 16,
  "winRate": 0.62,
  "profitFactor": 1.8,
  "maxDrawdown": 0.15,
  "sharpeRatio": 1.2,
  "avgWin": 123.45,
  "avgLoss": 67.89,
  "finalBalance": 11234.56,
  "trades": [...]
}
```

### 4. `create_strategy_from_observations`

Create a new strategy from AI observations.

**Input:**
```json
{
  "name": "High Velocity Breakout",
  "description": "Strategy based on high velocity observations",
  "symbol": "Step Index",
  "observationIds": ["obs_123", "obs_456"],
  "minConfidence": 0.7,
  "mode": "CUSTOM"
}
```

**Output:**
```json
{
  "success": true,
  "strategy": {
    "id": "uuid",
    "name": "High Velocity Breakout",
    "mode": "CUSTOM",
    "rules": {...}
  }
}
```

### 5. `generate_observation_insights`

Generate insights from observations for a symbol/time range.

**Input:**
```json
{
  "symbol": "Step Index",
  "from": "2026-09-01T00:00:00Z",
  "to": "2026-10-07T00:00:00Z"
}
```

**Output:**
```json
{
  "symbol": "Step Index",
  "totalObservations": 1523,
  "avgVelocity": 0.23,
  "peakVelocity": 0.89,
  "directionDistribution": { "up": 45, "down": 38, "flat": 17 },
  "topActiveHours": [
    { "hour": 9, "count": 234 },
    { "hour": 14, "count": 187 }
  ],
  "velocityClusters": [
    { "min": 0.1, "max": 0.2, "count": 456 },
    { "min": 0.2, "max": 0.3, "count": 321 }
  ],
  "suggestedStrategies": ["velocity_scalping", "momentum_breakout"]
}
```

## Implementation Steps

1. Add `get_market_candles` tool definition + handler to `mcp_server.ts`
2. Add `get_market_observations` tool definition + handler
3. Add `backtest_strategy_with_history` tool definition + handler
4. Add `create_strategy_from_observations` tool definition + handler
5. Add `generate_observation_insights` tool definition + handler
6. Update `McpContext` interface with new methods
7. Update `AppStore.buildMcpContext()` to expose new methods
8. Verify with MCP client tests

## Critical Fragility Warnings

### MCP TOOL INTERFACE IS A CONTRACT

1. **MCP tools are consumed by external clients**: Kilo and other AI tools call these tools via JSON-RPC 2.0. Changing tool names, input schemas, or return shapes breaks these clients.

2. **`McpContext` must be updated for new tools**: If new MCP tools need access to `AppStore` methods, add them to the `McpContext` interface in `backend/src/types/index.ts` and wire them in `backend/src/services/app-store.ts:buildMcpContext()`.

3. **Tool schemas must be valid JSON Schema**: The `inputSchema` in `McpTool` must follow JSON Schema specification. Invalid schemas cause MCP clients to reject the tool.

4. **Existing `get_recent_candles` is misleading**: Consider renaming to `get_recent_ticks` or updating it to query `market_candles` instead of `market_ticks` to avoid confusion.

## Verification

- [ ] All new MCP tools respond correctly
- [ ] Historical data returned in correct format
- [ ] Observations queryable via MCP
- [ ] Strategy creation works from observations
- [ ] Existing MCP tools still work
