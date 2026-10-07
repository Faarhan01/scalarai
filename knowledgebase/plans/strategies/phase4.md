# Strategies Plan — Phase 4: Backtest Engine with Historical Data

## Objective

Build a backtest engine that runs strategies against stored historical candles and stores results for AI analysis.

## Current State

- `evaluateStrategyBacktest` uses recent live ticks (last 500)
- No candle-based backtesting
- No backtest result storage
- Backtest runs in-process, could block server

## Implementation

### 1. Candle-Based Backtest Engine

```typescript
interface BacktestCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  direction: "up" | "down" | "flat";
  velocity?: number;
}

interface BacktestResult {
  strategyId: string;
  symbol: string;
  fromTime: number;
  toTime: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: BacktestTrade[];
}
```

### 2. Backtest Runner Service

```typescript
class BacktestEngine {
  runBacktest(strategy: Strategy, candles: BacktestCandle[], config: TradeConfig): BacktestResult
  calculateMetrics(trades: BacktestTrade[]): BacktestMetrics
}
```

### 3. Historical Candle Loading

Query `market_candles` table for backtest input:

```typescript
function getCandlesForBacktest(symbol: string, from: number, to: number): BacktestCandle[] {
  return scalarAiDb.getCandles(symbol, from, to);
}
```

If `market_candles` is empty, aggregate from `market_ticks`:

```typescript
function aggregateTicksToCandles(ticks: Tick[]): BacktestCandle[] {
  // Group ticks by minute bucket
  // Build OHLC candles
}
```

### 4. Backtest Isolation

- Run on copies of data, not live state
- No mutations to `AppStore` during backtest
- Use worker threads for long backtests to avoid blocking

### 5. MCP Tool: `backtest_strategy_with_history`

```json
{
  "strategyId": "uuid",
  "symbol": "Step Index",
  "from": "2026-10-01T00:00:00Z",
  "to": "2026-10-06T00:00:00Z",
  "initialBalance": 10000
}
```

Returns:

```json
{
  "strategyId": "uuid",
  "symbol": "Step Index",
  "totalTrades": 42,
  "winRate": 0.62,
  "profitFactor": 1.8,
  "maxDrawdown": 0.15,
  "sharpeRatio": 1.2,
  "trades": [...]
}
```

## Critical Fragility Warnings

1. **Backtest must not affect live state** — run on copies
2. **Candle quality matters** — gaps in data cause incorrect backtest results
3. **Backtest results must be stored** — for AI analysis and comparison

## Verification

- Backtest runs against historical candles
- Results stored in `backtest_results` table
- MCP tool returns correct data
- No live state mutation during backtest
