# Frontend Hooks

> Detailed reference for all custom hooks in `frontend/src/hooks/`.

## `useWebSocket.ts` (131 lines)

Low-level WebSocket connection to `/ws/live`.

```ts
export function useWebSocket(options: {
  onInit: (data: Record<string, any>) => void;
  onTick: (data: Record<string, any>) => void;
  onTrades: (data: Record<string, any>) => void;
  onLog: (log: Record<string, any>) => void;
  onConfig: (config: Record<string, any>) => void;
  onConnection: (data: Record<string, any>) => void;
  onWebRequestTest: (testState: Record<string, any>) => void;
  onAiStrategy: (strategy: Record<string, any>) => void;
  onFetchStrategies: () => void;
  onPong?: (pingLatency: number) => void;
  onStatusChange?: (connected: boolean) => void;
})
```

**Behavior:**
- Connects to `/ws/live` using `ws:` or `wss:` based on current protocol
- Auto-reconnects with 2500ms delay on close/error
- Ping/pong every 8 seconds — measures RTT latency
- Dispatches messages by type to typed callbacks
- Cleanup on unmount: clears timeouts, closes socket
- Exposes `sendWsMessage(msg)` for sending commands

**Message dispatch:**

| Type | Callback | Description |
|------|----------|-------------|
| `init` | `onInit` | Full status payload on connection |
| `tick` | `onTick` | Price/tick update |
| `trades` | `onTrades` | Trade list update |
| `log` | `onLog` | New system log |
| `config` | `onConfig` | Settings change |
| `connection` | `onConnection` | Bridge connection change |
| `webrequest_test` | `onWebRequestTest` | WebRequest status change |
| `ai_strategy` | `onAiStrategy` | AI strategy update |
| `pong` | `onPong` | Latency measurement response |

## `useAppStatus.ts` (28 lines)

Polls `/api/status` and exposes full server state.

```ts
export function useAppStatus(options: {
  onStatus: (data: any) => void;
  onInit?: (data: any) => void;
})
```

- Fetches `/api/status` on mount
- Returns `fetchStatus` callback for manual refresh
- Used as fallback when WebSocket is unavailable

## `useAiStudyFeed.ts` (44 lines)

Polls `/api/ai-study-feed` every 15 seconds.

```ts
export interface AiStudyFeedState {
  status: "waiting" | "calibrating" | "optimized" | "active";
  message: string;
  averageVelocity: number | null;
  knowledgeBase: any | null;
  strategy: any | null;
}

export function useAiStudyFeed(sendWsMessage: (msg: any) => boolean): AiStudyFeedState
```

**Behavior:**
- Polls every 15s
- Skips if `document.hidden` is true (tab not visible)
- Returns state object with status, message, averageVelocity, knowledgeBase, strategy

## `useSettings.ts` (226 lines)

Settings form state, validation, `applySettings()` POST, WebRequest test trigger.

```ts
export interface SettingsState {
  paramInput: {
    lotSize: string;
    takeProfitPoints: string;
    stopLossPoints: string;
    trailingStopPoints: string;
    maxTrades: string;
    useTrailingStop: boolean;
    mt5Path: string;
    appEndpoint: string;
    tradingMode: "Scalping" | "Swing";
    selectedAssets: string[];
    isAiModeEnabled: boolean;
  };
  saveSuccess: boolean;
  copiedUrl: boolean;
  webRequestStatus: { ... } | null;
  isVerifyingWebRequest: boolean;
  setWebRequestStatus: (value) => void;
}

export interface SettingsActions {
  applySettings: (fetchStatus, overrides?) => Promise<void>;
  triggerWebRequestTest: () => void;
  setCopiedUrl: (value: boolean) => void;
}
```

**Key behaviors:**
- `applySettings()` validates inputs (lotSize 0.01-100, TP/SL 1-10000, trailing 0-5000, maxTrades 1-20), POSTs to `/api/settings`, shows success toast
- `triggerWebRequestTest()` triggers probe, polls `/api/test-webrequest/status` every 1s for up to 15 attempts
- Persists endpoint to `localStorage` key `mt5_webrequest_endpoint`
- `getAppBaseUrl()` returns current origin with `ais-dev-` → `ais-pre-` transformation
- Syncs `paramInput` when `config` changes via `useEffect`

## `useTradingControls.ts` (57 lines)

Trade toggle/close/reset with WS-first, REST-fallback pattern.

```ts
export interface TradingControls {
  toggleTradingExecution: (sendWsMessage, config, fetchStatus) => Promise<void>;
  closeAllPositions: (sendWsMessage, fetchStatus) => Promise<void>;
  resetStats: (sendWsMessage, fetchStatus) => Promise<void>;
}
```

**Fallback behavior:**
- `toggleTradingExecution()`: tries `toggle_trade` via WS, falls back to `POST /api/toggle-trade`
- `closeAllPositions()`: tries `close_all` via WS, falls back to `POST /api/reset-stats`
- `resetStats()`: tries `reset_stats` via WS, falls back to `POST /api/reset-stats`

## `useChartData.ts` (54 lines)

Transforms raw ticks/candles for chart libraries.

```ts
export interface ChartData {
  candleData: CandleData[];
  displayCandles: CandleData[];
  minPrice: number;
  maxPrice: number;
  priceRange: number;
}

export function useChartData(candles, history, maxVisibleCandles = 80): ChartData
```

**Behavior:**
- Uses `candles` if available, falls back to mapping `history` ticks to candle format
- `displayCandles` = last `maxVisibleCandles` candles
- Computes `minPrice`, `maxPrice` from visible candles
- Enforces minimum price range of 1.5 with 5% padding
- Memoized via `useMemo`

## `useDownloadBridge.ts` (117 lines)

Generates Node.js bridge client script + package.json for download.

```ts
export interface BridgeDownloadConfig {
  appEndpoint?: string;
  mt5Path?: string;
}

export function useDownloadBridge(config): { downloadNodejsBridge: () => void }
```

**`downloadNodejsBridge()` behavior:**
- Generates `mt5_bridge.js` that polls `/poll` endpoint every 1.5s
- Executes MT5 commands via `terminal64.exe /cmd:trade,action=...,symbol=...,volume=...,sl=...,tp=...`
- Generates `package.json` with start script
- Uses `Blob` + `URL.createObjectURL` for client-side download
- `getAppBaseUrl()` reads from `<meta name="scalarai-app-endpoint">` or falls back to current origin

## `useElapsedTimer.ts` (19 lines)

Session elapsed time counter.

```ts
export function useElapsedTimer(): { elapsedTime: string; resetTimer: () => void }
```

- Starts on mount, updates every second
- Returns `elapsedTime` in `HH:MM:SS` format
- Exposes `resetTimer()` to reset to current time

## `useNetworkStatus.ts` (43 lines)

Online/offline detection and latency tracking.

```ts
export interface NetworkStatus {
  isInternetOnline: boolean;
  wsConnected: boolean;
  latency: number;
  pingLatency: number | null;
}

export function useNetworkStatus(): { ... }
```

- Tracks `isInternetOnline` via `navigator.onLine` + `online`/`offline` events
- Tracks `wsConnected`, `latency`, `pingLatency`
- Exposes `updatePing(ms)` to update latency from WS pong

## `useErrorHandler.ts` (26 lines)

Global error boundary helper.

```ts
export interface AppError {
  id: string;
  message: string;
  timestamp: number;
}

export function useErrorHandler(): { errors: AppError[]; showError: (message) => void; clearError: (id) => void }
```

- Stores up to 4 errors in state
- `showError(message)` adds error with UUID, auto-removes after 5s
- `clearError(id)` manually removes error

## `useSymbolState.ts` (20 lines)

Symbol state array management.

```ts
export interface SymbolState {
  symbol: string;
  connection: Record<string, any>;
  currentPrice: number;
  tickCount: number;
}

export function useSymbolState(initialSymbols: SymbolState[] = []): { symbolStates, setSymbolStates, updateSymbolStates }
```

- Simple wrapper around symbol states array
- `updateSymbolStates(states)` replaces entire array
- Used in `App.tsx` for managing multi-symbol state from WS
