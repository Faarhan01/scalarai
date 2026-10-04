# AI Connection Documentation

## Connection Overview

The AI assistant connects directly to the local ScalarAI MCP server running at `http://127.0.0.1:3000/mcp` using the Model Context Protocol (MCP) over HTTP with Bearer token authentication.

### How the Connection Works

1. **Server-Side MCP Endpoint**
   - The ScalarAI Express server exposes a dedicated MCP endpoint at `POST /mcp`
   - This endpoint implements the MCP JSON-RPC 2.0 protocol
   - Authentication is enforced via `Authorization: Bearer <token>` header
   - The expected API key is configured in `server.ts` and can be overridden via the `SCALARAI_MCP_API_KEY` environment variable

2. **AI Client-Side Access**
   - The AI assistant has shell access and uses standard HTTP calls to interact with the MCP endpoint
   - All communication uses JSON-RPC 2.0 formatted requests
   - The AI sends `initialize`, `tools/list`, and `tools/call` methods to interact with the server

3. **Authentication Flow**
   - Every MCP request requires a Bearer token in the `Authorization` header
   - The server validates the token before processing any MCP method
   - Invalid or missing tokens return a `401 Unauthorized` JSON-RPC error

## Connection Sequence

### Step 1: Initialize Handshake
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "scalarai",
      "version": "1.0"
    }
  }
}
```

Response includes:
- Protocol version: `2024-11-05`
- Server capabilities: `tools: {}`
- Server info: `{ name: "scalarai-mcp", version: "1.0.0" }`

### Step 2: Discover Available Tools
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

Response includes all 12 available tools with their input schemas.

### Step 3: Invoke Tools
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_system_status",
    "arguments": {}
  }
}
```

## Available MCP Tools

Since I’m the client, I can now directly use the MCP tools against `http://127.0.0.1:3000/mcp` to:

- **inspect live ticks/history**
- **read AI knowledge and strategy state**
- **trigger Gemini analysis/strategy synthesis**
- **change settings**
- **start/stop trading**
- **review trades/logs**

### Full Tool List

| Tool Name | Description | Arguments |
|-----------|-------------|-----------|
| `get_system_status` | Get the full ScalarAI system status including connection, config, trades, logs, stats, and AI strategy. | `{}` |
| `get_ai_knowledge_base` | Get the AI knowledge base containing long-term market velocity observations, hourly patterns, and peak speeds. | `{}` |
| `get_ai_strategy` | Get the current AI synthesized strategy rules and rationale. | `{}` |
| `analyze_market` | Trigger a Gemini AI market analysis report based on recent price history and current strategy. | `{}` |
| `synthesize_strategy` | Synthesize a new AI strategy based on current market telemetry, knowledge base, and trade performance. | `{}` |
| `update_trading_settings` | Update trading parameters such as lot size, TP, SL, strategy mode, and trading mode. | `selectedStrategy`, `lotSize`, `takeProfitPoints`, `stopLossPoints`, `trailingStopPoints`, `useTrailingStop`, `maxTrades`, `tradingMode`, `isAiModeEnabled` |
| `toggle_automated_trading` | Start or stop automated trading execution. | `isActive: boolean` |
| `get_trade_history` | Get the list of all trades, including open and closed positions. | `status?: "OPEN" | "CLOSED"` |
| `get_system_logs` | Get recent system logs filtered by source and level. | `source?: "SERVER" | "EA" | "AI"`, `level?: "INFO" | "SUCCESS" | "WARNING" | "ERROR"`, `limit?: number` |
| `place_validated_trade` | Place a BUY or SELL trade. If AI mode is enabled, the trade will be verified by the Gemini cognitive engine before execution. | `type: "BUY" | "SELL"`, `reason?: string` |
| `close_trade` | Close an open trade by its ID. | `tradeId: string` |
| `reset_stats` | Reset all trade statistics and clear the trade history log. | `{}` |

## Live System State

### Current Connection
- **EA Status:** Connected
- **Account:** `29974125`
- **Broker:** Deriv.com Limited
- **Balance:** `9781.66`
- **Current Price:** `7285.6`
- **Strategy:** `TREND_FOLLOWING`
- **Trading Active:** `false`
- **AI Mode:** `true`
- **Gemini API:** Configured

### AI Knowledge Base
- **Total Observations:** `1297`
- **Global Average Speed:** `0 pt/s`
- **Peak Velocity Registered:** tracked
- **Time-of-Day Patterns:** hourly rolling stats available

### AI Synthesized Strategy
- **Name:** `Adaptive Micro-Volatility Escalator`
- **Last Synthesized:** `2026-10-04T07:11:59.064Z`
- **Rationale:** Initial structural preset. Regulates velocity noise components and aligns trades with secondary EMA moving averages.
- **Rules:**
  - `minVelocityFilter`: `0.15`
  - `slPointsMultiplier`: `1.0`
  - `tpPointsMultiplier`: `1.0`
  - `allowCounterTrend`: `false`
  - `useEmaConfirmation`: `true`
  - `maxAllowedPositionDivergence`: `1.5`

## Shell Access Mechanism

The AI assistant connects using shell-level HTTP access:

1. **Direct HTTP Requests:** The AI uses built-in shell tools to send HTTP POST requests to `http://localhost:3000/mcp`
2. **JSON-RPC Format:** Each request follows the MCP JSON-RPC 2.0 specification
3. **Bearer Authentication:** The AI includes the configured API key in the `Authorization` header
4. **No Additional Libraries:** The connection uses standard HTTP primitives; no special MCP client libraries are required

### Example Shell Command Pattern
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/mcp" -Method Post `
  -Headers @{ "Authorization" = "Bearer <API_KEY>" } `
  -Body '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}'
```

## Integration with MT5

### EA WebRequest Flow
The MT5 Expert Advisor connects to the ScalarAI server via WebRequest:
- **Endpoint:** `http://127.0.0.1:3000/api/ea/tick`
- **Frequency:** Every tick / candle update
- **Data Sent:** account, broker, balance, profit, bid, ask, strategy, version
- **Data Received:** pending actions, TP/SL adjustments, strategy updates

### Live Price Stream
- Current price is maintained server-side and broadcast via:
  - REST API: `/api/status`
  - WebSocket: `/ws/live`
  - MCP tools: `get_system_status`

### Trade Execution Bridge
- Trades can be initiated via MCP `place_validated_trade`
- Server validates through AI cognitive engine if enabled
- Execution signals are queued and dispatched to MT5 EA via:
  - WebSocket `/mt5-bridge`
  - HTTP polling `/poll`, `/get-pending-trades`, `/api/get-pending-trades`

## Configuration

### Environment Variables
- `SCALARAI_MCP_API_KEY` — Bearer token for MCP endpoint access
- `GEMINI_API_KEY` — Google Gemini API key for AI analysis
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth credentials
- `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` — Repository sync targets

### MCP Endpoint Configuration for External Clients

**Claude Code (`.mcp.json`):**
```json
{
  "mcpServers": {
    "scalarai": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer +Z45RyDNhRZ5np8QWW6yrwfbKcnd5KNGzhzHU4nP8K"
      }
    }
  }
}
```

**Codex (`.codex/config.toml`):**
```toml
[mcp_servers.scalarai]
url = "http://127.0.0.1:3000/mcp"
enabled = true
http_headers = { "Authorization" = "Bearer +Z45RyDNhRZ5np8QWW6yrwfbKcnd5KNGzhzHU4nP8K" }
```

## Security Notes

- The MCP server binds to `0.0.0.0:3000` in production; restrict external access if exposed
- All API calls are localhost-only by default in development
- GitHub OAuth tokens are stored in server memory only; not persisted to disk
- No secrets are logged to the event stream
- The monitoring daemon writes to `%TEMP%`, which is user-writable only

## Files and State

The server persists the following files in the working directory:
- `ai_knowledge_profile.json` — long-term market velocity knowledge base
- `ai_synthesized_strategy.json` — current AI strategy rules and rationale
- `ai_knowledge_profile.json` — historical market telemetry patterns

## Troubleshooting

### 401 Unauthorized
- Verify the Bearer token matches `SCALARAI_MCP_API_KEY` in `server.ts`
- Check that the `Authorization` header is formatted exactly as `Bearer <token>`
- Ensure the server has restarted after any configuration changes

### MT5 Built-in MCP Returns 401
- Enable internal server in MT5: **Tools → Options → MCP → Enable internal server**
- Confirm address is `http://127.0.0.1:22346/mcp`
- Restart MT5 after changing MCP settings
- Copy the exact token from MT5's MCP settings UI

### Connection Drops
- Check server logs for errors
- Verify MT5 EA is still sending WebRequest heartbeats
- Ensure port 3000 is not blocked by firewall
