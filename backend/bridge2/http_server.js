/**
 * ScalarAI Bridge 2 - HTTP Server & Remote MCP Endpoint
 * Provides HTTP JSON-RPC MCP and REST endpoints for external AI clients and webhooks.
 */
import http from "http";
import { MCP_TOOLS, executeToolCall } from "./tools.js";

export function createHttpServer({ mt5Client, siteClient, port = 5100, apiKey = "" }) {
  const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // Helper to send JSON
    const sendJson = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    // Read request body helper
    const readBody = () => {
      return new Promise((resolve) => {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch {
            resolve({});
          }
        });
      });
    };

    // Health check
    if (pathname === "/health" || pathname === "/") {
      return sendJson(200, {
        status: "ok",
        service: "scalarai-mt5-bridge2",
        version: "2.0.0",
        mcpEndpoint: "/mcp",
        terminal: mt5Client.getStatus(),
      });
    }

    // --- MCP Remote JSON-RPC 2.0 Endpoint ---
    if (pathname === "/mcp" && req.method === "POST") {
      const body = await readBody();

      if (!body.jsonrpc || body.jsonrpc !== "2.0") {
        return sendJson(400, {
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: { code: -32600, message: "Invalid Request: expected jsonrpc 2.0" },
        });
      }

      // Check optional API key if configured
      if (apiKey) {
        const auth = req.headers.authorization || "";
        if (!auth.startsWith(`Bearer ${apiKey}`)) {
          return sendJson(401, {
            jsonrpc: "2.0",
            id: body.id ?? null,
            error: { code: -32001, message: "Unauthorized: Invalid API key" },
          });
        }
      }

      const { id, method, params } = body;

      if (method === "initialize") {
        return sendJson(200, {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "scalarai-mt5-bridge2", version: "2.0.0" },
          },
        });
      }

      if (method === "tools/list") {
        return sendJson(200, {
          jsonrpc: "2.0",
          id,
          result: { tools: MCP_TOOLS },
        });
      }

      if (method === "tools/call") {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const result = await executeToolCall(toolName, toolArgs, { mt5Client, siteClient });
        return sendJson(200, {
          jsonrpc: "2.0",
          id,
          result,
        });
      }

      return sendJson(200, {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    }

    // --- REST Convenience Endpoints ---
    if (pathname === "/status" && req.method === "GET") {
      return sendJson(200, mt5Client.getStatus());
    }

    if (pathname === "/account" && req.method === "GET") {
      return sendJson(200, mt5Client.getAccountInfo());
    }

    if (pathname === "/positions" && req.method === "GET") {
      return sendJson(200, { positions: mt5Client.getPositions() });
    }

    if (pathname === "/trade" && req.method === "POST") {
      const body = await readBody();
      const result = await mt5Client.placeTrade(body);
      return sendJson(200, result);
    }

    if (pathname === "/close" && req.method === "POST") {
      const body = await readBody();
      const result = await mt5Client.closeTrade(body.ticket);
      return sendJson(200, result);
    }

    if (pathname === "/close-all" && req.method === "POST") {
      const body = await readBody();
      const result = await mt5Client.closeAllPositions(body.symbol);
      return sendJson(200, result);
    }

    sendJson(404, { error: `Endpoint not found: ${req.method} ${pathname}` });
  });

  server.listen(port, "0.0.0.0", () => {
    console.error(`[BRIDGE2-HTTP] Server running on http://0.0.0.0:${port} (MCP at /mcp)`);
  });

  return server;
}

export default createHttpServer;
