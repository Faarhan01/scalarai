# Historical Data Plan — Stage 6: Enhanced MCP Tools

## Status: ❌ NOT DONE

## Objective

Add MCP tools for historical data requests, observation queries, and strategy creation.

## New MCP Tools

### `request_mt5_history`
Request historical data from MT5 EA.
```json
{
  "symbol": "Step Index",
  "timeframe": "M1",
  "count": 1000,
  "type": "candles"
}
```

### `get_market_candles`
Get OHLC candles with time range from SQLite.
```json
{
  "symbol": "Step Index",
  "from": "2026-10-01T00:00:00Z",
  "to": "2026-10-06T00:00:00Z",
  "limit": 5000
}
```

### `get_market_observations`
Get AI observations with filters.
```json
{
  "symbol": "Step Index",
  "from": "2026-10-01T00:00:00Z",
  "to": "2026-10-06T00:00:00Z",
  "direction": "up",
  "minVelocity": 0.5
}
```

### `backtest_strategy_with_history`
Backtest strategy using historical data.
```json
{
  "strategyId": "uuid",
  "symbol": "Step Index",
  "from": "2026-10-01T00:00:00Z",
  "to": "2026-10-06T00:00:00Z",
  "initialBalance": 10000
}
```

### `create_strategy_from_observation`
Create strategy from AI observations.
```json
{
  "name": "High Velocity Breakout",
  "description": "Strategy based on high velocity observations",
  "observationIds": ["obs1", "obs2"],
  "mode": "CUSTOM"
}
```

### `request_mt5_ticks`
Request tick-level history from MT5.
```json
{
  "symbol": "Step Index",
  "count": 10000,
  "type": "all" // or "buy", "sell"
}
```

## Critical Fragility Warnings

### MCP TOOL INTERFACE IS A CONTRACT

1. **MCP tools are consumed by external clients**: Kilo and other AI tools call these tools via JSON-RPC 2.0. Changing tool names, input schemas, or return shapes breaks these clients.

2. **`McpContext` must be updated for new tools**: If new MCP tools need access to `AppStore` methods, add them to the `McpContext` interface in `backend/src/types/index.ts` and wire them in `backend/src/services/app-store.ts:buildMcpContext()`.

3. **Tool schemas must be valid JSON Schema**: The `inputSchema` in `McpTool` must follow JSON Schema specification. Invalid schemas cause MCP clients to reject the tool.

## Implementation Steps

1. Update `backend/src/mcp_server.ts` with new tool definitions
2. Update `backend/src/mcp_server.ts` with tool handlers
3. Update `backend/src/services/app-store.ts` `buildMcpContext()` with new methods
4. Add WebSocket message handlers for history requests
5. Verify with MCP client tests

## Verification

- All new MCP tools respond correctly
- Historical data returned in correct format
- Observations queryable via MCP
- Strategy creation works from observations
