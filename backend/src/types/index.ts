export enum StrategyMode {
  TREND_FOLLOWING = "TREND_FOLLOWING",
  MEAN_REVERSION = "MEAN_REVERSION",
  AI_ADAPTIVE = "AI_ADAPTIVE",
  CUSTOM = "CUSTOM"
}

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

export interface TradeSessionStats {
  totalProfit: number;
  tradesCount: number;
  winRate: number;
  activePositionsCount: number;
  lastHeartbeatTime: string | null;
}

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

export interface SystemLog {
  id: string;
  timestamp: string;
  level: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  source: "SERVER" | "EA" | "AI";
  message: string;
}

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

export interface SymbolMetadata {
  symbol: string;
  description: string | null;
  digits: number | null;
  tickSize: number | null;
  broker: string | null;
  accountNumber: string | null;
  lastConnected: string | null;
}

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

export interface SymbolState {
  metadata: SymbolMetadata;
  ticks: Tick[];
  candles: CandleBar[];
  telemetry: MarketTelemetry[];
  connection: EAConnectionDetails;
}

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

export interface StrategyCondition {
  indicator: string;
  condition: string;
  value: number | string | boolean;
  action: "BUY" | "SELL" | "HOLD";
  priority: number;
}

export interface AiSynthesizedStrategy {
  id?: string;
  name: string;
  description: string;
  mode: StrategyMode;
  rules: StrategyRules;
  createdAt: string;
  updatedAt: string;
}

export interface AiKnowledgeBase {
  totalObservations: number;
  globalAverageSpeed: number;
  peakVelocityRegistered: number;
  timeOfDayPatterns: Record<string, { count: number; avgSpeed: number }>;
  lastUpdated: string;
}

export interface MarketTelemetry {
  timestamp: number;
  price: number;
  velocity: number;
  buyLocked: boolean;
  sellLocked: boolean;
}

export interface WebRequestTestState {
  status: "idle" | "pending" | "success" | "failed";
  lastTested: string;
  error: string;
  details: string;
  triggerTest: boolean;
}

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

export interface AiStudyFeedPayload {
  status: string;
  message: string;
  count: number;
  aiKnowledgeBase: AiKnowledgeBase;
  aiSynthesizedStrategy: AiSynthesizedStrategy;
  candleStream: Tick[];
  averageVelocity: number;
}

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

export interface SettingsRow {
  id: number;
  is_active: number;
  selected_strategy: string;
  lot_size: number;
  take_profit_points: number;
  stop_loss_points: number;
  trailing_stop_points: number;
  use_trailing_stop: number;
  max_trades: number;
  trading_mode: string;
  is_ai_mode_enabled: number;
  mt5_path: string | null;
  app_endpoint: string | null;
  selected_assets: string;
}

export interface EaConnectionRow {
  id: number;
  is_ea_connected: number;
  client_ip: string | null;
  last_ping: string | null;
  broker: string | null;
  account_number: string | null;
  balance: number | null;
  symbol: string | null;
  symbol_digits: number | null;
  symbol_tick_size: number | null;
  symbol_description: string | null;
  spread: number | null;
  session: string | null;
  margin: number | null;
  leverage: number | null;
  swap_long: number | null;
  swap_short: number | null;
  profit_calc_mode: number | null;
}

export interface AiKnowledgeRow {
  id: number;
  total_observations: number;
  global_average_speed: number;
  peak_velocity_registered: number;
  time_of_day_patterns: string;
  last_updated: string;
}

export interface AiStrategyRow {
  id: number;
  name: string;
  description: string;
  mode: string;
  rules: string;
  created_at: string;
  updated_at: string;
}

export interface StrategyRow {
  id: string;
  name: string;
  description: string;
  mode: string;
  rules: string;
  createdAt: string;
  updatedAt: string;
}

export interface TradeRow {
  id: string;
  ticket: number;
  symbol: string;
  type: "BUY" | "SELL";
  entry_price: number;
  close_price: number | null;
  lot_size: number;
  profit: number;
  status: "OPEN" | "CLOSED";
  open_time: string;
  close_time: string | null;
  strategy: string;
  reason: string;
}

export interface SymbolMetadataRow {
  symbol: string;
  description: string | null;
  digits: number | null;
  tick_size: number | null;
  broker: string | null;
  account_number: string | null;
  last_connected: string | null;
}
