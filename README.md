# ScalarAI

Local trading dashboard and strategy engine for MetaTrader 5, with an MCP interface for analysis and automation.

## What it does

- Receives live ticks from an MT5 EA via HTTP/WebSocket
- Computes strategy signals from EMA, RSI, ATR, Bollinger Bands, and velocity/acceleration telemetry
- Persists trades, ticks, logs, and AI strategy state to SQLite
- Exposes a React dashboard and an MCP endpoint for external tooling

## Prerequisites

- Node.js 18+
- npm
- MetaTrader 5 with the generated EA attached to a chart

## Quick start

```powershell
npm install
cp .env.example .env
npm run dev
```

Then open `http://localhost:3000`.

## Available endpoints

- `GET /api/status` — full server state, trades, logs, config, connection info
- `GET /api/ai-study-feed` — AI knowledge base, synthesized strategy, telemetry stream
- `POST /api/settings` — update strategy, lot size, TP/SL, trading mode, AI toggle
- `POST /api/toggle-trade` — start/stop automated execution
- `POST /api/reset-stats` — clear trade history
- `POST /api/ea/tick` — EA heartbeat / tick endpoint
- `POST /api/update-market` — live market telemetry stream
- `GET /api/ea/download` — download generated MQ5 EA file
- `GET /api/ea/template` — download MT5 chart template
- `GET /poll` — bridge polling for pending trades
- `POST /mcp` — MCP JSON-RPC endpoint

## Scripts

- `npm run dev` — start backend + Vite frontend
- `npm run build` — production build
- `npm run start` — run production bundle
- `npm run lint` — TypeScript type check
- `npm run test` — run vitest suite

## Notes

- The backend binds to `0.0.0.0:3000` by default; set `PORT` in `.env` to override
- The MCP endpoint requires `SCALARAI_MCP_API_KEY` in `.env`
- Do not commit real secrets; `.env.example` uses placeholders only
