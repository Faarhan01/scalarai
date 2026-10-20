import path from "path";
import dotenv from "dotenv";

dotenv.config();

export interface AppConfig {
  port: number;
  host: string;
  env: string;
  databasePath: string;
  defaultSymbol: string;
  symbols: Array<{
    symbol: string;
    category: string;
    digits: number;
    point: number;
    spread: number;
  }>;
  risk: {
    maxTrades: number;
    maxDailyLoss: number;
    maxDrawdownPct: number;
    defaultLotSize: number;
    defaultStopLossPoints: number;
    defaultTakeProfitPoints: number;
  };
  ea: {
    downloadFilename: string;
    heartbeatTimeoutMs: number;
  };
}

export const config: AppConfig = {
  port: Number(process.env.PORT) || 4000,
  host: process.env.HOST || "0.0.0.0",
  env: process.env.NODE_ENV || "development",
  databasePath: process.env.DATABASE_PATH || path.resolve(process.cwd(), "backend", "src", "db", "scalarai.sqlite"),
  defaultSymbol: process.env.DEFAULT_SYMBOL || "Step Index",
  symbols: [
    { symbol: "Step Index", category: "Synthetic Indices", digits: 1, point: 0.1, spread: 0.2 },
    { symbol: "Boom 1000 Index", category: "Crash/Boom", digits: 4, point: 0.001, spread: 0.8 },
    { symbol: "Crash 1000 Index", category: "Crash/Boom", digits: 4, point: 0.001, spread: 0.8 },
    { symbol: "Boom 500 Index", category: "Crash/Boom", digits: 4, point: 0.001, spread: 0.8 },
    { symbol: "Crash 500 Index", category: "Crash/Boom", digits: 4, point: 0.001, spread: 0.8 },
    { symbol: "Volatility 75 Index", category: "Volatility Indices", digits: 4, point: 0.0001, spread: 0.5 },
    { symbol: "Volatility 100 Index", category: "Volatility Indices", digits: 2, point: 0.01, spread: 1.2 },
    { symbol: "Volatility 50 Index", category: "Volatility Indices", digits: 4, point: 0.0001, spread: 0.4 },
    { symbol: "Jump 10 Index", category: "Jump Indices", digits: 4, point: 0.0001, spread: 0.4 },
    { symbol: "EURUSD", category: "Forex", digits: 5, point: 0.00001, spread: 0.00015 },
    { symbol: "GBPUSD", category: "Forex", digits: 5, point: 0.00001, spread: 0.00018 },
    { symbol: "USDJPY", category: "Forex", digits: 3, point: 0.001, spread: 0.015 },
    { symbol: "XAUUSD", category: "Metals", digits: 2, point: 0.01, spread: 0.35 },
    { symbol: "BTCUSD", category: "Crypto", digits: 2, point: 0.01, spread: 15.0 },
  ],
  risk: {
    maxTrades: Number(process.env.MAX_TRADES) || 5,
    maxDailyLoss: Number(process.env.MAX_DAILY_LOSS) || 500,
    maxDrawdownPct: Number(process.env.MAX_DRAWDOWN_PCT) || 10,
    defaultLotSize: Number(process.env.DEFAULT_LOT_SIZE) || 0.1,
    defaultStopLossPoints: Number(process.env.DEFAULT_STOP_LOSS_POINTS) || 150,
    defaultTakeProfitPoints: Number(process.env.DEFAULT_TAKE_PROFIT_POINTS) || 300,
  },
  ea: {
    downloadFilename: "StrategyForge.mq5",
    heartbeatTimeoutMs: 15000,
  },
};
