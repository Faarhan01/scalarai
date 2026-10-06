import { describe, it, expect } from "vitest";
import { Request, Response } from "express";
import { registerStatusRoute } from "../backend/src/routes/status";

function mockRes() {
  const jsonCalls: any[] = [];
  const res = {
    json: (data: any) => {
      jsonCalls.push(data);
      return { status: 200, data };
    },
    status: () => res,
  } as unknown as Response;
  return { res, jsonCalls };
}

describe("Status routes", () => {
  it("GET /api/status returns payload", () => {
    const payload = {
      config: { selectedStrategy: "TREND_FOLLOWING" },
      connection: { isEaConnected: false },
      currentPrice: 1250.0,
      activeSymbol: "Step Index",
    };

    const getRoutes: Record<string, any> = {};
    const postRoutes: Record<string, any> = {};

    const app: any = {
      get: (path: string, ...handlers: any[]) => {
        getRoutes[path] = handlers[handlers.length - 1];
      },
      post: (path: string, ...handlers: any[]) => {
        postRoutes[path] = handlers[handlers.length - 1];
      },
    };

    registerStatusRoute(app, () => payload as any, () => {}, undefined);

    const req = {} as Request;
    const { res, jsonCalls } = mockRes();
    getRoutes["/api/status"](req, res);

    expect(jsonCalls.length).toBe(1);
    expect(jsonCalls[0].activeSymbol).toBe("Step Index");
  });

  it("POST /api/status/switch-symbol updates symbol", () => {
    let activeSymbol = "Step Index";
    const switchSymbol = (symbol: string) => {
      activeSymbol = symbol;
    };

    const getRoutes: Record<string, any> = {};
    const postRoutes: Record<string, any> = {};

    const app: any = {
      get: (path: string, ...handlers: any[]) => {
        getRoutes[path] = handlers[handlers.length - 1];
      },
      post: (path: string, ...handlers: any[]) => {
        postRoutes[path] = handlers[handlers.length - 1];
      },
    };

    registerStatusRoute(app, () => ({} as any), switchSymbol, undefined);

    const req = { body: { symbol: "EURUSD" } } as Request;
    const { res, jsonCalls } = mockRes();
    postRoutes["/api/status/switch-symbol"](req, res);

    expect(activeSymbol).toBe("EURUSD");
    expect(jsonCalls.length).toBe(1);
    expect(jsonCalls[0].success).toBe(true);
    expect(jsonCalls[0].activeSymbol).toBe("EURUSD");
  });
});
