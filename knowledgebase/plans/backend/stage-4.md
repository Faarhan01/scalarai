# Backend Plan — Stage 4: AppStore Class

> **Canonical structure:** See `knowledgebase/site-structure/backend/index.md` for the actual committed file layout before editing anything.

## Objective

Encapsulate all application state and business logic into a single testable `AppStore` class.

## Actual Outcome

All module-level state and closures were migrated from `index.ts` into `backend/src/services/app-store.ts`. The intermediate `backend/src/services/app-state.ts` (which contained standalone functions taking `state` and `callbacks` parameters) was removed after the class-based approach proved cleaner.

**Result:**
- `backend/src/index.ts`: 160 lines (thin bootstrap)
- `backend/src/services/app-store.ts`: 441 lines (all state + business logic)
- `backend/src/services/app-state.ts`: deleted

## Current Architecture

```
index.ts  →  creates AppStore instance  →  wires routes/websockets to store methods
```

`index.ts` no longer contains:
- Module-level state objects (`appState`, `appCallbacks`, `webRequestTest`, `mt5BridgeClients`, `webDashboardClients`)
- State mutation functions (`getFullStatusPayload`, `updateMarket`, `broadcastToDashboards`, `toggleTrading`, `resetStats`, etc.)
- `mcpContext` construction logic

All of the above now live as methods on the `AppStore` class.

## AppStore Class Structure

**File:** `backend/src/services/app-store.ts`

```ts
export class AppStore {
  // State fields
  tradeConfig: TradeConfig;
  tradesList: TradeRecord[];
  systemLogs: SystemLog[];
  aiKnowledgeBase: AiKnowledgeBase;
  aiSynthesizedStrategy: AiSynthesizedStrategy;
  lastStrategySignal: { type: string; reason: string; confidence?: number } | null;
  symbolStates: SymbolStates;
  activeSymbol: string;
  lastProcessedTelemetryIndex: number;
  nextTicket: { value: number };
  latestBuyLockedFromEa: boolean;
  latestSellLockedFromEa: boolean;
  pendingBridgeOrders: any[];
  pendingEaCommand: { action: string; lot: number; sl: number; tp: number } | null;
  mt5BridgeClients: Set<WebSocket>;
  webDashboardClients: Set<WebSocket>;
  webRequestTest: { status: "idle" | "pending" | "success" | "failed"; lastTested: string; error: string; details: string; triggerTest: boolean };

  constructor() {
    // Initializes all state fields from defaults + DB
    this.loadAiSynthesizedStrategy();
    this.loadAiKnowledgeBase();
    this.nextTicket = { value: scalarAiDb.getMaxTicket() + 1 };
  }

  // Persistence
  loadFromDb(): void;
  loadAiSynthesizedStrategy(): void;
  loadAiKnowledgeBase(): void;

  // Logging + broadcasting
  addLog(source, level, message): void;
  broadcastToDashboards(payload): void;
  broadcastTradesUpdate(): void;

  // Status / payloads
  getFullStatusPayload(): FullStatusPayload;
  getAndClearPendingOrders(): any[];
  getPendingEaCommand(): { action: string; lot: number; sl: number; tp: number } | null;

  // Market ingestion
  updateMarket(data: UpdateMarketPayload, clientIp?: string): void;

  // Trade state builder
  buildTradeState(): TradeState;

  // MCP context factory
  buildMcpContext(): McpContext;

  // Background worker
  runBackgroundAnalysisWorker(): void;

  // Settings + trading controls
  updateSettings(params: Partial<TradeConfig>): TradeConfig;
  toggleTrading(isActive: boolean): TradeConfig;
  async placeTrade(type: "BUY" | "SELL", reason: string): Promise<{ success: boolean; message: string }>;
  async closeTrade(tradeId: string): Promise<{ success: boolean; message: string }>;
  resetStats(): void;

  // Stub for MCP type requirement
  analyzeMarket(): Promise<string>;
}
```

## State Categories

### Application State (mutated by business logic)
- `tradeConfig` — current trading configuration
- `tradesList` — all trades (open + closed)
- `systemLogs` — recent log entries (capped at 80)
- `aiKnowledgeBase` — AI speed baseline
- `aiSynthesizedStrategy` — AI strategy rules
- `lastStrategySignal` — most recent strategy signal
- `symbolStates` — per-symbol market state
- `activeSymbol` — currently viewed symbol
- `lastProcessedTelemetryIndex` — background worker cursor

### Transient/Request State
- `pendingBridgeOrders` — orders queued for MT5 bridge
- `pendingEaCommand` — single pending EA command
- `webRequestTest` — WebRequest test state machine
- `nextTicket` — monotonically increasing ticket counter

### EA Telemetry State
- `latestBuyLockedFromEa` — latest EA-reported BUY lock
- `latestSellLockedFromEa` — latest EA-reported SELL lock

### Connection State
- `mt5BridgeClients` — connected bridge WebSockets
- `webDashboardClients` — connected dashboard WebSockets

## `index.ts` Bootstrap Pattern

```ts
const store = new AppStore();

async function startServer() {
  store.loadFromDb();

  setInterval(() => store.runBackgroundAnalysisWorker(), 300000);
  setInterval(() => { /* DB cleanup */ }, 3600000);

  registerEaRoutes(app, store.getFullStatusPayload.bind(store), () => store.tradeConfig, store.updateMarket.bind(store), store.getPendingEaCommand.bind(store), apiKey);
  registerMarketRoutes(app, store.updateMarket.bind(store), () => store.tradeConfig, apiKey);
  registerSettingsRoutes(app, (params) => store.updateSettings(params), () => store.tradeConfig, ...);
  registerTradeRoutes(app, (isActive) => store.toggleTrading(isActive), () => store.resetStats(), apiKey);
  registerAiRoutes(app, () => ({ /* derived from store */ }));
  registerMcpRoute(app, store.buildMcpContext(), apiKey);
  registerStatusRoute(app, store.getFullStatusPayload.bind(store), (symbol) => { store.activeSymbol = symbol; }, store.getAndClearPendingOrders.bind(store), apiKey);
  registerHealthRoutes(app);
  registerStrategyRoutes(app);

  // WebSocket handlers use store methods directly
  createBridgeServer(server, (ws, rawMsg) => { store.addLog(...); });
  createDashboardServer(server, () => JSON.stringify({ type: "init", payload: store.getFullStatusPayload() }), (ws, rawMsg) => {
    // toggle_trade, close_all, reset_stats handlers
  });
}
```

## What Was Removed

- `backend/src/services/app-state.ts` — intermediate module with standalone functions (`buildTradeState`, `updateSettings`, `toggleTrading`, `resetStats`, `runBackgroundAnalysisWorker`, `buildMcpContext`, etc.) that took `(state, callbacks)` parameters. All functionality moved into `AppStore` class methods.

## Implementation Steps (Historical)

1. **Create `backend/src/services/app-store.ts`** — Define `AppStore` class with all state fields and methods
2. **Migrate from `app-state.ts`** — Move all standalone functions into class methods, remove `state`/`callbacks` parameters in favor of `this`
3. **Rewrite `backend/src/index.ts`** — Replace module-level state with `const store = new AppStore()`, pass store methods to route registrations
4. **Delete `backend/src/services/app-state.ts`** — No longer needed

## Verification

- `npx tsc --noEmit` passes
- All features work identically
- `AppStore` can be instantiated in tests without Express server
- `index.ts` remains under 200 lines
