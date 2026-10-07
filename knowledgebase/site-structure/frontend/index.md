# Frontend Site Structure

> Source of truth for `frontend/src/`. This file reflects the actual committed code at HEAD.

## Tree

```
frontend/src/
├── App.tsx                        # Root component (~677 lines), exports ErrorBoundary class
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
│   │   ├── CandlestickChart/      # Lightweight-charts candlestick renderer (directory)
│   │   │   ├── CandlestickChart.tsx
│   │   │   ├── types.ts
│   │   │   ├── constants.ts
│   │   │   └── index.ts
│   │   ├── TelemetryStream.tsx    # Live telemetry chart
│   │   └── index.ts               # Barrel export
│   ├── dashboard/
│   │   ├── PriceChart.tsx         # Price display
│   │   ├── StatsCards.tsx         # Summary statistics
│   │   └── TradePanel.tsx         # Trade controls
│   ├── downloads/
│   │   └── DownloadsCenter.tsx    # EA/bridge/template downloads
│   ├── layout/
│   │   ├── AppShell.tsx           # Root layout wrapper (ErrorBoundary + children)
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
│   ├── useElapsedTimer.ts         # Session elapsed counter (19 lines)
│   ├── useErrorHandler.ts         # Global error boundary helper (26 lines)
│   ├── useNetworkStatus.ts        # Online/offline detection (43 lines)
│   ├── useSettings.ts             # Settings form state + applySettings() (226 lines)
│   ├── useSymbolState.ts          # Symbol switching + per-symbol state (20 lines)
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

### `App.tsx` — Root Component (~677 lines)

- Exports `ErrorBoundary` class (class component with error catching)
- Orchestrates layout + hooks
- Not fully decomposed yet; still imports most components directly
- Manages tab navigation state locally
- Wires WebSocket message handlers to hook setters
- Uses `requestAnimationFrame` for chart throttling to avoid excessive re-renders
- Fetches initial status on mount, then syncs via WebSocket
- Blocks automated trading until AI calibration threshold (20 observations) is met

### `AppShell.tsx` — Error Boundary Wrapper (64 lines)

- Wraps `App.tsx` content in `ErrorBoundary`
- Catches React errors and displays fallback UI with refresh button

## Detailed Documentation

For detailed information on specific areas, see:

- [Hooks](hooks.md) — all custom hooks: useWebSocket, useSettings, useTradingControls, useChartData, etc.
- [Components](components.md) — component architecture, barrel exports, catalog
- [Services](services.md) — ApiClient, WebSocketClient
- [Tokens](tokens.md) — design tokens (colors, spacing, typography, shadows)
- [Styles](styles.md) — CSS architecture, component classes, Tailwind config
- [Lib](lib.md) — mql5_generator details
- [Types](types.md) — TypeScript interfaces and type definitions

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

### Path Aliases

Configured in both `tsconfig.json` and `vite.config.ts`:

| Alias | Resolves To |
|-------|-------------|
| `@/*` | `frontend/src/*` |
| `frontend/*` | `frontend/src/*` |
| `@tokens/*` | `frontend/src/tokens/*` |
| `@styles/*` | `frontend/src/styles/*` |

### Frontend Config Files

- `frontend/tsconfig.json` — TypeScript config targeting ES2022, React JSX, bundler module resolution, path aliases
- `frontend/vite.config.ts` — Vite config with React + Tailwind plugins, path aliases, HMR enabled by default
- `frontend/index.html` — SPA entry point
- `frontend/dist/` — Production build output

### State Management

- No global state library — uses React `useState` + custom hooks
- `App.tsx` holds master state, passes down via props
- Hooks encapsulate reusable stateful logic
- WebSocket messages update state via callbacks passed to `useWebSocket`
- `requestAnimationFrame` throttling for chart updates to avoid excessive re-renders

### API Communication

- REST via `services/api.ts` (`ApiClient` class)
- WebSocket via `services/ws.ts` + `useWebSocket.ts` hook
- Fallback: if WS not available, uses REST polling (`useAppStatus`)
- All API calls prefixed with `/api`

### Chart Data Flow

1. `App.tsx` receives `history` (ticks) and `candles` from WS/polling
2. `useChartData()` transforms raw data for chart library
3. `PriceChart` renders candlestick chart with optional EMA/Bollinger overlays
4. Chart updates throttled via `requestAnimationFrame` in `App.tsx`

### AI Calibration Gate

Automated trading is blocked until `aiStudyStatus === "optimized"` or `"active"`, which requires `aiKnowledgeBase.totalObservations >= 20`. This safety check is enforced in `App.tsx` before allowing trade execution.

### Tailwind CSS

- Uses Tailwind CSS v4 with `@tailwindcss/vite` plugin
- Custom theme in `styles/globals.css` using `@theme` directives
- Custom colors defined in `tokens/colors.ts` and imported as CSS variables
- Responsive design with mobile-first approach
- Animations: `animate-fade-in` (from `fadeIn` keyframes), `shimmer` (skeleton loading)

### Key Frontend Patterns

- **Tab Navigation**: `currentNavTab` state in `App.tsx` controls which tab content is shown
- **WS Message Routing**: `useWebSocket` dispatches messages to typed callbacks passed from `App.tsx`
- **Chart Throttling**: `pendingChartUpdate` ref + `requestAnimationFrame` batches chart updates
- **Settings Persistence**: Settings POSTed to backend, also saved to `localStorage` for endpoint
- **Mobile Responsive**: `MobileDrawer` component for mobile navigation, responsive grid classes throughout

### Important: Do NOT Refactor Without Checking

- `frontend/src/types/api.ts` — NOT empty; contains API response interfaces
- `frontend/src/components/index.ts` — barrel export, must be kept in sync with component folder
- `frontend/src/hooks/useSettings.ts` — 226 lines, handles settings form state, validation, applySettings POST, WebRequest test trigger
