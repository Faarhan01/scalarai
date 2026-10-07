# Historical Data Plan — Stage 6: Enhanced MCP Tools

## Status: ✅ DONE

## What Was Implemented

All planned MCP tools have been added to `backend/src/mcp_server.ts`:

### Existing Tools (Relevant to Historical Data)

- `get_market_telemetry` — Returns AI knowledge base object with long-term market velocity observations, hourly patterns, peak speeds
- `get_recent_candles` — Returns recent market ticks (note: name is misleading — returns ticks, not candles)
- `backtest_strategy` — Backtests against recent live ticks (default 500)
- `query_db` — Generic read-only SQL query tool

### New Tools Added

- `get_market_candles` — Get OHLC candles with time range from `market_candles` table (mcp_server.ts:388)
- `get_market_observations` — Get AI observations with filters (mcp_server.ts:402)
- `generate_observation_insights` — Generate insights from observations for a symbol/time range (mcp_server.ts:419)
- `backtest_strategy_with_history` — Backtest strategy using historical candle data (mcp_server.ts:431)
- `list_strategy_templates` — List all 8 built-in strategy templates (mcp_server.ts:357)
- `create_strategy_from_template` — Create strategy from template with optional overrides (mcp_server.ts:362)

## Critical Fragility Warnings

### MCP TOOL INTERFACE IS A CONTRACT

1. **MCP tools are consumed by external clients**: Kilo and other AI tools call these tools via JSON-RPC 2.0. Changing tool names, input schemas, or return shapes breaks these clients.

2. **`McpContext` must be updated for new tools**: If new MCP tools need access to `AppStore` methods, add them to the `McpContext` interface in `backend/src/types/index.ts` and wire them in `backend/src/services/app-store.ts:buildMcpContext()`.

3. **Tool schemas must be valid JSON Schema**: The `inputSchema` in `McpTool` must follow JSON Schema specification. Invalid schemas cause MCP clients to reject the tool.

4. **Existing `get_recent_candles` is misleading**: Consider renaming to `get_recent_ticks` or updating it to query `market_candles` instead of `market_ticks` to avoid confusion.

## Verification

- [x] All new MCP tools respond correctly
- [x] Historical data returned in correct format
- [x] Observations queryable via MCP
- [x] Strategy creation works from templates
- [x] Existing MCP tools still work
