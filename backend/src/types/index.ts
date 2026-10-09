import { WebSocket } from "ws";

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
  mt5Ticket?: number;
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
  sl?: number;
  tp?: number;
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

export interface SymbolStateEntry {
  ticks: Tick[];
  candles: CandleBar[];
  telemetry: MarketTelemetry[];
  connection: EAConnectionDetails;
  currentPrice: number;
  lastDirection: "up" | "down" | "flat";
  tickCount: number;
}

export interface SymbolStates {
  map: Map<string, SymbolStateEntry>;
  activeSymbol: string;
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
  eaPositions: EaPosition[];
  eaPositionsLastSync: string;
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

export interface Observation {
  id: string;
  symbol: string;
  timestamp: number;
  direction: "up" | "down" | "flat";
  velocity: number;
  price: number;
  candleId?: number;
  tags: string[];
  metadata: Record<string, any>;
  createdAt: string;
}

export interface ObservationFilters {
  symbol?: string;
  from?: number;
  to?: number;
  direction?: "up" | "down" | "flat";
  minVelocity?: number;
  maxVelocity?: number;
  tags?: string[];
  limit?: number;
}

export interface ObservationInsights {
  symbol: string;
  totalObservations: number;
  avgVelocity: number;
  peakVelocity: number;
  directionDistribution: { up: number; down: number; flat: number };
  topActiveHours: { hour: number; count: number }[];
  velocityClusters: { min: number; max: number; count: number }[];
  suggestedStrategies: string[];
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
  placeTrade: (
    type: "BUY" | "SELL",
    reason?: string,
    options?: { symbol?: string; lotSize?: number; sl?: number; tp?: number }
  ) => Promise<{ success: boolean; message: string; ticket?: number }>;
  closeTrade: (tradeId: string) => Promise<{ success: boolean; message: string }>;
  closeAllTrades: (symbol?: string) => Promise<{ success: boolean; closedCount: number; message: string }>;
  modifyTrade: (tradeId: string, options: { sl?: number; tp?: number }) => Promise<{ success: boolean; message: string }>;
  switchSymbol: (symbol: string) => void;
  getSymbols: () => Array<{ symbol: string; isConnected: boolean; currentPrice: number; tickCount: number; digits?: number | null; tickSize?: number | null }>;
  resetStats: () => Promise<void>;
  getTradingState: () => TradingState;
  getBridgeState: () => BridgeState;
  getCalibrationState: () => CalibrationState;
  getObservations: (filters?: ObservationFilters) => Observation[];
  generateInsights: (symbol: string, from?: number, to?: number) => ObservationInsights;
  backtestStrategyWithHistory: (strategyId: string, symbol: string, from: number, to: number, initialBalance?: number) => any;
}

export interface AppStoreReadOnly {
  config: TradeConfig;
  trades: readonly TradeRecord[];
  logs: readonly SystemLog[];
  getAiKnowledgeBase(): AiKnowledgeBase;
  getAiSynthesizedStrategy(): AiSynthesizedStrategy;
  getStrategySignal(): { type: string; reason: string; confidence?: number } | null;
  getSymbolStates(): SymbolStates;
  getActiveSymbol(): string;
  getNextTicket(): { value: number };
  getLatestBuyLockedFromEa(): boolean;
  getLatestSellLockedFromEa(): boolean;
  getPendingBridgeOrders(): readonly BridgeOrder[];
  getPendingEaCommands(): readonly EaCommand[];
  handleEaConfirmation(confirmation: EaConfirmation): void;
  handleEaPositionsReport(positions: EaPosition[]): void;
  handleEaLogs(logs: EaLog[]): void;
  getMt5BridgeClients(): ReadonlySet<WebSocket>;
  getWebDashboardClients(): ReadonlySet<WebSocket>;
  getWebRequestTest(): { status: "idle" | "pending" | "success" | "failed"; lastTested: string; error: string; details: string; triggerTest: boolean };

  getFullStatusPayload(): FullStatusPayload;
  getAndClearPendingOrders(): BridgeOrder[];
  getTradingState(): TradingState;
  getBridgeState(): BridgeState;
  getCalibrationState(): CalibrationState;
  buildMcpContext(): McpContext;
}

export type TradingState = "idle" | "active";
export type BridgeState = "disconnected" | "connected";
export type CalibrationState = "calibrating" | "optimized";

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

export interface EaCommand {
  action: "BUY" | "SELL" | "CLOSE_ALL" | "CLOSE_BY_TICKET" | "CONFIG_UPDATE" | "MODIFY_POSITION";
  symbol: string;
  lot: number;
  sl: number;
  tp: number;
  ticket?: number;
  reason?: string;
  id: string;
  timestamp: number;
  status: "pending" | "sent" | "confirmed" | "failed";
  error?: string;
}

export interface EaConfirmation {
  action: string;
  ticket: number;
  mt5Ticket?: number;
  success: boolean;
  error?: string;
  symbol: string;
  magic: number;
  timestamp: number;
}

export interface EaPosition {
  ticket: number;
  type: "BUY" | "SELL";
  symbol: string;
  volume: number;
  openPrice: number;
  sl: number;
  tp: number;
  profit: number;
  magic: number;
  openTime: string;
}

export interface EaLog {
  level: "INFO" | "SUCCESS" | "ERROR" | "WARN";
  message: string;
  timestamp: string;
  source: "EA";
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

export interface MarketCandleRow {
  id?: number;
  symbol: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  direction: "up" | "down" | "flat";
  minute_bucket: number;
  created_at?: string;
}

export interface ObservationRow {
  id: string;
  symbol: string;
  timestamp: number;
  direction: "up" | "down" | "flat";
  velocity: number;
  price: number;
  candle_id: number | null;
  tags: string;
  metadata: string;
  created_at: string;
}

export interface BacktestResultRow {
  id: string;
  strategy_id: string;
  strategy_version_id: string | null;
  symbol: string;
  from_time: number;
  to_time: number;
  initial_balance: number;
  final_balance: number;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  profit_factor: number;
  max_drawdown: number;
  sharpe_ratio: number;
  avg_win: number;
  avg_loss: number;
  metadata: string;
  created_at: string;
}

export interface StrategyTemplateRow {
  id: string;
  name: string;
  description: string;
  mode: string;
  category: string;
  rules: string;
  default_config: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface StrategyVersionRow {
  id: string;
  strategy_id: string;
  symbol: string;
  name: string;
  description: string;
  mode: string;
  rules: string;
  config: string;
  parent_version_id: string | null;
  created_by: string;
  created_at: string;
}

export interface StrategySymbolPerformanceRow {
  id: string;
  strategy_id: string;
  symbol: string;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_profit: number;
  avg_profit_per_trade: number;
  max_drawdown: number;
  last_updated: string;
}
