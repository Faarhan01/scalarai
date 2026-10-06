# Historical Data Plan — Stage 5: Observations Service & AI Insights

## Objective

Create a service to store and query AI observations, and generate insights.

## New Service: `backend/src/services/observations.ts`

### Functions
- `storeObservation(observation)` — save observation with timestamp
- `getObservations(filters)` — query by symbol, time range, direction, velocity
- `getObservationsByCandle(candleId)` — get observations for a specific candle
- `generateInsights(symbol, timeRange)` — AI-generated insights from observations
- `linkObservationToStrategy(observationId, strategyId)` — link observations to strategies

### Observation Structure
```typescript
interface Observation {
  id: string;
  symbol: string;
  timestamp: number;
  direction: "up" | "down" | "flat";
  velocity: number;
  price: number;
  candleId?: string;
  tags: string[];
  metadata: Record<string, any>;
  created_at: string;
}
```

## Enhanced AI Knowledge Base

- Link `ai_knowledge` patterns to specific observations
- Store observation clusters in `time_of_day_patterns`
- Generate strategy rules from observation patterns

## Implementation Steps

1. Create `backend/src/services/observations.ts`
2. Update `backend/src/types/index.ts` with `Observation` interface
3. Update `backend/src/db/repository.ts` with observation CRUD
4. Update `backend/src/services/app-state.ts` to store observations during `updateMarket()`
5. Add MCP tools for observation queries
6. Verify with tests

## Verification

- Observations stored with timestamps
- Queries filter correctly
- Insights generated from patterns
- MCP tools expose observation data
