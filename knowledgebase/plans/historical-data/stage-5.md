# Historical Data Plan — Stage 5: Observations Service & AI Insights

## Status: ✅ DONE

## What Was Implemented

### 1. `backend/src/services/observations.ts` (182 lines)

**Class:** `ObservationsService`

- `storeObservation(obs)` — stores market observation with tags/metadata
- `getObservations(filters?)` — queries observations with filters
- `getObservationsByCandle(candleId)` — observations linked to a candle
- `generateInsights(symbol, timeRange?)` — direction distribution, top hours, velocity clusters, suggested strategies
- `linkObservationToStrategy(observationId, strategyId)` — links observation to strategy via metadata
- `getObservationsForStrategy(strategyId)` — observations linked to a strategy

### 2. Integration with `AppStore`

**File:** `backend/src/services/app-store.ts`
- `private observationsService: ObservationsService` — instantiated in constructor
- `updateMarket()` stores observations when `velocity > 0.05`
- `buildMcpContext()` exposes `getObservations()` and `generateInsights()`

### 3. Repository Methods

**File:** `backend/src/db/repository.ts`
- `insertObservation(row)` — INSERT INTO observations
- `getObservations(symbol?, from?, to?, limit?)` — SELECT with filters

### 4. MCP Tools

- `get_market_observations` — exists in `mcp_server.ts:402`
- `generate_observation_insights` — exists in `mcp_server.ts:419`

## What Remains

- `getObservationsByCandle`, `linkObservationToStrategy`, `getObservationsForStrategy` are implemented but not yet used by MCP tools or frontend
- No frontend UI for browsing observations

## Critical Fragility Warnings

### NEW SERVICE MUST INTEGRATE WITH EXISTING STATE

1. **Observations must be stored via `AppStore`**: All state flows through `AppStore`. `observationsService` is instantiated in `AppStore` constructor and called from `updateMarket()`.

2. **Observations affect AI calibration**: The AI calibration gate (`totalObservations >= 20`) uses `aiKnowledgeBase.totalObservations`. The `ObservationsService` stores individual records but the calibration gate still uses the aggregate counter.

3. **Database table must be created via migration**: The `observations` table was added via `backend/src/db/migrate.ts` with `CREATE TABLE IF NOT EXISTS`.

4. **Observation storage must not block tick processing**: `updateMarket()` stores observations synchronously. Under high velocity, this could add latency. Consider async/batched writes if needed.

## Verification

- [x] Observations stored with timestamps
- [x] Queries filter correctly
- [x] Insights generated from patterns
- [x] MCP tools expose observation data
- [x] Tick processing performance acceptable
