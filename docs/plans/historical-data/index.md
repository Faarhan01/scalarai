# Historical Data Plan — Index

## Overview

This plan adds historical tick/candle storage, observation tracking, backtesting infrastructure, and frontend historical data display to ScalarAI. The goal is to enable the AI to understand how symbols move over time and create data-driven strategies via MCP.

## Current Status

| Stage | Name | Status |
|-------|------|--------|
| [stage-1.md](stage-1.md) | Time Utility & Candle Timestamps | ⚠️ PARTIALLY IMPLEMENTED — utilities created but not integrated |
| [stage-2.md](stage-2.md) | Enhanced Database Schema | ❌ NOT DONE — Required for all subsequent stages |
| [stage-3.md](stage-3.md) | EA Historical Data Support | ❌ NOT DONE — EA changes required |
| [stage-4.md](stage-4.md) | Backend History Routes & WebSocket | ❌ NOT DONE — Depends on stage 2 |
| [stage-5.md](stage-5.md) | Observations Service & AI Insights | ❌ NOT DONE — Depends on stage 2 |
| [stage-6.md](stage-6.md) | Enhanced MCP Tools | ❌ NOT DONE — Depends on stages 2-5 |
| [stage-7.md](stage-7.md) | Strategy Creation & Backtesting | ⚠️ PARTIALLY IMPLEMENTED — backtest engine exists but incomplete |
| [stage-8.md](stage-8.md) | Frontend Chart & Historical Data Display | ❌ NOT DONE — Final integration phase |
| [analysis.md](analysis.md) | Comprehensive Analysis & Recommendations | ✅ Complete |

## Key Findings from Codebase Audit

### What's Working

1. **Live data pipeline is solid**: EA → `/api/ea/tick` → `market_ticks` table. Timestamps, direction, velocity, price, spread, session all captured.
2. **Database is functional**: SQLite with WAL mode, foreign keys, proper indexes. `market_ticks` has 7-day retention.
3. **MCP infrastructure exists**: 30+ tools, auth, JSON-RPC 2.0. AI can already query trades, logs, telemetry.
4. **EA is connected and pushing data**: Site is live, ticks are flowing.
5. **Time utilities created**: `backend/src/utils/time.ts` has all planned functions.

### What's Missing

1. **No `market_candles` table** — Candles only in memory (max 200), lost on restart
2. **No `observations` table** — AI observations are in-memory only (just a counter)
3. **No `backtest_results` table** — Backtest results are ephemeral
4. **No `strategy_templates` table** — Templates hardcoded in JS
5. **Candle timestamps not minute-aligned** — `time` field uses `Date.now()` instead of minute bucket
6. **EA can't serve history** — Only broadcasts current candle
7. **No historical data routes** — `/api/market/candles` doesn't exist
8. **Frontend doesn't load history** — Only shows live data from WebSocket

### Critical Bugs Found

1. **Candle `time` not minute-aligned** (`market-ingestion.ts:66, 94`) — causes incorrect chart positions
2. **`/api/market/history` SQL bug** — compares against `ea_connections.symbol` instead of requested symbol
3. **`get_recent_candles` misnamed** — returns ticks, not candles
4. **No candle persistence** — all candle data lost on restart

## Recommended Implementation Order

### Phase 1: Foundation (Must complete first)
1. **Stage 2** — Add `market_candles`, `observations`, `backtest_results`, `strategy_templates` tables
2. **Stage 1 (fix)** — Align candle timestamps to minute boundaries

### Phase 2: Data Pipeline
3. **Stage 3** — EA pushes historical candles on connect
4. **Stage 4** — Backend routes for candle/observation queries
5. **Stage 5** — Observations service for AI insights

### Phase 3: AI & Strategy
6. **Stage 6** — MCP tools for historical data queries
7. **Stage 7** — Candle-based backtest engine with persistence

### Phase 4: Frontend
8. **Stage 8** — Frontend chart loads and displays historical data

## Key Recommendations

1. **Store historical data locally in SQLite** — Don't rely on MT5 to serve history on demand. MT5 `WebRequest` is outbound-only, broker history is limited, and network reliability is poor.

2. **Use `market_ticks` as raw data source** — It already has direction, velocity, timestamps. Aggregate into `market_candles` for long-term storage.

3. **Keep `market_candles` indefinitely** — 1-minute candles are small (~50 bytes each). A year of data is ~18MB, trivial for SQLite.

4. **Make strategies JSON-driven** — Store rules as JSON in database so AI can modify them without code changes.

5. **Add symbol dimension to all strategy tables** — Every strategy, template, and backtest result should track which symbol it applies to.

6. **Expose everything via MCP** — The AI should query historical data, run backtests, and create strategies through MCP tools.

## Contracts at Risk

These critical contracts must not be broken during implementation:

| Contract | Location | Consumer |
|----------|----------|----------|
| `getFullStatusPayload()` shape | `app-store.ts:140-179` | Frontend `App.tsx` `onInit` handler |
| `updateMarket()` broadcast shape | `app-store.ts:223-238` | Frontend chart via WebSocket `tick` message |
| `getPendingEaCommand()` | `app-store.ts:188-192` | EA via `POST /api/ea/tick` response |
| `getAndClearPendingOrders()` | `app-store.ts:132-136` | EA via `GET /poll` |
| WebSocket message types | `app-store.ts`, `dashboard.ts` | Frontend `useWebSocket.ts` handlers |
| Candle `time` format | `market-ingestion.ts`, `CandlestickChart.tsx` | `lightweight-charts` expects epoch seconds UTC |
| `market_ticks` schema | `schema.sql`, `repository.ts` | EA tick ingestion, MCP queries |
