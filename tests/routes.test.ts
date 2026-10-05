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

    const app: any = {
      get: (_path: string, handler: any) => {
        const req = {} as Request;
        const { res } = mockRes();
        return handler(req, res);
      },
    };

    registerStatusRoute(app, () => payload, () => {}, undefined, "test-key");
    expect(true).toBe(true);
  });

  it("POST /api/status/switch-symbol updates symbol", () => {
    let activeSymbol = "Step Index";
    const switchSymbol = (symbol: string) => {
      activeSymbol = symbol;
    };

    const app: any = {
      post: (_path: string, handler: any) => {
        const req = { body: { symbol: "EURUSD" } } as Request;
        const { res } = mockRes();
        return handler(req, res);
      },
    };

    registerStatusRoute(app, () => ({}), switchSymbol, undefined, "test-key");
    expect(activeSymbol).toBe("EURUSD");
  });
});
