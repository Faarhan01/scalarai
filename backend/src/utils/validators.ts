export function isValidStrategyMode(value: any): value is "TREND_FOLLOWING" | "MEAN_REVERSION" | "AI_ADAPTIVE" {
  return ["TREND_FOLLOWING", "MEAN_REVERSION", "AI_ADAPTIVE"].includes(value);
}

export function isValidTradingMode(value: any): value is "Scalping" | "Swing" {
  return ["Scalping", "Swing"].includes(value);
}

export function isValidTradeType(value: any): value is "BUY" | "SELL" {
  return ["BUY", "SELL"].includes(value);
}
