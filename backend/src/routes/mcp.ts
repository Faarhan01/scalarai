import { Request, Response, Application } from "express";
import { createMcpHandler, TOOLS, RESOURCES, PROMPTS } from "../mcp_server";
import { McpContext } from "../types";
import { mt5Bridge } from "../gateway/mt5-bridge";

export function registerMcpRoute(app: Application, ctx: McpContext, apiKey: string) {
  const handler = createMcpHandler(ctx, apiKey);

  // Support POST on both /mcp and /api/mcp
  app.post(["/mcp", "/api/mcp"], (req: Request, res: Response) => {
    handler(req, res);
  });

  // Support GET on /mcp and /api/mcp for agent discovery, health, and SSE
  app.get(["/mcp", "/api/mcp"], async (req: Request, res: Response) => {
    const accept = req.headers["accept"] || "";

    // SSE support for streaming MCP clients
    if (typeof accept === "string" && accept.includes("text/event-stream")) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`event: endpoint\ndata: ${JSON.stringify({ endpoint: "/mcp" })}\n\n`);
      const interval = setInterval(() => {
        res.write(`event: ping\ndata: {}\n\n`);
      }, 15000);
      req.on("close", () => clearInterval(interval));
      return;
    }

    const bridgeStatus = await mt5Bridge.getStatus().catch(() => ({ bridge_available: false, is_connected: false }));
    res.json({
      name: "scalarai-mcp",
      version: "3.0.0",
      protocolVersion: "2024-11-05",
      endpoints: {
        http: "/mcp",
        http_alias: "/api/mcp",
        sse: "/mcp",
      },
      capabilities: {
        tools: { count: TOOLS.length },
        resources: { count: RESOURCES.length },
        prompts: { count: PROMPTS.length },
      },
      activeSymbol: ctx.getStatus().activeSymbol,
      mt5Bridge: {
        available: bridgeStatus?.bridge_available ?? false,
        connected: bridgeStatus?.is_connected ?? false,
      },
      instructions: "Send JSON-RPC 2.0 POST requests to /mcp with methods 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'prompts/list', or 'initialize'.",
    });
  });
}
