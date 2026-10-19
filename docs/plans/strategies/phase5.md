# Strategies Plan — Phase 5: Optimization & Versioning

## Status: ❌ NOT DONE

## What Exists

- `strategy_versions` table exists in database
- `strategy-research.ts` has `analyzeStrategyPerformance()`, `suggestStrategyOptimizations()`, `recommendStrategyForConditions()`
- MCP tools `optimize_strategy`, `get_strategy_performance` exist

## What's Missing

- No `strategy-optimizer.ts` service
- No strategy versioning UI or MCP tools
- No automated optimization loop
- No strategy performance dashboard
- No rollback functionality

## Implementation Steps

1. Create `backend/src/services/strategy-optimizer.ts`
2. Add MCP tools for versioning (`compare_strategy_versions`, `get_strategy_evolution`, `rollback_strategy`)
3. Add frontend strategy performance dashboard
4. Implement optimization loop (advisory only)

## Critical Fragility Warnings

1. **Optimization suggestions are advisory only** — never auto-apply
2. **Version history must be immutable** — don't allow editing past versions
3. **Performance comparison must be fair** — same time period, same symbol

## Verification

- Strategy versions tracked correctly
- Optimization suggestions generated from data
- Rollback works without data loss
- MCP tools expose optimization data
