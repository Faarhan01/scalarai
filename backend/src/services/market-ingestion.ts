import { Tick, EAConnectionDetails, CandleBar } from "../types";

export interface SymbolStateEntry {
  ticks: Tick[];
  candles: CandleBar[];
  telemetry: TelemetryRecord[];
  connection: EAConnectionDetails;
  currentPrice: number;
  lastDirection: "up" | "down" | "flat";
  tickCount: number;
}

export interface TelemetryRecord {
  timestamp: number;
  price: number;
  velocity: number;
  buyLocked: boolean;
  sellLocked: boolean;
}

export interface SymbolStates {
  map: Map<string, SymbolStateEntry>;
  activeSymbol: string;
}

export function createSymbolStates(initialActiveSymbol = ""): SymbolStates {
  const map = new Map<string, SymbolStateEntry>();

  return {
    map,
    activeSymbol: initialActiveSymbol,
  };
}

export function createBlankSymbolState(symbol = ""): SymbolStateEntry {
  return {
    ticks: [],
    candles: [],
    telemetry: [],
    connection: {
      isEaConnected: false,
      clientIp: null,
      lastPing: null,
      broker: null,
      accountNumber: null,
      balance: null,
      symbol: symbol || null,
      symbolDigits: null,
      symbolTickSize: null,
      symbolDescription: null,
      spread: null,
      session: null,
      margin: null,
      leverage: null,
      swapLong: null,
      swapShort: null,
      profitCalcMode: null,
    },
    currentPrice: 0,
    lastDirection: "flat",
    tickCount: 0,
  };
}

export function getSymbolState(symbolStates: SymbolStates, symbol?: string): SymbolStateEntry {
  const targetSymbol = (symbol && symbol.trim()) || symbolStates.activeSymbol || "";
  if (!targetSymbol) {
    if (symbolStates.map.size > 0) {
      const first = symbolStates.map.keys().next().value;
      if (first) return symbolStates.map.get(first)!;
    }
    return createBlankSymbolState("");
  }
  if (!symbolStates.map.has(targetSymbol)) {
    symbolStates.map.set(targetSymbol, createBlankSymbolState(targetSymbol));
  }
  return symbolStates.map.get(targetSymbol)!;
}

export function aggregateTickIntoCandle(state: SymbolStateEntry, targetPrice: number): void {
  const now = Date.now();
  const currentBucket = Math.floor(now / 60000);
  const candles = state.candles || [];

  if (candles.length === 0) {
    state.candles = [{
      time: now,
      open: targetPrice,
      high: targetPrice,
      low: targetPrice,
      close: targetPrice,
      volume: null,
      direction: "flat",
      minuteBucket: currentBucket,
    }];
    return;
  }

  const lastCandle = candles[candles.length - 1];
  if (lastCandle.minuteBucket === currentBucket) {
    lastCandle.high = Math.max(lastCandle.high, targetPrice);
    lastCandle.low = Math.min(lastCandle.low, targetPrice);
    lastCandle.close = targetPrice;
  } else {
    candles.push({
      time: now,
      open: targetPrice,
      high: targetPrice,
      low: targetPrice,
      close: targetPrice,
      volume: null,
      direction: "flat",
      minuteBucket: currentBucket,
    });
    if (candles.length > 200) candles.shift();
  }
}

export function updateMarket(
  symbolStates: SymbolStates,
  data: {
    symbol?: string;
    price?: number;
    close?: number;
    open?: number;
    high?: number;
    low?: number;
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
): { symbol: SymbolStateEntry; switched: boolean } {
  const symbol = (data.symbol && data.symbol.trim()) || symbolStates.activeSymbol || "Step Index";
  const switched = !!symbolStates.activeSymbol && symbol !== symbolStates.activeSymbol;
  if (!symbolStates.activeSymbol || switched) {
    symbolStates.activeSymbol = symbol;
  }

  const state = getSymbolState(symbolStates, symbol);

  const rawPrice = data.price !== undefined ? Number(data.price) : (data.close !== undefined ? Number(data.close) : state.currentPrice);
  if (!isFinite(rawPrice) || rawPrice <= 0) {
    return { symbol: state, switched };
  }
  const targetPrice = rawPrice;

  const now = Date.now();

  if (state.ticks.length > 0 && Math.abs(targetPrice - state.currentPrice) < 0.0001 && state.telemetry.length > 0) {
    const lastTel = state.telemetry[state.telemetry.length - 1];
    const newVelocity = data.velocity !== undefined ? Number(data.velocity) : lastTel.velocity;
    if (Math.abs(newVelocity - lastTel.velocity) < 0.00001 && data.buyLocked === lastTel.buyLocked && data.sellLocked === lastTel.sellLocked) {
      return { symbol: state, switched };
    }
  }

  const numVelocity = data.velocity !== undefined ? Number(data.velocity) : 0;
  if (!isFinite(numVelocity)) return { symbol: state, switched };

  const isBuyLocked = data.buyLocked !== undefined ? Boolean(data.buyLocked) : false;
  const isSellLocked = data.sellLocked !== undefined ? Boolean(data.sellLocked) : false;

  state.telemetry.push({ timestamp: now, price: targetPrice, velocity: numVelocity, buyLocked: isBuyLocked, sellLocked: isSellLocked });
  if (state.telemetry.length > 500) state.telemetry.shift();

  let direction: "up" | "down" | "flat" = "flat";
  if (targetPrice > state.currentPrice) direction = "up";
  else if (targetPrice < state.currentPrice) direction = "down";
  state.currentPrice = targetPrice;
  state.lastDirection = direction;
  state.tickCount += 1;

  const tickRecord: Tick = {
    symbol,
    time: Date.now(),
    price: state.currentPrice,
    direction,
    open: data.open !== undefined ? Number(data.open) : state.currentPrice,
    high: data.high !== undefined ? Number(data.high) : state.currentPrice,
    low: data.low !== undefined ? Number(data.low) : state.currentPrice,
    close: Number(state.currentPrice),
    volume: data.volume !== undefined ? Number(data.volume) : null,
    velocity: numVelocity,
    buyLocked: isBuyLocked,
    sellLocked: isSellLocked,
    spread: data.spread !== undefined ? Number(data.spread) : null,
    session: data.session || null,
  };
  state.ticks.push(tickRecord);
  if (state.ticks.length > 150) state.ticks.shift();

  state.connection.isEaConnected = true;
  state.connection.lastPing = new Date().toISOString();
  state.connection.broker = data.broker || "MetaTrader 5 Link";
  state.connection.accountNumber = state.connection.accountNumber || data.account || "Simulated MT5 Acc";
  state.connection.balance = data.balance !== undefined ? Number(data.balance) : (state.connection.balance || 1000.0);
  state.connection.symbol = symbol;
  state.connection.symbolDigits = data.digits !== undefined ? Number(data.digits) : null;
  state.connection.symbolTickSize = data.tickSize !== undefined ? Number(data.tickSize) : null;
  state.connection.symbolDescription = data.description || null;
  state.connection.spread = data.spread !== undefined ? Number(data.spread) : null;
  state.connection.session = data.session || null;
  state.connection.margin = data.margin !== undefined ? Number(data.margin) : null;
  state.connection.leverage = data.leverage !== undefined ? Number(data.leverage) : null;
  state.connection.swapLong = data.swapLong !== undefined ? Number(data.swapLong) : null;
  state.connection.swapShort = data.swapShort !== undefined ? Number(data.swapShort) : null;
  state.connection.profitCalcMode = data.profitCalcMode !== undefined ? Number(data.profitCalcMode) : null;

  aggregateTickIntoCandle(state, targetPrice);

  return { symbol: state, switched };
}
