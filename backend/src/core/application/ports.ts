import { TradeRecord, TradeConfig, FullStatusPayload, EaCommand, EaConfirmation, EaPosition } from "../../types";
import { Bar } from "../../services/research-engine";

export interface AccountInfo {
  login: string;
  broker: string;
  server: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  leverage: number;
  openPositionsCount: number;
  floatingProfit: number;
  gatewayConnected: boolean;
}

export interface TerminalInfo {
  connected: boolean;
  terminalBuild: number;
  broker: string;
  pingMs: number;
  mode: string;
  activeSymbol: string;
  tradingState: string;
}

export interface MarketDataPort {
  getTick(symbol: string): { symbol: string; bid: number; ask: number; last: number; spread: number; time: string };
  getCandles(symbol: string, timeframe?: string, limit?: number): Bar[];
  getSymbols(): Array<{ symbol: string; category: string; digits: number; point: number; spread: number; bid: number; ask: number; isActive: boolean }>;
}

export interface AccountPort {
  getAccount(): AccountInfo;
  getTerminal(): TerminalInfo;
  getPortfolio(): { account: Partial<AccountInfo>; positions: any[]; orders: any[]; gatewayConnected: boolean };
}

export interface TradingPort {
  placeTrade(type: "BUY" | "SELL" | string, reason: string, options?: { symbol?: string; lotSize?: number; sl?: number; tp?: number }): Promise<TradeRecord | any>;
  closeTrade(tradeId: string): Promise<TradeRecord | undefined>;
  closeAllTrades(): Promise<number>;
  modifyTrade(tradeId: string, updates: { sl?: number; tp?: number }): Promise<TradeRecord | undefined>;
}

export interface GatewayPort {
  isConnected(): boolean;
  getConnectedEa(): any;
  queueOrderCommand(command: { action: string; symbol: string; volume: number; sl?: number; tp?: number; reason?: string }): { success: boolean; commandId: string; status: string };
  recordHeartbeat(payload: any): void;
  recordTick(payload: any): void;
  recordPositions(positions: EaPosition[]): void;
  recordConfirmation(confirmation: EaConfirmation): void;
}

export interface StrategyRepository {
  getStrategies(): any[];
  getStrategyById(id: string): any;
  saveStrategy(strategy: any): void;
  deleteStrategy(id: string): void;
}
