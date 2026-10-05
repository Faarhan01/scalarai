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
  symbolStates: Array<{
    symbol: string;
    connection: any;
    currentPrice: number;
    tickCount: number;
  }>;
  aiSynthesizedStrategy: any;
  stats: any;
  webRequestStatus: any;
}

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

export interface SettingsResponse {
  success: boolean;
  config: any;
  message?: string;
}

export interface TradeResponse {
  success: boolean;
  message: string;
}

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}
