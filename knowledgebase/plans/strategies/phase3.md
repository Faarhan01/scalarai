# Strategies Plan — Phase 3: AI-Driven Strategy Creation

## Objective

Enable the AI to create new strategies from observations and historical data via MCP, without manual code changes.

## Current State

- AI can synthesize strategy rules from knowledge base
- Strategy creation requires manual code or template selection
- Observations are stored in-memory only (telemetry array)
- No link between observations and strategy rules

## Implementation

### 1. Observation-to-Rule Mapping

Create mapping functions that convert observation patterns into strategy rules:

```typescript
interface StrategyRule {
  type: "ema_cross" | "rsi_filter" | "velocity_gate" | "bollinger_bounce" | "atr_breakout";
  params: Record<string, number | boolean>;
  direction: "buy" | "sell" | "both";
  confidence: number;
  observationIds: string[];
}
```

### 2. Rule Generation from Observations

```typescript
function generateRulesFromObservations(observations: Observation[]): StrategyRule[] {
  // Group observations by pattern
  // Extract common parameters (velocity thresholds, time windows, etc.)
  // Generate rule candidates with confidence scores
}
```

### 3. MCP Tool: `create_strategy_from_observations`

```json
{
  "name": "High Velocity Breakout",
  "symbol": "Step Index",
  "observationIds": ["obs1", "obs2", "obs3"],
  "minConfidence": 0.7,
  "mode": "CUSTOM"
}
```

### 4. Strategy Validation

Before saving a generated strategy:
- Run against recent historical data
- Calculate win rate, profit factor
- Only save if metrics exceed thresholds
- Store validation results in `backtest_results`

### 5. AI Strategy Evolution

- Track strategy versions over time
- Auto-generate new strategy versions when performance degrades
- Link strategy versions to observation clusters

## Critical Fragility Warnings

1. **Generated strategies must be valid** — invalid rules break trade execution
2. **Validation must run before saving** — bad strategies should not enter production
3. **Human review required** — AI-generated strategies need approval before activation

## Verification

- AI can create strategy from observations via MCP
- Generated strategy passes validation
- Strategy can be activated and traded
- Performance tracked in `strategy_symbol_performance`
