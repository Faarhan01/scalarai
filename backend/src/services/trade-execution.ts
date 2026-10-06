import { TradeRecord, TradeConfig, AiSynthesizedStrategy, AiKnowledgeBase, Tick, CandleBar } from "../types";
import { SymbolStates, getSymbolState } from "./market-ingestion";
import { buildContext, evaluateStrategy } from "./strategy";
import { scalarAiDb } from "../db";
import { createSystemLog } from "./defaults";
import { WebSocket } from "ws";

export interface AppCallbacks {
  addLog: (source: "SERVER" | "EA" | "AI", level: "INFO" | "SUCCESS" | "WARNING" | "ERROR", message: string) => void;
  broadcastToDashboards: (payload: unknown) => void;
  broadcastTradesUpdate: () => void;
}

export interface TradeState {
  tradesList: TradeRecord[];
  symbolStates: SymbolStates;
  activeSymbol: string;
  tradeConfig: TradeConfig;
  aiKnowledgeBase: AiKnowledgeBase;
  aiSynthesizedStrategy: AiSynthesizedStrategy;
  latestBuyLockedFromEa: boolean;
  latestSellLockedFromEa: boolean;
  nextTicket: { value: number };
  pendingBridgeOrders: any[];
  pendingEaCommand: { action: string; lot: number; sl: number; tp: number } | null;
  mt5BridgeClients: Set<WebSocket>;
}

export function getClosePrices(ticks: Tick[]): number[] {
  return ticks.map(t => (t.close !== undefined ? t.close : t.price));
}

export function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices.reduce((a, b) => a + b, 0) / prices.length;
  let ema = prices[0];
  const coeff = 2 / (period + 1);
  for (let i = 1; i < prices.length; i++) ema = prices[i] * coeff + ema * (1 - coeff);
  return ema;
}

export function calculateRSI(prices: number[], period: number = 10): number {
  if (prices.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function calculateATR(state: SymbolStates, activeSymbol: string, period: number = 10): number {
  const currentState = getSymbolState(state, activeSymbol);
  if (currentState.ticks.length < 2) return 0.5;
  const trs: number[] = [];
  for (let i = 1; i < currentState.ticks.length; i++) {
    const prev = currentState.ticks[i - 1];
    const curr = currentState.ticks[i];
    const prevClose = prev.close !== undefined ? prev.close : prev.price;
    const currHigh = curr.high !== undefined ? curr.high : curr.price;
    const currLow = curr.low !== undefined ? curr.low : curr.price;
    const tr = Math.max(currHigh - currLow, Math.abs(currHigh - prevClose), Math.abs(currLow - prevClose));
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  if (slice.length === 0) return 0.5;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function calculateBollingerBands(prices: number[], period: number = 15, numDevs: number = 2): { upper: number; middle: number; lower: number } {
  if (prices.length === 0) return { upper: 0, middle: 0, lower: 0 };
  const slice = prices.slice(-period);
  const middle = slice.reduce((sum, p) => sum + p, 0) / slice.length;
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / slice.length;
  const stdDev = Math.sqrt(variance) || 0.1;
  return { upper: middle + numDevs * stdDev, middle, lower: middle - numDevs * stdDev };
}

export async function evaluateSimulatedStrategy(state: TradeState, callbacks: AppCallbacks): Promise<void> {
  const MIN_SAFETY_CALIBRATION_THRESHOLD = 20;
  if (state.aiKnowledgeBase.totalObservations < MIN_SAFETY_CALIBRATION_THRESHOLD) return;
  if (getSymbolState(state.symbolStates, state.activeSymbol).ticks.length < 5) return;

  const ticks = getSymbolState(state.symbolStates, state.activeSymbol).ticks;
  const openTrades = state.tradesList.filter((t: TradeRecord) => t.status === "OPEN");

  openTrades.forEach((trade: TradeRecord) => {
    const currentPrice = getSymbolState(state.symbolStates, state.activeSymbol).currentPrice;
    let priceDiff = trade.type === "BUY" ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice;
    const pointsDiff = Math.abs(priceDiff) * 100;
    if (pointsDiff >= state.tradeConfig.takeProfitPoints && priceDiff > 0) {
      closeSimulatedPosition(state, trade, `TAKE PROFIT reached on ${state.activeSymbol} limit (+${pointsDiff.toFixed(1)} pts).`, callbacks);
    } else if (pointsDiff >= state.tradeConfig.stopLossPoints && priceDiff < 0) {
      closeSimulatedPosition(state, trade, `STOP LOSS reached on ${state.activeSymbol} risk boundary (-${pointsDiff.toFixed(1)} pts).`, callbacks);
    } else if (state.tradeConfig.useTrailingStop && priceDiff > 0) {
      const distancePoints = priceDiff * 100;
      if (distancePoints > state.tradeConfig.trailingStopPoints) {
        const atr = calculateATR(state.symbolStates, state.activeSymbol, 10);
        const atrPoints = atr * 100;
        const profitLockPoints = distancePoints * 0.5;
        const potentialRetracement = distancePoints - profitLockPoints;
        if (potentialRetracement < atrPoints) {
          closeSimulatedPosition(state, trade, `TRAILING STOP triggered: locked in +${profitLockPoints.toFixed(1)} pts of profit.`, callbacks);
        }
      }
    }
  });

  const activeBuyExists = openTrades.some((t: TradeRecord) => t.type === "BUY") || state.latestBuyLockedFromEa;
  const activeSellExists = openTrades.some((t: TradeRecord) => t.type === "SELL") || state.latestSellLockedFromEa;

  if (openTrades.length >= state.tradeConfig.maxTrades) return;

  const ctx = buildContext(
    ticks,
    state.aiKnowledgeBase,
    state.aiSynthesizedStrategy,
    state.tradeConfig.tradingMode || "Scalping",
    openTrades.length,
    activeBuyExists,
    activeSellExists
  );

  const signal = evaluateStrategy(state.tradeConfig.selectedStrategy, ctx, state.tradeConfig);
  if (signal.type !== "HOLD") {
    await openSimulatedPosition(state, signal.type, signal.reason, callbacks);
    callbacks.addLog("SERVER", "INFO", `Strategy signal: ${signal.type} - ${signal.reason}`);
  }
}

export async function openSimulatedPosition(state: TradeState, type: "BUY" | "SELL", reason: string, callbacks: AppCallbacks): Promise<void> {
  const openTrades = state.tradesList.filter((t: TradeRecord) => t.status === "OPEN");
  const activeBuyExists = openTrades.some((t: TradeRecord) => t.type === "BUY") || state.latestBuyLockedFromEa;
  const activeSellExists = openTrades.some((t: TradeRecord) => t.type === "SELL") || state.latestSellLockedFromEa;

  if (type === "BUY" && activeSellExists) {
    callbacks.addLog("SERVER", "ERROR", "Block BUY Execution: Gatekeeper locked because of active opposite SELL position(s).");
    return;
  }
  if (type === "SELL" && activeBuyExists) {
    callbacks.addLog("SERVER", "ERROR", "Block SELL Execution: Gatekeeper locked because of active opposite BUY position(s).");
    return;
  }
  if (openTrades.length >= state.tradeConfig.maxTrades) {
    callbacks.addLog("SERVER", "WARNING", "Block Trade Execution: Max trade boundary hit.");
    return;
  }

  const slApplied = Math.round(Number(state.tradeConfig.stopLossPoints || 0) * (state.aiSynthesizedStrategy.rules.slPointsMultiplier || 1.0));
  const tpApplied = Math.round(Number(state.tradeConfig.takeProfitPoints || 0) * (state.aiSynthesizedStrategy.rules.tpPointsMultiplier || 1.0));
  const tId = crypto.randomUUID();
  const currentPrice = getSymbolState(state.symbolStates, state.activeSymbol).currentPrice;
  const ticket = state.nextTicket.value;
  const newTrade: TradeRecord = {
    id: tId,
    ticket,
    type,
    entryPrice: currentPrice,
    lotSize: state.tradeConfig.lotSize,
    profit: 0,
    status: "OPEN",
    openTime: new Date().toLocaleTimeString(),
    strategy: state.tradeConfig.selectedStrategy,
    reason,
  };
  state.tradesList.unshift(newTrade);
  state.nextTicket.value += 1;
  callbacks.addLog("SERVER", "SUCCESS", `Open simulated MT5 position ticket #${newTrade.ticket} - ${type} at ${currentPrice} (Dynamic SL: ${slApplied} pts, TP: ${tpApplied} pts scaled by AI Strategy rules)`);
  const orderPayload = { action: (type || "BUY").toUpperCase(), symbol: state.activeSymbol, volume: Number(state.tradeConfig.lotSize || 0.1), sl: slApplied, tp: tpApplied };
  state.pendingBridgeOrders.push({ ...orderPayload, id: newTrade.id, ticket: newTrade.ticket, timestamp: Date.now() });
  state.pendingEaCommand = { action: (type || "BUY").toUpperCase(), lot: Number(state.tradeConfig.lotSize || 0.1), sl: slApplied, tp: tpApplied };
  state.mt5BridgeClients.forEach((client: WebSocket) => {
    if (client.readyState === 1) {
      try { client.send(JSON.stringify(orderPayload)); } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`Bridge order broadcast failed: ${reason}`);
      }
    }
  });
  callbacks.broadcastTradesUpdate();
}

export function closeSimulatedPosition(state: TradeState, trade: TradeRecord, reason: string, callbacks: AppCallbacks): void {
  trade.status = "CLOSED";
  trade.closePrice = getSymbolState(state.symbolStates, state.activeSymbol).currentPrice;
  trade.closeTime = new Date().toLocaleTimeString();
  const profitFactor = trade.type === "BUY" ? getSymbolState(state.symbolStates, state.activeSymbol).currentPrice - trade.entryPrice : trade.entryPrice - getSymbolState(state.symbolStates, state.activeSymbol).currentPrice;
  const finalProfit = Number((profitFactor * 10.0 * trade.lotSize).toFixed(2));
  trade.profit = finalProfit;
  trade.reason = reason;
  callbacks.addLog("SERVER", "SUCCESS", `Simulated Trade #${trade.ticket} CLOSED. Profit: ${finalProfit > 0 ? "+" : ""}$${finalProfit}`);
  const closePayload = { action: "CLOSE_ALL", symbol: state.activeSymbol, volume: trade.lotSize, sl: 0, tp: 0 };
  state.pendingBridgeOrders.push({ ...closePayload, id: trade.id, timestamp: Date.now() });
  state.pendingEaCommand = { action: "CLOSE_ALL", lot: trade.lotSize, sl: 0, tp: 0 };
  state.mt5BridgeClients.forEach((client: WebSocket) => {
    if (client.readyState === 1) {
      try { client.send(JSON.stringify(closePayload)); } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`Bridge close broadcast failed: ${reason}`);
      }
    }
  });
  callbacks.broadcastTradesUpdate();
}
