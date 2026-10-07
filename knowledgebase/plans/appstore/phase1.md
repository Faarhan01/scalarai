# AppStore Standardization — Phase 1: Private Fields + Getters

## Objective

Make all `AppStore` state fields `private` and expose read-only getters to prevent accidental mutation from outside the class.

## Current State

All 17 state fields in `backend/src/services/app-store.ts` lines 11–27 are public:

```ts
export class AppStore {
  tradeConfig: TradeConfig;                          // line 11
  tradesList: TradeRecord[];                         // line 12
  systemLogs: SystemLog[];                           // line 13
  aiKnowledgeBase: AiKnowledgeBase;                  // line 14
  aiSynthesizedStrategy: AiSynthesizedStrategy;      // line 15
  lastStrategySignal: { ... } | null;                // line 16
  symbolStates: SymbolStates;                        // line 17
  activeSymbol: string;                              // line 18
  lastProcessedTelemetryIndex: number;               // line 19
  nextTicket: { value: number };                     // line 20
  latestBuyLockedFromEa: boolean;                    // line 21
  latestSellLockedFromEa: boolean;                   // line 22
  pendingBridgeOrders: BridgeOrder[];                // line 23
  pendingEaCommand: { ... } | null;                  // line 24
  mt5BridgeClients: Set<WebSocket>;                  // line 25
  webDashboardClients: Set<WebSocket>;               // line 26
  webRequestTest: { status, lastTested, ... };       // line 27
}
```

## Exact Direct Field Accesses in `index.ts`

These are the exact lines that read/write `AppStore` state directly:

### Reads (need getters)
| Line | Code | Field |
|------|------|-------|
| 60 | `store.getFullStatusPayload.bind(store)` | method call |
| 60 | `() => store.tradeConfig` | `tradeConfig` |
| 61 | `store.updateMarket.bind(store)` | method call |
| 61 | `() => store.tradeConfig` | `tradeConfig` |
| 65 | `() => store.tradeConfig` | `tradeConfig` |
| 66 | `() => store.webRequestTest` | `webRequestTest` |
| 87 | `store.aiKnowledgeBase.totalObservations` | `aiKnowledgeBase` |
| 88 | `store.aiKnowledgeBase.totalObservations` | `aiKnowledgeBase` |
| 89 | `store.aiKnowledgeBase.totalObservations` | `aiKnowledgeBase` |
| 90 | `store.aiKnowledgeBase` | `aiKnowledgeBase` |
| 91 | `store.aiSynthesizedStrategy` | `aiSynthesizedStrategy` |
| 92 | `getSymbolState(store.symbolStates, store.activeSymbol)` | `symbolStates`, `activeSymbol` |
| 93 | `store.aiKnowledgeBase.globalAverageSpeed` | `aiKnowledgeBase` |
| 98 | `store.getFullStatusPayload.bind(store)` | method call |
| 105 | `store.getAndClearPendingOrders.bind(store)` | method call |
| 154 | `store.getFullStatusPayload()` | method call |

### Writes (need setter methods)
| Line | Code | Field |
|------|------|-------|
| 68 | `store.webRequestTest.status = "pending"` | `webRequestTest.status` |
| 69 | `store.webRequestTest.triggerTest = true` | `webRequestTest.triggerTest` |
| 70 | `store.webRequestTest.lastTested = new Date().toISOString()` | `webRequestTest.lastTested` |
| 71 | `store.webRequestTest.details = "..."` | `webRequestTest.details` |
| 75 | `store.webRequestTest.status = report.status` | `webRequestTest.status` |
| 76 | `store.webRequestTest.error = report.error || ""` | `webRequestTest.error` |
| 77 | `store.webRequestTest.details = report.details || ""` | `webRequestTest.details` |
| 78 | `store.webRequestTest.lastTested = new Date().toISOString()` | `webRequestTest.lastTested` |
| 79 | `store.webRequestTest.triggerTest = false` | `webRequestTest.triggerTest` |
| 100 | `store.activeSymbol = symbol` | `activeSymbol` |
| 101 | `store.symbolStates.activeSymbol = symbol` | `symbolStates.activeSymbol` |

### Set/Add/Delete operations
| Line | Code | Field |
|------|------|-------|
| 143 | `store.mt5BridgeClients.add(ws)` | `mt5BridgeClients` |
| 147 | `store.mt5BridgeClients.delete(ws)` | `mt5BridgeClients` |
| 161 | `store.toggleTrading(!store.tradeConfig.isActive)` | method call, reads `tradeConfig.isActive` |
| 164 | `store.tradesList.forEach(...)` | `tradesList` |
| 176 | `store.webDashboardClients.add(ws)` | `webDashboardClients` |
| 179 | `store.webDashboardClients.delete(ws)` | `webDashboardClients` |

## Implementation Steps

### 1. Make all fields private in `app-store.ts`

Change lines 11–27 from:
```ts
export class AppStore {
  tradeConfig: TradeConfig;
  tradesList: TradeRecord[];
  // ...
}
```

To:
```ts
export class AppStore {
  private tradeConfig: TradeConfig;
  private tradesList: TradeRecord[];
  private systemLogs: SystemLog[];
  private aiKnowledgeBase: AiKnowledgeBase;
  private aiSynthesizedStrategy: AiSynthesizedStrategy;
  private lastStrategySignal: { type: string; reason: string; confidence?: number } | null;
  private symbolStates: SymbolStates;
  private activeSymbol: string;
  private lastProcessedTelemetryIndex: number;
  private nextTicket: { value: number };
  private latestBuyLockedFromEa: boolean;
  private latestSellLockedFromEa: boolean;
  private pendingBridgeOrders: BridgeOrder[];
  private pendingEaCommand: { action: string; lot: number; sl: number; tp: number } | null;
  private mt5BridgeClients: Set<WebSocket>;
  private webDashboardClients: Set<WebSocket>;
  private webRequestTest: { status: "idle" | "pending" | "success" | "failed"; lastTested: string; error: string; details: string; triggerTest: boolean };
}
```

### 2. Add getters for all fields that need external read access

Add these getters to `AppStore`:

```ts
get config(): TradeConfig { return this.tradeConfig; }
get trades(): readonly TradeRecord[] { return this.tradesList; }
get logs(): readonly SystemLog[] { return this.systemLogs; }
get aiKnowledgeBase(): AiKnowledgeBase { return this.aiKnowledgeBase; }
get aiSynthesizedStrategy(): AiSynthesizedStrategy { return this.aiSynthesizedStrategy; }
get lastStrategySignal(): { type: string; reason: string; confidence?: number } | null { return this.lastStrategySignal; }
get symbolStates(): SymbolStates { return this.symbolStates; }
get activeSymbol(): string { return this.activeSymbol; }
get nextTicket(): { value: number } { return this.nextTicket; }
get latestBuyLockedFromEa(): boolean { return this.latestBuyLockedFromEa; }
get latestSellLockedFromEa(): boolean { return this.latestSellLockedFromEa; }
get pendingBridgeOrders(): readonly BridgeOrder[] { return this.pendingBridgeOrders; }
get pendingEaCommand(): { action: string; lot: number; sl: number; tp: number } | null { return this.pendingEaCommand; }
get mt5BridgeClients(): ReadonlySet<WebSocket> { return this.mt5BridgeClients; }
get webDashboardClients(): ReadonlySet<WebSocket> { return this.webDashboardClients; }
get webRequestTest(): { status: "idle" | "pending" | "success" | "failed"; lastTested: string; error: string; details: string; triggerTest: boolean } { return this.webRequestTest; }
```

Note: `mt5BridgeClients` and `webDashboardClients` return `ReadonlySet<WebSocket>` to prevent external code from calling `.add()`/`.delete()` on the set reference. However, `ReadonlySet` still allows `.has()` and `.size`, which is what `index.ts` needs.

### 3. Add setter methods for fields that `index.ts` writes

For `webRequestTest`, add a dedicated update method instead of exposing the whole object:

```ts
updateWebRequestTest(update: { status?: "idle" | "pending" | "success" | "failed"; error?: string; details?: string; triggerTest?: boolean }): void {
  if (update.status !== undefined) this.webRequestTest.status = update.status;
  if (update.error !== undefined) this.webRequestTest.error = update.error;
  if (update.details !== undefined) this.webRequestTest.details = update.details;
  if (update.triggerTest !== undefined) this.webRequestTest.triggerTest = update.triggerTest;
}
```

Then in `index.ts`, replace lines 68-71 with:
```ts
store.updateWebRequestTest({ status: "pending", triggerTest: true, lastTested: new Date().toISOString(), details: "Verification probe initiated. Waiting for MT5 bridge..." });
store.broadcastToDashboards({ type: "webrequest_test", testState: store.webRequestTest });
```

And lines 75-80 with:
```ts
store.updateWebRequestTest({ status: report.status as "idle" | "pending" | "success" | "failed", error: report.error || "", details: report.details || "", triggerTest: false });
store.broadcastToDashboards({ type: "webrequest_test", testState: store.webRequestTest });
```

For `activeSymbol` and `symbolStates.activeSymbol`, add a method:

```ts
switchSymbol(symbol: string): void {
  this.activeSymbol = symbol;
  this.symbolStates.activeSymbol = symbol;
  this.addLog("SERVER", "INFO", `Active market symbol switched to: ${symbol}`);
  this.broadcastToDashboards({ type: "init", payload: this.getFullStatusPayload() });
}
```

Then in `index.ts`, replace lines 100-103 with:
```ts
store.switchSymbol(symbol);
```

### 4. Update `index.ts` to use getters

Replace all direct field accesses with getters or methods:

| Old (line) | New |
|------------|-----|
| `() => store.tradeConfig` (60, 61, 65) | `() => store.config` |
| `() => store.webRequestTest` (66) | `() => store.webRequestTest` |
| `store.webRequestTest.status = "pending"` (68) | `store.updateWebRequestTest({ status: "pending", ... })` |
| `store.webRequestTest.triggerTest = true` (69) | `store.updateWebRequestTest({ triggerTest: true, ... })` |
| `store.webRequestTest.lastTested = ...` (70) | `store.updateWebRequestTest({ ... })` |
| `store.webRequestTest.details = ...` (71) | `store.updateWebRequestTest({ ... })` |
| `store.webRequestTest.status = ...` (75) | `store.updateWebRequestTest({ status: ... })` |
| `store.webRequestTest.error = ...` (76) | `store.updateWebRequestTest({ error: ... })` |
| `store.webRequestTest.details = ...` (77) | `store.updateWebRequestTest({ ... })` |
| `store.webRequestTest.lastTested = ...` (78) | `store.updateWebRequestTest({ ... })` |
| `store.webRequestTest.triggerTest = false` (79) | `store.updateWebRequestTest({ triggerTest: false })` |
| `store.activeSymbol = symbol` (100) | `store.switchSymbol(symbol)` |
| `store.symbolStates.activeSymbol = symbol` (101) | handled by `switchSymbol()` |
| `store.mt5BridgeClients.add(ws)` (143) | `store.mt5BridgeClients` is read-only, need method |
| `store.mt5BridgeClients.delete(ws)` (147) | need method |
| `store.webDashboardClients.add(ws)` (176) | need method |
| `store.webDashboardClients.delete(ws)` (179) | need method |

### 5. Add methods for Set mutations

Since `ReadonlySet` doesn't allow `.add()`/`.delete()`, add methods to `AppStore`:

```ts
addBridgeClient(ws: WebSocket): void {
  this.mt5BridgeClients.add(ws);
  this.broadcastToDashboards({ type: "connection", isBridgeConnected: true });
}

removeBridgeClient(ws: WebSocket): void {
  this.mt5BridgeClients.delete(ws);
  this.broadcastToDashboards({ type: "connection", isBridgeConnected: this.mt5BridgeClients.size > 0 });
}

addDashboardClient(ws: WebSocket): void {
  this.webDashboardClients.add(ws);
}

removeDashboardClient(ws: WebSocket): void {
  this.webDashboardClients.delete(ws);
}
```

### 6. Update internal references within `AppStore`

All internal references already use `this.fieldName` (verified). No changes needed.

### 7. Run typecheck and test

```bash
npx tsc --noEmit
npm run dev
```

## Critical Fragility Warnings

### DO NOT BREAK THESE CONTRACTS

1. **Frontend WebSocket messages must not change shape**: `getFullStatusPayload()` at `app-store.ts:90-130` returns data sent to frontend. The shape must remain identical.
2. **EA tick response must not change**: The EA reads specific field names from `routes/ea.ts:81-96`.
3. **MCP context must not change**: `buildMcpContext()` at `app-store.ts:258-325` methods must remain callable.
4. **Broadcast methods must not change**: `broadcastToDashboards()` at `app-store.ts:72-84` and `broadcastTradesUpdate()` at `app-store.ts:86-88` must continue sending the same message shapes.

## Verification

- `npx tsc --noEmit` passes
- Server starts on `http://localhost:3000`
- `/api/health` returns `status: ok`
- EA can still send ticks and receive responses with all required fields
- Dashboard WebSocket connects and receives init message with full `FullStatusPayload`
- Frontend chart displays candlesticks
- Settings changes persist
- Trade toggles work
- Symbol switching works
- No `store.fieldName = ...` assignments outside `AppStore` class
- No `store.fieldName.add()` / `.delete()` outside `AppStore` class
