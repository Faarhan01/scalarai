# Backend Plan — Stage 4: AppStore Class

> **Canonical structure:** See `knowledgebase/site-structure/backend/index.md` for the actual committed file layout before editing anything.

## Objective

Encapsulate all application state and business logic into a single testable `AppStore` class.

## Actual Outcome

All module-level state and closures were migrated from `index.ts` into `backend/src/services/app-store.ts`. The intermediate `backend/src/services/app-state.ts` (which contained standalone functions taking `state` and `callbacks` parameters) was removed after the class-based approach proved cleaner.

**Result:**
- `backend/src/index.ts`: 192 lines (thin bootstrap)
- `backend/src/services/app-store.ts`: 453 lines (all state + business logic)
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
  pendingBridgeOrders: BridgeOrder[];
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
  getAndClearPendingOrders(): BridgeOrder[];
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

## Critical Fragility Warnings

### STATE CONTRACT STABILITY

1. **`AppStore` is the ONLY state container**: All application state lives in `AppStore`. Do NOT create new global stores, module-level state, or duplicate state in routes or WebSocket handlers. If you need new state, add it to `AppStore` and pass a getter/method to the route registration.

2. **`getFullStatusPayload()` is a contract with the frontend**: This method returns the full state sent via WebSocket `init` message. The frontend `App.tsx` `onInit` handler destructures this payload. Removing or renaming fields breaks the dashboard.

3. **`updateMarket()` is a contract with the EA**: This method processes incoming tick data from `/api/ea/tick` and `/api/update-market`. It broadcasts `tick` messages to dashboards. Changing the broadcast shape breaks the chart.

4. **WebSocket broadcast methods are critical**:
   - `broadcastToDashboards(payload)` — sends to ALL connected dashboard clients
   - `broadcastTradesUpdate()` — sends `{type: "trades", trades, stats}`
   - Both are called from many places. If you change the message format, update `frontend/src/hooks/useWebSocket.ts` and `frontend/src/App.tsx`.

5. **`buildMcpContext()` is a contract with MCP tools**: The MCP server uses this context for all 25+ tools. If you add new store methods that MCP tools need, add them to `McpContext` in `backend/src/types/index.ts` and wire them here.

6. **`pendingBridgeOrders` and `pendingEaCommand` are contracts with the EA bridge**:
   - `getAndClearPendingOrders()` returns orders sent to `/mt5-bridge`
   - `getPendingEaCommand()` returns commands sent via `/api/ea/tick` response
   - Changing these shapes breaks the EA's ability to receive trade commands

7. **Background workers are critical**:
   - `runBackgroundAnalysisWorker()` runs every 5 minutes — processes unprocessed telemetry, updates AI knowledge
   - DB cleanup runs every 1 hour — deletes old ticks/logs
   - Do NOT remove or significantly slow these without understanding the impact on AI calibration and DB size

## `index.ts` Bootstrap Pattern

```ts
const store = new AppStore();

async function startServer() {
  store.loadFromDb();

  setInterval(() => store.runBackgroundAnalysisWorker(), 300000);
  setInterval(() => { /* DB cleanup */ }, 3600000);

  registerEaRoutes(app, store.getFullStatusPayload.bind(store), () => store.tradeConfig, store.updateMarket.bind(store), store.getPendingEaCommand.bind(store));
  registerMarketRoutes(app, store.updateMarket.bind(store), () => store.tradeConfig);
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
- `index.ts` remains under 200 lines (actual: 192 lines)
- `app-store.ts` is 453 lines (actual count at HEAD)
