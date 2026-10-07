# AppStore Standardization — Phase 2: Split Interface

## Objective

Create an `AppStoreReadOnly` interface and pass it to routes/WebSocket handlers instead of the full `AppStore` class. Only `index.ts` gets the full mutable instance.

## Prerequisites

- Phase 1 must be complete (all fields private, getters exposed)

## Current Signatures (After Phase 1)

After Phase 1, route/WebSocket registrations in `index.ts` look like this:

```ts
// index.ts lines 60-61
registerEaRoutes(app, store.getFullStatusPayload.bind(store), () => store.tradeConfig, store.updateMarket.bind(store), store.getPendingEaCommand.bind(store));
registerMarketRoutes(app, store.updateMarket.bind(store), () => store.tradeConfig);

// index.ts lines 62-84
registerSettingsRoutes(app, (params) => store.updateSettings(params), () => store.tradeConfig, () => store.webRequestTest, triggerTest, reportTest, apiKey);

// index.ts line 85
registerTradeRoutes(app, (isActive: boolean) => store.toggleTrading(isActive), () => store.resetStats(), apiKey);

// index.ts lines 96-107
registerStatusRoute(app, store.getFullStatusPayload.bind(store), (symbol) => { store.switchSymbol(symbol); }, store.getAndClearPendingOrders.bind(store), apiKey);

// index.ts line 95
registerMcpRoute(app, store.buildMcpContext(), apiKey);

// index.ts lines 132-181
createBridgeServer(server, onMessage, (ws) => store.addBridgeClient(ws), (ws) => store.removeBridgeClient(ws));
createDashboardServer(server, () => JSON.stringify({ type: "init", payload: store.getFullStatusPayload() }), onMessage, (ws) => store.addDashboardClient(ws), (ws) => store.removeDashboardClient(ws));
```

## Implementation Steps

### 1. Define `AppStoreReadOnly` interface

Add to `backend/src/types/index.ts` (after `McpContext`):

```ts
export interface AppStoreReadOnly {
  // State getters
  config: TradeConfig;
  trades: readonly TradeRecord[];
  logs: readonly SystemLog[];
  aiKnowledgeBase: AiKnowledgeBase;
  aiSynthesizedStrategy: AiSynthesizedStrategy;
  lastStrategySignal: { type: string; reason: string; confidence?: number } | null;
  symbolStates: SymbolStates;
  activeSymbol: string;
  nextTicket: { value: number };
  latestBuyLockedFromEa: boolean;
  latestSellLockedFromEa: boolean;
  pendingBridgeOrders: readonly BridgeOrder[];
  pendingEaCommand: { action: string; lot: number; sl: number; tp: number } | null;
  mt5BridgeClients: ReadonlySet<WebSocket>;
  webDashboardClients: ReadonlySet<WebSocket>;
  webRequestTest: { status: "idle" | "pending" | "success" | "failed"; lastTested: string; error: string; details: string; triggerTest: boolean };

  // Read-only methods
  getFullStatusPayload(): FullStatusPayload;
  getAndClearPendingOrders(): BridgeOrder[];
  getPendingEaCommand(): { action: string; lot: number; sl: number; tp: number } | null;
  buildMcpContext(): McpContext;
}
```

### 2. Make `AppStore` implement `AppStoreReadOnly`

In `backend/src/services/app-store.ts`:

```ts
export class AppStore implements AppStoreReadOnly {
  // ... implementation with private fields and getters from Phase 1
}
```

### 3. Update route registration signatures

Update each route file to accept `AppStoreReadOnly` instead of loose function signatures:

#### `routes/ea.ts` (lines 8-15)

```ts
export function registerEaRoutes(
  app: Application,
  getStatus: AppStoreReadOnly["getFullStatusPayload"],
  getConfig: AppStoreReadOnly["config"],
  onTick: (data: UpdateMarketPayload, clientIp?: string) => void,
  getPendingEaCommand?: AppStoreReadOnly["getPendingEaCommand"],
  apiKey?: string
)
```

#### `routes/market.ts` (lines 6-11)

```ts
export function registerMarketRoutes(
  app: Application,
  updateMarket: (data: UpdateMarketPayload) => void,
  getConfig?: () => TradeConfig,  // or AppStoreReadOnly["config"]
  apiKey?: string
)
```

#### `routes/settings.ts` (lines 6-14)

```ts
export function registerSettingsRoutes(
  app: Application,
  updateSettings: (params: Partial<TradeConfig>) => void,
  getSettings: () => TradeConfig,
  getWebRequestTest: () => AppStoreReadOnly["webRequestTest"],
  triggerTest: () => void,
  reportTest: (report: { status: string; error?: string; details?: string }) => void,
  apiKey?: string
)
```

#### `routes/trades.ts` (line 5)

```ts
export function registerTradeRoutes(app: Application, toggleTrade: (isActive: boolean) => void, resetStats: () => void, apiKey?: string)
```

No change needed — already accepts function signatures.

#### `routes/status.ts` (lines 5-11)

```ts
export function registerStatusRoute(
  app: Application,
  getStatus: AppStoreReadOnly["getFullStatusPayload"],
  switchSymbol: (symbol: string) => void,  // mutation method, not part of AppStoreReadOnly
  getAndClearPendingOrders?: AppStoreReadOnly["getAndClearPendingOrders"],
  apiKey?: string
)
```

Note: `switchSymbol` is a mutation method and is NOT part of `AppStoreReadOnly`. It's passed directly from `index.ts` as `store.switchSymbol`.

#### `routes/mcp.ts`

Currently accepts `McpContext` directly. No change needed — `McpContext` is already a read-only interface.

### 4. Update WebSocket handler signatures

#### `websockets/bridge.ts` (lines 4-9)

```ts
export function createBridgeServer(
  server: Server,
  onMessage: (ws: WebSocket, rawMsg: string) => void,
  onConnect?: (store: AppStoreReadOnly, ws: WebSocket) => void,  // pass read-only store
  onClose?: (store: AppStoreReadOnly, ws: WebSocket) => void
)
```

#### `websockets/dashboard.ts`

```ts
export function createDashboardServer(
  server: Server,
  sendInit: () => string,
  onMessage: (ws: WebSocket, rawMsg: string) => void,
  onConnect?: (store: AppStoreReadOnly, ws: WebSocket) => void,
  onClose?: (store: AppStoreReadOnly, ws: WebSocket) => void
)
```

### 5. Update `index.ts` to use getters/methods

After Phase 1, `index.ts` already uses getters and methods. Phase 2 is mainly about:
- Updating route/WebSocket type signatures
- Passing `store` as `AppStoreReadOnly` instead of full `AppStore`
- TypeScript will enforce that routes can't mutate state

### 6. Update all route handler implementations

Each route file's internal logic doesn't need to change — they already receive function callbacks. The only change is the type signatures.

### 7. Update WebSocket handlers in `index.ts`

```ts
// Before
createBridgeServer(server, onMessage, (ws) => store.addBridgeClient(ws), (ws) => store.removeBridgeClient(ws));

// After - TypeScript enforces read-only access
createBridgeServer(server, onMessage, (store, ws) => store.addBridgeClient(ws), (store, ws) => store.removeBridgeClient(ws));
```

Wait — this won't work because `addBridgeClient` is a mutation method. The better pattern is:

```ts
createBridgeServer(
  server,
  onMessage,
  (ws) => store.addBridgeClient(ws),  // index.ts is the only place that can mutate
  (ws) => store.removeBridgeClient(ws)
);
```

So `AppStoreReadOnly` should NOT include mutation methods. Only `index.ts` gets the full `AppStore`.

### 8. What `AppStoreReadOnly` includes vs excludes

| Included (read-only) | Excluded (mutation) |
|---------------------|---------------------|
| All getters | `addBridgeClient()` |
| `getFullStatusPayload()` | `removeBridgeClient()` |
| `getAndClearPendingOrders()` | `addDashboardClient()` |
| `getPendingEaCommand()` | `removeDashboardClient()` |
| `buildMcpContext()` | `updateWebRequestTest()` |
| | `switchSymbol()` |
| | `updateSettings()` |
| | `toggleTrading()` |
| | `placeTrade()` |
| | `closeTrade()` |
| | `resetStats()` |
| | `addLog()` |
| | `broadcastToDashboards()` |

## What This Achieves

- Routes and WebSocket handlers can only read state, not mutate it
- TypeScript enforces the contract at compile time
- Accidental `store.tradesList = []` from a route handler becomes a type error
- Clear separation: `index.ts` = orchestration + mutation, routes/WS = read + dispatch

## Implementation Safety

### DO NOT BREAK THESE CONTRACTS

1. **`getFullStatusPayload()` shape** — frontend `App.tsx` `onInit` expects ALL fields
2. **`updateMarket()` broadcast shape** — frontend chart depends on `candles`, `history`, `currentPrice`, `connection`, `stats`, `symbolStates`
3. **EA tick response** — EA reads `isActive`, `selectedStrategy`, `pendingAction`, etc. from `routes/ea.ts:81-96`
4. **MCP context** — all 25+ MCP tools depend on `buildMcpContext()` methods

## Verification

- `npx tsc --noEmit` passes
- Server starts
- All routes function correctly
- WebSocket connections work
- No route/WebSocket handler can directly mutate store state
