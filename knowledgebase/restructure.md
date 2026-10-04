# ScalarAI Restructure Plan

## Goals

- Separate backend and frontend into clear, maintainable domains.
- Make routing, services, WebSocket handling, and state explicit.
- Keep the current single-`package.json` dev workflow while allowing future split.
- Preserve existing behavior: EA WebRequest bridge, dashboard, MCP, GitHub sync, AI knowledge/strategy files.

## Root Layout

```
scalarai/
├── backend/
│   ├── src/
│   └── data/
├── frontend/
│   ├── src/
│   ├── index.html
│   ├── vite.config.ts
│   └── tsconfig.json
├── knowledgebase/
│   ├── plan.md
│   └── info/
│       └── aiconnection.md
├── assets/
│   └── .aistudio/
├── .env
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Backend Structure

```
backend/
├── src/
│   ├── index.ts                 # App bootstrap: express, vite/prod static, websockets, mcp
│   ├── mcp_server.ts            # MCP JSON-RPC handler + tool registry
│   ├── types/
│   │   ├── index.ts             # Shared backend types
│   │   ├── trade.ts
│   │   ├── ai.ts
│   │   ├── mcp.ts
│   │   └── github.ts
│   ├── routes/
│   │   ├── ea.ts                # /api/ea/*, /api/update-market
│   │   ├── settings.ts          # /api/settings, strategy updates
│   │   ├── trades.ts            # /api/toggle-trade, /api/reset-stats
│   │   ├── ai.ts                # /api/gemini/*, /api/ai-study-feed
│   │   ├── mcp.ts               # /mcp route wiring
│   │   └── github.ts            # /api/github-status, /api/sync-from-github, /api/auth/github/*
│   ├── websockets/
│   │   ├── bridge.ts            # /mt5-bridge WS handler
│   │   └── dashboard.ts         # /ws/live, /ws, /live-feed WS handler
│   ├── services/
│   │   ├── strategy.ts          # evaluateSimulatedStrategy, open/close logic, EMA/RSI/ATR/Bollinger
│   │   ├── ai.ts                # Gemini client calls, knowledge base persistence, synthesis
│   │   ├── market.ts            # Tick history, telemetry, velocity calculations
│   │   └── git.ts               # simple-git sync wrapper
│   ├── middleware/
│   │   ├── cors.ts              # CORS headers + preflight
│   │   ├── error.ts             # Centralized error handler
│   │   └── logger.ts            # Optional HTTP request/response logging
│   └── utils/
│       ├── indicators.ts        # calculateEMA, calculateRSI, calculateATR, calculateBollingerBands
│       ├── auth.ts              # MCP Bearer validation helper
│       └── validators.ts        # Request body validation helpers
└── data/
    ├── ai_knowledge_profile.json
    └── ai_synthesized_strategy.json
```

### Backend Responsibilities

- `backend/src/index.ts` owns server lifecycle, Vite middleware in dev, static serving in prod.
- `backend/src/routes/*` own route handlers and payload parsing.
- `backend/src/websockets/*` own WS upgrade routing and client management.
- `backend/src/services/*` own business logic, AI calls, strategy evaluation, git operations.
- `backend/src/middleware/*` own cross-cutting concerns.
- `backend/src/utils/*` own pure helpers.
- `backend/data/` owns all persisted JSON state.

### Backend Migration Notes

- Move `server.ts` logic into `backend/src/index.ts`.
- Extract inline route handlers from `server.ts` into `backend/src/routes/*`.
- Extract WebSocket handling into `backend/src/websockets/*`.
- Extract strategy/indicator logic into `backend/src/services/strategy.ts` and `backend/src/utils/indicators.ts`.
- Extract Gemini AI calls into `backend/src/services/ai.ts`.
- Extract GitHub sync logic into `backend/src/services/git.ts`.
- Move persistent JSON files to `backend/data/`.
- Keep MCP context assembly in `backend/src/index.ts` or a dedicated `backend/src/mcp/context.ts`.

## Frontend Structure

```
frontend/
├── src/
│   ├── main.tsx                 # React entrypoint
│   ├── App.tsx                  # Root layout + routing/navigation state
│   ├── types/
│   │   └── index.ts             # Shared frontend types
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── MobileMenu.tsx
│   │   │   └── StatusBar.tsx
│   │   ├── dashboard/
│   │   │   ├── ConnectionCard.tsx
│   │   │   ├── TradePanel.tsx
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── AiPanel.tsx
│   │   │   ├── LogsPanel.tsx
│   │   │   ├── KnowledgePanel.tsx
│   │   │   └── StrategyPanel.tsx
│   │   ├── charts/
│   │   │   ├── PriceChart.tsx
│   │   │   ├── CandleSeries.tsx
│   │   │   └── VelocityChart.tsx
│   │   ├── trades/
│   │   │   ├── TradeList.tsx
│   │   │   ├── TradeRow.tsx
│   │   │   └── TradeStats.tsx
│   │   ├── ai/
│   │   │   ├── AnalysisReport.tsx
│   │   │   ├── MetaAnalysis.tsx
│   │   │   └── StrategySynthesizer.tsx
│   │   ├── settings/
│   │   │   ├── TradingSettings.tsx
│   │   │   ├── RiskSettings.tsx
│   │   │   └── WebRequestTest.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── Badge.tsx
│   │       ├── Modal.tsx
│   │       └── Toggle.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── useStatus.ts
│   │   ├── useAiStudyFeed.ts
│   │   ├── useGithub.ts
│   │   └── useLocalStorage.ts
│   ├── services/
│   │   ├── api.ts               # fetch wrappers
│   │   ├── ws.ts                # WebSocket connection manager
│   │   └── mcp.ts               # MCP JSON-RPC client helper
│   ├── stores/                  # Optional: lightweight state container
│   │   └── appStore.ts
│   ├── utils/
│   │   ├── formatters.ts
│   │   └── validators.ts
│   ├── styles/
│   │   └── index.css
│   └── lib/
│       └── mql5_generator.ts
├── index.html
├── vite.config.ts
└── tsconfig.json
```

### Frontend Responsibilities

- `frontend/src/components/*` owns all UI.
- `frontend/src/hooks/*` owns reusable state and effects.
- `frontend/src/services/*` owns HTTP/WS/MCP client code.
- `frontend/src/stores/*` owns shared UI state if hooks are insufficient.
- `frontend/src/styles/index.css` owns global styles.
- `frontend/src/lib/mql5_generator.ts` stays where it is semantically.

### Frontend Migration Notes

- Move `src/App.tsx` into `frontend/src/App.tsx`.
- Break `App.tsx` into smaller components under `frontend/src/components/*`.
- Extract inline fetch/WebSocket/MCP logic into `frontend/src/services/*`.
- Extract repeated stateful behavior into `frontend/src/hooks/*`.
- Move `src/index.css` to `frontend/src/styles/index.css`.
- Keep Vite and TS configs at `frontend/` or symlink/merge as needed.

## Scripts and Config

### package.json

Keep one `package.json` at root with:

```json
{
  "scripts": {
    "dev": "tsx backend/src/index.ts",
    "build": "vite build && esbuild backend/src/index.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
    "start": "node dist/server.cjs",
    "lint": "tsc --noEmit",
    "backend:dev": "tsx backend/src/index.ts",
    "frontend:dev": "vite",
    "typecheck": "tsc --noEmit"
  }
}
```

### tsconfig

- Keep root `tsconfig.json` as the project reference config.
- Add `backend/tsconfig.json` and `frontend/tsconfig.json` extending the root.
- Ensure path alias `@/*` maps to `frontend/*` for Vite and `backend/*` for server code as needed.

### vite.config.ts

- Move to `frontend/vite.config.ts`.
- Update server middleware mode and root/base paths if needed.
- Keep build output consistent with backend static serving.

## Execution Flow After Restructure

1. `npm run dev` starts `backend/src/index.ts`.
2. Backend initializes Express, REST routes, MCP, and WebSockets.
3. Backend attaches Vite middleware in dev to serve `frontend/`.
4. Frontend remains the same React app, just imported from `frontend/src/`.
5. EA continues posting to backend routes.
6. AI client continues calling `POST /mcp`.

## Migration Order

1. Create `backend/` and `frontend/` folders.
2. Move files into new structure.
3. Update imports and paths.
4. Update `package.json` scripts.
5. Run `npm run lint` and fix type errors.
6. Run `npm run dev` and verify frontend, API, MCP, and EA connectivity.
7. Update `README.md` with new structure.

## Non-Goals

- Do not split into a monorepo/workspace yet unless requested.
- Do not change database/storage format; keep JSON files in `backend/data/`.
- Do not remove existing functionality; this is a structural refactor only.
