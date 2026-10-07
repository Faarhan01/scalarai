# Strategies Plan — Phase 5: Optimization & Versioning

## Objective

Implement strategy optimization, versioning, and an AI feedback loop for continuous improvement.

## Implementation

### 1. Strategy Versioning

- Every strategy change creates a new version
- Versions track parent-child relationships
- Rollback to previous version supported
- Performance tracked per version per symbol

### 2. Optimization Engine

```typescript
interface OptimizationSuggestion {
  parameter: string;
  currentValue: number;
  suggestedValue: number;
  reason: string;
  expectedImprovement: string;
  confidence: number;
}
```

### 3. AI Optimization Loop

1. Query `backtest_results` for underperforming strategies
2. Identify parameter patterns in winning trades
3. Generate optimization suggestions
4. Run backtest with suggested parameters
5. Deploy if improvement exceeds threshold

### 4. Strategy Performance Dashboard

- Track win rate, profit factor, max drawdown over time
- Compare strategy versions
- Show per-symbol performance breakdown

### 5. MCP Tools for Optimization

- `optimize_strategy` — get optimization suggestions
- `compare_strategy_versions` — compare two strategy versions
- `get_strategy_evolution` — get version history for a strategy
- `rollback_strategy` — revert to previous version

## Critical Fragility Warnings

1. **Optimization suggestions are advisory only** — never auto-apply
2. **Version history must be immutable** — don't allow editing past versions
3. **Performance comparison must be fair** — same time period, same symbol

## Verification

- Strategy versions tracked correctly
- Optimization suggestions generated from data
- Rollback works without data loss
- MCP tools expose optimization data
