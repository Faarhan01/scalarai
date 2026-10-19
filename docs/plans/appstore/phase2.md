# AppStore Standardization — Phase 2: Split Interface

## Objective

Create an `AppStoreReadOnly` interface and use it to type route/WebSocket callbacks. Only `index.ts` gets the full mutable `AppStore`. This phase is mainly about adding a type contract; the runtime behavior does not change.

## Prerequisites

- Phase 1 must be complete (all fields private, getters exposed)
- Current getter style uses method names like `getAiKnowledgeBase()`, not property getters

## Current State After Phase 1

`AppStore` now has these read accessors:
- `config` (getter property)
- `trades` (getter property)
- `logs` (getter property)
- `getAiKnowledgeBase()` (method)
- `getAiSynthesizedStrategy()` (method)
- `getStrategySignal()` (method)
- `getSymbolStates()` (method)
- `getActiveSymbol()` (method)
- `getNextTicket()` (method)
- `getLatestBuyLockedFromEa()` (method)
- `getLatestSellLockedFromEa()` (method)
- `getPendingBridgeOrders()` (method)
- `getPendingEaCommand()` (method)
- `getMt5BridgeClients()` (method)
- `getWebDashboardClients()` (method)
- `getWebRequestTest()` (method)

And these mutation methods (only `index.ts` should call these):
- `updateSettings()`, `toggleTrading()`, `placeTrade()`, `closeTrade()`, `resetStats()`
- `switchSymbol()`, `updateWebRequestTest()`
- `addBridgeClient()`, `removeBridgeClient()`, `addDashboardClient()`, `removeDashboardClient()`
- `addLog()`, `broadcastToDashboards()`, `broadcastTradesUpdate()`

## Implementation Steps

### 1. Define `AppStoreReadOnly` interface

Add to `backend/src/types/index.ts`:

```ts
export interface AppStoreReadOnly {
  // State accessors
  config: TradeConfig;
  trades: readonly TradeRecord[];
  logs: readonly SystemLog[];
  getAiKnowledgeBase(): AiKnowledgeBase;
  getAiSynthesizedStrategy(): AiSynthesizedStrategy;
  getStrategySignal(): { type: string; reason: string; confidence?: number } | null;
  getSymbolStates(): SymbolStates;
  getActiveSymbol(): string;
  getNextTicket(): { value: number };
  getLatestBuyLockedFromEa(): boolean;
  getLatestSellLockedFromEa(): boolean;
  getPendingBridgeOrders(): readonly BridgeOrder[];
  getPendingEaCommand(): { action: string; lot: number; sl: number; tp: number } | null;
  getMt5BridgeClients(): ReadonlySet<WebSocket>;
  getWebDashboardClients(): ReadonlySet<WebSocket>;
  getWebRequestTest(): { status: "idle" | "pending" | "success" | "failed"; lastTested: string; error: string; details: string; triggerTest: boolean };

  // Read-only methods
  getFullStatusPayload(): FullStatusPayload;
  getAndClearPendingOrders(): BridgeOrder[];
  buildMcpContext(): McpContext;
}
```

Then make `AppStore` implement it:

```ts
export class AppStore implements AppStoreReadOnly {
  // ...
}
```

### 2. Update route type signatures

Update the callback types in route files to reference `AppStoreReadOnly` where it adds safety. The route files already accept loose function signatures, so this is additive.

**Important:** Do NOT change the runtime behavior. Only add TypeScript types. The routes still receive the same callbacks from `index.ts`.

#### `routes/ea.ts`

```ts
export function registerEaRoutes(
  app: Application,
  getStatus: () => FullStatusPayload,
  getConfig: () => TradeConfig,
  onTick: (data: UpdateMarketPayload, clientIp?: string) => void,
  getPendingEaCommand?: () => { action: string; lot: number; sl: number; tp: number } | null,
  apiKey?: string
)
```

No change needed — these are already function signatures.

#### `routes/settings.ts`

```ts
export function registerSettingsRoutes(
  app: Application,
  updateSettings: (params: Partial<TradeConfig>) => void,
  getSettings: () => TradeConfig,
  getWebRequestTest: () => AppStoreReadOnly["getWebRequestTest"](),
  triggerTest: () => void,
  reportTest: (report: { status: string; error?: string; details?: string }) => void,
  apiKey?: string
)
```

### 3. Do NOT change WebSocket server signatures

**Critical:** The WebSocket server signatures in `bridge.ts` and `dashboard.ts` are:
```ts
onConnect?: (ws: WebSocket) => void;
onClose?: (ws: WebSocket) => void;
```

Do NOT change these to accept `store`. The WebSocket servers don't need store access — `index.ts` closes over `store` and passes method references. Changing these signatures would break the WebSocket server API and is unnecessary.

### 4. Update `index.ts` type safety only

After Phase 1, `index.ts` already uses getters and methods. Phase 2 doesn't require changing any `index.ts` code. The only change is ensuring `AppStore` implements `AppStoreReadOnly` and that route/WebSocket callback types are consistent.

### 5. Add runtime guard in development (optional)

If you want runtime enforcement in addition to TypeScript:

```ts
// In index.ts, after creating store
if (process.env.NODE_ENV !== "production") {
  const originalStore = store;
  const handler: ProxyHandler<AppStore> = {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      throw new TypeError(`AppStore has no property ${String(prop)}`);
    },
  };
}
```

This is optional and mainly for debugging. Phase 4 covers `Object.freeze()`.

## What This Achieves

- `AppStoreReadOnly` documents exactly what external code can read
- TypeScript enforces that route/WebSocket callbacks can't access private fields
- If someone adds a new route that tries to read `store.tradeConfig` directly, TypeScript will error
- No runtime changes, no breaking changes to existing code

## What This Does NOT Do

- It does NOT prevent `index.ts` from mutating state — `index.ts` still has the full `AppStore`
- It does NOT change any function signatures at runtime
- It does NOT add state machine enforcement (that's Phase 3)

## Critical Fragility Warnings

### DO NOT BREAK THESE CONTRACTS

1. **`getFullStatusPayload()` shape** — frontend `App.tsx` `onInit` expects ALL fields
2. **`updateMarket()` broadcast shape** — frontend chart depends on `candles`, `history`, `currentPrice`, `connection`, `stats`, `symbolStates`
3. **EA tick response** — EA reads `isActive`, `selectedStrategy`, `pendingAction`, etc. from `routes/ea.ts:81-96`
4. **MCP context** — all 25+ MCP tools depend on `buildMcpContext()` methods

### DO NOT CHANGE WEBSOCKET SERVER SIGNATURES

5. **`createBridgeServer` and `createDashboardServer` signatures are stable**: Their `onConnect`/`onClose` callbacks only take `(ws: WebSocket)`. Do NOT add a `store` parameter. `index.ts` already closes over `store` and passes bound methods.

## Verification

- `npx tsc --noEmit` passes
- Server starts
- All routes function correctly
- WebSocket connections work
- No route/WebSocket handler can directly access private `AppStore` fields
