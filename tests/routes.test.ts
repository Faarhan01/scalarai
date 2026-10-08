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

  it("POST /api/ea/tick returns config and pending commands", async () => {
    const { registerEaRoutes } = await import("../backend/src/routes/ea");
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

    const mockConfig = {
      isActive: true,
      selectedStrategy: "TREND_FOLLOWING",
      lotSize: 0.1,
      takeProfitPoints: 300,
      stopLossPoints: 150,
      trailingStopPoints: 100,
      useTrailingStop: true,
      maxTrades: 3,
      tradingMode: "Scalping" as const,
      isAiModeEnabled: true,
      selectedAssets: ["Step Index"],
    };

    const mockPendingCommands = [
      {
        id: "cmd-1",
        action: "BUY" as const,
        symbol: "Step Index",
        lot: 0.1,
        sl: 150,
        tp: 300,
        ticket: 1001,
        status: "pending" as const,
        timestamp: Date.now(),
      },
    ];

    registerEaRoutes(
      app,
      () => ({ config: mockConfig } as any),
      () => mockConfig as any,
      async () => {},
      () => mockPendingCommands as any,
      undefined,
      undefined,
      undefined,
      undefined
    );

    const req = {
      body: {
        account: "123456",
        broker: "Deriv",
        symbol: "Step Index",
        digits: 1,
        tickSize: 0.1,
      },
    } as Request;

    const { res, jsonCalls } = mockRes();
    await postRoutes["/api/ea/tick"](req, res);

    expect(jsonCalls.length).toBe(1);
    const result = jsonCalls[0];
    expect(result.isActive).toBe(true);
    expect(result.selectedStrategy).toBe("TREND_FOLLOWING");
    expect(result.pendingAction).toBe("BUY");
    expect(result.pendingLot).toBe(0.1);
    expect(result.pendingCommands.length).toBe(1);
    expect(result.pendingCommands[0].action).toBe("BUY");
  });

  it("GET /api/ea/code returns valid MQL5 code", async () => {
    const { registerEaRoutes } = await import("../backend/src/routes/ea");
    const getRoutes: Record<string, any> = {};

    const app: any = {
      get: (path: string, ...handlers: any[]) => {
        getRoutes[path] = handlers[handlers.length - 1];
      },
      post: () => {},
    };

    registerEaRoutes(
      app,
      () => ({} as any),
      () => ({} as any),
      async () => {},
      undefined
    );

    let sentBody = "";
    const res = {
      setHeader: () => {},
      send: (body: string) => {
        sentBody = body;
      },
    } as unknown as Response;

    const req = {
      query: { url: "http://127.0.0.1:3000" },
      protocol: "http",
      get: () => "127.0.0.1:3000",
    } as unknown as Request;

    getRoutes["/api/ea/code"](req, res);

    expect(sentBody).toContain("ScalarAI_MultiAsset_EA.mq5");
    expect(sentBody).toContain("void OnTick()");
    expect(sentBody).toContain("ManageTrailingStop");
  });
});
