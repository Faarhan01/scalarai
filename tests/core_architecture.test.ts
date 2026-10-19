import { describe, it, expect } from "vitest";
import { buildContainer } from "../backend/src/core/composition";
import { parseSymbol, parseOrderAction } from "../backend/src/core/server/validation";
import { isReadOnlySql } from "../backend/src/mcp_server";

describe("Cotrade Core Architecture & Hardcoding Fixes", () => {
  it("builds the core application container with wired dependencies", () => {
    const container = buildContainer();
    expect(container).toBeDefined();
    expect(container.config).toBeDefined();
    expect(container.store).toBeDefined();
    expect(container.gateway).toBeDefined();
  });

  it("preserves symbol spaces and casing exactly as received without mutation", () => {
    expect(parseSymbol("Boom 1000 Index")).toBe("Boom 1000 Index");
    expect(parseSymbol("Volatility 75 (1s) Index")).toBe("Volatility 75 (1s) Index");
    expect(parseSymbol("BTC/USD")).toBe("BTC/USD");
    expect(parseSymbol("eurusd")).toBe("eurusd");
    expect(parseSymbol("", "Step Index")).toBe("Step Index");
  });

  it("handles case-insensitive order actions seamlessly", () => {
    expect(parseOrderAction("buy")).toBe("BUY");
    expect(parseOrderAction("BUY")).toBe("BUY");
    expect(parseOrderAction("sell")).toBe("SELL");
    expect(parseOrderAction("SELL")).toBe("SELL");
    expect(parseOrderAction("close")).toBe("CLOSE");
    expect(parseOrderAction("modify")).toBe("MODIFY");
  });

  it("does not false-positively block SQL queries containing 'Index' in symbols", () => {
    const query = "SELECT * FROM trades WHERE symbol = 'Step Index'";
    expect(isReadOnlySql(query)).toBe(true);

    const query2 = "SELECT * FROM market_ticks WHERE symbol = 'Boom 1000 Index' LIMIT 10";
    expect(isReadOnlySql(query2)).toBe(true);

    const maliciousQuery = "DROP TABLE trades;";
    expect(isReadOnlySql(maliciousQuery)).toBe(false);
  });
});
