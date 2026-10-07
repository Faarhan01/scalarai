# Historical Data Plan — Stage 7: Strategy Creation & Backtesting

## Status: ⚠️ PARTIALLY IMPLEMENTED — Backtest engine exists but incomplete

## Objective

Enable strategy creation from observations and backtesting with historical candle data.

## Current State

### What Exists

**`backend/src/services/strategy.ts`**:
- `evaluateStrategyBacktest(mode, limit)` — ✅ exists
- Runs strategy evaluation against recent ticks from `scalarAiDb.getTicks(limit)`
- Returns `BacktestResult` with: `mode`, `ticksAnalyzed`, `signals`, `simulatedTrades`, `wins`, `losses`, `winRate`, `totalProfit`, `avgProfit`, `maxDrawdown`
- **Does NOT store results to database**
- **Does NOT support time range** — only uses `limit` for most recent ticks
- **Does NOT use candle data** — uses ticks only

**`backend/src/services/strategy-research.ts`**:
- `analyzeStrategyPerformance(mode, limit)` — ✅ exists
- `suggestStrategyOptimizations(mode)` — ✅ exists
- `recommendStrategyForConditions(volatility, trend, timeOfDay)` — ✅ exists

**`backend/src/services/strategy-templates.ts`**:
- 8 built-in strategy templates — ✅ exists
- `createStrategyFromTemplate()` — ✅ exists
- Templates are code-only, not database-backed

### What's Missing

1. No `backend/src/services/strategy-backtest.ts` (backtest logic is embedded in `strategy.ts`)
2. No `backend/src/services/strategy-optimizer.ts` (optimization is in `strategy-research.ts`)
3. No `backtest_results` table in database
4. Backtest results are not persisted
5. No time range support in backtest
6. No candle-based backtesting (uses ticks only)
7. No strategy creation from observations
8. No strategy versioning
9. No `strategy_templates` table in database

## Required Implementation

### 1. Candle-Based Backtest Engine

**New file:** `backend/src/services/strategy-backtest.ts`

```typescript
interface BacktestCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  direction: "up" | "down" | "flat";
  volume?: number;
  velocity?: number;
}

interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  type: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  profit: number;
  reason: string;
}

interface BacktestResult {
  strategyId: string;
  strategyMode: StrategyMode;
  symbol: string;
  fromTime: number;
  toTime: number;
  initialBalance: number;
  finalBalance: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgWin: number;
  avgLoss: number;
  trades: BacktestTrade[];
}
```

**Key functions:**
```typescript
class BacktestEngine {
  runBacktest(
    strategyMode: StrategyMode,
    candles: BacktestCandle[],
    config: TradeConfig,
    initialBalance: number
  ): BacktestResult
  
  calculateMetrics(trades: BacktestTrade[], initialBalance: number): {
    winRate: number;
    profitFactor: number;
    maxDrawdown: number;
    sharpeRatio: number;
    avgWin: number;
    avgLoss: number;
  }
  
  saveResult(result: BacktestResult): void
}
```

### 2. Time Range Support

**Current:** `evaluateStrategyBacktest(mode, limit)` — only most recent N ticks

**Required:** `runBacktest(strategyId, symbol, from, to, initialBalance)` — specific time range

**Implementation:**
```typescript
function runBacktestWithHistory(
  strategyId: string,
  symbol: string,
  from: number,
  to: number,
  initialBalance: number = 10000
): BacktestResult {
  // 1. Load candles from market_candles table
  const candles = scalarAiDb.getCandles(symbol, from, to, 10000);
  
  // 2. Load strategy
  const strategy = scalarAiDb.getStrategyById(strategyId);
  
  // 3. Run backtest
  const engine = new BacktestEngine();
  const result = engine.runBacktest(strategy.mode, candles, config, initialBalance);
  
  // 4. Save result
  engine.saveResult(result);
  
  return result;
}
```

### 3. Strategy Creation from Observations

**New file:** `backend/src/services/strategy-generator.ts`

```typescript
interface GeneratedStrategy {
  name: string;
  description: string;
  mode: StrategyMode;
  rules: Record<string, any>;
  confidence: number;
  observationIds: string[];
}

function generateStrategyFromObservations(
  observationIds: string[],
  symbol: string
): GeneratedStrategy {
  // 1. Load observations
  const observations = observationIds.map(id => scalarAiDb.getObservation(id));
  
  // 2. Analyze patterns
  const patterns = analyzeObservationPatterns(observations);
  
  // 3. Generate rules
  const rules = generateRulesFromPatterns(patterns);
  
  // 4. Validate rules
  const confidence = validateRules(rules, observations);
  
  return {
    name: `Generated Strategy for ${symbol}`,
    description: `AI-generated strategy from ${observations.length} observations`,
    mode: determineMode(patterns),
    rules,
    confidence,
    observationIds
  };
}
```

### 4. Strategy Versioning

**New table:** `strategy_versions` (see stage-2)

Track every strategy change:
```typescript
function createStrategyVersion(
  strategyId: string,
  changes: Partial<Strategy>
): string {
  const parentVersion = scalarAiDb.getLatestStrategyVersion(strategyId);
  
  const version: StrategyVersion = {
    id: generateId(),
    strategyId,
    symbol: "Step Index",
    name: changes.name || parentVersion.name,
    description: changes.description || parentVersion.description,
    mode: changes.mode || parentVersion.mode,
    rules: changes.rules || parentVersion.rules,
    config: changes.config || parentVersion.config,
    parentVersionId: parentVersion.id,
    createdBy: "ai",
    createdAt: new Date().toISOString()
  };
  
  scalarAiDb.insertStrategyVersion(version);
  return version.id;
}
```

## Critical Fragility Warnings

### BACKTEST MUST NOT AFFECT LIVE STATE

1. **Backtest must run on copies, not live state**: The backtest engine must operate on copies of `market_candles`, not mutate live data. Use immutable candle arrays.

2. **Backtest results must not overwrite live strategy**: `backtest_results` table is separate from `ai_strategy` and `strategies` tables. A backtest is analysis, not a live strategy change.

3. **Strategy optimization suggestions are advisory only**: The optimizer should return suggestions, not automatically apply them. Human review is required before activating any optimized strategy.

4. **Backtest must support time ranges**: Current `evaluateStrategyBacktest` only accepts `limit`. Must be extended to support `from`/`to` timestamps for historical backtesting.

## Implementation Steps

1. Create `backend/src/services/strategy-backtest.ts` with candle-based backtest engine
2. Update `backend/src/services/strategy.ts` to add time-range support
3. Create `backend/src/services/strategy-generator.ts` for AI-generated strategies
4. Create `backend/src/services/strategy-optimizer.ts` for optimization suggestions
5. Add `backtest_results` table to schema
6. Add MCP tools for backtesting with history
7. Verify with tests

## Verification

- [ ] Backtest runs against historical candles
- [ ] Results stored in `backtest_results` table
- [ ] Time range queries work correctly
- [ ] Strategy generation from observations works
- [ ] Strategy versioning tracks changes
- [ ] MCP tools expose strategy creation
