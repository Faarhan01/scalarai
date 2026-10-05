# ScalarAI

Local trading dashboard and strategy engine for MetaTrader 5, with an MCP interface for analysis and automation.

## What it does

- Receives live ticks from an MT5 Expert Advisor via HTTP/WebSocket
- Computes strategy signals from EMA, RSI, ATR, Bollinger Bands, and velocity/acceleration telemetry
- Persists trades, ticks, logs, and AI strategy state to SQLite
- Exposes a React dashboard and an MCP endpoint for external tooling like Kilo

## Prerequisites

- Node.js 18+
- npm
- MetaTrader 5 with the generated EA attached to a chart

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Then open `http://localhost:3000`.

## Available endpoints

### REST API
- `GET /api/status` — full server state, trades, logs, config, connection info
- `GET /api/health` — health check
- `GET /api/ai-study-feed` — AI knowledge base, synthesized strategy, telemetry stream
- `GET /api/strategies` — list all strategies
- `GET /api/strategies/:id` — get strategy by ID
- `POST /api/strategies` — create strategy
- `POST /api/settings` — update strategy, lot size, TP/SL, trading mode, AI toggle
- `GET /api/settings` — fetch current settings
- `POST /api/toggle-trade` — start/stop automated execution
- `POST /api/reset-stats` — clear trade history
- `POST /api/status/switch-symbol` — switch active symbol
- `POST /api/ea/tick` — EA heartbeat / tick endpoint
- `POST /api/update-market` — live market telemetry stream
- `GET /api/market/history` — market history
- `GET /api/ea/download` — download generated MQ5 EA file
- `GET /api/ea/generator-source` — download Node.js bridge source
- `GET /api/ea/template` — download MT5 chart template
- `GET /poll` — bridge polling for pending trades
- `GET /get-pending-trades` — bridge polling alias
- `GET /api/get-pending-trades` — bridge polling alias

### MCP
- `POST /mcp` — MCP JSON-RPC 2.0 endpoint (requires `SCALARAI_MCP_API_KEY`)

### WebSockets
- `WS /mt5-bridge` — MT5 bridge signaling
- `WS /ws/live` — dashboard live feed

## Scripts

- `npm run dev` — start backend + Vite frontend
- `npm run build` — production build
- `npm run start` — run production bundle
- `npm run lint` — TypeScript type check
- `npm run test` — run vitest suite

## Configuration

Set these in `.env`:

- `PORT` — server port (default: `3000`)
- `SCALARAI_MCP_API_KEY` — Bearer token for MCP endpoint
- `GEMINI_API_KEY` — Google Gemini API key (optional)
- `FRONTEND_URL` — allowed CORS origin (default: `http://localhost:5173`)

## Notes

- The backend binds to `0.0.0.0:3000` by default; set `PORT` in `.env` to override
- State-changing routes (`/api/settings`, `/api/toggle-trade`, `/api/reset-stats`, etc.) require `SCALARAI_MCP_API_KEY` Bearer token
- Do not commit real secrets; `.env.example` uses placeholders only
- SQLite database is stored in `backend/data/scalarai.sqlite`
