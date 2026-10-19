import { describe, it, expect } from "vitest";
import {
  calculateEMA,
  calculateRSI,
  calculateATR,
  calculateBollingerBands,
  buildContext,
  evaluateStrategy,
  evaluateStrategyBacktest,
} from "../backend/src/services/strategy";

const makeTick = (overrides: any = {}): any => ({
  time: Date.now(),
  price: 100,
  direction: "up",
  open: 100,
  high: 101,
  low: 99,
  close: 100,
  velocity: 0,
  buyLocked: false,
  sellLocked: false,
  spread: 0,
  session: "session",
  ...overrides,
});

const baseCtx = (ticks: any[] = []) =>
  buildContext(
    ticks,
    {
      totalObservations: 50,
      globalAverageSpeed: 0.2,
      peakVelocityRegistered: 0.5,
      timeOfDayPatterns: {},
      lastUpdated: new Date().toISOString(),
    },
    {
      id: "ai_adaptive",
      name: "AI Adaptive",
      description: "",
      mode: "AI_ADAPTIVE",
      rules: {},
      createdAt: "",
      updatedAt: "",
    },
    "Scalping",
    0,
    false,
    false
  );

describe("calculateEMA", () => {
  it("returns average when fewer prices than period", () => {
    expect(calculateEMA([1, 2, 3], 5)).toBeCloseTo(2);
  });

  it("returns EMA for full series", () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const ema = calculateEMA(prices, 10);
    expect(ema).toBeGreaterThan(100);
  });
});

describe("calculateRSI", () => {
  it("returns 50 when insufficient data", () => {
    expect(calculateRSI([1, 2, 3], 10)).toBe(50);
  });

  it("returns 100 when no losses", () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(calculateRSI(prices, 10)).toBe(100);
  });

  it("returns 0 when no gains", () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 - i);
    expect(calculateRSI(prices, 10)).toBe(0);
  });
});

describe("calculateATR", () => {
  it("returns 0.5 with fewer than 2 ticks", () => {
    expect(calculateATR([makeTick()], 10)).toBeCloseTo(0.5);
  });

  it("returns average true range", () => {
    const ticks = [
      makeTick({ high: 102, low: 98, close: 100 }),
      makeTick({ high: 103, low: 99, close: 101 }),
    ];
    expect(calculateATR(ticks, 10)).toBeGreaterThan(0);
  });
});

describe("calculateBollingerBands", () => {
  it("returns middle band equal to price when no data", () => {
    const result = calculateBollingerBands([], 15, 2);
    expect(result.middle).toBe(0);
  });

  it("returns upper greater than middle for rising prices", () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = calculateBollingerBands(prices, 15, 2);
    expect(result.upper).toBeGreaterThan(result.middle);
    expect(result.lower).toBeLessThan(result.middle);
  });
});

describe("buildContext", () => {
  it("builds strategy context from ticks", () => {
    const ticks = Array.from({ length: 20 }, (_, i) => makeTick({ price: 100 + i * 0.1, close: 100 + i * 0.1 }));
    const ctx = baseCtx(ticks);
    expect(ctx.prices.length).toBe(20);
    expect(ctx.atr).toBeGreaterThanOrEqual(0);
  });
});

describe("evaluateStrategy", () => {
  it("returns HOLD when max trades reached", () => {
    const ctx = baseCtx([]);
    ctx.openTradesCount = 3;
    const config = { maxTrades: 3, tradingMode: "Scalping" as const };
    const signal = evaluateStrategy("TREND_FOLLOWING", ctx, config as any);
    expect(signal.type).toBe("HOLD");
  });

  it("returns BUY or SELL or HOLD for trend following", () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 2);
    const ticks = prices.map((p) => makeTick({ price: p, close: p }));
    const ctx = baseCtx(ticks);
    ctx.openTradesCount = 0;
    const config = { maxTrades: 3, tradingMode: "Scalping" as const };
    const signal = evaluateStrategy("TREND_FOLLOWING", ctx, config as any);
    expect(["BUY", "SELL", "HOLD"]).toContain(signal.type);
  });
});

describe("evaluateStrategyBacktest", () => {
  it("returns object with required fields", () => {
    const result = evaluateStrategyBacktest("TREND_FOLLOWING", 10);
    expect(result).toHaveProperty("mode");
    expect(result).toHaveProperty("winRate");
    expect(result).toHaveProperty("totalProfit");
    expect(result).toHaveProperty("maxDrawdown");
  });
});
