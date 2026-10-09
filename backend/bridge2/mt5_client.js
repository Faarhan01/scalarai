/**
 * ScalarAI Bridge 2 - MetaTrader 5 Terminal Client
 * Interfaces with MetaTrader 5 via Terminal CLI execution, file IPC, and simulated EA fallback.
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { EventEmitter } from "events";
import { config } from "./config.js";

export class MT5Client extends EventEmitter {
  constructor(options = {}) {
    super();
    this.customPath = options.mt5Path || config.mt5Path;
    this.dataPath = options.mt5DataPath || config.mt5DataPath;
    this.magicNumber = options.magicNumber || config.magicNumber;
    this.activeSymbol = options.defaultSymbol || config.defaultSymbol;

    // Local state cache
    this.account = {
      login: 88204192,
      server: "Deriv-Server",
      broker: "Deriv Limited",
      currency: "USD",
      balance: 10000.0,
      equity: 10000.0,
      margin: 0.0,
      freeMargin: 10000.0,
      leverage: 100,
      isLive: false,
    };

    this.positions = new Map();
    this.nextTicket = 100001;
    this.terminalPath = this.resolveTerminalPath();
    this.isEaAttached = false;
    this.lastTickTime = Date.now();

    // Set up file-based IPC communication directory if specified
    this.ipcDir = this.resolveIpcDirectory();
    this.initIpcDirectory();
  }

  /**
   * Auto-discover terminal64.exe across Windows, Wine, and custom paths
   */
  resolveTerminalPath() {
    if (this.customPath && fs.existsSync(this.customPath)) {
      return this.customPath;
    }

    const isWindows = process.platform === "win32";
    const candidates = [
      this.customPath,
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "MetaTrader 5", "terminal64.exe") : "",
      process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "MetaTrader 5", "terminal64.exe") : "",
      process.env.APPDATA ? path.join(process.env.APPDATA, "MetaQuotes", "Terminal", "terminal64.exe") : "",
      // Wine paths on Linux / macOS
      path.join(process.env.HOME || "", ".wine", "drive_c", "Program Files", "MetaTrader 5", "terminal64.exe"),
      path.join(process.env.HOME || "", ".wine", "drive_c", "Program Files (x86)", "MetaTrader 5", "terminal64.exe"),
      "terminal64.exe",
      "terminal.exe",
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Discover or create shared IPC directory (Terminal/Common/Files or local data/ipc)
   */
  resolveIpcDirectory() {
    if (this.dataPath && fs.existsSync(this.dataPath)) {
      return this.dataPath;
    }

    // Windows MetaQuotes Common Files path
    if (process.platform === "win32" && process.env.APPDATA) {
      const commonDir = path.join(process.env.APPDATA, "MetaQuotes", "Terminal", "Common", "Files", "ScalarAI");
      return commonDir;
    }

    // Local fallback directory
    return path.resolve(process.cwd(), "backend", "data", "mt5_ipc");
  }

  initIpcDirectory() {
    try {
      if (!fs.existsSync(this.ipcDir)) {
        fs.mkdirSync(this.ipcDir, { recursive: true });
      }
    } catch {
      // Ignore directory creation failure
    }
  }

  /**
   * Returns current terminal and bridge status
   */
  getStatus() {
    return {
      connected: !!this.terminalPath || this.isEaAttached,
      terminalPath: this.terminalPath || "Not detected (running in High-Fidelity Simulation / EA Socket mode)",
      platform: "MetaTrader 5 (x64)",
      account: this.account,
      activeSymbol: this.activeSymbol,
      openPositionsCount: this.positions.size,
      magicNumber: this.magicNumber,
      ipcDirectory: this.ipcDir,
      lastHeartbeat: new Date(this.lastTickTime).toISOString(),
    };
  }

  getAccountInfo() {
    this.recalculateEquity();
    return { ...this.account };
  }

  getPositions(symbol = null) {
    this.recalculateEquity();
    const list = Array.from(this.positions.values());
    if (symbol) {
      return list.filter((p) => p.symbol.toLowerCase() === symbol.toLowerCase());
    }
    return list;
  }

  recalculateEquity() {
    let totalProfit = 0;
    let totalMargin = 0;
    for (const pos of this.positions.values()) {
      totalProfit += Number(pos.profit || 0);
      totalMargin += Number(pos.volume * 100);
    }
    this.account.equity = Number((this.account.balance + totalProfit).toFixed(2));
    this.account.margin = Number(totalMargin.toFixed(2));
    this.account.freeMargin = Number((this.account.equity - this.account.margin).toFixed(2));
  }

  /**
   * Execute BUY or SELL order directly
   */
  async placeTrade({ symbol, type, volume, sl, tp, comment }) {
    const sym = symbol || this.activeSymbol;
    const action = (type || "BUY").toUpperCase();
    const lot = Math.max(0.01, Number(volume || config.defaultLotSize));
    const slPts = sl !== undefined ? Number(sl) : config.defaultSlPoints;
    const tpPts = tp !== undefined ? Number(tp) : config.defaultTpPoints;
    const ticket = this.nextTicket++;

    // Simulated market price for calculation
    const basePrice = sym.includes("Step") ? 1250.0 : 1.085;
    const spread = 0.2;
    const openPrice = action === "BUY" ? basePrice + spread : basePrice;

    // Calculate absolute SL / TP if points provided
    const slPrice = slPts > 0 ? (action === "BUY" ? openPrice - slPts * 0.1 : openPrice + slPts * 0.1) : 0;
    const tpPrice = tpPts > 0 ? (action === "BUY" ? openPrice + tpPts * 0.1 : openPrice - tpPts * 0.1) : 0;

    const newPosition = {
      ticket,
      symbol: sym,
      type: action,
      volume: lot,
      openPrice: Number(openPrice.toFixed(4)),
      currentPrice: Number(openPrice.toFixed(4)),
      sl: Number(slPrice.toFixed(4)),
      tp: Number(tpPrice.toFixed(4)),
      slPoints: slPts,
      tpPoints: tpPts,
      profit: 0.0,
      openTime: new Date().toISOString(),
      comment: comment || `ScalarAI Bridge2 (${this.magicNumber})`,
      magic: this.magicNumber,
    };

    this.positions.set(ticket, newPosition);
    this.recalculateEquity();

    // If native MT5 terminal is found, dispatch command line or IPC file
    if (this.terminalPath) {
      this.dispatchTerminalCommand("TRADE", {
        action,
        symbol: sym,
        volume: lot,
        sl: slPrice,
        tp: tpPrice,
        ticket,
      });
    }

    this.writeIpcCommand("NEW_ORDER", newPosition);

    return {
      success: true,
      ticket,
      symbol: sym,
      type: action,
      volume: lot,
      openPrice,
      sl: slPrice,
      tp: tpPrice,
      message: `Executed ${action} order on ${sym} (Ticket: ${ticket}, Lots: ${lot})`,
    };
  }

  /**
   * Close a specific open trade
   */
  async closeTrade(ticket) {
    const tNum = Number(ticket);
    const position = this.positions.get(tNum);

    if (!position) {
      return { success: false, message: `Position ticket ${ticket} not found or already closed.` };
    }

    this.positions.delete(tNum);
    this.account.balance += position.profit;
    this.recalculateEquity();

    if (this.terminalPath) {
      this.dispatchTerminalCommand("CLOSE", { ticket: tNum });
    }

    this.writeIpcCommand("CLOSE_ORDER", { ticket: tNum, symbol: position.symbol });

    return {
      success: true,
      ticket: tNum,
      closedProfit: position.profit,
      message: `Successfully closed position #${tNum} on ${position.symbol}`,
    };
  }

  /**
   * Close all open positions (optionally filtered by symbol)
   */
  async closeAllPositions(symbol = null) {
    const toClose = [];
    for (const [ticket, pos] of this.positions.entries()) {
      if (!symbol || pos.symbol.toLowerCase() === symbol.toLowerCase()) {
        toClose.push(ticket);
      }
    }

    let closedCount = 0;
    for (const ticket of toClose) {
      await this.closeTrade(ticket);
      closedCount++;
    }

    if (this.terminalPath) {
      this.dispatchTerminalCommand("CLOSE_ALL", { symbol: symbol || "" });
    }

    this.writeIpcCommand("CLOSE_ALL", { symbol: symbol || "" });

    return {
      success: true,
      closedCount,
      message: `Closed ${closedCount} position(s)${symbol ? ` on ${symbol}` : " globally"}.`,
    };
  }

  /**
   * Modify SL / TP points of an active trade
   */
  async modifyPosition(ticket, { sl, tp }) {
    const tNum = Number(ticket);
    const pos = this.positions.get(tNum);

    if (!pos) {
      return { success: false, message: `Position ticket ${ticket} not found.` };
    }

    if (sl !== undefined) pos.slPoints = Number(sl);
    if (tp !== undefined) pos.tpPoints = Number(tp);

    if (this.terminalPath) {
      this.dispatchTerminalCommand("MODIFY", { ticket: tNum, sl: pos.slPoints, tp: pos.tpPoints });
    }

    this.writeIpcCommand("MODIFY_ORDER", { ticket: tNum, sl: pos.slPoints, tp: pos.tpPoints });

    return {
      success: true,
      ticket: tNum,
      sl: pos.slPoints,
      tp: pos.tpPoints,
      message: `Modified position #${tNum}: SL=${pos.slPoints}pts, TP=${pos.tpPoints}pts`,
    };
  }

  /**
   * Dispatches trade command to native MT5 terminal process
   */
  dispatchTerminalCommand(action, params) {
    if (!this.terminalPath) return;

    try {
      const args = [`/cmd:${action.toLowerCase()}`, ...Object.entries(params).map(([k, v]) => `${k}=${v}`)];
      const child = spawn(this.terminalPath, args, { detached: true, stdio: "ignore" });
      child.unref();
    } catch (err) {
      // Terminal command dispatch non-fatal
    }
  }

  /**
   * Writes command to shared IPC queue for MQL5 Expert Advisor to read
   */
  writeIpcCommand(type, payload) {
    try {
      const file = path.join(this.ipcDir, "pending_commands.json");
      let queue = [];
      if (fs.existsSync(file)) {
        try {
          queue = JSON.parse(fs.readFileSync(file, "utf-8"));
        } catch {}
      }
      queue.push({
        id: Date.now() + Math.random().toString(36).substring(2, 7),
        type,
        payload,
        timestamp: Date.now(),
        status: "pending",
      });
      fs.writeFileSync(file, JSON.stringify(queue, null, 2));
    } catch {}
  }
}

export default MT5Client;
