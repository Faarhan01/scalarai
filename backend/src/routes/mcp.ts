import { Request, Response } from "express";
import { createMcpHandler } from "../mcp_server";
import { McpContext } from "../types";

export function registerMcpRoute(app: any, ctx: McpContext, apiKey: string) {
  app.post("/mcp", (req: Request, res: Response) => {
    createMcpHandler(ctx, apiKey)(req, res);
  });
}
