# Frontend Site Structure

> Source of truth for `frontend/src/`. This file reflects the actual committed code at HEAD.

## Tree

```
frontend/src/
├── App.tsx                        # Root component (~692 lines), orchestrates layout + hooks
├── main.tsx                       # React entrypoint
├── types/
│   ├── index.ts                   # Re-exports from ./api
│   └── api.ts                     # Empty placeholder
├── components/
│   ├── index.ts                   # Barrel export for all components
│   ├── ai/
│   │   ├── AiStudyFeed.tsx        # AI study feed display
│   │   ├── KnowledgeBase.tsx      # Knowledge base viewer
│   │   └── StrategyPanel.tsx      # Strategy configuration panel
│   ├── charts/
│   │   ├── CandlestickChart.tsx   # Lightweight-charts candlestick renderer
│   │   └── TelemetryStream.tsx    # Live telemetry chart
│   ├── dashboard/
│   │   ├── PriceChart.tsx         # Price display
│   │   ├── StatsCards.tsx         # Summary statistics
│   │   └── TradePanel.tsx         # Trade controls
│   ├── downloads/
│   │   └── DownloadsCenter.tsx    # EA/bridge/template downloads
│   ├── layout/
│   │   ├── Header.tsx             # Top navigation bar
│   │   ├── MobileDrawer.tsx       # Mobile side menu
│   │   ├── StatusBar.tsx          # Connection status indicator
│   │   ├── SymbolSwitcher.tsx     # Active symbol selector
│   │   └── TabBar.tsx             # Bottom tab navigation
│   ├── logs/
│   │   └── LogsViewer.tsx         # System log viewer
│   ├── settings/
│   │   ├── AssetSelector.tsx      # Asset/symbol selection
│   │   ├── SettingsForm.tsx       # Strategy/lot/TP/SL form
│   │   └── WebRequestTest.tsx     # WebRequest verification UI
│   ├── trades/
│   │   ├── TradeFilters.tsx       # Trade list filters
│   │   ├── TradeList.tsx          # Trade list container
│   │   └── TradeRow.tsx           # Single trade row
│   ├── ui/
│   │   ├── Badge.tsx              # Status badge
│   │   ├── Button.tsx             # Button component
│   │   ├── Card.tsx               # Card container
│   │   ├── ErrorBanner.tsx        # Error display banner
│   │   └── Modal.tsx              # Modal dialog
├── hooks/
│   ├── useAiStudyFeed.ts          # AI study feed state + polling
│   ├── useAppStatus.ts            # Full status polling/websocket sync
│   ├── useChartData.ts            # Chart data transformation
│   ├── useDownloadBridge.ts       # Download bridge state
│   ├── useErrorHandler.ts         # Global error boundary helper
│   ├── useNetworkStatus.ts        # Online/offline detection
│   ├── useSettings.ts             # Settings form state + applySettings()
│   ├── useSymbolState.ts          # Symbol state management
│   ├── useTradingControls.ts      # Trade toggle/close/reset
│   └── useWebSocket.ts            # WS /ws/live connection + message routing
├── services/
│   ├── api.ts                     # ApiClient class — fetch wrappers for /api/*
│   └── ws.ts                      # WebSocketClient class — raw WS connection helper
├── styles/
│   ├── globals.css                # Tailwind @theme, :root variables, base reset, animations
│   ├── components.css             # Semantic UI utility classes
│   ├── globals.d.ts               # TypeScript module declaration for stylesheets
│   └── index.css                  # Root stylesheet entrypoint
├── tokens/
│   ├── colors.ts                  # Palette: brand, slate, emerald, amber, rose, cyan
│   ├── index.ts                   # Central token aggregator and type exports
│   ├── shadows.ts                 # Hairline depth and radiant glow presets
│   ├── spacing.ts                 # 4px modular spacing scale
│   └── typography.ts              # Plus Jakarta Sans + JetBrains Mono scales
└── lib/
    └── mql5_generator.ts          # MQL5 EA template and code generation (mirrors backend)
```

## Key Facts

### `App.tsx` — Root Component (~692 lines)

- Not fully decomposed yet; still imports most components directly
- Uses extracted hooks for state management
- Manages tab navigation state locally
- Wires WebSocket message handlers to hook setters

### Hooks Architecture

| Hook | Responsibility |
|------|---------------|
| `useWebSocket` | Low-level WS connection to `/ws/live`, reconnection, ping/pong, message dispatch by type |
| `useAppStatus` | Polls `/api/status` + WS init messages, exposes full server state |
| `useAiStudyFeed` | Polls `/api/ai-study-feed`, exposes AI knowledge/strategy |
| `useSettings` | Settings form state, validation, `applySettings()` POST, WebRequest test trigger |
| `useTradingControls` | Toggle trading, close all, reset stats |
| `useChartData` | Transforms raw ticks/candles for chart libraries |
| `useDownloadBridge` | Download bridge/EA generation state |
| `useNetworkStatus` | `navigator.onLine` + online/offline events |
| `useErrorHandler` | Global error boundary state |
| `useSymbolState` | Symbol switching + per-symbol state |

### Services

- `services/api.ts` — `ApiClient` class with typed methods for all REST endpoints
- `services/ws.ts` — `WebSocketClient` class with connect/disconnect/handler registry

### Design Tokens

Located in `tokens/`. Imported via `@tokens/*` path alias (configured in `tsconfig.json`).

### Important: Do NOT Refactor Without Checking

- `frontend/src/types/api.ts` — empty placeholder, do not remove without checking imports
- `frontend/src/components/index.ts` — barrel export, must be kept in sync with component folder

## Dependencies

```
App.tsx
  → components/* (presentational)
  → hooks/* (stateful logic)
  → services/* (API + WS)
  → types/* (TypeScript interfaces)
  → tokens/* (design tokens via @tokens/* alias)
  → lib/* (MQL5 generator, mirrors backend/services/ea-generator.ts)
```
