# Historical Data Plan — Stage 5: Observations Service & AI Insights

## Status: ❌ NOT DONE — Depends on stage 2 (schema)

## Objective

Create a service to store and query AI observations, and generate insights from observation patterns.

## Current State

**What exists:**
- `ai_knowledge.total_observations` — single integer counter in SQLite
- `ai_knowledge.time_of_day_patterns` — JSON blob of hourly patterns
- `ai_knowledge.global_average_speed` — aggregate velocity metric
- `market_ticks` — raw ticks with direction, velocity, timestamps

**What's missing:**
- No individual observation records — only aggregate counters
- No observation service (`observations.ts` does not exist)
- No observation CRUD in repository
- No per-observation metadata or tags
- No insights generation

## New Service: `backend/src/services/observations.ts`

### Core Functions

```typescript
interface Observation {
  id: string;
  symbol: string;
  timestamp: number;          // epoch ms
  direction: "up" | "down" | "flat";
  velocity: number;
  price: number;
  candleId?: number;
  tags: string[];
  metadata: Record<string, any>;
  createdAt: string;
}

interface ObservationFilters {
  symbol?: string;
  from?: number;              // epoch ms
  to?: number;                // epoch ms
  direction?: "up" | "down" | "flat";
  minVelocity?: number;
  maxVelocity?: number;
  tags?: string[];
  limit?: number;
}

class ObservationsService {
  storeObservation(obs: Omit<Observation, "id" | "createdAt">): string
  getObservations(filters: ObservationFilters): Observation[]
  getObservationsByCandle(candleId: number): Observation[]
  getObservationsByTimeRange(symbol: string, from: number, to: number): Observation[]
  generateInsights(symbol: string, timeRange: { from: number; to: number }): ObservationInsights
  linkObservationToStrategy(observationId: string, strategyId: string): void
  getObservationsForStrategy(strategyId: string): Observation[]
}

interface ObservationInsights {
  symbol: string;
  totalObservations: number;
  avgVelocity: number;
  peakVelocity: number;
  directionDistribution: { up: number; down: number; flat: number };
  topActiveHours: { hour: number; count: number }[];
  velocityClusters: { min: number; max: number; count: number }[];
  suggestedStrategies: string[];
}
```

### Integration with `AppStore`

Update `backend/src/services/app-store.ts`:

1. **Import observations service:**
```typescript
import { ObservationsService } from "./observations";
```

2. **Add to constructor:**
```typescript
private observationsService: ObservationsService;

constructor() {
  // ... existing init ...
  this.observationsService = new ObservationsService(scalarAiDb);
}
```

3. **Store observations in `updateMarket()`:**
```typescript
// After processing tick:
if (numVelocity > 0.1) {  // only store significant observations
  this.observationsService.storeObservation({
    symbol,
    timestamp: now,
    direction,
    velocity: numVelocity,
    price: targetPrice,
    candleId: lastCandle?.id,
    tags: this.generateObservationTags(state, numVelocity),
    metadata: {
      buyLocked: isBuyLocked,
      sellLocked: isSellLocked,
      spread: data.spread,
      session: data.session,
    }
  });
}
```

4. **Add to `McpContext`:**
```typescript
getObservations: (filters?: ObservationFilters) => Observation[];
generateInsights: (symbol: string, from?: number, to?: number) => ObservationInsights;
```

## Repository Methods

Add to `backend/src/db/repository.ts`:

```typescript
// Observations
insertObservation(obs: Observation): void
getObservations(filters: ObservationFilters): Observation[]
getObservationsByCandle(candleId: number): Observation[]
getObservationsByTimeRange(symbol: string, from: number, to: number): Observation[]
linkObservationToStrategy(observationId: string, strategyId: string): void
getObservationsForStrategy(strategyId: string): Observation[]
```

## MCP Tools

Add to `backend/src/mcp_server.ts`:

- `get_market_observations` — query observations with filters
- `generate_observation_insights` — generate insights for a symbol/time range

## Critical Fragility Warnings

### NEW SERVICE MUST INTEGRATE WITH EXISTING STATE

1. **Observations must be stored via `AppStore`**: Do NOT create a separate state container for observations. All state must flow through `AppStore`. Add observation methods to `AppStore` and call them from `updateMarket()`.

2. **Observations affect AI calibration**: The AI calibration gate (`totalObservations >= 20`) uses `aiKnowledgeBase.totalObservations`. If you add a separate observations count, ensure it doesn't conflict with this gate. **Recommendation:** keep `ai_knowledge.total_observations` as the source of truth, sync from `observations` table count.

3. **Database table must be created via migration**: The `observations` table must be added via `backend/src/db/migrate.ts`, not just `schema.sql`.

4. **Observation storage must not block tick processing**: `updateMarket()` is called on every tick. Storing observations must be async or batched to avoid slowing down tick processing.

## Implementation Steps

1. Create `backend/src/services/observations.ts`
2. Update `backend/src/types/index.ts` with `Observation` interface
3. Update `backend/src/db/repository.ts` with observation CRUD
4. Update `backend/src/services/app-store.ts` to store observations during `updateMarket()`
5. Add MCP tools for observation queries
6. Verify with tests

## Verification

- [ ] Observations stored with timestamps
- [ ] Queries filter correctly
- [ ] Insights generated from patterns
- [ ] MCP tools expose observation data
- [ ] Tick processing performance not affected
