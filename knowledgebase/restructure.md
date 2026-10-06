# ScalarAI Restructure Plan

> **Canonical structure:** See `knowledgebase/site-structure/backend/index.md` and `knowledgebase/site-structure/frontend/index.md` for the exact committed file layout.

## Current Actual Structure

```
scalarai/
├── backend/
│   ├── src/
│   │   ├── index.ts                 # 160-line bootstrap: express, vite/prod static, websockets
│   │   ├── mcp_server.ts            # MCP JSON-RPC handler + tool registry
│   │   ├── types/
│   │   │   └── index.ts             # Shared backend types
│   │   ├── routes/
│   │   │   ├── ai.ts                # /api/ai-study-feed
│   │   │   ├── ea.ts                # /api/ea/*, /api/update-market
│   │   │   ├── health.ts            # /api/health
│   │   │   ├── market.ts            # /api/market/history
│   │   │   ├── mcp.ts               # /mcp route wiring
│   │   │   ├── settings.ts          # /api/settings, strategy updates
│   │   │   ├── status.ts            # /api/status, /poll, symbol switching
│   │   │   ├── strategies.ts        # /api/strategies
│   │   │   └── trades.ts            # /api/toggle-trade, /api/reset-stats
│   │   ├── websockets/
│   │   │   ├── bridge.ts            # /mt5-bridge WS handler
│   │   │   └── dashboard.ts         # /ws/live, /ws, /live-feed WS handler
│   │   ├── services/
│   │   │   ├── app-store.ts         # AppStore class — ALL state + business logic (441 lines)
│   │   │   ├── defaults.ts          # Default config/knowledge/strategy factories
│   │   │   ├── ea-generator.ts      # MQL5 EA and Node.js bridge code generation
│   │   │   ├── knowledge.ts         # AI knowledge base calculations
│   │   │   ├── market-ingestion.ts  # Symbol state, tick aggregation, candle building
│   │   │   ├── state-persistence.ts # DB hydration + persist helpers
│   │   │   ├── strategy.ts          # evaluateStrategy, EMA/RSI/ATR/Bollinger
│   │   │   ├── strategy-research.ts # Strategy analysis/optimization helpers
│   │   │   └── strategy-templates.ts # Built-in strategy templates
│   │   ├── middleware/
│   │   │   ├── auth.ts              # Bearer token auth middleware
│   │   │   ├── cors.ts              # CORS headers + preflight
│   │   │   ├── error.ts             # Centralized error handler
│   │   │   ├── logger.ts            # Optional HTTP request/response logging
│   │   │   └── rateLimit.ts         # Rate limiting middleware (180 req/min)
│   │   ├── utils/
│   │   │   ├── ip.ts                # IPv6-mapped IPv4 normalization
│   │   │   └── validators.ts        # Request body validation helpers
│   │   └── db/
│   │       ├── index.ts             # DB initialization + migration
│   │       └── repository.ts        # ScalarAiDb class with all queries
│   └── data/
│       ├── scalarai.sqlite          # Active SQLite database
│       ├── scalarai.sqlite-shm
│       └── scalarai.sqlite-wal
├── frontend/
│   ├── src/
│   │   ├── main.tsx                 # React entrypoint
│   │   ├── App.tsx                  # Root layout (~613 lines)
│   │   ├── types/
│   │   │   └── api.ts               # Empty placeholder
│   │   ├── components/
│   │   │   ├── index.ts             # Component barrel export
│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── MobileDrawer.tsx
│   │   │   │   └── StatusBar.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── StatsCards.tsx
│   │   │   │   ├── TradePanel.tsx
│   │   │   │   └── PriceChart.tsx
│   │   │   ├── charts/
│   │   │   │   ├── CandlestickChart.tsx
│   │   │   │   └── TelemetryStream.tsx
│   │   │   ├── trades/
│   │   │   │   ├── TradeList.tsx
│   │   │   │   ├── TradeRow.tsx
│   │   │   │   └── TradeFilters.tsx
│   │   │   ├── ai/
│   │   │   │   ├── AiStudyFeed.tsx
│   │   │   │   ├── StrategyPanel.tsx
│   │   │   │   └── KnowledgeBase.tsx
│   │   │   ├── settings/
│   │   │   │   ├── SettingsForm.tsx
│   │   │   │   ├── AssetSelector.tsx
│   │   │   │   └── WebRequestTest.tsx
│   │   │   ├── downloads/
│   │   │   │   └── DownloadsCenter.tsx
│   │   │   ├── logs/
│   │   │   │   └── LogsViewer.tsx
│   │   │   └── ui/
│   │   │       ├── Badge.tsx
│   │   │       ├── Button.tsx
│   │   │       ├── Card.tsx
│   │   │       └── Modal.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useChartData.ts
│   │   │   ├── useDownloadBridge.ts
│   │   │   ├── useAiStudyFeed.ts
│   │   │   ├── useTradingControls.ts
│   │   │   ├── useAppStatus.ts
│   │   │   ├── useSettings.ts
│   │   │   └── useNetworkStatus.ts
│   │   ├── services/
│   │   │   ├── api.ts               # fetch wrappers
│   │   │   └── ws.ts                # WebSocket connection manager
│   │   ├── styles/
│   │   │   ├── globals.css          # Tailwind @theme, :root variables, base reset, animations
│   │   │   ├── components.css       # Semantic UI utility classes
│   │   │   ├── globals.d.ts         # TypeScript module declaration for stylesheets
│   │   │   └── index.css            # Root stylesheet entrypoint
│   │   ├── tokens/
│   │   │   ├── colors.ts            # Palette: brand, slate, emerald, amber, rose, cyan
│   │   │   ├── spacing.ts           # 4px modular spacing scale
│   │   │   ├── typography.ts        # Plus Jakarta Sans + JetBrains Mono scales
│   │   │   ├── shadows.ts           # Hairline depth and radiant glow presets
│   │   │   └── index.ts             # Central token aggregator and type exports
│   │   └── lib/
│   │       └── mql5_generator.ts    # MQL5 EA template and code generation
│   ├── index.html
│   ├── vite.config.ts
│   └── tsconfig.json
├── knowledgebase/
│   ├── plan.md
│   ├── restructure.md
│   ├── info/
│   │   └── aiconnection.md
│   └── plans/
│       ├── backend/
│       │   ├── implementation-plan.md
│       │   ├── stage-1.md
│       │   ├── stage-2.md
│       │   ├── stage-3.md
│       │   └── stage-4.md
│       ├── database/
│       │   ├── stage-1.md
│       │   ├── stage-2.md
│       │   └── stage-3.md
│       ├── frontend/
│       │   ├── stage-1.md
│       │   ├── stage-2.md
│       │   └── stage-3.md
│       └── style/
│           ├── stage-1.md
│           ├── stage-2.md
│           └── stage-3.md
├── assets/
│   └── .aistudio/
│       └── .gitignore
├── .env
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Completed Work

- Backend routes extracted into `backend/src/routes/*`
- WebSocket handlers extracted into `backend/src/websockets/*`
- Strategy/indicator logic consolidated in `backend/src/services/strategy.ts`
- Market ingestion/symbol state extracted into `backend/src/services/market-ingestion.ts`
- EA code generation extracted into `backend/src/services/ea-generator.ts`
- Knowledge base calculations in `backend/src/services/knowledge.ts`
- Strategy templates and research helpers extracted
- Frontend hooks extracted from `App.tsx` into `frontend/src/hooks/*`
- Frontend components organized into feature folders under `frontend/src/components/*`
- Design tokens and semantic CSS classes implemented in `frontend/src/tokens/*` and `frontend/src/styles/*`
- SQLite migration complete; legacy JSON files removed
- **Backend state wrapped in `AppStore` class** — `backend/src/services/app-store.ts` contains all state and business logic
- **`index.ts` reduced to 160-line bootstrap** — no module-level state, all logic delegated to `AppStore` instance
- **Deleted `backend/src/services/app-state.ts`** — replaced by OOP `AppStore` class
- **Added rate limiting middleware** — `backend/src/middleware/rateLimit.ts` (180 req/min default)

## Remaining Work

- Continue splitting `frontend/src/App.tsx` into presentational components
- Remove remaining dead/placeholder files: `frontend/src/types/api.ts`, `backend/src/utils/response.ts`
- Fix `@tokens/colors` path alias resolution in `CandlestickChart.tsx`
- Add unit/integration tests for `AppStore` and route handlers
- Add Docker / process manager configs for local hosting

## Non-Goals

- Do not split into a monorepo/workspace unless requested.
- Do not change database/storage format.
- Do not remove existing functionality; this is a structural refactor only.
