import { Request, Response, Application } from "express";
import { createMcpHandler, TOOLS } from "../mcp_server";
import { McpContext } from "../types";

export function registerMcpRoute(app: Application, ctx: McpContext, apiKey?: string) {
  const handler = createMcpHandler(ctx, apiKey || "");

  app.post("/mcp", handler);
  app.post("/api/mcp", handler);

  app.get("/mcp", (_req: Request, res: Response) => {
    res.json({
      name: "scalarai-mcp",
      version: "2.0.0",
      status: "ready",
      toolsCount: TOOLS.length,
      protocol: "JSON-RPC 2.0",
      endpoint: "/mcp",
    });
  });

  app.get("/api/mcp", (_req: Request, res: Response) => {
    res.json({
      name: "scalarai-mcp",
      version: "2.0.0",
      status: "ready",
      toolsCount: TOOLS.length,
      protocol: "JSON-RPC 2.0",
      endpoint: "/api/mcp",
    });
  });
}
