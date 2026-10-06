import { Request, Response, Application } from "express";
import { createMcpHandler } from "../mcp_server";
import { McpContext } from "../types";

export function registerMcpRoute(app: Application, ctx: McpContext, apiKey: string) {
  app.post("/mcp", (req: Request, res: Response) => {
    createMcpHandler(ctx, apiKey)(req, res);
  });
}
