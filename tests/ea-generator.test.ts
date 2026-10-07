import { describe, it, expect } from "vitest";
import { generateMql5Code } from "../backend/src/services/ea-generator";
import { generateMql5Code as generateFrontendMql5Code } from "../frontend/src/lib/mql5_generator";

describe("MQL5 EA Generator", () => {
  it("should generate valid MQL5 code without format specifier or syntax errors", () => {
    const code = generateMql5Code("http://127.0.0.1:3000", {
      isActive: true,
      lotSize: 0.2,
      takeProfitPoints: 200,
      stopLossPoints: 100,
    });

    expect(code).toBeDefined();
    expect(code.length).toBeGreaterThan(1000);
    // Checks for MQL5 forward declarations
    expect(code).toContain("void PushHistoricalCandles(int count);");
    expect(code).toContain("void ManageTrailingStop(double bid, double ask);");
    expect(code).toContain("void BroadcastMarketUpdate();");
    // Check for proper 64-bit integer format specifier %I64d
    expect(code).toContain("%I64d");
    expect(code).not.toContain("%lld");
    // Check bulk candles endpoint
    expect(code).toContain("/api/market/bulk-candles");
    expect(code).toContain("/api/update-market");
  });

  it("should keep backend and frontend generators aligned", () => {
    const backendCode = generateMql5Code("http://127.0.0.1:3000", {});
    const frontendCode = generateFrontendMql5Code("http://127.0.0.1:3000", {});

    expect(backendCode).toContain("ScalarAI_MultiAsset_EA.mq5");
    expect(frontendCode).toContain("ScalarAI_MultiAsset_EA.mq5");
    expect(backendCode).toContain("PushHistoricalCandles");
    expect(frontendCode).toContain("PushHistoricalCandles");
  });
});
