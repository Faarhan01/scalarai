import { Request, Response } from "express";
import { AppStore } from "../../services/app-store";
import { GatewayManager } from "../../gateway/gateway-manager";
import { mt5Bridge, parseTimeframe } from "../../gateway/mt5-bridge";
import { scalarAiDb } from "../../db";
import { config } from "../config";
import { parseSymbol, parseOrderAction, parseVolume, parsePoints } from "./validation";
import { ok, error } from "./responses";

export class CotradeHandlers {
  constructor(private store: AppStore, private gateway: GatewayManager) {}

  getAccount = async (req: Request, res: Response) => {
    const status = this.store.getFullStatusPayload();
    const ea = this.gateway.getConnectedEa();
    const conn = status.connection;
    const trades = this.store.trades;
    const openTrades = trades.filter((t) => t.status === "OPEN");
    const floatingProfit = openTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
    const isConnected = this.gateway.isConnected() || !!conn?.isEaConnected;

    const balance = ea?.account?.balance !== undefined && ea.account.balance !== null ? ea.account.balance : (conn?.balance !== undefined && conn?.balance !== null ? conn.balance : 0);
    const equity = ea?.account?.equity !== undefined && ea.account.equity !== null ? ea.account.equity : ((conn as any)?.equity !== undefined && (conn as any)?.equity !== null ? (conn as any).equity : Number((balance + floatingProfit).toFixed(2)));
    const margin = ea?.account?.margin !== undefined && ea.account.margin !== null ? ea.account.margin : (conn?.margin !== undefined && conn?.margin !== null ? conn.margin : 0);
    const freeMargin = ea?.account?.freeMargin !== undefined && ea.account.freeMargin !== null ? ea.account.freeMargin : ((conn as any)?.freeMargin !== undefined && (conn as any)?.freeMargin !== null ? (conn as any).freeMargin : Number((equity - margin).toFixed(2)));
    const marginLevel = margin > 0 ? Number(((equity / margin) * 100).toFixed(2)) : 0;
    const leverage = ea?.account?.leverage !== undefined && ea.account.leverage !== null ? ea.account.leverage : (conn?.leverage || 0);
    const login = ea?.account?.login ? String(ea.account.login) : (conn?.accountNumber || "");
    const broker = ea?.account?.broker || conn?.broker || "";
    const server = (ea?.account as any)?.server || (conn as any)?.server || "";
    const currency = ea?.account?.currency || (conn as any)?.currency || "USD";

    return ok(res, {
      login,
      broker,
      server,
      currency,
      balance,
      equity,
      margin,
      freeMargin,
      marginLevel,
      leverage,
      openPositionsCount: openTrades.length,
      floatingProfit: Number(floatingProfit.toFixed(2)),
      gatewayConnected: isConnected,
      connected: isConnected,
    });
  };

  getTerminal = (req: Request, res: Response) => {
    const status = this.store.getFullStatusPayload();
    const ea = this.gateway.getConnectedEa();
    const conn = status.connection;
    const isConnected = this.gateway.isConnected() || !!conn?.isEaConnected;
    return ok(res, {
      connected: isConnected,
      terminalBuild: ea?.eaDetails?.terminalBuild || null,
      broker: ea?.account?.broker || conn?.broker || "MetaTrader 5 Direct Bridge",
      pingMs: isConnected ? 12 : null,
      mode: isConnected ? "MT5 Direct Bridge Live" : "Awaiting MT5 Terminal",
      activeSymbol: this.store.getActiveSymbol() || config.defaultSymbol,
      tradingState: this.store.getTradingState(),
    });
  };

  getTotals = (req: Request, res: Response) => {
    const trades = this.store.trades;
    const open = trades.filter((t) => t.status === "OPEN");
    const closed = trades.filter((t) => t.status === "CLOSED");
    return ok(res, {
      symbolsTotal: config.symbols.length,
      positionsTotal: open.length,
      ordersTotal: 0,
      historyDealsTotal: closed.length,
      totalVolumeTraded: Number(trades.reduce((sum, t) => sum + t.lotSize, 0).toFixed(2)),
    });
  };

  getPortfolio = (req: Request, res: Response) => {
    const status = this.store.getFullStatusPayload();
    const ea = this.gateway.getConnectedEa();
    const conn = status.connection;
    const trades = this.store.trades;
    const openTrades = trades.filter((t) => t.status === "OPEN");
    const floatingProfit = openTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
    const balance = ea?.account?.balance !== undefined && ea.account.balance !== null ? ea.account.balance : (conn?.balance !== undefined && conn?.balance !== null ? conn.balance : 0);
    const equity = ea?.account?.equity !== undefined && ea.account.equity !== null ? ea.account.equity : ((conn as any)?.equity !== undefined && (conn as any)?.equity !== null ? (conn as any).equity : Number((balance + floatingProfit).toFixed(2)));

    return ok(res, {
      account: {
        balance,
        equity,
        floatingProfit: Number(floatingProfit.toFixed(2)),
        leverage: ea?.account?.leverage || conn?.leverage || 0,
        currency: ea?.account?.currency || (conn as any)?.currency || "USD",
        login: ea?.account?.login ? String(ea.account.login) : (conn?.accountNumber || ""),
        broker: ea?.account?.broker || conn?.broker || "",
      },
      positions: openTrades.map((t) => ({
        ticket: t.ticket || t.id,
        id: t.id,
        symbol: t.symbol,
        type: t.type,
        volume: t.lotSize,
        openPrice: t.entryPrice,
        currentPrice: t.closePrice || t.entryPrice,
        sl: t.sl || 0,
        tp: t.tp || 0,
        profit: Number((t.profit || 0).toFixed(2)),
        openTime: t.openTime,
        comment: t.reason,
      })),
      orders: [],
      gatewayConnected: this.gateway.isConnected(),
    });
  };

  getSymbols = async (req: Request, res: Response) => {
    try {
      const bridgeSymbols = await mt5Bridge.getSymbols();
      if (bridgeSymbols && bridgeSymbols.success && Array.isArray(bridgeSymbols.symbols) && bridgeSymbols.symbols.length > 0) {
        this.gateway.setCachedBrokerSymbols(bridgeSymbols.symbols);
        const active = this.store.getActiveSymbol() || config.defaultSymbol;
        const mapped = bridgeSymbols.symbols.map((s: any) => ({
          symbol: s.name || s.symbol,
          category: s.path || s.category || "MT5",
          digits: s.digits ?? 2,
          point: s.point ?? 0.01,
          spread: s.spread ?? 0.5,
          bid: s.bid || 0,
          ask: s.ask || 0,
          isActive: (s.name || s.symbol).toLowerCase() === active.toLowerCase(),
        }));
        return ok(res, { count: mapped.length, symbols: mapped });
      }
    } catch {
      // fallback to cached or config
    }
    const cached = this.gateway.getCachedBrokerSymbols();
    if (cached && cached.length > 0) {
      const active = this.store.getActiveSymbol() || config.defaultSymbol;
      const mapped = cached.map((s: any) => ({
        symbol: s.name || s.symbol,
        category: s.path || s.category || "MT5",
        digits: s.digits ?? 2,
        point: s.point ?? 0.01,
        spread: s.spread ?? 0.5,
        bid: s.bid || 0,
        ask: s.ask || 0,
        isActive: (s.name || s.symbol).toLowerCase() === active.toLowerCase(),
      }));
      return ok(res, { count: mapped.length, symbols: mapped });
    }
    const status = this.store.getFullStatusPayload();
    const currPrice = status.currentPrice || 0;
    const active = this.store.getActiveSymbol() || config.defaultSymbol;
    const list = config.symbols.map((s) => ({
      ...s,
      bid: currPrice > 0 ? Number((currPrice - s.spread / 2).toFixed(s.digits)) : 0,
      ask: currPrice > 0 ? Number((currPrice + s.spread / 2).toFixed(s.digits)) : 0,
      isActive: s.symbol.toLowerCase() === active.toLowerCase(),
    }));
    return ok(res, { count: list.length, symbols: list });
  };

  getSymbolDetails = async (req: Request, res: Response) => {
    const symName = req.params.symbol;
    try {
      const info = await mt5Bridge.getSymbolInfo(symName);
      if (info && info.success && info.symbol_info) {
        const s = info.symbol_info;
        return ok(res, {
          symbol: s.name || symName,
          category: s.path || "MT5",
          digits: s.digits ?? 2,
          point: s.point ?? 0.01,
          spread: s.spread ?? 0,
          bid: s.bid || 0,
          ask: s.ask || 0,
          minVolume: s.volume_min ?? 0.01,
          maxVolume: s.volume_max ?? 50.0,
          volumeStep: s.volume_step ?? 0.01,
          derived: s._derived,
        });
      }
    } catch {
      // fallback
    }
    const found = config.symbols.find((s) => s.symbol.toLowerCase() === symName.toLowerCase()) || {
      symbol: symName,
      category: "Custom",
      digits: 2,
      point: 0.01,
      spread: 0.5,
    };
    const status = this.store.getFullStatusPayload();
    const price = status.currentPrice || 0;
    return ok(res, {
      ...found,
      bid: price > 0 ? Number((price - found.spread / 2).toFixed(found.digits)) : 0,
      ask: price > 0 ? Number((price + found.spread / 2).toFixed(found.digits)) : 0,
      minVolume: 0.01,
      maxVolume: 50.0,
      volumeStep: 0.01,
    });
  };

  getTick = async (req: Request, res: Response) => {
    const sym = req.params.symbol;
    try {
      const tickRes = await mt5Bridge.getTick(sym);
      if (tickRes && tickRes.success && tickRes.tick) {
        const t = tickRes.tick;
        return ok(res, {
          symbol: sym,
          bid: t.bid,
          ask: t.ask,
          last: t.last || t.bid,
          spread: t.spread ?? 0,
          time: typeof t.time === "number" ? new Date(t.time * 1000).toISOString() : new Date().toISOString(),
        });
      }
    } catch {
      // fallback
    }
    const status = this.store.getFullStatusPayload();
    const state = this.store.getSymbolStates().map.get(sym);
    const latestTick = state && state.ticks.length > 0 ? state.ticks[state.ticks.length - 1] : null;
    const price = latestTick ? latestTick.price : status.currentPrice;
    return ok(res, {
      symbol: sym,
      bid: latestTick?.spread ? price - latestTick.spread / 2 : price,
      ask: latestTick?.spread ? price + latestTick.spread / 2 : price,
      last: price,
      spread: latestTick?.spread ?? 0,
      time: latestTick ? new Date(latestTick.time).toISOString() : new Date().toISOString(),
    });
  };

  getCandles = async (req: Request, res: Response) => {
    const sym = req.params.symbol;
    const limit = Math.min(Number(req.query.count || 200), 1000);
    const tfStr = (req.query.timeframe as string) || "M1";
    const tfNum = parseTimeframe(tfStr);
    try {
      const ratesRes = await mt5Bridge.getRates(sym, tfNum, limit);
      if (ratesRes && ratesRes.success && Array.isArray(ratesRes.rates) && ratesRes.rates.length > 0) {
        return ok(res, {
          symbol: sym,
          timeframe: tfStr,
          count: ratesRes.rates.length,
          candles: ratesRes.rates.map((c: any) => ({
            time: typeof c.time === "number" ? (c.time < 10000000000 ? c.time * 1000 : c.time) : c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.tick_volume || c.volume || 100,
          })),
        });
      }
    } catch {
      // fallback to db
    }
    // Fall back to the database. The timeframe has to be carried through, or
    // the fallback returns every timeframe stored for the symbol mixed
    // together and the chart draws bars of different sizes on one axis.
    const candles = scalarAiDb.getCandles(sym, undefined, undefined, limit, tfStr);
    return ok(res, {
      symbol: sym,
      timeframe: tfStr,
      count: candles.length,
      candles: candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 100,
        spread: c.spread ?? 0,
      })),
    });
  };

  getPositions = async (req: Request, res: Response) => {
    if (this.gateway.isConnected()) {
      try {
        const bridgePos = await mt5Bridge.getPositions();
        if (bridgePos && bridgePos.success && Array.isArray(bridgePos.positions)) {
          return ok(res, { count: bridgePos.positions.length, positions: bridgePos.positions });
        }
      } catch {
        // quiet fallback
      }
    }
    const trades = this.store.trades;
    const openTrades = trades.filter((t) => t.status === "OPEN");
    return ok(res, {
      count: openTrades.length,
      positions: openTrades.map((t) => ({
        ticket: t.mt5Ticket || t.ticket || t.id,
        id: t.id,
        symbol: t.symbol,
        type: t.type,
        volume: t.lotSize,
        openPrice: t.entryPrice,
        currentPrice: t.closePrice || t.entryPrice,
        sl: t.sl || 0,
        tp: t.tp || 0,
        profit: Number((t.profit || 0).toFixed(2)),
        openTime: t.openTime,
        comment: t.reason,
      })),
    });
  };

  executeModify = async (req: Request, res: Response) => {
    try {
      const { ticket, id, sl, tp } = req.body || {};
      const tradeId = String(ticket || id || "");
      if (!tradeId) return error(res, "Missing trade ticket or id", 400);

      const parsedSl = sl !== undefined && sl !== null ? Number(sl) : undefined;
      const parsedTp = tp !== undefined && tp !== null ? Number(tp) : undefined;

      if (this.gateway.isConnected()) {
        const queued = await this.gateway.queueOrderCommand({
          action: "MODIFY",
          symbol: this.store.getActiveSymbol() || config.defaultSymbol,
          ticket: tradeId,
          sl: parsedSl,
          tp: parsedTp,
          reason: `Modify SL/TP on Ticket #${tradeId}`,
        });
        return ok(res, { success: true, mode: "EA_GATEWAY", ...queued });
      }

      const modified = await this.store.modifyTrade(tradeId, { sl: parsedSl, tp: parsedTp });
      return ok(res, { success: true, ...modified });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  };

  checkOrder = (req: Request, res: Response) => {
    const { symbol, volume = 0.1, type = "BUY" } = req.body || {};
    const sym = parseSymbol(symbol, this.store.getActiveSymbol() || config.defaultSymbol);
    const status = this.store.getFullStatusPayload();
    const gw = this.gateway.getStatus();
    const balance = gw?.account?.balance ?? status.connection?.balance ?? 0.0;
    const vol = parseVolume(volume);
    const marginReq = Number((vol * 100).toFixed(2));
    const isValid = balance >= marginReq;

    return ok(res, {
      retcode: isValid ? 0 : 10019,
      retcodeDescription: isValid ? "TRADE_RETCODE_DONE" : "TRADE_RETCODE_NO_MONEY",
      symbol: sym,
      volume: vol,
      type: parseOrderAction(type),
      margin: marginReq,
      marginFree: Math.max(0, balance - marginReq),
      marginLevel: marginReq > 0 ? ((balance / marginReq) * 100).toFixed(1) : 0,
      valid: isValid,
    });
  };

  executeBuy = async (req: Request, res: Response) => {
    try {
      const { volume = 0.1, symbol, sl, tp, reason = "Cotrade Quick Buy" } = req.body || {};
      const sym = parseSymbol(symbol, this.store.getActiveSymbol() || config.defaultSymbol);
      const conf = this.store.config;
      const vol = parseVolume(volume);

      if (this.gateway.isConnected()) {
        const queued = await this.gateway.queueOrderCommand({
          action: "BUY",
          symbol: sym,
          volume: vol,
          sl: parsePoints(sl) ?? conf.stopLossPoints,
          tp: parsePoints(tp) ?? conf.takeProfitPoints,
          reason,
        });
        return ok(res, { success: true, mode: "EA_GATEWAY", ...queued });
      }

      const trade = await this.store.placeTrade("BUY", reason, {
        symbol: sym,
        lotSize: vol,
        sl: parsePoints(sl) ?? conf.stopLossPoints,
        tp: parsePoints(tp) ?? conf.takeProfitPoints,
      });
      return ok(res, { success: true, mode: "PLATFORM_ENGINE", trade });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  };

  executeSell = async (req: Request, res: Response) => {
    try {
      const { volume = 0.1, symbol, sl, tp, reason = "Cotrade Quick Sell" } = req.body || {};
      const sym = parseSymbol(symbol, this.store.getActiveSymbol() || config.defaultSymbol);
      const conf = this.store.config;
      const vol = parseVolume(volume);

      if (this.gateway.isConnected()) {
        const queued = await this.gateway.queueOrderCommand({
          action: "SELL",
          symbol: sym,
          volume: vol,
          sl: parsePoints(sl) ?? conf.stopLossPoints,
          tp: parsePoints(tp) ?? conf.takeProfitPoints,
          reason,
        });
        return ok(res, { success: true, mode: "EA_GATEWAY", ...queued });
      }

      const trade = await this.store.placeTrade("SELL", reason, {
        symbol: sym,
        lotSize: vol,
        sl: parsePoints(sl) ?? conf.stopLossPoints,
        tp: parsePoints(tp) ?? conf.takeProfitPoints,
      });
      return ok(res, { success: true, mode: "PLATFORM_ENGINE", trade });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  };

  closePosition = async (req: Request, res: Response) => {
    try {
      const { ticket, id } = req.body || {};
      const tradeId = id || String(ticket || "");
      if (!tradeId) return error(res, "Missing trade ticket or id", 400);

      if (this.gateway.isConnected()) {
        const queued = await this.gateway.queueOrderCommand({
          action: "CLOSE",
          symbol: this.store.getActiveSymbol() || config.defaultSymbol,
          volume: 0,
          ticket: tradeId,
          reason: `Close Ticket #${tradeId}`,
        });
        return ok(res, { success: true, mode: "EA_GATEWAY", ...queued });
      }

      const closed = await this.store.closeTrade(tradeId);
      return ok(res, { success: true, closed });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  };

  closeAllPositions = async (req: Request, res: Response) => {
    try {
      if (this.gateway.isConnected()) {
        const queued = await this.gateway.queueOrderCommand({
          action: "CLOSE_ALL",
          symbol: this.store.getActiveSymbol() || config.defaultSymbol,
          volume: 0,
          reason: "Close all positions from web",
        });
        return ok(res, { success: true, mode: "EA_GATEWAY", ...queued });
      }

      const count = await this.store.closeAllTrades();
      return ok(res, { success: true, closedCount: count });
    } catch (err: any) {
      return error(res, err.message, 500);
    }
  };

  calculateProfit = async (req: Request, res: Response) => {
    const { action = "BUY", volume = 0.1, openPrice, closePrice, symbol } = req.body || {};
    const sym = parseSymbol(symbol, this.store.getActiveSymbol() || config.defaultSymbol);
    const act = parseOrderAction(action);
    const vol = parseVolume(volume);
    const oPrice = Number(openPrice) || 0;
    const cPrice = Number(closePrice) || oPrice;

    if (this.gateway.isConnected() && oPrice > 0 && cPrice > 0) {
      try {
        const bridgeRes = await mt5Bridge.calcProfit(act, sym, vol, oPrice, cPrice);
        if (bridgeRes && bridgeRes.success && bridgeRes.profit !== undefined && bridgeRes.profit !== null) {
          return ok(res, { symbol: sym, action: act, volume: vol, openPrice: oPrice, closePrice: cPrice, profit: Number(bridgeRes.profit.toFixed(2)) });
        }
      } catch {
        // fallback
      }
    }
    const diff = act === "BUY" ? cPrice - oPrice : oPrice - cPrice;
    const profit = Number((diff * 10 * vol).toFixed(2));
    return ok(res, { symbol: sym, action: act, volume: vol, openPrice: oPrice, closePrice: cPrice, profit });
  };

  calculateMargin = async (req: Request, res: Response) => {
    const { volume = 0.1, leverage = 100, symbol, price } = req.body || {};
    const sym = parseSymbol(symbol, this.store.getActiveSymbol() || config.defaultSymbol);
    const vol = parseVolume(volume);
    const lev = Number(leverage) || 100;
    const status = this.store.getFullStatusPayload();
    const currPrice = Number(price) || status.currentPrice || 0;

    if (this.gateway.isConnected() && currPrice > 0) {
      try {
        const bridgeRes = await mt5Bridge.calcMargin(parseOrderAction("BUY"), sym, vol, currPrice);
        if (bridgeRes && bridgeRes.success && bridgeRes.margin !== undefined && bridgeRes.margin !== null) {
          return ok(res, { symbol: sym, volume: vol, leverage: lev, marginRequired: Number(bridgeRes.margin.toFixed(2)) });
        }
      } catch {
        // fallback
      }
    }
    const margin = currPrice > 0 ? Number(((vol * currPrice * 10) / lev).toFixed(2)) : 0;
    return ok(res, { symbol: sym, volume: vol, leverage: lev, marginRequired: margin });
  };

  getHistoryDeals = async (req: Request, res: Response) => {
    const days = Number(req.query.days || 30);
    if (this.gateway.isConnected()) {
      try {
        const resBridge = await mt5Bridge.getHistoryDeals(days);
        if (resBridge && resBridge.success && Array.isArray(resBridge.deals) && resBridge.deals.length > 0) {
          return ok(res, {
            count: resBridge.deals.length,
            deals: resBridge.deals.map((d: any) => ({
              deal: d.ticket || d.deal,
              order: d.order,
              time: typeof d.time === "number" ? new Date(d.time * 1000).toISOString() : String(d.time || ""),
              symbol: d.symbol,
              type: d.type === 0 ? "BUY" : "SELL",
              volume: d.volume,
              price: d.price,
              profit: d.profit,
              comment: d.comment,
            })),
          });
        }
      } catch {
        // fallback
      }
    }
    const closed = this.store.trades.filter((t) => t.status === "CLOSED");
    return ok(res, {
      count: closed.length,
      deals: closed.map((t) => ({
        deal: t.ticket || t.id,
        order: t.ticket || t.id,
        time: t.closeTime || t.openTime,
        symbol: t.symbol,
        type: t.type,
        volume: t.lotSize,
        price: t.closePrice || t.entryPrice,
        profit: t.profit,
        comment: t.reason,
      })),
    });
  };

  getHistoryOrders = async (req: Request, res: Response) => {
    const days = Number(req.query.days || 30);
    if (this.gateway.isConnected()) {
      try {
        const resBridge = await mt5Bridge.getHistoryOrders(days);
        if (resBridge && resBridge.success && Array.isArray(resBridge.orders) && resBridge.orders.length > 0) {
          return ok(res, {
            count: resBridge.orders.length,
            orders: resBridge.orders.map((o: any) => ({
              ticket: o.ticket,
              timeSetup: typeof o.time_setup === "number" ? new Date(o.time_setup * 1000).toISOString() : String(o.time_setup || ""),
              type: o.type === 0 ? "BUY" : "SELL",
              state: o._state || "ORDER_STATE_FILLED",
              volumeInitial: o.volume_initial || o.volume_current,
              priceOpen: o.price_open,
              sl: o.sl || 0,
              tp: o.tp || 0,
              symbol: o.symbol,
              comment: o.comment,
            })),
          });
        }
      } catch {
        // fallback
      }
    }
    const trades = this.store.trades;
    return ok(res, {
      count: trades.length,
      orders: trades.map((t) => ({
        ticket: t.ticket || t.id,
        timeSetup: t.openTime,
        type: t.type,
        state: t.status === "OPEN" ? "ORDER_STATE_PLACED" : "ORDER_STATE_FILLED",
        volumeInitial: t.lotSize,
        priceOpen: t.entryPrice,
        sl: t.sl || 0,
        tp: t.tp || 0,
        symbol: t.symbol,
        comment: t.reason,
      })),
    });
  };
}
