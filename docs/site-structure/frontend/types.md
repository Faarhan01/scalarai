# Frontend Types

> Key TypeScript types from `frontend/src/types/`.

## `types/index.ts` — Shared Frontend Types

### Core Types

- `StrategyMode` — TREND_FOLLOWING | MEAN_REVERSION | AI_ADAPTIVE (matches backend enum)
- `TradeConfig` — trade configuration
- `TradeRecord` — individual trade
- `SystemLog` — log entry
- `Tick` — market tick data
- `EAConnectionDetails` — EA connection state
- `AiSynthesizedStrategy` — AI strategy with rules
- `AiKnowledgeBase` — AI knowledge base
- `CandleBar` — OHLC candle data
- `SymbolState` — symbol state entry
- `StrategyRules` — strategy rule configuration
- `StrategyCondition` — individual strategy condition
- `MarketTelemetry` — telemetry record
- `WebRequestTestState` — WebRequest test state
- `UpdateMarketPayload` — market update payload (matches backend)
- `FullStatusPayload` — full status response (matches backend)
- `AiStudyFeedPayload` — AI study feed response (matches backend)
- `McpContext` — MCP context (matches backend)
- `BridgeOrder` — bridge order payload

## `types/api.ts` — API Response Types

### `StatusResponse`

```ts
export interface StatusResponse {
  config: any;
  connection: any;
  isBridgeConnected: boolean;
  logs: any[];
  trades: any[];
  history: any[];
  status: string;
  currentPrice: number;
  activeSymbol: string;
  symbolStates: Array<{ symbol: string; connection: any; currentPrice: number; tickCount: number }>;
  aiSynthesizedStrategy: any;
  stats: any;
  webRequestStatus: any;
}
```

### `AiStudyFeedResponse`

```ts
export interface AiStudyFeedResponse {
  status: string;
  message?: string;
  count: number;
  unprocessedCount?: number;
  threshold?: number;
  aiKnowledgeBase: any;
  aiSynthesizedStrategy: any;
  candleStream: any[];
  averageVelocity: number;
  stream?: any[];
}
```

### `SettingsResponse`

```ts
export interface SettingsResponse {
  success: boolean;
  config: any;
  message?: string;
}
```

### `TradeResponse`

```ts
export interface TradeResponse {
  success: boolean;
  message: string;
}
```

### `WebSocketMessage`

```ts
export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}
```

**Note:** API response types use `any` for nested objects. The actual shapes match backend `FullStatusPayload`, `AiStudyFeedPayload`, etc.

## Hook State Types

### `AiStudyFeedState` (useAiStudyFeed.ts)

```ts
export interface AiStudyFeedState {
  status: "waiting" | "calibrating" | "optimized" | "active";
  message: string;
  averageVelocity: number | null;
  knowledgeBase: any | null;
  strategy: any | null;
}
```

### `SettingsState` (useSettings.ts)

```ts
export interface SettingsState {
  paramInput: { lotSize, takeProfitPoints, stopLossPoints, trailingStopPoints, maxTrades, useTrailingStop, mt5Path, appEndpoint, tradingMode, selectedAssets, isAiModeEnabled };
  saveSuccess: boolean;
  copiedUrl: boolean;
  webRequestStatus: { status, lastTested, error, details } | null;
  isVerifyingWebRequest: boolean;
  setWebRequestStatus: (value) => void;
}
```

### `TradingControls` (useTradingControls.ts)

```ts
export interface TradingControls {
  toggleTradingExecution: (sendWsMessage, config, fetchStatus) => Promise<void>;
  closeAllPositions: (sendWsMessage, fetchStatus) => Promise<void>;
  resetStats: (sendWsMessage, fetchStatus) => Promise<void>;
}
```

### `ChartData` (useChartData.ts)

```ts
export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartData {
  candleData: CandleData[];
  displayCandles: CandleData[];
  minPrice: number;
  maxPrice: number;
  priceRange: number;
}
```

### `NetworkStatus` (useNetworkStatus.ts)

```ts
export interface NetworkStatus {
  isInternetOnline: boolean;
  wsConnected: boolean;
  latency: number;
  pingLatency: number | null;
}
```

### `AppError` (useErrorHandler.ts)

```ts
export interface AppError {
  id: string;
  message: string;
  timestamp: number;
}
```

### `BridgeDownloadConfig` (useDownloadBridge.ts)

```ts
export interface BridgeDownloadConfig {
  appEndpoint?: string;
  mt5Path?: string;
}
```

### `SymbolState` (useSymbolState.ts)

```ts
export interface SymbolState {
  symbol: string;
  connection: Record<string, any>;
  currentPrice: number;
  tickCount: number;
}
```
