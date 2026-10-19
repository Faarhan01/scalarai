# Backend Plan — Stage 2: Type Safety Sweep

> **Canonical structure:** See `knowledgebase/site-structure/backend/index.md` for the actual committed file layout before editing anything.

## Objective

Replace high-value `: any` types with proper interfaces across the backend.

## Completed Work

### 1. Error handling — `err: any` → `unknown`

All route catch blocks and MCP server error handlers now use `unknown`:

**Route files:**
- `backend/src/routes/ea.ts` — 3 catch blocks updated
- `backend/src/routes/market.ts` — 2 catch blocks updated
- `backend/src/routes/settings.ts` — 7 catch blocks updated
- `backend/src/routes/strategies.ts` — 3 catch blocks updated
- `backend/src/routes/trades.ts` — 2 catch blocks updated

**Pattern used:**
```ts
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({ error: message || "Default error message" });
}
```

**Other files:**
- `backend/src/mcp_server.ts` — error handling uses `unknown`
- `backend/src/middleware/error.ts` — error handling uses `unknown`

### 2. Payload typing — `data: any` → `UpdateMarketPayload`

The `/api/update-market` endpoint in `backend/src/routes/ea.ts` and `backend/src/routes/market.ts` now accepts `UpdateMarketPayload` instead of `any`.

### 3. Settings typing — `params: any` → `Partial<TradeConfig>`

The settings route callbacks now use `Partial<TradeConfig>` for type-safe configuration updates.

### 4. Database typing — `db: any` → `InstanceType<typeof Database>`

`backend/src/db/repository.ts` constructor uses `InstanceType<typeof Database>` instead of `any` for the SQLite database instance.

### 5. Strategy rules typing — `rules: Record<string, any>` → `StrategyRules`

`backend/src/types/index.ts` defines a `StrategyRules` interface used in `AiSynthesizedStrategy` instead of untyped `Record<string, any>`.

### 6. Route handler typing — `app: any` → `app: express.Application`

All `backend/src/routes/*.ts` files use `express.Application` instead of `any` for the app parameter.

## New Types Added

### `UpdateMarketPayload`

```ts
export interface UpdateMarketPayload {
  symbol?: string;
  price?: number;
  close?: number;
  velocity?: number;
  buyLocked?: boolean;
  sellLocked?: boolean;
  broker?: string;
  account?: string;
  balance?: number;
  digits?: number;
  tickSize?: number;
  description?: string;
  spread?: number;
  session?: string;
  margin?: number;
  leverage?: number;
  swapLong?: number;
  swapShort?: number;
  profitCalcMode?: number;
}
```

### `FullStatusPayload`

```ts
export interface FullStatusPayload {
  config: TradeConfig;
  connection: EAConnectionDetails;
  isBridgeConnected: boolean;
  logs: SystemLog[];
  trades: TradeRecord[];
  history: Tick[];
  candles: CandleBar[];
  status: string;
  currentPrice: number;
  activeSymbol: string;
  symbolStates: Array<{ symbol: string; connection: EAConnectionDetails; currentPrice: number; tickCount: number }>;
  aiSynthesizedStrategy: AiSynthesizedStrategy;
  lastStrategySignal: { type: string; reason: string; confidence?: number } | null;
  stats: TradeSessionStats;
  webRequestStatus: WebRequestTestState;
}
```

### `AiStudyFeedPayload`

```ts
export interface AiStudyFeedPayload {
  status: string;
  message: string;
  count: number;
  aiKnowledgeBase: AiKnowledgeBase;
  aiSynthesizedStrategy: AiSynthesizedStrategy;
  candleStream: Tick[];
  averageVelocity: number;
}
```

## Critical Fragility Warnings

### TYPE CHANGES CAN BREAK THE FRONTEND/EA

1. **`FullStatusPayload` is a contract with the frontend**: The `init` WebSocket message sends the full `FullStatusPayload`. The frontend `App.tsx` `onInit` handler expects ALL of these fields. Removing or renaming any field will cause runtime errors in the dashboard.

2. **`UpdateMarketPayload` is a contract with the EA**: The EA sends data matching this shape to `/api/ea/tick`. If you remove fields that the EA sends, the tick will be rejected or processed incorrectly.

3. **`AiStudyFeedPayload` is a contract with the frontend**: The frontend `useAiStudyFeed` hook expects `status`, `message`, `count`, `aiKnowledgeBase`, `aiSynthesizedStrategy`, `candleStream`, `averageVelocity`. Renaming any breaks the AI study feed UI.

4. **`TradeConfig` is a contract with both frontend and EA**: The EA reads `selectedStrategy`, `lotSize`, `takeProfitPoints`, `stopLossPoints`, `trailingStopPoints`, `useTrailingStop`, `maxTrades`, `tradingMode`, `isAiModeEnabled`, `selectedAssets` from the `/api/ea/tick` response. The frontend also displays and edits these. Do NOT rename or remove fields without updating both.

5. **Route response shapes are contracts**: Even if not fully typed, routes like `/api/status`, `/api/ea/tick`, `/api/settings` return specific JSON shapes that the frontend and EA depend on. Changing these shapes causes silent failures.

## Remaining Work

- None at this time. Type safety sweep is complete.
- Future work: add stricter typing for `pendingBridgeOrders` array elements if needed.

## Verification

- `npx tsc --noEmit` passes with zero `any` errors in critical paths
- All routes still function correctly
- `backend/src/mcp_server.ts` still handles all MCP tools
