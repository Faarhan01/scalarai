# ScalarAI Knowledgebase & Pattern Checker — Full Migration Plan

> Improve what ScalarAI already offers. Add proper pattern checking, extend the knowledgebase (observations, strategies, patterns/indicators), and wire it into the existing MCP layer. No unnecessary things — only capabilities that replace or improve on what already exists.

**Source of truth:** `backend/src/db/schema.sql` — one schema file for everything.  
**Entry point:** `backend/src/mcp_server.ts` — all MCP tools and resources live here.  
**Database access:** `backend/src/db/repository.ts` — `ScalarAiDb` class with typed wrappers.  
**Types:** `backend/src/types/index.ts` — TypeScript interfaces for every row.  
**Bridge:** `backend/src/gateway/mt5-bridge.ts` → `mt5_bridge_cli.py` → vendored `mt5_pkg_bridge/` (identical to `trader/pkg/mt5/mt5_pkg_bridge`).  
**Knowledgebase:** `backend/src/knowledgebase/` — all knowledgebase code, barrel-exported from `index.ts`.

---

## 1. Full ScalarAI Site Structure

### Frontend (`frontend/src/`)

```
frontend/src/
├── App.tsx                          # root layout, tab navigation
├── main.tsx                         # entry point
├── components/
│   ├── ai/
│   │   ├── AiStudyFeed.tsx          # live market telemetry feed
│   │   ├── KnowledgeBase.tsx        # strategy performance + templates UI
│   │   └── StrategyPanel.tsx        # strategy management panel
│   ├── charts/
│   │   ├── CandlestickChart/        # TradingView-style candlestick (React)
│   │   ├── TelemetryStream.tsx      # live tick stream visualization
│   ├── dashboard/
│   │   ├── PriceChart.tsx           # price chart
│   │   ├── StatsCards.tsx           # summary cards
│   │   └── TradePanel.tsx           # trade entry/management
│   ├── research/
│   │   └── ResearchLab.tsx          # 4 tabs: backtest | patterns | indicators | strategyforge
│   ├── layout/                      # AppShell, Header, StatusBar, TabBar, MobileDrawer, SymbolSwitcher
│   ├── trades/                      # TradeList, TradeRow, TradeFilters
│   ├── portfolio/PortfolioView.tsx
│   ├── symbols/BrokerSymbolsView.tsx
│   ├── settings/                    # SettingsForm, AssetSelector, WebRequestTest
│   ├── downloads/DownloadsCenter.tsx
│   ├── gateway/GatewayConsole.tsx
│   ├── logs/LogsViewer.tsx
│   └── ui/                          # Badge, Button, Card, Modal, ErrorBanner
├── hooks/                           # useAiStudyFeed, useAppStatus, useChartData, useSettings, etc.
├── services/
│   ├── api.ts                       # REST API client
│   └── ws.ts                        # WebSocket client
├── styles/                          # globals.css, components.css, tokens/
├── types/                           # api.ts, index.ts
└── tokens/                          # colors, spacing, typography, shadows
```

### Backend (`backend/src/`)

```
backend/src/
├── db/
│   ├── schema.sql                   # CREATE TABLE for all tables (single source of truth)
│   ├── repository.ts                # ScalarAiDb — all read/write methods (750 lines)
│   ├── index.ts                     # exports scalarAiDb singleton
│   └── migrate.ts                   # openDb() + migrate() + seedDefaults()
├── services/
│   ├── knowledge.ts                 # updateKnowledgeBaseFromTelemetry + formatKnowledgeBase
│   ├── observations.ts              # ObservationsService — store/query/generateInsights
│   ├── strategy.ts                  # evaluateStrategyBacktest
│   ├── strategy-backtest.ts         # BacktestEngine (in-process, candles only)
│   ├── strategy-research.ts         # scanCandlePatterns + runBacktest (pattern_scan)
│   ├── strategy-templates.ts        # STRATEGY_TEMPLATES (8 built-in)
│   ├── strategy-research.ts         # analyzeMarket, analyzeStrategyPerformance, etc.
│   ├── market-ingestion.ts          # tick/candle ingestion from bridge
│   ├── state-persistence.ts         # minimal
│   └── defaults.ts                  # default config/knowledge/strategy
├── mcp_server.ts                    # 80+ tools, ~30 resources, 5 prompts — the protocol layer
├── routes/                          # REST: market, trades, strategies, settings, ea, health, mcp, ai, cotrade, status
├── types/index.ts                   # every TypeScript interface (~600 lines)
├── gateway/
│   ├── mt5-bridge.ts                # TypeScript client → Python subprocess
│   ├── mt5_bridge_cli.py            # Python CLI adapter (JSON-RPC over stdout)
│   ├── mt5/mt5_pkg_bridge/          # vendored bridge (identical to trader/pkg/mt5/mt5_pkg_bridge)
│   ├── gateway-manager.ts           # central telemetry, positions, live order execution
│   ├── routes.ts                    # REST + streaming endpoints
│   ├── enums.ts                     # enums
│   └── README.md                    # bridge architecture docs
├── core/
│   ├── config.ts                    # databasePath, paths
│   ├── composition.ts               # DI composition
│   ├── application/container.ts     # application container
│   ├── application/ports.ts         # port interfaces
│   └── server/
│       ├── research.ts              # StrategyForge CSV parsing & storage (shared with MCP)
│       ├── handlers.ts              # request handlers
│       ├── routes.ts                # route definitions
│       ├── bot_routes.ts            # bot-specific routes
│       ├── db_routes.ts             # DB admin routes
│       ├── validation.ts            # input validation
│       └── responses.ts            # response helpers
├── middleware/                      # auth, cors, error, logger, rateLimit
├── utils/                           # auth, index, ip, response, time, validators
├── websockets/                      # bridge.ts, dashboard.ts
├── index.ts                         # server entry point
├── services/trading-machine.ts      # trading state machine (xstate)
├── services/app-store.ts            # central state store (45KB)
└── services/trade-execution.ts      # trade execution logic
```

### Frontend Knowledgebase (`KnowledgeBase.tsx`)

- **Strategy Performance Dashboard**: cards showing name, category, win rate, profit factor, trades
- **Strategy Templates**: 8 built-in templates (scalping, day trading, momentum, breakout, reversal, adaptive)
- No pattern results display, no statistical verdicts, no null-control comparison

### Frontend Research Lab (`ResearchLab.tsx`)

4 tabs:
1. **Backtester** — in-process backtest with strategy selector, parameters, equity curve, trade table
2. **Pattern Recognition** — scans 100 bars, shows Doji, Hammer, Shooting Star, Engulfing with hardcoded confidence
3. **Indicator Inspector** — RSI, EMA, SMA, Bollinger, MACD on live chart
4. **StrategyForge MT5 Runs** — import/paste StrategyForge CSV reports, view native MT5 test results

---

## 2. Knowledgebase Structure — What Exists vs What's Missing

### Tables that exist (from `schema.sql`)

| Table | Purpose | Status |
|---|---|---|
| `ai_knowledge` | 1 row — total_observations, global_average_speed, peak_velocity_registered, time_of_day_patterns (JSON), last_updated | Velocity-only, no patterns |
| `ai_strategy` | 1 row — name, mode, rules (JSON) | Basic AI strategy config |
| `observations` | per-tick: id, symbol, timestamp, direction, velocity, price, candle_id, tags, metadata | Stores velocity, not full OHLC |
| `market_candles` | per-bar: symbol, time, open, high, low, close, volume, direction, minute_bucket | Good — has OHLC |
| `market_ticks` | per-tick: symbol, time, price, direction, spread, session | Good |
| `strategies` | id, name, description, mode, rules (JSON array), created_at, updated_at | Basic |
| `strategy_versions` | version rows linked to strategy_id | Version tracking |
| `backtest_results` | backtest runs: profit_factor, win_rate, drawdown, sharpe, etc. | No spread/cost, no split-half, no timeframe |
| `strategy_symbol_performance` | per-strategy-per-symbol aggregates | Good |
| `strategy_templates` | 8 built-in templates (category, rules, default_config, tags) | Good |
| `trades`, `system_logs`, `ea_connections`, `symbol_metadata`, `settings` | runtime state | Good |

### What `knowledge.ts` does today

- `updateKnowledgeBaseFromTelemetry(symbol, telemetry)` — EMA-smooths velocity, tracks peak, builds hourly `timeOfDayPatterns`
- `formatKnowledgeBase(knowledge)` — human-readable summary string
- `getAiKnowledge()` / `upsertAiKnowledge()` in repository.ts — read/write the single `ai_knowledge` row

**What it does NOT do:** no pattern storage, no statistical significance, no null control, no split-half replication, no cost/spread modeling, no `EDGE / NO EDGE / INCONCLUSIVE` verdict, no forward-return analysis, no indicator library beyond what `research-engine.ts` scans at runtime.

### What `observations.ts` `generateInsights()` does today

Computes direction distribution, velocity clusters (4 buckets), top 5 active hours, and suggests strategies by crude heuristics:
- `up > 1.5× down` → "trend_following"
- `down > 1.5× up` → "mean_reversion"
- `peakVelocity > 0.3` → "velocity_scalping"
- `top hour > 20% of observations` → "time_based_trading"

**What it does NOT do:** no t-test, no p-value, no null comparison, no split-half, no cost adjustment, no expectancy. The heuristics are not validated against data.

### What `research-engine.ts` `scanCandlePatterns()` does today

Detects: Doji, Hammer, Shooting Star, Bullish/Bearish Engulfing. Returns `PatternMatch[]` with hardcoded confidence (0.75, 0.82, 0.85).

**What it does NOT do:** no forward-return measurement, no t-test vs baseline, no null control, no split-half, no cost adjustment, no verdict. Confidence is arbitrary.

---

## 3. MCP Inventory — What Exists vs What's Missing

### MCP Tools (80+)

| Category | Tools | Count |
|---|---|---|
| System status | get_system_status, get_trading_state, get_bridge_state, get_calibration_state | 4 |
| AI knowledge | get_ai_knowledge_base, get_ai_strategy, synthesize_ai_strategy | 3 |
| Strategies | list_strategies, create_strategy, update_strategy, delete_strategy, activate_strategy | 5 |
| Backtesting | backtest_strategy, backtest_strategy_with_history | 2 |
| Database | query_db | 1 |
| Trading settings | update_trading_settings, toggle_automated_trading | 2 |
| Trade history | get_trade_history, get_system_logs | 2 |
| Trade execution | place_validated_trade, close_trade, modify_trade_sl_tp, close_all_trades | 4 |
| Symbols | get_symbols, switch_active_symbol | 2 |
| EA telemetry | get_ea_telemetry, reset_stats | 2 |
| StrategyForge | ingest_strategyforge_csv, get_strategyforge_results | 2 |
| Market data | get_market_telemetry, get_recent_candles, get_market_candles, get_market_observations | 4 |
| Market analysis | analyze_market, analyze_strategy_performance, get_strategy_performance, optimize_strategy, recommend_strategy | 5 |
| Strategy templates | list_strategy_templates, create_strategy_from_template | 2 |
| Export | export_data | 1 |
| Knowledge | get_knowledge_summary, generate_observation_insights | 2 |
| MT5 bridge | mt5_get_bridge_status, mt5_connect_bridge, mt5_disconnect_bridge, mt5_get_account_info, mt5_get_terminal_info, mt5_get_symbols, mt5_get_symbol_info, mt5_get_positions, mt5_get_rates, mt5_get_history_deals, mt5_get_history_orders, mt5_buy, mt5_sell, mt5_close_position, mt5_close_all, mt5_call_function, mt5_list_functions, mt5_modify_position, mt5_get_orders, mt5_get_tick, mt5_get_market_depth, mt5_calc_margin, mt5_calc_profit, mt5_get_totals, execute_mt5_bridge_order | 26 |
| **Total** | | **~80** |

### MCP Resources (30+)

| URI | Purpose |
|---|---|
| `scalarai://status` | full system state |
| `scalarai://config` | trading config |
| `scalarai://strategy/active` | active AI strategy |
| `scalarai://strategies` | strategy catalogue |
| `scalarai://strategy-templates` | reusable templates |
| `scalarai://knowledge/base` | AI knowledge base |
| `scalarai://symbols` | connected symbols |
| `scalarai://trades/open` | open positions |
| `scalarai://trades/recent` | recent trade history |
| `scalarai://logs/recent` | system logs |
| `scalarai://tester/results` | StrategyForge tester results |
| `scalarai://guides/backtesting` | backtesting guide (markdown) |
| `scalarai://bridge/*` | MT5 bridge status, functions, positions, symbols, deals |
| `scalarai://candles/{symbol}` | candles for a symbol |
| `scalarai://rates/{symbol}/{timeframe}` | rates from MT5 |
| `scalarai://observations/{symbol}` | AI observations |

### MCP Prompts (5)

| Prompt | Purpose |
|---|---|
| `assess_risk` | review exposure and decide if safe to trade |
| `review_strategy` | assess strategy performance, recommend adjustments |
| `research_market` | analyze market conditions before trading |
| `summarise_session` | summarize trading session |
| `validate_strategy` | evaluate strategy before enabling (uses native MT5 tester evidence) |

### What MCP is MISSING (needed for knowledgebase improvement)

| Missing Tool | Why Needed |
|---|---|
| `check_pattern` | Run statistical pattern check (t-test, null, split-half, cost) and store result |
| `get_pattern_results` | List stored pattern tests with verdicts |
| `get_pattern_result` | Get one pattern result by ID |
| `get_null_control` | Run null baseline for comparison |
| `list_indicators` | List indicator library entries |
| `add_indicator` | Add custom indicator to library |
| `get_knowledge_summary` | Full knowledgebase summary (velocity + patterns + edge count) |
| `record_pattern_result` | Store a pattern test result (called by check_pattern internally) |

### Missing Resources

| Missing URI | Why Needed |
|---|---|
| `scalarai://knowledge/patterns` | all pattern results with verdicts |
| `scalarai://knowledge/edge` | only EDGE verdict patterns |
| `scalarai://knowledge/indicators` | indicator library |

---

## 4. Proposed Improvements — File by File

### 4.1 `src/db/schema.sql` — Add tables (the only schema change)

**New tables:**

```sql
-- Pattern test results: every pattern run is recorded here with statistical verdict
CREATE TABLE IF NOT EXISTS pattern_results (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL DEFAULT 'Step Index',
  timeframe TEXT NOT NULL DEFAULT 'M15',
  pattern_name TEXT NOT NULL,
  pattern_category TEXT NOT NULL DEFAULT 'candlestick', -- candlestick | indicator | shape
  occurrences INTEGER NOT NULL DEFAULT 0,
  forward_return_mean REAL NOT NULL DEFAULT 0,
  forward_return_sd REAL NOT NULL DEFAULT 0,
  t_statistic REAL NOT NULL DEFAULT 0,
  p_value REAL NOT NULL DEFAULT 1,
  win_rate REAL NOT NULL DEFAULT 0,
  expectancy REAL NOT NULL DEFAULT 0,
  net_after_cost REAL NOT NULL DEFAULT 0,
  spread_points REAL NOT NULL DEFAULT 0,
  verdict TEXT NOT NULL DEFAULT 'INCONCLUSIVE' CHECK (verdict IN ('EDGE','NO EDGE','INCONCLUSIVE')),
  null_comparison TEXT NOT NULL DEFAULT '{}', -- JSON: {t, p_value, mean}
  split_half_agree INTEGER NOT NULL DEFAULT 0,
  split_half_t1 REAL, split_half_t2 REAL,
  min_trades_threshold INTEGER NOT NULL DEFAULT 30,
  bars_analyzed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indicator library: reusable indicator definitions with parameter schemas
CREATE TABLE IF NOT EXISTS indicator_library (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom', -- trend | momentum | volatility | volume | custom
  formula TEXT NOT NULL DEFAULT '{}',      -- JSON: parameter names, defaults, description
  is_builtin INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Pattern-to-strategy links: which patterns fed into which strategy versions
CREATE TABLE IF NOT EXISTS pattern_strategy_links (
  id TEXT PRIMARY KEY,
  pattern_result_id TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pattern_result_id) REFERENCES pattern_results(id),
  FOREIGN KEY (strategy_id) REFERENCES strategies(id)
);
```

**Enhanced backtest_results (ALTER TABLE):**

```sql
ALTER TABLE backtest_results ADD COLUMN spread_points REAL DEFAULT 0;
ALTER TABLE backtest_results ADD COLUMN net_after_cost REAL DEFAULT 0;
ALTER TABLE backtest_results ADD COLUMN split_half_agree INTEGER DEFAULT 0;
ALTER TABLE backtest_results ADD COLUMN null_beaten INTEGER DEFAULT 0;
```

**New indexes:**

```sql
CREATE INDEX IF NOT EXISTS idx_pattern_results_symbol_tf ON pattern_results(symbol, timeframe);
CREATE INDEX IF NOT EXISTS idx_pattern_results_verdict ON pattern_results(verdict);
CREATE INDEX IF NOT EXISTS idx_pattern_results_created ON pattern_results(created_at);
CREATE INDEX IF NOT EXISTS idx_indicator_library_category ON indicator_library(category);
CREATE INDEX IF NOT EXISTS idx_pattern_strategy_links_strategy ON pattern_strategy_links(strategy_id);
```

### 4.2 `src/types/index.ts` — Add TypeScript interfaces

Add after `ObservationInsights` (around line 300):

```typescript
export interface PatternResultRow {
  id: string;
  symbol: string;
  timeframe: string;
  pattern_name: string;
  pattern_category: string;
  occurrences: number;
  forward_return_mean: number;
  forward_return_sd: number;
  t_statistic: number;
  p_value: number;
  win_rate: number;
  expectancy: number;
  net_after_cost: number;
  spread_points: number;
  verdict: 'EDGE' | 'NO EDGE' | 'INCONCLUSIVE';
  null_comparison: string; // JSON
  split_half_agree: number;
  split_half_t1?: number;
  split_half_t2?: number;
  min_trades_threshold: number;
  bars_analyzed: number;
  created_at: string;
}

export interface IndicatorLibraryRow {
  id: string;
  name: string;
  category: string;
  formula: string; // JSON
  is_builtin: number;
  created_at: string;
}

export interface PatternCheckParams {
  symbol: string;
  timeframe: string;
  pattern_name: string;
  pattern_category?: string;
  bars: number;          // how many historical bars to scan
  forward_bars: number;  // bars forward to measure return
  cost_points?: number;  // spread cost in points, default from symbol metadata
  min_trades?: number;   // default 30
}
```

Add to `ScalarAiDb` type usage in `repository.ts` imports.

### 4.3 `src/db/repository.ts` — Add DAO methods

Add to `ScalarAiDb` class (before the final closing brace):

```typescript
// Pattern results
insertPatternResult(result: PatternResultRow): void {
  this.db.prepare(
    `INSERT INTO pattern_results (id, symbol, timeframe, pattern_name, pattern_category, occurrences, forward_return_mean, forward_return_sd, t_statistic, p_value, win_rate, expectancy, net_after_cost, spread_points, verdict, null_comparison, split_half_agree, split_half_t1, split_half_t2, min_trades_threshold, bars_analyzed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    result.id, result.symbol, result.timeframe, result.pattern_name,
    result.pattern_category, result.occurrences, result.forward_return_mean,
    result.forward_return_sd, result.t_statistic, result.p_value,
    result.win_rate, result.expectancy, result.net_after_cost,
    result.spread_points, result.verdict, result.null_comparison,
    result.split_half_agree, result.split_half_t1 ?? null,
    result.split_half_t2 ?? null, result.min_trades_threshold,
    result.bars_analyzed
  );
}

getPatternResults(symbol?: string, timeframe?: string, verdict?: string, limit = 50): PatternResultRow[] {
  let query = `SELECT * FROM pattern_results`;
  const params: unknown[] = [];
  const clauses: string[] = [];
  if (symbol) { clauses.push(`symbol = ?`); params.push(symbol); }
  if (timeframe) { clauses.push(`timeframe = ?`); params.push(timeframe); }
  if (verdict) { clauses.push(`verdict = ?`); params.push(verdict); }
  if (clauses.length > 0) query += ` WHERE ${clauses.join(' AND ')}`;
  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(Math.min(limit, 200));
  return this.db.prepare(query).all(...params) as PatternResultRow[];
}

getPatternResultById(id: string): PatternResultRow | undefined {
  return this.db.prepare(`SELECT * FROM pattern_results WHERE id = ?`).get(id) as PatternResultRow | undefined;
}

deletePatternResult(id: string): void {
  this.db.prepare(`DELETE FROM pattern_results WHERE id = ?`).run(id);
}

// Indicator library
insertIndicatorLibrary(indicator: IndicatorLibraryRow): void {
  this.db.prepare(
    `INSERT INTO indicator_library (id, name, category, formula, is_builtin) VALUES (?, ?, ?, ?, ?)`
  ).run(indicator.id, indicator.name, indicator.category, indicator.formula, indicator.is_builtin);
}

getAllIndicatorLibrary(): IndicatorLibraryRow[] {
  return this.db.prepare(`SELECT * FROM indicator_library ORDER BY created_at DESC`).all() as IndicatorLibraryRow[];
}

getIndicatorLibraryById(id: string): IndicatorLibraryRow | undefined {
  return this.db.prepare(`SELECT * FROM indicator_library WHERE id = ?`).get(id) as IndicatorLibraryRow | undefined;
}

upsertIndicatorLibrary(indicator: IndicatorLibraryRow): void {
  this.db.prepare(
    `INSERT INTO indicator_library (id, name, category, formula, is_builtin) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category, formula = excluded.formula`
  ).run(indicator.id, indicator.name, indicator.category, indicator.formula, indicator.is_builtin);
}

// Pattern → strategy links
insertPatternStrategyLink(link: { id: string; pattern_result_id: string; strategy_id: string; weight: number }): void {
  this.db.prepare(
    `INSERT INTO pattern_strategy_links (id, pattern_result_id, strategy_id, weight) VALUES (?, ?, ?, ?)`
  ).run(link.id, link.pattern_result_id, link.strategy_id, link.weight);
}

getPatternLinksForStrategy(strategyId: string): Array<{ id: string; pattern_result_id: string; strategy_id: string; weight: number }> {
  return this.db.prepare(`SELECT * FROM pattern_strategy_links WHERE strategy_id = ?`).all(strategyId) as any[];
}
```

### 4.4 `src/services/knowledge.ts` — Extend knowledgebase

Keep existing functions. Add:

```typescript
export interface KnowledgeSummary {
  totalObservations: number;
  globalAverageSpeed: number;
  peakVelocityRegistered: number;
  timeOfDayPatterns: Record<string, {count: number; avgSpeed: number}>;
  patternEdgeCount: number;       // patterns with EDGE verdict
  patternNoEdgeCount: number;     // patterns with NO EDGE verdict
  topPatterns: Array<{pattern_name: string; verdict: string; net_after_cost: number}>;
  lastUpdated: string;
}

export function getKnowledgeSummary(): KnowledgeSummary {
  const knowledge = scalarAiDb.getAiKnowledge();
  const patterns = scalarAiDb.getPatternResults(undefined, undefined, 100);
  const edgePatterns = patterns.filter(p => p.verdict === 'EDGE');
  const noEdgePatterns = patterns.filter(p => p.verdict === 'NO EDGE');
  const topPatterns = patterns
    .filter(p => p.verdict === 'EDGE')
    .sort((a, b) => b.net_after_cost - a.net_after_cost)
    .slice(0, 5)
    .map(p => ({pattern_name: p.pattern_name, verdict: p.verdict, net_after_cost: p.net_after_cost}));
  
  return {
    totalObservations: knowledge?.totalObservations ?? 0,
    globalAverageSpeed: knowledge?.globalAverageSpeed ?? 0,
    peakVelocityRegistered: knowledge?.peakVelocityRegistered ?? 0,
    timeOfDayPatterns: knowledge?.timeOfDayPatterns ?? {},
    patternEdgeCount: edgePatterns.length,
    patternNoEdgeCount: noEdgePatterns.length,
    topPatterns,
    lastUpdated: knowledge?.lastUpdated ?? new Date().toISOString(),
  };
}

export function formatKnowledgeBase(knowledge: KnowledgeSummary): string {
  const patternSection = [
    '',
    'Pattern Edge Summary:',
    `- Patterns with EDGE: ${knowledge.patternEdgeCount}`,
    `- Patterns with NO EDGE: ${knowledge.patternNoEdgeCount}`,
    knowledge.topPatterns.length > 0
      ? `- Top patterns:\n${knowledge.topPatterns.map(p => `  ${p.pattern_name}: ${p.net_after_cost.toFixed(4)} net`).join('\n')}`
      : '- No edge patterns found yet',
  ].join('\n');
  
  return existingFormat + patternSection;
}

export function recordPatternResult(result: PatternResultRow): void {
  scalarAiDb.insertPatternResult(result);
}

export function getPatternStats(symbol: string): { total: number; edge: number; noEdge: number; inconclusive: number } {
  const patterns = scalarAiDb.getPatternResults(symbol);
  return {
    total: patterns.length,
    edge: patterns.filter(p => p.verdict === 'EDGE').length,
    noEdge: patterns.filter(p => p.verdict === 'NO EDGE').length,
    inconclusive: patterns.filter(p => p.verdict === 'INCONCLUSIVE').length,
  };
}
```

### 4.5 `src/services/research-engine.ts` — Add statistical pattern checker

Add a `checkPattern` function that:

1. Scans bars for the pattern (reuse `scanCandlePatterns` detection logic, or add new detectors: consecutive bars, engulfing, pin bar, inside breakout, double top/bottom, M/W shapes).
2. Computes forward return after each occurrence (over `forward_bars` bars).
3. Computes Welch's t against unconditional baseline (mean of all forward returns).
4. Computes null baseline: shuffle bar signs 1000×, compute t distribution, get p_value.
5. Computes split-half: first half t, second half t, agreement check (both same sign, both |t| ≥ 1).
6. Computes expectancy and `net_after_cost` (subtract `spread_points * point` per round trip).
7. Returns verdict: `EDGE` if `|t| ≥ 2` AND halves agree AND beats null AND occurrences ≥ min_trades AND `net_after_cost > 0`; `NO EDGE` if failures are definitive; `INCONCLUSIVE` otherwise.

Also add statistical helpers: `welchT(a, b)`, `shuffleNull(returns, iterations)`, `splitHalf(returns)`.

### 4.6 `src/services/strategy-backtest.ts` — Enhance backtest engine

Add optional cost modeling:

```typescript
export interface BacktestConfig {
  takeProfitPoints: number;
  stopLossPoints: number;
  spreadPoints?: number;   // NEW: spread cost in points
  pointValue?: number;     // NEW: value per point per lot
  commissionPerLot?: number; // NEW
}
```

Modify `runBacktest` to subtract `spreadPoints * pointValue` from each trade's profit. Add `net_after_cost` field to `BacktestResult`.

### 4.7 `src/mcp_server.ts` — Add MCP tools & resources

**New tools:**

| Tool | Description | Input |
|---|---|---|
| `check_pattern` | Run statistical pattern check; store result | symbol, timeframe, pattern_name, bars, forward_bars, cost_points?, min_trades? |
| `get_pattern_results` | List stored pattern results with verdicts | symbol?, timeframe?, verdict?, limit? |
| `get_pattern_result` | Get one pattern result by ID | id |
| `get_null_control` | Run null baseline for symbol/timeframe | symbol, timeframe, bars, iterations? |
| `list_indicators` | List indicator library entries | category? |
| `add_indicator` | Add indicator to library | name, category, formula (JSON) |

**New resources:**

- `scalarai://knowledge/patterns` — all pattern results with verdicts
- `scalarai://knowledge/edge` — only EDGE verdict patterns
- `scalarai://indicators` — indicator library

**Resource handlers:** add cases in `readResource()` for the new URIs.

**Tool handler:** add cases in `handleRpc()` for `check_pattern`, `get_pattern_results`, etc. Each calls the service layer, persists to DB, returns JSON.

### 4.8 `src/routes/` — Optional REST endpoints

If REST routes mirror MCP tools, add:
- `GET /api/knowledge/patterns`
- `POST /api/knowledge/check-pattern`
- `GET /api/indicators`

(Only if the frontend needs them; MCP alone may suffice.)

---

## 5. Migration Steps (in order)

### Step 1: Backup the database
```bash
cp backend/src/db/scalarai.sqlite backend/src/db/backups/scalarai.sqlite.backup-$(date +%Y%m%d)
```

### Step 2: Run schema migration
Apply the new `CREATE TABLE` statements from section 4.1 to `scalarai.sqlite`. Use `sqlite3` CLI or a Node script:
```bash
sqlite3 backend/src/db/scalarai.sqlite < backend/src/db/schema.sql
```
(Note: `schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so it's idempotent. For ALTER TABLE on `backtest_results`, run separately and guard against "duplicate column" errors.)

### Step 3: Update TypeScript files
Edit the files listed in section 4 in this order:
1. `src/types/index.ts` — add interfaces first (other files import them)
2. `src/db/repository.ts` — add DAO methods
3. `src/services/knowledge.ts` — extend summary
4. `src/services/research-engine.ts` — add statistical checker
5. `src/services/strategy-backtest.ts` — add cost modeling (optional)
6. `src/mcp_server.ts` — add tools, resources, handlers

### Step 4: Compile and test
```bash
cd backend
npx tsc --noEmit        # type check
# then run the dev server and exercise each new MCP tool
```

### Step 5: Seed indicator library (optional, one-time)
Insert built-in indicators via `add_indicator` tool or direct SQL:
- EMA (fast/slow)
- RSI
- ATR
- Bollinger Bands
- MACD

### Step 6: Verify end-to-end
Run `check_pattern` on `Step Index` M15 for "Bullish Engulfing" and confirm:
- Result stored in `pattern_results`
- Verdict is `EDGE` / `NO EDGE` / `INCONCLUSIVE`
- `scalarai://knowledge/patterns` resource returns it

---

## 6. Rollback Plan

If anything breaks:

1. **Database:** Restore from `backend/src/db/backups/scalarai.sqlite.backup-<date>`:
   ```bash
   cp backend/src/db/backups/scalarai.sqlite.backup-<date> backend/src/db/scalarai.sqlite
   ```
2. **TypeScript:** `git checkout -- src/` (revert all source changes)
3. **Verify:** `npx tsc --noEmit` passes, existing MCP tools still work (`get_system_status`, `get_ai_knowledge_base`, `backtest_strategy`, etc.)

The migration is additive-only (new tables, new functions, new tools). No existing table is dropped or renamed. Rollback is safe.

---

## 7. What We Are NOT Adding (Deliberate Scope Boundaries)

| Item | Reason |
|---|---|
| Replacing MT5 Strategy Tester | ScalarAI's own guide says: "Use MT5's native Strategy Tester, not the in-app engine." The tester remains the source of truth for backtests. |
| Python bridge removal | The MCP → `mt5_bridge_cli.py` → `mt5_pkg_bridge` chain works. Don't touch it. |
| Fake/simulated data | All pattern checks run on real bars from `market_candles` or MT5 via bridge. |
| Unused UI / dashboard components | Backend-only changes; frontend integration only if requested. |
| More than 3 pattern detectors initially | Start with: engulfing, pin bar/hammer, inside-bar breakout, consecutive bars. Add more only if validated. |

---

## 8a. Knowledgebase Folder Structure (implemented)

The knowledgebase code has been restructured into `backend/src/knowledgebase/` with subfolders mirroring the charts/analysis restructure:

```
backend/src/knowledgebase/
├── index.ts              # barrel export — single import point
├── knowledge.ts          # velocity + time-of-day knowledge
├── observations.ts       # observation store + insights
├── core/
│   └── common.ts         # shared stats (welchT, shuffleNull, splitHalf, betai, mean, sd)
├── patterns/
│   ├── index.ts          # barrel export
│   ├── patterns.ts       # pattern detection (scanCandlePatterns)
│   ├── pattern-checker.ts # statistical checker (t-test, null, split-half, cost)
│   ├── indicators.ts     # indicator library (sma, ema, rsi, atr, bollinger, macd)
│   └── dump/             # easily removable pattern test results
│       ├── README.md
│       ├── candlestick/  # delete to remove candlestick results
│       ├── indicator/    # delete to remove indicator results
│       └── shape/        # delete to remove shape (M/W) results
├── strategies/
│   ├── index.ts          # barrel export
│   ├── strategy.ts       # strategy evaluation
│   ├── backtest.ts       # backtest engine
│   ├── research.ts       # research analysis
│   ├── research-backtest.ts # backtest from research-engine (runBacktest)
│   └── templates.ts      # strategy templates
├── data/                 # knowledgebase data files
└── scratch/              # working scripts (free to edit)
```

**Key design:** `core/common.ts` holds shared statistics (ported from Python `common.py`). `patterns/dump/` has subfolders that can be individually deleted. `scratch/` is for working scripts. `data/` is for data files. Import everything via `from "backend/knowledgebase"` (barrel export).

## 7a. MCP Tools Added (implemented)

Statistical pattern checking:

| Tool | Description | Input |
|---|---|---|
| `check_pattern` | Run statistical pattern check on one pattern; store result with verdict | symbol?, timeframe?, pattern_name, bars?, forward_bars?, cost_points?, min_trades? |
| `check_all_patterns` | Run the whole pattern suite against one bar set; store every result | symbol?, timeframe?, bars?, forward_bars?, cost_points?, min_trades? |
| `get_pattern_results` | List stored pattern results with verdicts | symbol?, timeframe?, verdict?, limit? |
| `get_null_control` | Run null (shuffled) baseline for comparison | symbol?, timeframe?, bars?, iterations? |
| `ingest_history` | Pull bars from MT5 into `market_candles` so the knowledgebase can test them | symbol, timeframe?, count? |

Indicator library:

| Tool | Description | Input |
|---|---|---|
| `list_indicators` | List indicator library entries | category? |
| `add_indicator` | Add custom indicator to library | name, category, formula? |

Native MT5 Strategy Tester:

| Tool | Description | Input |
|---|---|---|
| `run_strategy_tester` | Launch MT5's native tester for any compiled EA; returns report + CSV | expert, symbol?, period?, from?, to?, model?, inputs?, visual?, timeout?, tag? |

### The pipeline

```
ingest_history   MT5 → market_candles (real bars)
      ↓
check_all_patterns  market_candles → scanCandlePatterns → per-pattern
                    forward returns → Welch's t → null shuffle → split-half
                    → cost-adjusted expectancy → EDGE/NO EDGE/INCONCLUSIVE
      ↓
pattern_results  every verdict stored, queryable via get_pattern_results
      ↓
get_knowledge_summary  velocity + pattern edge counts in one view
```

### Statistical validation (core/common.ts)

`welchT`, `shuffleNull`, `splitHalf`, `tDistributionP`, `betai`, `mean`, `sd`, plus the `Bar` interface and `Series` type.

The `lgamma` Lanczos approximation requires its **ninth** coefficient. With only eight, `c[8]` is `undefined`, `a` becomes NaN, and every p-value comes back null. The Python original does not hit this because it calls `math.lgamma` from the standard library. Verified against Python: `betai(5, 0.5, 0.5)` → 0.010119559735433754 (Python: 0.010119559735433731).

## 7a-ii. Frontend Fixes (implemented)

The chart was frozen and the symbol page showed no prices. Both were frontend
bugs, and one of them was caused by the timeframe column added above.

| defect | cause | fix |
|---|---|---|
| Chart never moved with live ticks | `useChartData` used the live tick history only when there were no candles at all, so once the first bar loaded every tick was discarded | the live price updates the last bar's close and range, and the tick stream is used when there are no candles |
| Price line drifted away from the candles | the tracker dot was drawn at the last stored close, not the live price | the dot tracks `currentPrice` |
| Price line could be drawn off the canvas | min/max were computed from the candles only | the live price is included in the range |
| Chart drew bars of different sizes on one axis | the candle fetch passed no timeframe, so every timeframe stored for the symbol came back mixed | the fetch passes the timeframe, and `getCandles()` filters on it |
| Timeframe switch emptied the chart | `fetchCandles` replaced the candle array | it merges |
| Bridge fallback answered with the wrong timeframe | it always fetched M1, whatever was asked | it fetches the requested timeframe |
| Symbol page showed "--" for 692 of 731 symbols | MT5 only quotes 39 of them right now, and the page fetched the catalogue once and never refreshed | the page refreshes every 5 s and the server serves the catalogue from a cache, refreshing it in the background |
| The H1 button showed nothing | `MT5_TIMEFRAMES` had H1 = 16384; MT5's `TIMEFRAME_H1` is 16385. H2 and H3 were off by one too | corrected, and the map is now documented against the installed package |

The last one is worth noting: the Python bridge reads the period codes from the
installed MetaTrader5 package, so it was always right. The TypeScript map
hardcoded them, and hardcoding a value the package owns is how it drifted.

### Measured after the fixes

| check | before | after |
|---|---|---|
| `/api/market/candles?timeframe=M15` gaps | mixed timeframes | 900000 ms only |
| `/api/candles/EURUSD?timeframe=H1` | 0 bars | 30 bars, 3600000 ms |
| `/api/gateway/bridge/symbols` | 640 ms | 20 ms (served from cache) |
| live price on the symbol page | not shown | shown for every quoted symbol |

## 7a-iii. EA Bar Streaming (implemented)

The ScalarAI Gateway EA already pushed ticks, heartbeats, positions and deal
history. It did NOT push OHLCV bars, despite its own header claiming
"OHLCV bar pushing" -- there was no `CopyRates` anywhere in the source.

### The port bug

`InpServerUrl` still defaulted to `http://127.0.0.1:3000` after the site
moved to 4000. The EA posted to a port nothing listened on, MT5 rejected it
as not-allowlisted (error 4014), and the site ran on the Python bridge alone
for months. The site now also listens on 3000, so whichever allowlist entry
exists works and this cannot go stale again.

### What was added

| Where | Change |
|---|---|
| EA inputs | `InpPushBars`, `InpBarsTimeframe` (ENUM_TIMEFRAMES), `InpBarsCount` (1000, startup backfill), `InpBarsRefreshCount` (20, timer refresh) |
| EA code | `PushBars(int count)` using `CopyRates`, POSTing to `/api/gateway/bars` |
| EA calls | backfill in `OnInit`, tail refresh in `OnTimer` |
| Site | `gateway.handleBars()` storing into `market_candles` via `ingestBulkCandles` |
| Site route | `POST /api/gateway/bars` |

The bars are MT5's own `CopyRates` output, so they are exactly what the
chart shows -- a second source of truth, not a re-derivation. The period
code mapping is explicit because MT5's `TIMEFRAME_H1` is 16385, not 16384.

### Verified

```
M15=20 bars, spread_max=1.0, newest bar close: 7276.5 -> 7276.7 -> 7276.9 -> 7277.1
```

The count holds at 20 because the push is an upsert on the same bars; the
forming bar's close moves with the market. M1 bars arrive alongside.

## 7b. Seed File (implemented)

`src/db/seed-indicators.ts` — populates the indicator library with 6 built-in indicators (EMA, SMA, RSI, ATR, Bollinger, MACD). Run with `npx tsx src/db/seed-indicators.ts`.

## 8. Success Criteria

After migration, the following must work:

1. `check_pattern` returns a verdict (`EDGE` / `NO EDGE` / `INCONCLUSIVE`) with `t_statistic`, `p_value`, `net_after_cost`, `split_half_agree`.
2. Result is persisted to `pattern_results` and queryable via `get_pattern_results`.
3. `scalarai://knowledge/patterns` resource lists all pattern results with verdicts.
4. `get_null_control` returns a baseline for comparison.
5. Existing tools (`get_ai_knowledge_base`, `backtest_strategy_with_history`, `validate_strategy` prompt) continue to work unchanged.
6. `npx tsc --noEmit` passes with zero errors.

---

**Files touched (summary):**

| File | Action |
|---|---|
| `src/db/schema.sql` | Add 3 tables + indexes (+ optional ALTERs) |
| `src/types/index.ts` | Add `PatternResultRow`, `IndicatorLibraryRow`, `PatternCheckParams`, `PatternCheckResult` |
| `src/db/repository.ts` | Add pattern/indicator/link DAO methods |
| `src/knowledgebase/` | Full restructure: core/, patterns/, strategies/, data/, scratch/, dump/ |
| `src/knowledgebase/core/common.ts` | Shared stats (welchT, shuffleNull, splitHalf, betai, mean, sd) |
| `src/knowledgebase/patterns/pattern-checker.ts` | Statistical pattern checker with EDGE/NO EDGE/INCONCLUSIVE verdict |
| `src/knowledgebase/patterns/dump/` | Removable pattern test results (candlestick, indicator, shape) |
| `src/knowledgebase/index.ts` | Barrel export — single import point |
| `src/services/knowledge.ts` | Moved to `knowledgebase/knowledge.ts` + extended with pattern summary |
| `src/services/observations.ts` | Moved to `knowledgebase/observations.ts` |
| `src/services/strategy.ts` | Moved to `knowledgebase/strategies/strategy.ts` |
| `src/services/strategy-backtest.ts` | Moved to `knowledgebase/strategies/backtest.ts` |
| `src/services/strategy-research.ts` | Moved to `knowledgebase/strategies/research.ts` |
| `src/services/strategy-templates.ts` | Moved to `knowledgebase/strategies/templates.ts` |
| `src/services/research-engine.ts` | Split into indicators, patterns, research-backtest (moved to knowledgebase) |
| `src/mcp_server.ts` | Add 6 tools, 3 resources, RPC handlers, resource readers |
| `backend/migration.md` | This plan |
