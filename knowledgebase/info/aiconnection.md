# AI Connection Documentation

## Connection Overview

The AI assistant connects to the local ScalarAI server running at `http://127.0.0.1:3000`.

### Access Methods

1. **REST API** — Direct HTTP calls to Express routes
2. **MCP** — JSON-RPC 2.0 over HTTP at `POST /mcp` with Bearer token auth
3. **WebSocket** — Real-time updates at `ws://127.0.0.1:3000/ws/live`

## REST API Reference

### Read State

```bash
curl http://localhost:3000/api/status
```

Returns:
- `config` — current trade config
- `connection` — EA connection details
- `isBridgeConnected` — bridge client count
- `logs` — recent system logs
- `trades` — trade history
- `history` — recent ticks
- `candles` — recent candles
- `currentPrice` — latest price
- `activeSymbol` — current symbol
- `symbolStates` — per-symbol state summary
- `aiSynthesizedStrategy` — current AI strategy
- `lastStrategySignal` — last strategy signal
- `stats` — trade statistics
- `webRequestStatus` — WebRequest test state

### Read AI Feed

```bash
curl http://localhost:3000/api/ai-study-feed
```

Returns:
- `status` — AI mode status (`waiting`, `calibrating`, `optimized`, `active`)
- `message` — AI status message
- `aiKnowledgeBase` — long-term market velocity observations
- `averageVelocity` — current average velocity
- `aiSynthesizedStrategy` — current synthesized strategy

### Modify Config

```bash
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{
    "selectedStrategy": "TREND_FOLLOWING",
    "lotSize": 0.1,
    "takeProfitPoints": 300,
    "stopLossPoints": 150,
    "trailingStopPoints": 100,
    "useTrailingStop": true,
    "maxTrades": 3,
    "tradingMode": "Scalping",
    "isAiModeEnabled": true
  }'
```

### Control Trading

```bash
# Start/stop automated trading
curl -X POST http://localhost:3000/api/toggle-trade \
  -H "Content-Type: application/json" \
  -d '{"isActive": true}'

# Reset trade history
curl -X POST http://localhost:3000/api/reset-stats
```

## MCP Endpoint

### Configuration

Set `SCALARAI_MCP_API_KEY` in `.env`:

```env
SCALARAI_MCP_API_KEY=your-secret-key
```

### Request Format

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_system_status",
      "arguments": {}
    }
  }'
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `get_system_status` | Full system status |
| `get_ai_knowledge_base` | AI knowledge base |
| `get_ai_strategy` | Current AI strategy |
| `list_strategies` | List all strategies |
| `create_strategy` | Create custom strategy |
| `update_strategy` | Update strategy by ID |
| `delete_strategy` | Delete strategy by ID |
| `activate_strategy` | Activate strategy |
| `backtest_strategy` | Backtest strategy |
| `query_db` | Run read-only SQL query |
| `update_trading_settings` | Update trading parameters |
| `toggle_automated_trading` | Start/stop trading |
| `get_trade_history` | Get trade history |
| `get_system_logs` | Get system logs |
| `place_validated_trade` | Place BUY/SELL trade |
| `close_trade` | Close trade by ID |
| `reset_stats` | Reset statistics |

## WebSocket

Connect to `ws://127.0.0.1:3000/ws/live` for real-time updates.

Message types:
- `init` — initial state payload
- `trades_update` — trade list changed
- `config` — config updated
- `connection` — connection state changed
- `webrequest_test` — WebRequest test status
- `ping`/`pong` — latency measurement

## Security Notes

- All API calls are localhost-only by default
- State-changing routes require `SCALARAI_MCP_API_KEY` Bearer token
- GitHub OAuth tokens are no longer stored in `.env.example`
- No secrets are logged

## Troubleshooting

### 401 Unauthorized
- Verify the Bearer token matches `SCALARAI_MCP_API_KEY` in `.env`
- Ensure the `Authorization` header is formatted as `Bearer <token>`

### Connection Drops
- Check server logs for errors
- Verify MT5 EA is still sending WebRequest heartbeats
- Ensure port 3000 is not blocked by firewall
