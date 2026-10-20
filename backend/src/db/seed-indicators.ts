// Seed the indicator library with built-in indicators.
// Run: npx tsx src/db/seed-indicators.ts
import { scalarAiDb } from "./index";

const builtins = [
  { id: "ind_ema", name: "EMA", category: "trend", formula: { params: { period: 14 }, description: "Exponential Moving Average" } },
  { id: "ind_sma", name: "SMA", category: "trend", formula: { params: { period: 20 }, description: "Simple Moving Average" } },
  { id: "ind_rsi", name: "RSI", category: "momentum", formula: { params: { period: 14 }, description: "Relative Strength Index" } },
  { id: "ind_atr", name: "ATR", category: "volatility", formula: { params: { period: 14 }, description: "Average True Range" } },
  { id: "ind_bollinger", name: "Bollinger Bands", category: "volatility", formula: { params: { period: 20, numStd: 2.0 }, description: "Bollinger Bands (2 sigma)" } },
  { id: "ind_macd", name: "MACD", category: "momentum", formula: { params: { fast: 12, slow: 26, signal: 9 }, description: "MACD (12/26/9)" } },
];

for (const ind of builtins) {
  scalarAiDb.upsertIndicatorLibrary({
    id: ind.id,
    name: ind.name,
    category: ind.category,
    formula: JSON.stringify(ind.formula),
    is_builtin: 1,
    created_at: new Date().toISOString(),
  });
  console.log(`  seeded: ${ind.name} (${ind.category})`);
}

console.log(`\n  ${builtins.length} indicators seeded.`);