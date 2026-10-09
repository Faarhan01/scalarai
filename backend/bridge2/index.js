#!/usr/bin/env node
/**
 * ScalarAI Bridge 2 - Master Entry Point
 * Direct Node.js bridge for MetaTrader 5 with Model Context Protocol (MCP) server.
 */
import { config } from "./config.js";
import { MT5Client } from "./mt5_client.js";
import { SiteClient } from "./site_client.js";
import { McpStdioServer } from "./mcp_server.js";
import { createHttpServer } from "./http_server.js";

// Initialize core services
const mt5Client = new MT5Client({
  mt5Path: config.mt5Path,
  mt5DataPath: config.mt5DataPath,
  defaultSymbol: config.defaultSymbol,
  magicNumber: config.magicNumber,
});

const siteClient = new SiteClient({
  siteUrl: config.siteUrl,
  apiKey: config.apiKey,
});

// Setup background syncing between MT5 and ScalarAI
function startSyncDaemon() {
  console.error(`[BRIDGE2] Starting bidirectional sync daemon...`);
  console.error(`[BRIDGE2] ScalarAI Endpoint: ${config.siteUrl}`);
  console.error(`[BRIDGE2] MetaTrader 5 Path: ${mt5Client.terminalPath || "Simulated / Socket Mode"}`);

  // Connect WebSocket to platform
  siteClient.connectWebSocket();

  siteClient.on("order", async (orderMsg) => {
    console.error("[BRIDGE2] Received order signal from ScalarAI platform:", orderMsg);
    if (orderMsg.action === "BUY" || orderMsg.action === "SELL") {
      await mt5Client.placeTrade({
        type: orderMsg.action,
        symbol: orderMsg.symbol || config.defaultSymbol,
        volume: orderMsg.volume || config.defaultLotSize,
        sl: orderMsg.sl,
        tp: orderMsg.tp,
        comment: orderMsg.reason || "Platform Signal",
      });
    } else if (orderMsg.action === "CLOSE" && orderMsg.ticket) {
      await mt5Client.closeTrade(orderMsg.ticket);
    } else if (orderMsg.action === "CLOSE_ALL") {
      await mt5Client.closeAllPositions(orderMsg.symbol);
    }
  });

  // Regular heartbeat to report terminal positions & ticks to site
  setInterval(async () => {
    try {
      const positions = mt5Client.getPositions();
      if (positions.length > 0) {
        await siteClient.sendPositions(positions);
      }
    } catch {
      // Quiet heartbeat
    }
  }, config.heartbeatIntervalMs);
}

// Mode Selection
if (config.isHttpMode) {
  // Start HTTP / SSE server
  createHttpServer({
    mt5Client,
    siteClient,
    port: config.httpPort,
    apiKey: config.apiKey,
  });
  startSyncDaemon();
} else if (config.isDaemonMode) {
  // Pure background daemon without stdio MCP
  console.error("=================================================");
  console.error("⚡ SCALARAI MT5 BRIDGE 2 - DAEMON MODE ⚡");
  console.error("=================================================");
  startSyncDaemon();
} else {
  // Default mode: MCP Stdio Server (for Claude Desktop, Cursor, external AI agents)
  console.error("=================================================");
  console.error("🤖 SCALARAI MT5 BRIDGE 2 - MCP SERVER ACTIVE 🤖");
  console.error("Protocol: Model Context Protocol (JSON-RPC 2.0)");
  console.error(`Target: ${config.siteUrl}`);
  console.error("=================================================");

  const mcpServer = new McpStdioServer({ mt5Client, siteClient });
  mcpServer.start();
  startSyncDaemon();
}
