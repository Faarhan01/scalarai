import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

export interface Mt5BridgeStatus {
  success: boolean;
  bridge: string;
  version: string;
  bridge_available: boolean;
  is_connected: boolean;
  connection_info?: Record<string, unknown>;
  account?: any;
  terminal?: any;
  server_time?: string;
  python_version?: string;
  error?: string;
}

export const MT5_TIMEFRAMES: Record<string, number> = {
  M1: 1,
  M2: 2,
  M3: 3,
  M4: 4,
  M5: 5,
  M6: 6,
  M10: 10,
  M12: 12,
  M15: 15,
  M20: 20,
  M30: 30,
  H1: 16384,
  H2: 16385,
  H3: 16386,
  H4: 16388,
  H6: 16390,
  H8: 16392,
  H12: 16396,
  D1: 16408,
  W1: 32769,
  MN1: 49153,
};

export function parseTimeframe(tf?: string | number): number {
  if (typeof tf === "number" && !isNaN(tf)) return tf;
  if (typeof tf === "string") {
    const upper = tf.trim().toUpperCase();
    if (upper in MT5_TIMEFRAMES) return MT5_TIMEFRAMES[upper];
    const parsed = parseInt(tf, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 1;
}

export class Mt5BridgeService {
  private scriptPath: string;

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.scriptPath = path.resolve(__dirname, "mt5_bridge_cli.py");
  }

  /**
   * Execute a command on the Python mt5_pkg_bridge CLI
   */
  public async executeCommand<T = any>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    const pythonBin = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
    return new Promise((resolve) => {
      const child = spawn(pythonBin, [this.scriptPath, command, JSON.stringify(args)], {
        timeout: 10000,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("close", (code) => {
        if (code !== 0 && !stdout.trim()) {
          resolve({
            success: false,
            error: stderr.trim() || `mt5_bridge_cli exited with code ${code}`,
          } as T);
          return;
        }

        try {
          // Find first { and last } to safely parse json even if python printed a warning
          const start = stdout.indexOf("{");
          const end = stdout.lastIndexOf("}");
          if (start >= 0 && end > start) {
            const parsed = JSON.parse(stdout.slice(start, end + 1));
            resolve(parsed);
          } else {
            resolve({
              success: false,
              error: `Invalid JSON from bridge: ${stdout || stderr}`,
            } as T);
          }
        } catch (err: any) {
          resolve({
            success: false,
            error: `Failed to parse bridge output: ${err.message}`,
            raw: stdout,
          } as T);
        }
      });

      child.on("error", (err) => {
        resolve({
          success: false,
          error: `Failed to spawn python3: ${err.message}`,
        } as T);
      });
    });
  }

  public async getStatus(): Promise<Mt5BridgeStatus> {
    const status = await this.executeCommand<Mt5BridgeStatus>("status");
    if (status && status.bridge_available && !status.is_connected) {
      try {
        const acc = await this.getAccount();
        if (acc && acc.success && acc.account) {
          status.is_connected = true;
          status.account = acc.account;
        }
      } catch {
        // quiet
      }
    }
    return status;
  }

  public async connect(config: Record<string, unknown> = {}): Promise<any> {
    return this.executeCommand("connect", config);
  }

  public async disconnect(): Promise<any> {
    return this.executeCommand("disconnect");
  }

  public async getAccount(): Promise<any> {
    return this.executeCommand("account");
  }

  public async getTerminal(): Promise<any> {
    return this.executeCommand("terminal");
  }

  public async getSymbols(group?: string): Promise<any> {
    return this.executeCommand("symbols", group ? { group } : {});
  }

  public async getSymbolInfo(symbol: string): Promise<any> {
    return this.executeCommand("symbol_info", { symbol });
  }

  public async getTick(symbol: string): Promise<any> {
    return this.executeCommand("tick", { symbol });
  }

  public async getRates(symbol: string, timeframe: number | string = 1, count = 100): Promise<any> {
    const tfInt = parseTimeframe(timeframe);
    return this.executeCommand("rates", { symbol, timeframe: tfInt, count });
  }

  public async getPositions(): Promise<any> {
    return this.executeCommand("positions");
  }

  public async getHistoryDeals(days = 30): Promise<any> {
    return this.executeCommand("history_deals", { days });
  }

  public async getHistoryOrders(days = 30): Promise<any> {
    return this.executeCommand("history_orders", { days });
  }

  public async buy(params: { symbol: string; volume: number; sl?: number; tp?: number; comment?: string }): Promise<any> {
    return this.executeCommand("buy", params);
  }

  public async sell(params: { symbol: string; volume: number; sl?: number; tp?: number; comment?: string }): Promise<any> {
    return this.executeCommand("sell", params);
  }

  public async close(ticket: number | string): Promise<any> {
    return this.executeCommand("close", { ticket });
  }

  public async closeAll(): Promise<any> {
    return this.executeCommand("close_all");
  }

  public async modifyPosition(ticket: number | string, sl?: number, tp?: number): Promise<any> {
    return this.executeCommand("modify", { ticket, sl, tp });
  }

  public async getOrders(symbol?: string): Promise<any> {
    return this.executeCommand("orders", { symbol });
  }

  public async getMarketBook(symbol: string): Promise<any> {
    return this.executeCommand("market_book", { symbol });
  }

  public async getTotals(): Promise<any> {
    return this.executeCommand("totals");
  }

  public async listFunctions(): Promise<any> {
    return this.executeCommand("functions");
  }

  public async executeFunction(functionName: string, args: any[] = [], kwargs: Record<string, any> = {}): Promise<any> {
    return this.executeCommand("call", { function: functionName, args, kwargs });
  }

  public async calcMargin(action: string, symbol: string, volume: number, price = 0): Promise<any> {
    return this.executeCommand("calc_margin", { action, symbol, volume, price });
  }

  public async calcProfit(action: string, symbol: string, volume: number, openPrice: number, closePrice: number): Promise<any> {
    return this.executeCommand("calc_profit", { action, symbol, volume, open_price: openPrice, close_price: closePrice });
  }
}

export const mt5Bridge = new Mt5BridgeService();
