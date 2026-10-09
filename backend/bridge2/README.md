# ScalarAI MT5 Bridge 2 (Node.js + MCP)

Production-ready Node.js bridge for MetaTrader 5 featuring native **Model Context Protocol (MCP)** support. Enables any external AI agent outside of the web application (such as **Claude Desktop**, **Cursor**, **Windsurf**, or custom LLM scripts) to inspect market state and execute trades on MT5 with full risk controls.

---

## 🌟 Key Features

- **Standard MCP (Model Context Protocol 2024-11-05)**: First-class stdio JSON-RPC 2.0 implementation compatible with Claude Desktop, Cursor, and any MCP client.
- **External AI Trading Execution**: External AI models can place trades, modify SL/TP, liquidate positions, and retrieve account balance/equity.
- **Bidirectional Sync**: Real-time synchronization between MetaTrader 5 terminal and the ScalarAI web platform dashboard.
- **Multi-Mode Operation**:
  - `mcp` (default): Line-delimited stdio JSON-RPC for external AI agents.
  - `http`: REST API & HTTP JSON-RPC MCP server on port `5100`.
  - `daemon`: Standalone background polling & WebSocket syncing daemon.
- **Zero Heavy Dependencies**: Pure Node.js utilizing built-in standard libraries.

---

## 🚀 Quick Start for External AI Agents

### 1. Claude Desktop Integration

Add the bridge to your `claude_desktop_config.json`:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "scalarai-mt5": {
      "command": "node",
      "args": [
        "C:\\path\\to\\backend\\bridge2\\index.js",
        "--mcp"
      ],
      "env": {
        "SCALARAI_SITE_URL": "http://127.0.0.1:3000",
        "MT5_PATH": "C:\\Program Files\\MetaTrader 5\\terminal64.exe",
        "DEFAULT_SYMBOL": "Step Index",
        "DEFAULT_LOT_SIZE": "0.1",
        "DEFAULT_SL_POINTS": "150",
        "DEFAULT_TP_POINTS": "300"
      }
    }
  }
}
```

Restart Claude Desktop. The hammer icon (Tools) will now show all `mt5_*` and `scalarai_*` tools!

### 2. Cursor / Windsurf Integration

Add to your project's `.cursor/mcp.json` or global MCP settings:

```json
{
  "mcpServers": {
    "scalarai-mt5": {
      "command": "node",
      "args": ["./backend/bridge2/index.js", "--mcp"],
      "env": {
        "SCALARAI_SITE_URL": "http://127.0.0.1:3000"
      }
    }
  }
}
```

---

## 🛠️ MCP Tools Reference

External AIs have access to 15 tools:

| MCP Tool | Description | Parameters |
|---|---|---|
| `mt5_get_status` | Returns terminal connection, active symbol, and account summary | None |
| `mt5_get_account` | Gets balance, equity, margin, free margin, leverage, broker info | None |
| `mt5_get_positions` | Lists all open positions with ticket, lots, SL/TP, floating profit | `symbol?` (string) |
| `mt5_place_trade` | Executes a BUY or SELL order on MT5 terminal | `type` ("BUY"\|"SELL"), `symbol?`, `volume?`, `sl?`, `tp?`, `reason?` |
| `mt5_close_trade` | Closes a specific position by ticket number or trade ID | `ticket` (string) |
| `mt5_close_all_trades` | Emergency panic close: liquidates all positions | `symbol?` (string) |
| `mt5_modify_trade` | Modifies Stop Loss and/or Take Profit in points on an open order | `ticket` (string), `sl?`, `tp?` |
| `mt5_get_market_price` | Fetches live bid, ask, spread, and current price for any symbol | `symbol?` (string) |
| `mt5_get_candles` | Retrieves historical OHLCV candles for technical analysis | `symbol?`, `limit?` (number) |
| `scalarai_get_system_status` | Queries full status from the ScalarAI web platform | None |
| `scalarai_toggle_automated_trading` | Enables or pauses automated algorithmic strategy execution | `isActive` (boolean) |
| `scalarai_update_settings` | Adjusts lot size, TP, SL, trailing stop, and active strategy mode | `lotSize?`, `takeProfitPoints?`, `stopLossPoints?`, `useTrailingStop?`, etc. |
| `scalarai_get_ai_knowledge` | Fetches velocity baselines & quantitative speed metrics | None |
| `scalarai_get_strategies` | Lists all available algorithmic strategies | None |
| `mt5_send_custom_command` | Sends raw custom command to terminal queue | `command` (string), `payload?` (object) |

---

## 💬 Example External AI Prompts

Once configured in Claude Desktop or Cursor, you can prompt your AI directly:

- *"Check my current MT5 balance, equity, and list any open positions."*
- *"What is the current market price and spread on Step Index?"*
- *"Analyze the recent 50 candles on Step Index. If the trend is bullish, execute a BUY order with 0.2 lots, 150 points SL, and 300 points TP."*
- *"Modify ticket #100001: tighten the Stop Loss to 80 points."*
- *"Emergency: close all open positions immediately."*

---

## 🏃 Running Modes

### 1. Stdio MCP Mode (for External AI)
```bash
node backend/bridge2/index.js --mcp
```

### 2. HTTP Server Mode
```bash
node backend/bridge2/index.js --http --port 5100
```
Provides:
- `POST /mcp` - JSON-RPC 2.0 MCP endpoint
- `GET /health` - Health check
- `GET /account` - Account info
- `GET /positions` - Open positions
- `POST /trade` - Place trade

### 3. Background Sync Daemon Mode
```bash
node backend/bridge2/index.js --daemon
```

### 4. Run Test Suite
```bash
node backend/bridge2/test.js
```

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SCALARAI_SITE_URL` | `http://127.0.0.1:3000` | URL of the ScalarAI platform backend |
| `SCALARAI_MCP_API_KEY` | *(empty)* | Optional authorization token |
| `MT5_PATH` | `terminal64.exe` | Absolute path to MetaTrader 5 terminal |
| `DEFAULT_SYMBOL` | `Step Index` | Default market asset symbol |
| `DEFAULT_LOT_SIZE` | `0.1` | Default trade lot volume |
| `DEFAULT_SL_POINTS` | `150` | Default Stop Loss in points |
| `DEFAULT_TP_POINTS` | `300` | Default Take Profit in points |
| `BRIDGE_PORT` | `5100` | HTTP port when running with `--http` |
