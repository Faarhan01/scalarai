// Strategies barrel export.
export * from "./strategy";
export { BacktestEngine } from "./backtest";
export type { BacktestCandle, BacktestTrade } from "./backtest";
export * from "./research";
export * from "./templates";
export { runBacktest } from "./research-backtest";
export type { BacktestParams, BacktestTrade as ResearchBacktestTrade, BacktestResult as ResearchBacktestResult } from "./research-backtest";
// Strategy type subfolders (each is independently removable)
export * from "./trend";
export * from "./reversion";
export * from "./breakout";
export * from "./adaptive";
export * from "./custom";