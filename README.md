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
- SQLite 3 — required at runtime for local persistence (`better-sqlite3` is used; prebuilt binaries are downloaded during `npm install` on most platforms)
- MetaTrader 5 with the generated EA attached to a chart

## Project structure

```
.
├── backend/
│   ├── src/
│   │   ├── db/                  # SQLite schema, migration, repository
│   │   ├── middleware/          # CORS, auth, logging, rate limiting
│   │   ├── routes/              # Express route handlers
│   │   ├── services/            # Business logic
│   │   │   ├── app-state.ts            # App state orchestration
│   │   │   ├── state-persistence.ts    # DB hydration + persist helpers
│   │   │   ├── trade-execution.ts      # Trade lifecycle + strategy triggers
│   │   │   ├── market-ingestion.ts     # Symbol state + candle aggregation
│   │   │   ├── strategy.ts             # Strategy evaluation + indicator math
│   │   │   ├── defaults.ts             # Default config factories
│   │   │   ├── ea-generator.ts         # MQL5/Node bridge code generation
│   │   │   └── ...
│   │   ├── types/               # TypeScript interfaces
│   │   ├── utils/               # Validators, auth helpers
│   │   ├── websockets/          # MT5 bridge + dashboard WebSocket servers
│   │   ├── mcp_server.ts        # MCP JSON-RPC 2.0 handler
│   │   └── index.ts             # Express app + server bootstrap
│   └── data/
│       ├── scalarai.sqlite      # Active SQLite database
│       └── backups/             # Legacy JSON backups
├── frontend/
│   ├── src/
│   │   ├── components/          # React components
│   │   ├── hooks/               # Custom hooks
│   │   ├── services/            # API + WebSocket clients
│   │   ├── styles/              # Tailwind + semantic CSS
│   │   ├── tokens/              # Design tokens
│   │   ├── types/               # Frontend TypeScript interfaces
│   │   ├── App.tsx              # Root component
│   │   └── main.tsx             # Entry point
│   ├── index.html
│   └── vite.config.ts
├── tests/                       # vitest unit tests
├── knowledgebase/
│   └── plans/                   # Implementation plans by domain
│       ├── backend/
│       ├── frontend/
│       ├── database/
│       └── style/
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

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

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Backend server port |
| `SCALARAI_MCP_API_KEY` | No | — | Bearer token for `/mcp` and state-changing routes |
| `FRONTEND_URL` | No | `http://localhost:5173` | Allowed CORS origin for the frontend |
| `GEMINI_API_KEY` | No | — | Google Gemini API key |
| `APP_URL` | No | — | Host URL used for EA generator and self-referential links |
| `GITHUB_CLIENT_ID` | No | — | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | No | — | GitHub OAuth client secret |
| `GITHUB_REPO_OWNER` | No | `Faarhan01` | GitHub repo owner for sync |
| `GITHUB_REPO_NAME` | No | `Scalarai` | GitHub repo name for sync |

## Notes

- The backend binds to `0.0.0.0:3000` by default; set `PORT` in `.env` to override
- State-changing routes (`/api/settings`, `/api/toggle-trade`, `/api/reset-stats`, etc.) require `SCALARAI_MCP_API_KEY` Bearer token
- Do not commit real secrets; `.env.example` uses placeholders only
- SQLite database is stored in `backend/data/scalarai.sqlite`

## Multi-computer workflow

This repo is edited from multiple machines and synced via GitHub. To avoid merge noise and machine-specific conflicts:

- `backend/data/scalarai.sqlite-shm` and `backend/data/scalarai.sqlite-wal` are ignored via `.gitignore`
- The main database file `backend/data/scalarai.sqlite` is still tracked
- If you need machine-local DB behavior, keep `scalarai.sqlite` uncommitted and rely on `backend/data/backups/` for portable data

## Development

```bash
# Type check
npm run lint

# Run tests
npm run test

# Start dev server with hot reload
npm run dev
```
