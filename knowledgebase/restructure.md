# ScalarAI Restructure Plan

## Current Actual Structure

```
scalarai/
├── backend/
│   ├── src/
│   │   ├── index.ts                 # App bootstrap: express, vite/prod static, websockets, mcp
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
│   │   │   ├── defaults.ts          # Default config/knowledge/strategy factories
│   │   │   ├── ea-generator.ts      # MQL5 EA and Node.js bridge code generation
│   │   │   ├── knowledge.ts         # AI knowledge base calculations
│   │   │   ├── market-ingestion.ts  # Symbol state, tick aggregation, candle building
│   │   │   ├── strategy.ts          # evaluateStrategy, EMA/RSI/ATR/Bollinger
│   │   │   ├── strategy-research.ts # Strategy analysis/optimization helpers
│   │   │   └── strategy-templates.ts # Built-in strategy templates
│   │   ├── middleware/
│   │   │   ├── auth.ts              # Bearer token auth middleware
│   │   │   ├── cors.ts              # CORS headers + preflight
│   │   │   ├── error.ts             # Centralized error handler
│   │   │   └── logger.ts            # Optional HTTP request/response logging
│   │   └── utils/
│   │       ├── index.ts             # Re-exports
│   │       ├── auth.ts              # MCP Bearer validation helper
│   │       ├── indicators.ts        # Removed; logic lives in services/strategy.ts
│   │       ├── response.ts         # Empty placeholder
│   │       └── validators.ts        # Request body validation helpers
│   └── data/
│       ├── scalarai.sqlite          # Active SQLite database
│       ├── scalarai.sqlite-shm
│       └── scalarai.sqlite-wal
├── frontend/
│   ├── src/
│   │   ├── main.tsx                 # React entrypoint
│   │   ├── App.tsx                  # Root layout + routing/navigation state (~613 lines)
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
│       ├── database.md
│       ├── site-improvement.md
│       └── style.md
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

## Remaining Work

- Continue extracting `backend/src/index.ts` into smaller service modules
- Continue splitting `frontend/src/App.tsx` into presentational components
- Remove remaining dead/placeholder files: `frontend/src/types/api.ts`, `backend/src/utils/response.ts`
- Fix `@tokens/colors` path alias resolution in `CandlestickChart.tsx`
- Add rate limiting / schema validation middleware
- Add unit/integration tests
- Add Docker / process manager configs for local hosting

## Non-Goals

- Do not split into a monorepo/workspace unless requested.
- Do not change database/storage format.
- Do not remove existing functionality; this is a structural refactor only.
