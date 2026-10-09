# Strategies Plan — Overview

## Objective

Make strategy creation, storage, and optimization data-driven and accessible via MCP so the AI can create, test, and improve strategies without manual code changes.

## Current State

- Strategies are stored in `strategies` table (custom strategies) and `ai_strategy` table (single AI strategy)
- Strategy templates exist in code (`strategy-templates.ts`) but are not database-backed
- MCP tools can list, create, update, delete, and activate strategies
- Backtesting exists (`evaluateStrategyBacktest`) but only uses recent live ticks
- No multi-symbol strategy management
- No strategy performance tracking per symbol

## Key Problems

1. **No historical backtest infrastructure** — `evaluateStrategyBacktest` uses recent live ticks only, not historical candles
2. **Strategies are not symbol-aware** — no per-symbol strategy performance tracking
3. **No strategy versioning** — can't track how strategies evolve over time
4. **AI can't create strategies from data** — requires manual code changes or template selection
5. **No strategy optimization loop** — AI suggestions are static, not data-driven

## Phases

- [phase1.md](phase1.md) — Database schema for strategies, templates, backtest results
- [phase2.md](phase2.md) — Multi-symbol strategy management
- [phase3.md](phase3.md) — AI-driven strategy creation from observations
- [phase4.md](phase4.md) — Backtest engine with historical data
- [phase5.md](phase5.md) — Strategy optimization & versioning

## Recommendations

1. **Store everything in SQLite** — don't rely on MT5 to serve historical data on demand. Store ticks, candles, observations, and backtest results locally.
2. **Use the existing `market_ticks` table as the source of truth** — it already has direction, velocity, timestamps, and symbol. Add candle aggregation on top.
3. **Make strategies JSON-driven** — store rules as JSON in the database so the AI can modify them without code changes.
4. **Add symbol dimension to all strategy tables** — every strategy, template, and backtest result should track which symbol it applies to.
5. **Implement a simple backtest runner** — run strategy evaluation against stored candles, not live ticks, to avoid affecting live state.
6. **Expose everything via MCP** — the AI should be able to query historical data, run backtests, and create strategies through MCP tools.
