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
  time: number;
  price: number;
  direction: "up" | "down" | "flat";
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  velocity?: number;
  buyLocked?: boolean;
  sellLocked?: boolean;
  spread?: number;
  session?: string;
}

export interface TradeRecord {
  id: string;
  ticket: number;
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
}

export interface SymbolState {
  metadata: SymbolMetadata;
  ticks: Tick[];
  candles: CandleBar[];
  telemetry: MarketTelemetry[];
  connection: EAConnectionDetails;
}

export interface AiSynthesizedStrategy {
  id?: string;
  name: string;
  description: string;
  mode: StrategyMode;
  rules: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyRule {
  indicator: string;
  condition: string;
  value: number | string | boolean;
  action: "BUY" | "SELL" | "HOLD";
  priority: number;
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

export interface McpContext {
  getStatus: () => any;
  getAiStudyFeed: () => any;
  getTrades: () => TradeRecord[];
  getLogs: () => SystemLog[];
  getConfig: () => TradeConfig;
  getConnection: () => EAConnectionDetails;
  getAiStrategy: () => AiSynthesizedStrategy;
  getAiKnowledgeBase: () => AiKnowledgeBase;
  analyzeMarket: () => Promise<string>;
  synthesizeStrategy: () => Promise<AiSynthesizedStrategy>;
  updateSettings: (params: any) => Promise<TradeConfig>;
  toggleTrading: (isActive: boolean) => Promise<TradeConfig>;
  placeTrade: (type: "BUY" | "SELL", reason?: string) => Promise<any>;
  closeTrade: (tradeId: string) => Promise<any>;
  resetStats: () => Promise<void>;
}
