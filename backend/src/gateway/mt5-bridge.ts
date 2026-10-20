import { spawn, spawnSync, ChildProcessWithoutNullStreams } from "child_process";
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

/**
 * MT5 period codes.
 *
 * These must match the installed MetaTrader5 package exactly. H1, H2 and H3
 * were off by one here: the map had H1 = 16384, but the package's
 * TIMEFRAME_H1 is 16385. MT5 has no period 16384, so a request for H1 came
 * back empty and the chart's H1 button showed nothing. The bridge's Python
 * side reads these from the package rather than hardcoding them, which is why
 * it was right and this was not.
 */
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
  H1: 16385,
  H2: 16386,
  H3: 16387,
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

/**
 * Find a Python interpreter that can actually load the MetaTrader5 package.
 *
 * The bare name "python" is not enough. Windows ships an App Execution Alias
 * at C:\Users\<user>\AppData\Local\Microsoft\WindowsApps\python.exe, and
 * a PATH that puts it first resolves to it. That stub starts the interpreter
 * but the MetaTrader5 package then fails to load its own DLL, and the process
 * dies with STATUS_DLL_INIT_FAILED -- exit code 3221225794, with nothing on
 * stderr. The failure looks like a bridge problem and is not one.
 *
 * So: try the candidates, and keep the first that can import MetaTrader5.
 * PYTHON_BIN wins if it is set and works.
 */
function resolvePython(): string {
  const candidates: string[] = [];

  if (process.env.PYTHON_BIN) candidates.push(process.env.PYTHON_BIN);
  if (process.platform === "win32") {
    candidates.push("python", "py -3", "python3");
  } else {
    candidates.push("python3", "python");
  }

  for (const cand of candidates) {
    const parts = cand.split(" ");
    const bin = parts[0];
    const extra = parts.slice(1);
    try {
      const r = spawnSync(bin, [...extra, "-c", "import MetaTrader5"], {
        timeout: 15000,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });
      if (r.status === 0) return cand;
    } catch {
      // try the next candidate
    }
  }

  // Nothing verified. Fall back to the plain name and let the error say so.
  return process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
}

export class Mt5BridgeService {
  private scriptPath: string;
  private pythonBin: string;

  /**
   * Serialises bridge calls.
   *
   * Every command is a separate Python process, and each one attaches to the
   * MetaTrader 5 terminal. Two of those at the same time make the second die
   * with STATUS_DLL_INIT_FAILED (exit code 3221225794) and nothing on stderr,
   * because the MetaTrader5 package cannot load its DLL while another process
   * holds the terminal.
   *
   * The gateway manager polls six bridge calls per cycle and the MCP server
   * polls on its own timer, so overlaps were routine -- an MCP call would
   * fail whenever it landed during a poll.
   *
   * Chaining the calls means only one Python process is attached at a time.
   */
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * The persistent bridge worker.
   *
   * One Python process, started once, holding the MetaTrader 5 connection.
   * Commands go down stdin as JSON lines and answers come back on stdout.
   *
   * Before this, every command spawned a process that attached to the
   * terminal and detached again. The gateway manager polls six commands every
   * five seconds and each attach takes about a second, so the terminal was
   * held almost continuously. Any other command arriving in that window died
   * with STATUS_DLL_INIT_FAILED (exit 3221225794, no stderr) because the
   * MetaTrader5 package cannot load its DLL while another process holds the
   * terminal.
   *
   * A single long-lived process removes the contention entirely, and takes a
   * command from about a second to a few milliseconds.
   */
  private worker: ChildProcessWithoutNullStreams | null = null;
  private workerBuffer = "";
  private workerPending = new Map<number, { resolve: (v: any) => void; timer: NodeJS.Timeout }>();
  private nextRequestId = 1;

  /**
   * Make sure the worker is up. Returns null if it cannot be started, in
   * which case the caller falls back to a one-shot spawn.
   */
  private ensureWorker(): ChildProcessWithoutNullStreams | null {
    if (this.worker && !this.worker.killed && !this.worker.exitCode) return this.worker;

    try {
      const child = spawn(this.pythonBin, [this.scriptPath, "serve", "{}"], {
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        stdio: ["pipe", "pipe", "pipe"],
      }) as ChildProcessWithoutNullStreams;

      child.stdout.on("data", (chunk: Buffer) => this.onWorkerData(chunk));
      child.stderr.on("data", () => { /* the worker reports errors as JSON on stdout */ });
      child.on("exit", () => {
        // Fail anything still in flight; the next command starts a new worker.
        this.worker = null;
        for (const [, p] of this.workerPending) {
          clearTimeout(p.timer);
          p.resolve({ success: false, error: "bridge worker exited" });
        }
        this.workerPending.clear();
      });

      this.worker = child;
      return child;
    } catch {
      this.worker = null;
      return null;
    }
  }

  /** Split the worker's stdout into lines and answer each request. */
  private onWorkerData(chunk: Buffer): void {
    this.workerBuffer += chunk.toString();
    let idx: number;
    while ((idx = this.workerBuffer.indexOf("\n")) >= 0) {
      const line = this.workerBuffer.slice(0, idx).trim();
      this.workerBuffer = this.workerBuffer.slice(idx + 1);
      if (!line) continue;
      let parsed: any;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const pending = this.workerPending.get(parsed?.id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.workerPending.delete(parsed.id);
      // A command that takes this long means the worker is oversubscribed.
      // Log it, because the symptom otherwise shows up only as slow tool calls.
      if (typeof parsed._ms === "number" && parsed._ms > 200) {
        console.warn(
          `[mt5-bridge] slow command: ${parsed._ms}ms  (worker reported)`,
        );
      }
      pending.resolve(parsed);
    }
  }

  /** Send one command to the persistent worker. */
  private sendToWorker<T>(command: string, args: Record<string, unknown>, timeoutMs: number): Promise<T> {
    return new Promise((resolve) => {
      const child = this.ensureWorker();
      if (!child) {
        resolve({ success: false, error: "could not start the bridge worker" } as T);
        return;
      }
      const id = this.nextRequestId++;
      const timer = setTimeout(() => {
        this.workerPending.delete(id);
        resolve({ success: false, error: `bridge worker timed out after ${timeoutMs}ms` } as T);
      }, timeoutMs);
      this.workerPending.set(id, { resolve, timer });
      try {
        child.stdin.write(JSON.stringify({ id, command, args }) + "\n");
      } catch (err: any) {
        clearTimeout(timer);
        this.workerPending.delete(id);
        resolve({ success: false, error: `bridge worker write failed: ${err?.message || err}` } as T);
      }
    });
  }

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.scriptPath = path.resolve(__dirname, "mt5_bridge_cli.py");
    this.pythonBin = resolvePython();
  }

  /**
   * Execute a command on the Python mt5_pkg_bridge CLI
   */
  public async executeCommand<T = any>(command: string, args: Record<string, unknown> = {}, timeoutMs: number = 10000): Promise<T> {
    // The worker holds the terminal on its own, so commands no longer need to
    // be serialised against each other. The queue is kept for the one-shot
    // fallback path, where two attaches really would collide.
    const useWorker = !!this.ensureWorker();
    if (useWorker) return this.sendToWorker<T>(command, args, timeoutMs);

    const run = this.queue.then(
      () => this.spawnCli<T>(command, args, timeoutMs),
      () => this.spawnCli<T>(command, args, timeoutMs),
    );
    // Keep the chain alive regardless of what this call does.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private spawnCli<T = any>(command: string, args: Record<string, unknown> = {}, timeoutMs: number = 10000): Promise<T> {
    const pythonBin = this.pythonBin;
    return new Promise((resolve) => {
      const child = spawn(pythonBin, [this.scriptPath, command, JSON.stringify(args)], {
        timeout: timeoutMs,
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
          // A bare exit code is not diagnostic. The Python side dies with
          // STATUS_DLL_INIT_FAILED (3221225794) when the MetaTrader5 package
          // cannot attach to the terminal, and stderr is empty in that case.
          // Say which binary ran and which script was asked for, so the
          // failure is diagnosable without a debugger.
          const detail = [
            `mt5_bridge_cli exited with code ${code}`,
            `python=${pythonBin}`,
            `script=${this.scriptPath}`,
            `command=${command}`,
            stderr.trim() ? `stderr=${stderr.trim().slice(0, 300)}` : "stderr=(empty)",
          ].join(" | ");
          resolve({
            success: false,
            error: detail,
            exit_code: code,
            python: pythonBin,
            script: this.scriptPath,
            command,
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

  public async runTester(config: {
    expert: string;
    symbol?: string;
    period?: string;
    from?: string;
    to?: string;
    model?: string;
    deposit?: number;
    currency?: string;
    leverage?: number;
    inputs?: Record<string, string | number>;
    visual?: boolean;
    shutdown?: boolean;
    timeout?: number;
    tag?: string;
  }): Promise<any> {
    const timeoutMs = (config.timeout || 300) * 1000;
    return this.executeCommand("run_tester", config, timeoutMs);
  }

  public async calcMargin(action: string, symbol: string, volume: number, price = 0): Promise<any> {
    return this.executeCommand("calc_margin", { action, symbol, volume, price });
  }

  public async calcProfit(action: string, symbol: string, volume: number, openPrice: number, closePrice: number): Promise<any> {
    return this.executeCommand("calc_profit", { action, symbol, volume, open_price: openPrice, close_price: closePrice });
  }
}

export const mt5Bridge = new Mt5BridgeService();
