# Strategies Plan — Phase 2: Multi-Symbol Strategy Management

## Objective

Enable strategies to work across multiple symbols with per-symbol configuration and performance tracking.

## Current State

- `settings.selected_assets` stores array of symbols
- `symbol_connections` tracks per-symbol EA connection
- `market_ticks` has `symbol` column
- Strategies have no symbol dimension — same strategy applies to all symbols

## Implementation

### 1. Strategy-Symbol Mapping Table

```sql
CREATE TABLE IF NOT EXISTS strategy_symbols (
  strategy_id TEXT NOT NULL,
  symbol TEXT NOT NULL DEFAULT 'Step Index',
  is_active INTEGER NOT NULL DEFAULT 1,
  config_overrides TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (strategy_id, symbol),
  FOREIGN KEY (strategy_id) REFERENCES strategies(id)
);
```

### 2. Symbol-Specific Strategy Config

Each symbol can override default strategy parameters:

```typescript
interface StrategySymbolConfig {
  symbol: string;
  isActive: boolean;
  configOverrides: Partial<TradeConfig>;
  performance: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalProfit: number;
  };
}
```

### 3. Symbol-Switching Logic

When switching symbols via `/api/status/switch-symbol`:
- Load symbol-specific strategy config
- Update `selectedStrategy` in settings if needed
- Broadcast config change to EA

### 4. Per-Symbol Performance Tracking

Update `strategy_symbol_performance` after each trade close:

```sql
UPDATE strategy_symbol_performance
SET total_trades = total_trades + 1,
    wins = wins + ?,
    losses = losses + ?,
    total_profit = total_profit + ?,
    win_rate = (wins + ?) * 1.0 / (total_trades + 1),
    last_updated = ?
WHERE strategy_id = ? AND symbol = ?
```

### 5. Multi-Symbol MCP Tools

Add MCP tools:
- `get_strategy_performance_by_symbol` — get performance for specific symbol
- `set_strategy_for_symbol` — assign strategy to specific symbol
- `get_symbol_strategies` — list all strategies for a symbol

## Critical Fragility Warnings

1. **Symbol switching must preserve state** — switching symbols shouldn't reset active trades
2. **EA must receive correct symbol config** — MT5 EA trades on one symbol at a time
3. **Performance metrics must be per-symbol** — mixing symbols breaks strategy analysis

## Verification

- Strategy can be assigned to specific symbol
- Performance tracked correctly per symbol
- Symbol switching works without data loss
- MCP tools expose multi-symbol data
