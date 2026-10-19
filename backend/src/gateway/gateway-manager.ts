import { AppStore } from "../services/app-store";
import { scalarAiDb } from "../db";
import { EaCommand, EaConfirmation, EaPosition } from "../types";
import { mt5Bridge, Mt5BridgeStatus } from "./mt5-bridge";

export interface GatewayHeartbeatPayload {
  service?: string;
  version?: string;
  symbol: string;
  accountNumber: number;
  balance: number;
  equity: number;
  margin?: number;
  freeMargin?: number;
  leverage?: number;
  broker?: string;
  currency?: string;
  terminalBuild?: number;
  isTester?: boolean;
  magic?: number;
  timestamp?: number;
}

export interface GatewayTickPayload {
  symbol: string;
  bid: number;
  ask: number;
  last?: number;
  volume?: number;
  spread?: number;
  time?: number;
}

export interface GatewayCommandRequest {
  action: "BUY" | "SELL" | "CLOSE" | "CLOSE_ALL" | "MODIFY" | "CANCEL";
  symbol?: string;
  volume?: number;
  sl?: number;
  tp?: number;
  ticket?: string | number;
  reason?: string;
}

export class GatewayManager {
  private store: AppStore;
  private lastHeartbeatTime: number = 0;
  private eaDetails: GatewayHeartbeatPayload | null = null;
  private commandQueue: EaCommand[] = [];
  private lastBridgeSyncTime: number = 0;
  private cachedBridgeStatus: Mt5BridgeStatus | null = null;
  private cachedBrokerSymbols: any[] = [];

  constructor(store: AppStore) {
    this.store = store;
  }

  public getBridgeService() {
    return mt5Bridge;
  }

  public getCachedBrokerSymbols(): any[] {
    return this.cachedBrokerSymbols;
  }

  public setCachedBrokerSymbols(symbols: any[]): void {
    this.cachedBrokerSymbols = symbols;
    this.store.setBrokerSymbols(symbols);
  }

  public getActiveSymbol(): string {
    return this.store.getActiveSymbol() || "Step Index";
  }

  public startBackgroundBridgeSync(intervalMs = 5000): void {
    setInterval(() => {
      this.syncFromMt5Bridge().catch(() => {});
    }, intervalMs);
  }

  /**
   * Sync telemetry and market state from mt5_pkg_bridge
   */
  public async syncFromMt5Bridge(): Promise<Mt5BridgeStatus> {
    try {
      const status = await mt5Bridge.getStatus();
      this.cachedBridgeStatus = status;
      this.lastBridgeSyncTime = Date.now();

      this.store.setBridgeConnected(!!status.is_connected);

      if (status.is_connected) {
        const acc = status.account;
        const activeSymbol = this.store.getActiveSymbol() || "Step Index";

        // 0. Auto-sync broker symbols catalog
        try {
          const symsRes = await mt5Bridge.getSymbols();
          if (symsRes && symsRes.success && Array.isArray(symsRes.symbols) && symsRes.symbols.length > 0) {
            this.cachedBrokerSymbols = symsRes.symbols;
            this.store.setBrokerSymbols(symsRes.symbols);
            const currentActive = this.store.getActiveSymbol();
            if (!currentActive && symsRes.symbols[0]?.name) {
              this.store.switchSymbol(symsRes.symbols[0].name);
            }
          }
        } catch {
          // quiet symbol sync
        }

        // 1. Fetch real-time tick from MT5 bridge
        let tickData: any = null;
        try {
          const tickRes = await mt5Bridge.getTick(activeSymbol);
          if (tickRes && tickRes.success && tickRes.tick) {
            tickData = tickRes.tick;
          }
        } catch {
          // quiet fallback
        }

        // 2. Update platform market state with real prices and account info
        this.store.updateMarket({
          symbol: activeSymbol,
          price: tickData ? (tickData.last || tickData.bid) : undefined,
          bid: tickData ? tickData.bid : undefined,
          ask: tickData ? tickData.ask : undefined,
          spread: tickData ? tickData.spread : undefined,
          volume: tickData ? tickData.volume : undefined,
          balance: acc?.balance,
          equity: acc?.equity,
          broker: acc?.company || acc?.server || "MetaTrader 5 Direct Bridge",
          account: String(acc?.login || ""),
          margin: acc?.margin,
          freeMargin: acc?.margin_free,
          server: acc?.server,
          leverage: acc?.leverage,
          currency: acc?.currency || "USD",
        });

        // 3. Fetch real candlestick rates from MT5 if available
        try {
          const ratesRes = await mt5Bridge.getRates(activeSymbol, 1, 100);
          if (ratesRes && ratesRes.success && Array.isArray(ratesRes.rates) && ratesRes.rates.length > 0) {
            this.store.ingestBulkCandles(
              activeSymbol,
              ratesRes.rates.map((r: any) => ({
                time: typeof r.time === "number" ? (r.time < 10000000000 ? r.time * 1000 : r.time) : Date.now(),
                open: r.open,
                high: r.high,
                low: r.low,
                close: r.close,
                volume: r.tick_volume || r.volume || 100,
              }))
            );
          }
        } catch {
          // quiet rates sync
        }

        // 4. Also sync positions if available
        const posRes = await mt5Bridge.getPositions();
        if (posRes && posRes.success && Array.isArray(posRes.positions)) {
          const eaPositions: EaPosition[] = posRes.positions.map((p: any) => ({
            ticket: p.ticket,
            symbol: p.symbol,
            type: p.type === 0 ? "BUY" : "SELL",
            lot: p.volume,
            openPrice: p.price_open,
            currentPrice: p.price_current,
            sl: p.sl,
            tp: p.tp,
            profit: p.profit,
            magic: p.magic,
            comment: p.comment,
            openTime: typeof p.time === "number" ? new Date(p.time * 1000).toISOString() : String(p.time || ""),
          }));
          this.store.handleEaPositionsReport(eaPositions);
        }

        // 5. Also sync recent closed deals into history
        try {
          const dealsRes = await mt5Bridge.getHistoryDeals(7);
          if (dealsRes && dealsRes.success && Array.isArray(dealsRes.deals) && dealsRes.deals.length > 0) {
            this.handleHistory({
              accountNumber: Number(acc?.login || 0),
              count: dealsRes.deals.length,
              deals: dealsRes.deals.map((d: any) => ({
                dealTicket: d.ticket || d.deal,
                orderTicket: d.order,
                symbol: d.symbol || activeSymbol,
                type: d.type === 0 ? "BUY" : "SELL",
                volume: d.volume,
                closePrice: d.price,
                profit: d.profit,
                closeTime: d.time,
              })),
            });
          }
        } catch {
          // quiet deals sync
        }
      }

      return status;
    } catch (err: any) {
      return {
        success: false,
        bridge: "mt5_pkg_bridge",
        version: "1.2.0",
        bridge_available: true,
        is_connected: false,
        error: err.message,
      };
    }
  }

  /**
   * Process EA Heartbeat (for backward compatibility if any EA connects)
   */
  public handleHeartbeat(payload: GatewayHeartbeatPayload) {
    this.lastHeartbeatTime = Date.now();
    this.eaDetails = payload;

    this.store.updateMarket({
      symbol: payload.symbol,
      bid: payload.balance,
      ask: payload.equity,
      balance: payload.balance,
      equity: payload.equity,
      broker: payload.broker || "MetaTrader 5 Broker",
      account: String(payload.accountNumber),
      margin: payload.margin,
      leverage: payload.leverage,
      currency: payload.currency,
    });

    this.store.addLog(
      "EA",
      "INFO",
      `Gateway Heartbeat: ${payload.symbol} | Acc #${payload.accountNumber} | Bal: $${payload.balance.toFixed(2)} | Eq: $${payload.equity.toFixed(2)}`
    );

    return {
      status: "acknowledged",
      serverTime: new Date().toISOString(),
      activeSymbol: this.store.getActiveSymbol(),
      tradingActive: this.store.getTradingState() === "active",
    };
  }

  /**
   * Process incoming real-time tick
   */
  public handleTick(payload: GatewayTickPayload) {
    this.lastHeartbeatTime = Date.now();
    const bid = Number(payload.bid);
    const ask = Number(payload.ask);
    const symbol = payload.symbol || this.store.getActiveSymbol() || "Step Index";

    this.store.updateMarket({
      symbol,
      bid,
      ask,
    });

    return { received: true, symbol, time: payload.time || Date.now() };
  }

  /**
   * Execute or queue an order command
   */
  public async queueOrderCommand(req: GatewayCommandRequest): Promise<{ commandId: string; status: string; bridgeResult?: any }> {
    const commandId = `cmd_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    let normalizedAction: "BUY" | "SELL" | "CLOSE_ALL" | "CLOSE_BY_TICKET" | "CONFIG_UPDATE" | "MODIFY_POSITION" = "BUY";
    if (req.action === "BUY") normalizedAction = "BUY";
    else if (req.action === "SELL") normalizedAction = "SELL";
    else if (req.action === "CLOSE_ALL") normalizedAction = "CLOSE_ALL";
    else if (req.action === "CLOSE") normalizedAction = "CLOSE_BY_TICKET";
    else if (req.action === "MODIFY") normalizedAction = "MODIFY_POSITION";

    const cmd: EaCommand = {
      id: commandId,
      action: normalizedAction,
      symbol: req.symbol || this.store.getActiveSymbol() || "Step Index",
      lot: req.volume ?? 0.1,
      sl: req.sl ?? 0,
      tp: req.tp ?? 0,
      ticket: req.ticket ? Number(req.ticket) : undefined,
      reason: req.reason || "MT5 Direct Bridge Order",
      timestamp: Date.now(),
      status: "pending",
    };

    // If mt5_pkg_bridge is connected, execute directly and await real MT5 response!
    let bridgeDispatched = false;
    let bridgeResult: any = null;
    if (this.cachedBridgeStatus?.is_connected) {
      bridgeDispatched = true;
      try {
        if (req.action === "BUY") {
          bridgeResult = await mt5Bridge.buy({ symbol: cmd.symbol, volume: cmd.lot, sl: cmd.sl, tp: cmd.tp, comment: cmd.reason });
        } else if (req.action === "SELL") {
          bridgeResult = await mt5Bridge.sell({ symbol: cmd.symbol, volume: cmd.lot, sl: cmd.sl, tp: cmd.tp, comment: cmd.reason });
        } else if (req.action === "CLOSE" && req.ticket) {
          bridgeResult = await mt5Bridge.close(req.ticket);
        } else if (req.action === "CLOSE_ALL") {
          bridgeResult = await mt5Bridge.closeAll();
        } else if (req.action === "MODIFY" && req.ticket) {
          bridgeResult = await mt5Bridge.modifyPosition(req.ticket, req.sl, req.tp);
        }
        this.syncFromMt5Bridge().catch(() => {});
      } catch (err: any) {
        bridgeResult = { success: false, error: err.message };
      }
    }

    this.commandQueue.push(cmd);
    this.store.addLog("SERVER", "INFO", `Order dispatched: [${cmd.action}] ${cmd.symbol} (ID: ${commandId}) via ${bridgeDispatched ? "MT5 Bridge" : "Gateway"}`);

    return {
      commandId,
      status: bridgeDispatched ? (bridgeResult?.success ? "executed_live_mt5" : "bridge_execution_failed") : "queued_for_ea",
      bridgeResult,
    };
  }

  public getPendingCommands(symbol?: string, magic?: number): EaCommand[] {
    const pending = [...this.commandQueue];
    this.commandQueue = [];
    return pending;
  }

  public handleConfirmation(conf: EaConfirmation) {
    this.lastHeartbeatTime = Date.now();
    this.store.handleEaConfirmation(conf);

    if (conf.success) {
      this.store.addLog("EA", "SUCCESS", `Execution Confirmed: [${conf.action}] on ${conf.symbol} | Ticket #${conf.ticket}`);
    } else {
      this.store.addLog("EA", "ERROR", `Execution Failed: [${conf.action}] on ${conf.symbol}: ${conf.error || "Unknown error"}`);
    }

    return { acknowledged: true };
  }

  public handlePositions(report: { accountNumber: number; count: number; positions: EaPosition[] }) {
    this.lastHeartbeatTime = Date.now();
    this.store.handleEaPositionsReport(report.positions || []);
    return { acknowledged: true, count: report.count };
  }

  public handleHistory(report: { accountNumber: number; count: number; deals: any[] }) {
    this.lastHeartbeatTime = Date.now();
    if (report.deals && Array.isArray(report.deals)) {
      for (const d of report.deals) {
        try {
          scalarAiDb.insertDeal({
            dealTicket: String(d.dealTicket),
            orderTicket: String(d.orderTicket || ""),
            symbol: d.symbol || "Step Index",
            type: d.type || "BUY",
            volume: d.volume || 0.1,
            price: d.closePrice || 0,
            profit: d.profit || 0,
            closeTime: d.closeTime ? new Date(d.closeTime * 1000).toISOString() : new Date().toISOString(),
          });
        } catch {
          // ignore duplicate
        }
      }
    }
    return { acknowledged: true, dealsSynced: report.count || 0 };
  }

  public isConnected(): boolean {
    const hasHeartbeat = Date.now() - this.lastHeartbeatTime < 20000;
    const hasBridge = !!this.cachedBridgeStatus?.is_connected;
    return hasHeartbeat || hasBridge;
  }

  public getStatus() {
    const isConn = this.isConnected();
    const storeStatus = this.store.getFullStatusPayload();
    const bridgeAcc = this.cachedBridgeStatus?.account;

    const balance = bridgeAcc?.balance !== undefined ? bridgeAcc.balance : (this.eaDetails?.balance ?? storeStatus.connection?.balance ?? 0.0);
    const equity = bridgeAcc?.equity !== undefined ? bridgeAcc.equity : (this.eaDetails?.equity ?? (storeStatus.connection?.balance !== null && storeStatus.connection?.balance !== undefined ? storeStatus.connection.balance + (storeStatus.stats?.totalProfit || 0) : 0.0));
    const margin = bridgeAcc?.margin !== undefined ? bridgeAcc.margin : (this.eaDetails?.margin ?? storeStatus.connection?.margin ?? 0.0);
    const freeMargin = bridgeAcc?.margin_free !== undefined ? bridgeAcc.margin_free : (this.eaDetails?.freeMargin ?? (equity > margin ? equity - margin : 0.0));
    const leverage = bridgeAcc?.leverage !== undefined ? bridgeAcc.leverage : (this.eaDetails?.leverage ?? storeStatus.connection?.leverage ?? 0);
    const broker = bridgeAcc?.company || bridgeAcc?.server || this.eaDetails?.broker || storeStatus.connection?.broker || (isConn ? "MetaTrader 5 Direct Bridge" : "Awaiting MT5 Connection");
     const login = bridgeAcc?.login ?? this.eaDetails?.accountNumber ?? storeStatus.connection?.accountNumber ?? "";
    const currency = bridgeAcc?.currency || this.eaDetails?.currency || storeStatus.connection?.currency || "USD";

    return {
      status: isConn ? "connected" : "ready_waiting_bridge",
      isEaConnected: isConn,
      isBridgeConnected: isConn,
      bridge: "mt5_pkg_bridge",
      bridgeVersion: "1.2.0",
      bridgeAvailable: true,
      bridgeStatus: this.cachedBridgeStatus,
      lastHeartbeat: this.lastHeartbeatTime > 0 ? new Date(this.lastHeartbeatTime).toISOString() : null,
      secondsSinceLastHeartbeat: this.lastHeartbeatTime > 0 ? Math.round((Date.now() - this.lastHeartbeatTime) / 1000) : null,
      eaDetails: this.eaDetails,
      account: {
        login,
        broker,
        server: bridgeAcc?.server || (this.eaDetails as any)?.server || (storeStatus.connection as any)?.server || "MT5 Terminal",
        currency,
        balance,
        equity,
        margin,
        freeMargin,
        leverage,
      },
      activeSymbol: storeStatus.activeSymbol || "Step Index",
      currentPrice: storeStatus.currentPrice,
      pendingCommandsCount: this.commandQueue.length,
      eaPositionsCount: storeStatus.stats?.activePositionsCount || 0,
      tradingState: this.store.getTradingState(),
    };
  }

  public getConnectedEa() {
    return this.getStatus();
  }
}
