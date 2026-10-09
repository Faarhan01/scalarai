/**
 * ScalarAI Bridge 2 - Stdio Model Context Protocol (MCP) Server
 * Enables any external AI agent (Claude Desktop, Cursor, Windsurf, custom agents)
 * to control MetaTrader 5 and ScalarAI via standard input/output JSON-RPC.
 */
import readline from "readline";
import { MCP_TOOLS, executeToolCall } from "./tools.js";

export class McpStdioServer {
  constructor({ mt5Client, siteClient }) {
    this.mt5Client = mt5Client;
    this.siteClient = siteClient;
    this.rl = null;
  }

  start() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    this.rl.on("line", async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const message = JSON.parse(trimmed);
        await this.handleMessage(message);
      } catch (err) {
        this.sendError(null, -32700, `Parse error: ${err.message}`);
      }
    });

    this.rl.on("close", () => {
      process.exit(0);
    });

    // Send log to stderr so stdin/stdout remains clean JSON-RPC
    console.error("[MCP-BRIDGE2] Stdio server initialized and listening for AI agent requests.");
  }

  async handleMessage(message) {
    if (!message || message.jsonrpc !== "2.0") {
      this.sendError(message?.id ?? null, -32600, "Invalid Request: jsonrpc must be '2.0'");
      return;
    }

    const { id, method, params } = message;

    // Handle notifications (no id)
    if (id === undefined || id === null) {
      if (method === "notifications/initialized" || method === "initialized") {
        console.error("[MCP-BRIDGE2] AI Client connection established.");
      }
      return;
    }

    switch (method) {
      case "initialize": {
        this.sendResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          serverInfo: {
            name: "scalarai-mt5-bridge2",
            version: "2.0.0",
          },
        });
        break;
      }

      case "ping": {
        this.sendResult(id, {});
        break;
      }

      case "tools/list": {
        this.sendResult(id, {
          tools: MCP_TOOLS,
        });
        break;
      }

      case "tools/call": {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        console.error(`[MCP-BRIDGE2] Executing tool: ${toolName}`, JSON.stringify(toolArgs));

        const result = await executeToolCall(toolName, toolArgs, {
          mt5Client: this.mt5Client,
          siteClient: this.siteClient,
        });

        this.sendResult(id, result);
        break;
      }

      default: {
        this.sendError(id, -32601, `Method not found: ${method}`);
        break;
      }
    }
  }

  sendResult(id, result) {
    const response = {
      jsonrpc: "2.0",
      id,
      result,
    };
    process.stdout.write(JSON.stringify(response) + "\n");
  }

  sendError(id, code, message, data = null) {
    const response = {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
        ...(data ? { data } : {}),
      },
    };
    process.stdout.write(JSON.stringify(response) + "\n");
  }
}

export default McpStdioServer;
