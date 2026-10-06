# Backend Types

> Key TypeScript interfaces and types from `backend/src/types/index.ts`.

## Enums

```ts
export enum StrategyMode {
  TREND_FOLLOWING = "TREND_FOLLOWING",
  MEAN_REVERSION = "MEAN_REVERSION",
  AI_ADAPTIVE = "AI_ADAPTIVE",
  CUSTOM = "CUSTOM"
}
```

## Core Domain Types

### `TradeConfig`

```ts
export interface TradeConfig {
  isActive: boolean;
  selectedStrategy: StrategyMode;
  lotSize: number;
  takeProfitPoints: number;
  stopLossPoints: number;
  trailingStopPoints: number;
  useTrailingStop: boolean;
  maxTrades: number;
  mt5Path?: string;
  appEndpoint?: string;
  tradingMode?: "Scalping" | "Swing";
  selectedAssets?: string[];
  isAiModeEnabled?: boolean;
}
```

### `TradeRecord`

```ts
export interface TradeRecord {
  id: string;
  ticket: number;
  symbol?: string;
  type: "BUY" | "SELL";
  entryPrice: number;
  closePrice?: number;
  lotSize: number;
  profit: number;
  status: "OPEN" | "CLOSED";
  openTime: string;
  closeTime?: string;
  strategy: StrategyMode;
  reason: string;
}
```

### `SystemLog`

```ts
export interface SystemLog {
  id: string;
  timestamp: string;
  level: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  source: "SERVER" | "EA" | "AI";
  message: string;
}
```

### `Tick`

```ts
export interface Tick {
  symbol?: string;
  time: number;
  price: number;
  direction: "up" | "down" | "flat";
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number | null;
  velocity?: number;
  buyLocked?: boolean;
  sellLocked?: boolean;
  spread?: number;
  session?: string;
}
```

### `CandleBar`

```ts
export interface CandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  direction: "up" | "down" | "flat";
  minuteBucket?: number;
}
```

### `EAConnectionDetails`

```ts
export interface EAConnectionDetails {
  isEaConnected: boolean;
  clientIp: string | null;
  lastPing: string | null;
  broker: string | null;
  accountNumber: string | null;
  balance: number | null;
  symbol: string | null;
  symbolDigits: number | null;
  symbolTickSize: number | null;
  symbolDescription: string | null;
  spread: number | null;
  session: string | null;
  margin: number | null;
  leverage: number | null;
  swapLong: number | null;
  swapShort: number | null;
  profitCalcMode: number | null;
}
```

## AI Types

### `AiKnowledgeBase`

```ts
export interface AiKnowledgeBase {
  totalObservations: number;
  globalAverageSpeed: number;
  peakVelocityRegistered: number;
  timeOfDayPatterns: Record<string, { count: number; avgSpeed: number }>;
  lastUpdated: string;
}
```

### `AiSynthesizedStrategy`

```ts
export interface AiSynthesizedStrategy {
  id?: string;
  name: string;
  description: string;
  mode: StrategyMode;
  rules: StrategyRules;
  createdAt: string;
  updatedAt: string;
}
```

### `StrategyRules`

```ts
export interface StrategyRules {
  telemetry?: Record<string, unknown>;
  minVelocityFilter?: number;
  maxAllowedPositionDivergence?: number;
  useEmaConfirmation?: boolean;
  allowCounterTrend?: boolean;
  conditions?: Array<{
    indicator: string;
    condition: string;
    value: number | string | boolean;
    action: "BUY" | "SELL" | "HOLD";
    priority: number;
  }>;
  slPointsMultiplier?: number;
  tpPointsMultiplier?: number;
}
```

### `StrategyCondition`

```ts
export interface StrategyCondition {
  indicator: string;
  condition: string;
  value: number | string | boolean;
  action: "BUY" | "SELL" | "HOLD";
  priority: number;
}
```

## Payload Types

### `FullStatusPayload`

```ts
export interface FullStatusPayload {
  config: TradeConfig;
  connection: EAConnectionDetails;
  isBridgeConnected: boolean;
  logs: SystemLog[];
  trades: TradeRecord[];
  history: Tick[];
  candles: CandleBar[];
  status: string;
  currentPrice: number;
  activeSymbol: string;
  symbolStates: Array<{ symbol: string; connection: EAConnectionDetails; currentPrice: number; tickCount: number }>;
  aiSynthesizedStrategy: AiSynthesizedStrategy;
  lastStrategySignal: { type: string; reason: string; confidence?: number } | null;
  stats: TradeSessionStats;
  webRequestStatus: WebRequestTestState;
}
```

### `UpdateMarketPayload`

```ts
export interface UpdateMarketPayload {
  symbol?: string;
  price?: number;
  close?: number;
  open?: number;
  high?: number;
  low?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  equity?: number;
  currency?: string;
  velocity?: number;
  buyLocked?: boolean;
  sellLocked?: boolean;
  spread?: number;
  session?: string;
  broker?: string;
  account?: string;
  balance?: number;
  digits?: number;
  tickSize?: number;
  description?: string;
  margin?: number;
  leverage?: number;
  swapLong?: number;
  swapShort?: number;
  profitCalcMode?: number;
}
```

### `AiStudyFeedPayload`

```ts
export interface AiStudyFeedPayload {
  status: string;
  message: string;
  count: number;
  aiKnowledgeBase: AiKnowledgeBase;
  aiSynthesizedStrategy: AiSynthesizedStrategy;
  candleStream: Tick[];
  averageVelocity: number;
}
```

### `McpContext`

```ts
export interface McpContext {
  getStatus: () => FullStatusPayload;
  getAiStudyFeed: () => Promise<AiStudyFeedPayload>;
  getTrades: () => TradeRecord[];
  getLogs: () => SystemLog[];
  getConfig: () => TradeConfig;
  getConnection: () => EAConnectionDetails;
  getAiStrategy: () => AiSynthesizedStrategy;
  getAiKnowledgeBase: () => AiKnowledgeBase;
  analyzeMarket: () => Promise<string>;
  synthesizeStrategy: () => Promise<AiSynthesizedStrategy>;
  updateSettings: (params: Partial<TradeConfig>) => Promise<TradeConfig>;
  toggleTrading: (isActive: boolean) => Promise<TradeConfig>;
  placeTrade: (type: "BUY" | "SELL", reason?: string) => Promise<{ success: boolean; message: string }>;
  closeTrade: (tradeId: string) => Promise<{ success: boolean; message: string }>;
  resetStats: () => Promise<void>;
}
```

### `WebRequestTestState`

```ts
export interface WebRequestTestState {
  status: "idle" | "pending" | "success" | "failed";
  lastTested: string;
  error: string;
  details: string;
  triggerTest: boolean;
}
```

### `BridgeOrder`

```ts
export interface BridgeOrder {
  action: string;
  symbol: string;
  volume: number;
  sl: number;
  tp: number;
  id: string;
  ticket: number;
  timestamp: number;
}
```

### `TradeSessionStats`

```ts
export interface TradeSessionStats {
  totalProfit: number;
  tradesCount: number;
  winRate: number;
  activePositionsCount: number;
  lastHeartbeatTime: string | null;
}
```

### `SymbolMetadata`

```ts
export interface SymbolMetadata {
  symbol: string;
  description: string | null;
  digits: number | null;
  tickSize: number | null;
  broker: string | null;
  accountNumber: string | null;
  lastConnected: string | null;
}
```

## DB Row Types

- `SettingsRow` — id, is_active, selected_strategy, lot_size, take_profit_points, stop_loss_points, trailing_stop_points, use_trailing_stop, max_trades, trading_mode, is_ai_mode_enabled, mt5_path, app_endpoint, selected_assets
- `EaConnectionRow` — id, is_ea_connected, client_ip, last_ping, broker, account_number, balance, symbol, symbol_digits, symbol_tick_size, symbol_description, spread, session, margin, leverage, swap_long, swap_short, profit_calc_mode
- `AiKnowledgeRow` — id, total_observations, global_average_speed, peak_velocity_registered, time_of_day_patterns, last_updated
- `AiStrategyRow` — id, name, description, mode, rules, created_at, updated_at
- `StrategyRow` — id, name, description, mode, rules, createdAt, updatedAt
- `TradeRow` — id, ticket, symbol, type, entry_price, close_price, lot_size, profit, status, open_time, close_time, strategy, reason
- `SymbolMetadataRow` — symbol, description, digits, tick_size, broker, account_number, last_connected

## Market Ingestion Types

- `SymbolStateEntry` — ticks, candles, telemetry, connection, currentPrice, lastDirection, tickCount
- `TelemetryRecord` — timestamp, price, velocity, buyLocked, sellLocked
- `SymbolStates` — map, activeSymbol
