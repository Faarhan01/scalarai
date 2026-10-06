# Frontend Site Structure

> Source of truth for `frontend/src/`. This file reflects the actual committed code at HEAD.

## Tree

```
frontend/src/
├── App.tsx                        # Root component (~692 lines), exports ErrorBoundary class
├── main.tsx                       # React entrypoint
├── types/
│   ├── index.ts                   # Shared frontend types: StrategyMode, TradeConfig, TradeRecord, etc.
│   └── api.ts                     # API response types: StatusResponse, AiStudyFeedResponse, etc. — NOT empty
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
│   └── ui/
│       ├── Badge.tsx              # Status badge (variants: brand, primary, secondary, etc.)
│       ├── Button.tsx             # Button component
│       ├── Card.tsx               # Card container (variants: default, elevated, subtle)
│       ├── ErrorBanner.tsx        # Error display banner
│       └── Modal.tsx              # Modal dialog (sizes: sm, md, lg, xl)
├── hooks/
│   ├── useAiStudyFeed.ts          # AI study feed state + polling (44 lines)
│   ├── useAppStatus.ts            # Full status polling/websocket sync (28 lines)
│   ├── useChartData.ts            # Chart data transformation (54 lines)
│   ├── useDownloadBridge.ts       # Download bridge state (117 lines)
│   ├── useErrorHandler.ts         # Global error boundary helper (26 lines)
│   ├── useNetworkStatus.ts        # Online/offline detection (43 lines)
│   ├── useSettings.ts             # Settings form state + applySettings() (226 lines)
│   ├── useSymbolState.ts          # Symbol state management (20 lines)
│   ├── useTradingControls.ts      # Trade toggle/close/reset (57 lines)
│   └── useWebSocket.ts            # WS /ws/live connection + message routing (131 lines)
├── services/
│   ├── api.ts                     # ApiClient class — fetch wrappers for /api/*
│   └── ws.ts                      # WebSocketClient class — raw WS connection helper
├── styles/
│   ├── globals.css                # Tailwind @theme, :root variables, base reset, animations
│   ├── components.css             # Semantic UI utility classes (card-panel, etc.)
│   ├── globals.d.ts               # TypeScript module declaration for stylesheets
│   └── index.css                  # Root stylesheet entrypoint (imports globals + components)
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

- Exports `ErrorBoundary` class (class component with error catching)
- Orchestrates layout + hooks
- Not fully decomposed yet; still imports most components directly
- Manages tab navigation state locally
- Wires WebSocket message handlers to hook setters

### Hooks Architecture

| Hook | Responsibility | Lines |
|------|---------------|-------|
| `useWebSocket` | Low-level WS connection to `/ws/live`, reconnection, ping/pong, message dispatch by type | 131 |
| `useAppStatus` | Polls `/api/status` + WS init messages, exposes full server state | 28 |
| `useAiStudyFeed` | Polls `/api/ai-study-feed`, exposes AI knowledge/strategy | 44 |
| `useSettings` | Settings form state, validation, `applySettings()` POST, WebRequest test trigger | 226 |
| `useTradingControls` | Toggle trading, close all, reset stats | 57 |
| `useChartData` | Transforms raw ticks/candles for chart libraries | 54 |
| `useDownloadBridge` | Download bridge/EA generation state | 117 |
| `useNetworkStatus` | `navigator.onLine` + online/offline events | 43 |
| `useErrorHandler` | Global error boundary state | 26 |
| `useSymbolState` | Symbol switching + per-symbol state | 20 |

### Services

- `services/api.ts` — `ApiClient` class with typed methods for all REST endpoints
- `services/ws.ts` — `WebSocketClient` class with connect/disconnect/handler registry

### Design Tokens

Located in `tokens/`. Imported via `@tokens/*` path alias (configured in `tsconfig.json`).

- `colors.ts` — color scales (brand, slate, emerald, amber, rose, cyan)
- `spacing.ts` — 4px modular spacing scale
- `typography.ts` — font families and sizes
- `shadows.ts` — shadow presets including glow effects
- `index.ts` — re-exports all tokens

### Types

- `types/index.ts` — Shared frontend types: `StrategyMode`, `TradeConfig`, `TradeRecord`, `SystemLog`, `Tick`, `EAConnectionDetails`, `AiSynthesizedStrategy`, `AiKnowledgeBase`, etc.
- `types/api.ts` — API response types: `StatusResponse`, `AiStudyFeedResponse`, `SettingsResponse`, `TradeResponse`, `WebSocketMessage`

### Important: Do NOT Refactor Without Checking

- `frontend/src/types/api.ts` — NOT empty; contains API response interfaces
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
