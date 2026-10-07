import { describe, it, expect } from "vitest";
import { isReadOnlySql } from "../backend/src/mcp_server";

describe("isReadOnlySql", () => {
  it("allows simple SELECT", () => {
    expect(isReadOnlySql("SELECT * FROM trades")).toBe(true);
  });

  it("allows SELECT with WHERE and ORDER BY", () => {
    expect(isReadOnlySql("SELECT id FROM trades WHERE status = ? ORDER BY time DESC LIMIT 10")).toBe(true);
  });

  it("blocks DELETE", () => {
    expect(isReadOnlySql("DELETE FROM trades")).toBe(false);
  });

  it("blocks DROP", () => {
    expect(isReadOnlySql("DROP TABLE trades")).toBe(false);
  });

  it("blocks UPDATE", () => {
    expect(isReadOnlySql("UPDATE settings SET lot_size = 1")).toBe(false);
  });

  it("blocks INSERT", () => {
    expect(isReadOnlySql("INSERT INTO trades VALUES (1)")).toBe(false);
  });

  it("blocks ALTER", () => {
    expect(isReadOnlySql("ALTER TABLE trades ADD COLUMN x")).toBe(false);
  });

  it("blocks multi-statement via semicolon", () => {
    expect(isReadOnlySql("SELECT * FROM trades; DELETE FROM logs")).toBe(false);
  });

  it("blocks SQL comment injection", () => {
    expect(isReadOnlySql("SELECT * FROM trades -- DELETE FROM logs")).toBe(false);
  });

  it("blocks block comment injection", () => {
    expect(isReadOnlySql("SELECT * FROM trades /* DELETE FROM logs */")).toBe(false);
  });

  it("blocks PRAGMA", () => {
    expect(isReadOnlySql("PRAGMA journal_mode = WAL")).toBe(false);
  });

  it("blocks ATTACH", () => {
    expect(isReadOnlySql("ATTACH DATABASE 'x' AS y")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isReadOnlySql("delete from trades")).toBe(false);
    expect(isReadOnlySql("SeLeCt * FROM trades")).toBe(true);
  });

  it("trims leading whitespace", () => {
    expect(isReadOnlySql("  SELECT * FROM trades")).toBe(true);
    expect(isReadOnlySql("\nDELETE FROM trades")).toBe(false);
  });

  it("collapses internal whitespace", () => {
    expect(isReadOnlySql("SELECT * FROM trades WHERE id = 1 AND x = 2")).toBe(true);
  });
});

describe("createMcpHandler integration", () => {
  it("initializes and lists extended tools", async () => {
    const { createMcpHandler } = await import("../backend/src/mcp_server");
    const mockCtx: any = {
      getStatus: () => ({ activeSymbol: "Boom 1000", symbolStates: [] }),
      getSymbols: () => [{ symbol: "Boom 1000", isConnected: true, currentPrice: 500, tickCount: 10 }],
      switchSymbol: () => {},
      placeTrade: async () => ({ success: true, message: "Trade placed", ticket: 101 }),
      closeAllTrades: async () => ({ success: true, closedCount: 2, message: "Closed 2 trades" }),
    };

    const handler = createMcpHandler(mockCtx, "");
    let responseData: any;
    const mockRes: any = {
      json: (data: any) => { responseData = data; return mockRes; },
      status: () => mockRes,
    };

    // Test tools/list
    await handler({ body: { jsonrpc: "2.0", id: 1, method: "tools/list" }, headers: {} } as any, mockRes);
    expect(responseData.result.tools).toBeDefined();
    const toolNames = responseData.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain("place_validated_trade");
    expect(toolNames).toContain("close_all_trades");
    expect(toolNames).toContain("get_symbols");
    expect(toolNames).toContain("switch_active_symbol");
    expect(toolNames).toContain("get_ea_telemetry");

    // Test tools/call: get_symbols
    await handler({ body: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_symbols", arguments: {} } }, headers: {} } as any, mockRes);
    expect(responseData.result.content[0].text).toContain("Boom 1000");

    // Test tools/call: place_validated_trade
    await handler({ body: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "place_validated_trade", arguments: { type: "BUY", symbol: "Boom 1000", lotSize: 0.2 } } }, headers: {} } as any, mockRes);
    expect(responseData.result.content[0].text).toContain("Trade placed");

    // Test tools/call: close_all_trades
    await handler({ body: { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "close_all_trades", arguments: { symbol: "Boom 1000" } } }, headers: {} } as any, mockRes);
    expect(responseData.result.content[0].text).toContain("Closed 2 trades");
  });
});
