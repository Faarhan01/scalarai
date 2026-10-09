/**
 * ScalarAI Bridge 2 - Configuration Management
 * Handles environment variables, CLI arguments, and auto-discovery.
 */
import fs from "fs";
import path from "path";

// Load optional .env file without external dependencies
export function loadEnvFile(envPath = path.resolve(process.cwd(), ".env")) {
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    } catch {
      // Ignore reading errors
    }
  }
}

loadEnvFile();

// Parse CLI flags
export function parseArgs(args = process.argv.slice(2)) {
  const parsed = {
    mcp: false,
    http: false,
    daemon: false,
    port: 5100,
    siteUrl: "",
    apiKey: "",
    mt5Path: "",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--mcp") parsed.mcp = true;
    else if (arg === "--http") parsed.http = true;
    else if (arg === "--daemon") parsed.daemon = true;
    else if (arg === "--port" && args[i + 1]) parsed.port = parseInt(args[++i], 10);
    else if (arg.startsWith("--port=")) parsed.port = parseInt(arg.split("=")[1], 10);
    else if (arg === "--site-url" && args[i + 1]) parsed.siteUrl = args[++i];
    else if (arg.startsWith("--site-url=")) parsed.siteUrl = arg.split("=")[1];
    else if (arg === "--api-key" && args[i + 1]) parsed.apiKey = args[++i];
    else if (arg.startsWith("--api-key=")) parsed.apiKey = arg.split("=")[1];
    else if (arg === "--mt5-path" && args[i + 1]) parsed.mt5Path = args[++i];
    else if (arg.startsWith("--mt5-path=")) parsed.mt5Path = arg.split("=")[1];
  }

  return parsed;
}

const cliArgs = parseArgs();

export const config = {
  // Scalar AI Platform connection
  siteUrl: (
    cliArgs.siteUrl ||
    process.env.SCALARAI_SITE_URL ||
    process.env.SCALARAI_URL ||
    "http://127.0.0.1:3000"
  ).replace(/\/$/, ""),

  apiKey: cliArgs.apiKey || process.env.SCALARAI_MCP_API_KEY || process.env.SCALARAI_API_KEY || "",

  // MetaTrader 5 Terminal Configuration
  mt5Path: cliArgs.mt5Path || process.env.MT5_PATH || process.env.MT5_TERMINAL_PATH || "",
  mt5DataPath: process.env.MT5_DATA_PATH || "",
  defaultSymbol: process.env.DEFAULT_SYMBOL || "Step Index",
  defaultLotSize: parseFloat(process.env.DEFAULT_LOT_SIZE || "0.1"),
  defaultSlPoints: parseInt(process.env.DEFAULT_SL_POINTS || "150", 10),
  defaultTpPoints: parseInt(process.env.DEFAULT_TP_POINTS || "300", 10),
  magicNumber: parseInt(process.env.MT5_MAGIC_NUMBER || "20261009", 10),

  // Modes
  isMcpMode: cliArgs.mcp || (!cliArgs.http && !cliArgs.daemon && !process.stdin.isTTY),
  isHttpMode: cliArgs.http,
  isDaemonMode: cliArgs.daemon,
  httpPort: cliArgs.port || parseInt(process.env.BRIDGE_PORT || "5100", 10),

  // Polling / Heartbeat
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "1500", 10),
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || "3000", 10),
};

export default config;
