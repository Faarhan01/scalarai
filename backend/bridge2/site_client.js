/**
 * ScalarAI Bridge 2 - Site Client
 * Communicates with the ScalarAI full-stack platform over REST and WebSocket.
 */
import http from "http";
import https from "https";
import { EventEmitter } from "events";
import { config } from "./config.js";

export class SiteClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.baseUrl = (options.siteUrl || config.siteUrl).replace(/\/$/, "");
    this.apiKey = options.apiKey || config.apiKey;
    this.wsClient = null;
    this.isConnected = false;
    this.reconnectTimer = null;
  }

  get headers() {
    const h = { "Content-Type": "application/json" };
    if (this.apiKey) {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  /**
   * Internal HTTP request helper using standard Node.js http/https
   */
  request(method, endpoint, body = null, timeout = 5000) {
    return new Promise((resolve, reject) => {
      try {
        const fullUrl = new URL(endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`);
        const client = fullUrl.protocol === "https:" ? https : http;

        const options = {
          hostname: fullUrl.hostname,
          port: fullUrl.port || (fullUrl.protocol === "https:" ? 443 : 80),
          path: fullUrl.pathname + fullUrl.search,
          method: method.toUpperCase(),
          headers: this.headers,
          timeout,
        };

        const req = client.request(options, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            try {
              const parsed = data ? JSON.parse(data) : {};
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(parsed);
              } else {
                resolve({ error: parsed.error || `HTTP ${res.statusCode}`, statusCode: res.statusCode, data: parsed });
              }
            } catch {
              resolve({ raw: data, statusCode: res.statusCode });
            }
          });
        });

        req.on("error", (err) => {
          resolve({ error: `Connection failed: ${err.message}`, networkError: true });
        });

        req.on("timeout", () => {
          req.destroy();
          resolve({ error: "Request timed out", timeout: true });
        });

        if (body) {
          req.write(typeof body === "string" ? body : JSON.stringify(body));
        }

        req.end();
      } catch (err) {
        resolve({ error: err.message });
      }
    });
  }

  // --- Platform Inspection & Data Endpoints ---

  async getHealth() {
    return this.request("GET", "/api/health");
  }

  async getStatus() {
    return this.request("GET", "/api/status");
  }

  async getSettings() {
    return this.request("GET", "/api/settings");
  }

  async updateSettings(settingsPatch) {
    return this.request("POST", "/api/settings", settingsPatch);
  }

  async getTrades() {
    return this.request("GET", "/api/trades");
  }

  async getCandles(symbol, limit = 100) {
    const sym = encodeURIComponent(symbol || config.defaultSymbol);
    return this.request("GET", `/api/market/candles?symbol=${sym}&limit=${limit}`);
  }

  async getAiStudyFeed() {
    return this.request("GET", "/api/ai-study-feed");
  }

  async getStrategies() {
    return this.request("GET", "/api/strategies");
  }

  // --- Trade Execution Endpoints ---

  async placeTrade({ type, symbol, lotSize, sl, tp, reason }) {
    return this.request("POST", "/api/trades", {
      type: (type || "BUY").toUpperCase(),
      symbol: symbol || config.defaultSymbol,
      lotSize: lotSize !== undefined ? Number(lotSize) : config.defaultLotSize,
      sl: sl !== undefined ? Number(sl) : config.defaultSlPoints,
      tp: tp !== undefined ? Number(tp) : config.defaultTpPoints,
      reason: reason || "MCP External AI Signal",
    });
  }

  async closeTrade(tradeId) {
    return this.request("POST", `/api/trades/${tradeId}/close`);
  }

  async closeAllTrades(symbol = null) {
    return this.request("POST", "/api/trades/close-all", symbol ? { symbol } : {});
  }

  async modifyTrade(tradeId, { sl, tp }) {
    return this.request("POST", `/api/trades/${tradeId}/modify`, { sl, tp });
  }

  // --- EA Ingestion Endpoints (Bridge forwards MT5 terminal data) ---

  async sendTick(tickData) {
    return this.request("POST", "/api/ea/tick", tickData);
  }

  async sendBulkCandles(symbol, candles) {
    return this.request("POST", "/api/market/bulk-candles", { symbol, candles });
  }

  async sendPositions(positions) {
    return this.request("POST", "/api/ea/positions", { positions });
  }

  async sendConfirmation(confirmation) {
    return this.request("POST", "/api/ea/confirm", confirmation);
  }

  async sendLog(level, message, source = "EA") {
    return this.request("POST", "/api/ea/logs", { level, message, source });
  }

  // --- WebSocket Connection ---

  connectWebSocket() {
    if (typeof WebSocket === "undefined") {
      return; // Skip if WebSocket API is not supported in current environment
    }

    try {
      const wsUrl = this.baseUrl.replace(/^http/, "ws") + "/ws/bridge";
      this.wsClient = new WebSocket(wsUrl);

      this.wsClient.onopen = () => {
        this.isConnected = true;
        this.emit("connected");
        // Register client
        this.wsClient.send(
          JSON.stringify({
            client: "scalarai-bridge2-mcp",
            version: "2.0.0",
            status: "online",
            time: Date.now(),
          })
        );
      };

      this.wsClient.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.emit("message", msg);
          if (msg.type === "trade_signal" || msg.type === "order") {
            this.emit("order", msg);
          }
        } catch {
          // Ignore parse errors
        }
      };

      this.wsClient.onclose = () => {
        this.isConnected = false;
        this.emit("disconnected");
        this.scheduleReconnect();
      };

      this.wsClient.onerror = () => {
        this.isConnected = false;
      };
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connectWebSocket();
    }, 4000);
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.wsClient) {
      try {
        this.wsClient.close();
      } catch {}
      this.wsClient = null;
    }
    this.isConnected = false;
  }
}

export default SiteClient;
