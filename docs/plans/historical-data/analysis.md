# Historical Data Plan — Comprehensive Analysis & Recommendations

## Executive Summary

**The site is live and pushing data, but historical data infrastructure is missing.** The foundation exists (live tick pipeline, database, MCP), but without `market_candles`, `observations`, and `backtest_results` tables, the AI cannot perform historical analysis or create data-driven strategies.

**Implementation priority:** Stage 2 (schema) → Stage 1 (fix timestamps) → Stage 3/4 (EA + routes) → Stage 5 (observations) → Stage 6 (MCP tools) → Stage 7 (backtesting) → Stage 8 (frontend).

**Estimated effort:** 2-3 days for backend (stages 1-7), 1 day for frontend (stage 8).

## Current State Assessment

### What Works

1. **Live data pipeline is solid**: EA → `/api/ea/tick` → `market_ticks` table. Timestamps, direction, velocity, price, spread, session all captured correctly.
2. **Database is functional**: SQLite with WAL mode, foreign keys enabled, proper indexes on `market_ticks(time)` and `market_ticks(symbol)`.
3. **MCP infrastructure exists**: 30+ tools, Bearer auth, JSON-RPC 2.0. AI can query trades, logs, telemetry, strategies.
4. **EA is connected and pushing data**: Site is live at `localhost:3000`, EA is sending ticks every 3 seconds.
5. **Time utilities created**: `backend/src/utils/time.ts` has all planned functions (`getMinuteBucket`, `nowEpochMs`, etc.).
6. **Basic backtest exists**: `evaluateStrategyBacktest` in `strategy.ts` can evaluate strategies against ticks.

### What's Missing

| Component | Status | Impact |
|-----------|--------|--------|
| `market_candles` table | ❌ Does not exist | No long-term candle storage, no candle-based backtesting |
| `observations` table | ❌ Does not exist | No per-observation records, only aggregate counter |
| `backtest_results` table | ❌ Does not exist | Backtest results are ephemeral, not persisted |
| `strategy_templates` table | ❌ Does not exist | Templates hardcoded in JS, not queryable via MCP |
| Candle timestamp alignment | ⚠️ Bug | Candle `time` uses `Date.now()` instead of minute-aligned timestamp |
| EA history support | ❌ Missing | EA only broadcasts current candle, cannot serve history |
| History routes | ❌ Missing | No `/api/market/candles` or `/api/market/observations` |
| Historical MCP tools | ❌ Missing | No `get_market_candles`, `get_market_observations`, etc. |
| Frontend history loading | ❌ Missing | Chart only shows live data, no historical context |

## Detailed Findings

### Stage 1: Time Utilities (PARTIALLY IMPLEMENTED)

**Completed:**
- `backend/src/utils/time.ts` created with all planned functions

**Missing:**
- `aggregateTickIntoCandle()` in `market-ingestion.ts` uses inline `Math.floor(now / 60000)` instead of `getMinuteBucket()`
- Candle `time` field set to `Date.now()` instead of minute-aligned timestamp (`currentBucket * 60000`)
- `CandlestickChart.tsx` uses inline `new Date()` formatting instead of `formatTime()`

**Impact:** Chart displays candles at incorrect x-positions. This is a **critical bug** that breaks chart accuracy.

**Fix required:**
```typescript
// In market-ingestion.ts aggregateTickIntoCandle():
time: currentBucket * 60000, // minute-aligned epoch ms
```

### Stage 2: Database Schema (NOT DONE)

**Required new tables:**

1. **`market_candles`** — OHLC candle storage with indefinite retention
   - Columns: `id`, `symbol`, `time`, `open`, `high`, `low`, `close`, `volume`, `direction`, `minute_bucket`, `created_at`
   - Index: `(symbol, time)`
   - Retention: **indefinite** (1-minute candles are ~50 bytes each)

2. **`observations`** — Individual AI observation records
   - Columns: `id`, `symbol`, `timestamp`, `direction`, `velocity`, `price`, `candle_id`, `tags`, `metadata`, `created_at`
   - Index: `(symbol, timestamp)`

3. **`backtest_results`** — Persisted backtest results
   - Columns: `id`, `strategy_id`, `strategy_version_id`, `symbol`, `from_time`, `to_time`, `initial_balance`, `final_balance`, `total_trades`, `wins`, `losses`, `win_rate`, `profit_factor`, `max_drawdown`, `sharpe_ratio`, `avg_win`, `avg_loss`, `metadata`, `created_at`

4. **`strategy_templates`** — Database-backed strategy templates
   - Columns: `id`, `name`, `description`, `mode`, `category`, `rules`, `default_config`, `tags`, `created_at`, `updated_at`

5. **`strategy_versions`** — Strategy evolution tracking
   - Columns: `id`, `strategy_id`, `symbol`, `name`, `description`, `mode`, `rules`, `config`, `parent_version_id`, `created_by`, `created_at`

6. **`strategy_symbol_performance`** — Per-symbol performance tracking
   - Columns: `id`, `strategy_id`, `symbol`, `total_trades`, `wins`, `losses`, `win_rate`, `total_profit`, `avg_profit_per_trade`, `max_drawdown`, `last_updated`
   - Unique constraint: `(strategy_id, symbol)`

### Stage 3: EA Historical Data (NOT DONE)

**Current EA capabilities:**
- Broadcasts current candle via `BroadcastMarketUpdate()`
- Syncs every 3 seconds via `SyncWithWebApp()`
- Receives pending commands from backend

**Missing:**
- No `CopyRates` lookback for historical data
- No history request polling
- No `CopyTicks` support

**Recommended approach:** EA push on connect (Option A)
- Add `PushHistoricalCandles(count)` to generated EA
- Call from `OnInit()` after indicator handles are created
- Sends last 1000 candles via existing `/api/update-market` endpoint
- No new backend routes needed

**Why not polling (Option B):**
- MT5 `WebRequest` is outbound-only
- EA already polls `/api/ea/tick` — adding another poll adds complexity
- Push on connect is simpler and faster

### Stage 4: Backend Routes (NOT DONE)

**Required new routes:**

1. `GET /api/market/candles` — Query OHLC candles from `market_candles` table
   - Query params: `symbol`, `from`, `to`, `limit`
   - Returns: `{ symbol, candles, count, from, to }`

2. `GET /api/market/observations` — Query observations with filters
   - Query params: `symbol`, `from`, `to`, `direction`, `minVelocity`, `limit`
   - Returns: `{ symbol, observations, count }`

3. `POST /api/ea/request-history` — Queue history request for EA (fallback)
   - Request: `{ symbol, timeframe, count }`
   - Returns: `{ queued: true }`

**Required WebSocket messages:**
- `request_history` — frontend requests history
- `history_response` — backend responds with candles

### Stage 5: Observations Service (NOT DONE)

**Current state:**
- `ai_knowledge.total_observations` is just a counter
- No per-observation records

**Required:**
- New service: `backend/src/services/observations.ts`
- Store observations during `updateMarket()` with tags and metadata
- Generate insights from observation patterns
- Link observations to strategies

### Stage 6: Enhanced MCP Tools (NOT DONE)

**Required new tools:**

1. `get_market_candles` — Get OHLC candles with time range
2. `get_market_observations` — Get observations with filters
3. `backtest_strategy_with_history` — Backtest using historical candles
4. `create_strategy_from_observations` — Create strategy from observation patterns
5. `generate_observation_insights` — Generate insights from observations

**Existing tools to fix:**
- `get_recent_candles` — misleading name, returns ticks not candles. Consider renaming to `get_recent_ticks`.

### Stage 7: Strategy Creation & Backtesting (PARTIALLY IMPLEMENTED)

**Current state:**
- `evaluateStrategyBacktest(mode, limit)` exists but uses ticks, not candles
- No time range support
- No result persistence
- No strategy creation from observations

**Required:**
- Candle-based backtest engine
- Time range support (`from`/`to` instead of just `limit`)
- Persist results to `backtest_results` table
- Strategy generation from observations
- Strategy versioning

### Stage 8: Frontend Chart (NOT DONE)

**Current state:**
- Chart only shows live data from WebSocket
- No historical data loading
- No WebSocket history message handlers

**Required:**
- Load historical candles on mount/symbol change
- Merge historical + live candles
- Handle `history_response` WebSocket messages
- Loading and empty states
- **Must not break existing live data functionality**

## Critical Bugs to Fix

### 1. Candle Timestamp Alignment (CRITICAL)

**File:** `backend/src/services/market-ingestion.ts:66, 94`

**Bug:** New candles get `time: Date.now()` instead of minute-aligned timestamp.

**Impact:** Frontend chart displays candles at incorrect x-positions.

**Fix:**
```typescript
// Line 66 and 94:
time: currentBucket * 60000, // minute-aligned epoch ms
```

### 2. `/api/market/history` SQL Bug

**File:** `backend/src/routes/market.ts:57-59`

**Bug:** SQL compares against `ea_connections.symbol` instead of requested symbol parameter.

**Impact:** Returns empty or wrong data when querying for specific symbols.

**Fix:**
```sql
-- Current (wrong):
SELECT * FROM market_ticks WHERE time >= ? AND time <= ? AND (SELECT symbol FROM ea_connections WHERE id = 1) = ?

-- Fixed:
SELECT * FROM market_ticks WHERE symbol = ? AND time >= ? AND time <= ? ORDER BY time ASC
```

### 3. `get_recent_candles` Misleading Name

**File:** `backend/src/mcp_server.ts:550-557`

**Bug:** Tool name says "candles" but returns `market_ticks` rows (raw ticks, not OHLC candles).

**Impact:** AI expects OHLC data but gets raw ticks.

**Fix:** Either rename to `get_recent_ticks` or update to query `market_candles` table.

## Implementation Recommendations

### Storage Strategy

**Store everything locally in SQLite.** Do NOT rely on MT5 to serve historical data on demand because:
- MT5 `WebRequest` is outbound-only, can't listen for history requests
- Broker history servers have lookback limits (typically 1-2 years for M1)
- Network latency and reliability issues
- Data loss if MT5 is offline

**Retention policy:**
- `market_ticks`: 7 days (current) — raw tick data for recent analysis
- `market_candles`: **indefinite** — aggregated OHLC for backtesting
- `observations`: **indefinite** — AI insights and strategy generation
- `backtest_results`: **indefinite** — strategy performance tracking

### Data Flow

```
EA → POST /api/ea/tick → updateMarket() → market_ticks (7-day retention)
                          → aggregateTickIntoCandle() → symbolStates.candles (in-memory)
                          → background job → market_candles (indefinite)
                          → storeObservation() → observations (indefinite)

AI via MCP → get_market_candles → market_candles table
           → get_market_observations → observations table
           → backtest_strategy_with_history → backtest_results table
```

### Backend Improvements Needed

1. **Add candle persistence in `app-store.ts`:**
   - After `aggregateTickIntoCandle()`, check if candle is complete (minute bucket changed)
   - If complete, persist to `market_candles` table
   - Batch inserts for performance (every 10 completed candles)

2. **Add background candle aggregation:**
   - In `index.ts`, add interval job to aggregate `market_ticks` → `market_candles`
   - Run every 5 minutes to catch any missed candles
   - Query: `SELECT * FROM market_ticks WHERE time > last_aggregation_time`
   - Group by `(symbol, minute_bucket)`, build OHLC, insert

3. **Fix `market-ingestion.ts` timestamp alignment:**
   - Use `getMinuteBucket()` from utils
   - Set candle `time` to `currentBucket * 60000`

### Frontend Improvements Needed

1. **Load historical candles on mount:**
   - Call `/api/market/candles?symbol=Step Index&limit=1000` on startup
   - Merge with live candles from WebSocket
   - Deduplicate by timestamp

2. **Handle WebSocket history messages:**
   - Add `history_response` handler to `useWebSocket.ts`
   - Update chart with historical data

3. **Add history loading UI:**
   - Date range picker (1 day, 7 days, 30 days, custom)
   - Load button
   - Progress indicator

4. **Ensure backward compatibility:**
   - Chart must work without historical data (live-only mode)
   - Graceful degradation if history load fails
   - No breaking changes to existing WebSocket message handlers

## How Price Moves — What to Track

For the AI to understand how a symbol moves, the system should capture:

1. **Velocity** — rate of price change (points per second)
   - Already captured: `market_ticks.velocity`
   - Use case: Identify high-momentum periods

2. **Direction** — up/down/flat per tick and per candle
   - Already captured: `market_ticks.direction`, `market_candles.direction`
   - Use case: Trend detection, reversal patterns

3. **Volatility** — price range per minute, ATR
   - Already captured: candle `high - low`, tick `spread`
   - Use case: Adjust stop-loss/take-profit dynamically

4. **Session patterns** — time-of-day volatility profiles
   - Already captured: `market_ticks.session`, `ai_knowledge.time_of_day_patterns`
   - Use case: Trade only during high-volatility sessions

5. **Spread impact** — how spread affects effective entry/exit
   - Already captured: `market_ticks.spread`
   - Use case: Avoid trading during high-spread periods

6. **Liquidity patterns** — buy/sell locked states
   - Already captured: `market_ticks.buy_locked`, `market_ticks.sell_locked`
   - Use case: Identify support/resistance levels

**The `market_ticks` table already captures all of this.** The gap is storage duration and aggregation. Adding `market_candles` with indefinite retention solves 80% of the problem.

## Conclusion

**The site is live and pushing data. The foundation is solid.**

The gap is:
1. **Storage** — add `market_candles` for long-term candle history
2. **Querying** — add MCP tools to access historical data
3. **Backtesting** — run strategies against stored candles
4. **Strategy creation** — make strategies data-driven, not code-driven

**Recommended approach:**
- Store everything locally in SQLite
- Let the AI query via MCP
- Don't depend on MT5 for history (unreliable, limited)
- Extend the existing `market_ticks` schema rather than replacing it
- Fix the critical candle timestamp bug before building on top of it

**Next steps:**
1. Fix Stage 1 timestamp alignment bug
2. Implement Stage 2 database schema
3. Implement Stage 3 EA history push
4. Continue with stages 4-8 in order
