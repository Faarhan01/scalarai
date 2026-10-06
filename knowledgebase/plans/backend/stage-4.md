# Backend Plan — Stage 4: Global Mutable State Wrapper

## Objective

Wrap module-level state into a testable `AppStore` class.

## Current State

Module-level state is hard to test. Exact state in `backend/src/index.ts` lines 41–63:

```ts
let tradeConfig = getDefaultTradeConfig();                    // line 42
let pendingBridgeOrders: any[] = [];                          // line 43
let pendingEaCommand: { action: string; lot: number; sl: number; tp: number } | null = null; // line 44
const symbolStates = createSymbolStates("Step Index");        // line 45
let activeSymbol = "Step Index";                              // line 46

const webRequestTest: { status: ...; triggerTest: boolean } = { ... }; // line 48
let systemLogs: SystemLog[] = [];                             // line 55
let tradesList: TradeRecord[] = [];                           // line 56
let nextTicket = 837201;                                      // line 57
let latestBuyLockedFromEa = false;                            // line 58
let latestSellLockedFromEa = false;                           // line 59
let aiKnowledgeBase = getDefaultAiKnowledgeBase();            // line 60
let lastStrategySignal: { type: string; reason: string; confidence?: number } | null = null; // line 61
let aiSynthesizedStrategy = getDefaultAiSynthesizedStrategy(); // line 62
let lastProcessedTelemetryIndex = 0;                          // line 63
```

Plus WebSocket client sets:
```ts
const mt5BridgeClients = new Set<WebSocket>();                // line 129
const webDashboardClients = new Set<WebSocket>();             // line 130
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

## Proposed Structure

```
backend/src/
├── services/
│   ├── app-store.ts          # Testable state container
│   └── ...existing services
```

## `AppStore` Class Design

```ts
// backend/src/services/app-store.ts
import { TradeConfig, TradeRecord, SystemLog, AiKnowledgeBase, AiSynthesizedStrategy, Tick, EAConnectionDetails } from "../types";
import { SymbolStates, createSymbolStates, getSymbolState, updateMarketState, aggregateTickIntoCandle } from "./market-ingestion";
import { scalarAiDb } from "../db";

export class AppStore {
  // Application state
  tradeConfig: TradeConfig;
  tradesList: TradeRecord[];
  systemLogs: SystemLog[];
  aiKnowledgeBase: AiKnowledgeBase;
  aiSynthesizedStrategy: AiSynthesizedStrategy;
  lastStrategySignal: { type: string; reason: string; confidence?: number } | null;
  symbolStates: SymbolStates;
  activeSymbol: string;
  lastProcessedTelemetryIndex: number;

  // Transient state
  pendingBridgeOrders: Array<{ action: string; symbol: string; volume: number; sl: number; tp: number; id: string; ticket: number; timestamp: number }>;
  pendingEaCommand: { action: string; lot: number; sl: number; tp: number } | null;
  webRequestTest: { status: "idle" | "pending" | "success" | "failed"; lastTested: string; error: string; details: string; triggerTest: boolean };
  nextTicket: number;

  // EA telemetry
  latestBuyLockedFromEa: boolean;
  latestSellLockedFromEa: boolean;

  // WebSocket clients (not serialized, just tracked)
  mt5BridgeClients = new Set<WebSocket>();
  webDashboardClients = new Set<WebSocket>();

  constructor() {
    this.tradeConfig = getDefaultTradeConfig();
    this.tradesList = [];
    this.systemLogs = [];
    this.aiKnowledgeBase = getDefaultAiKnowledgeBase();
    this.aiSynthesizedStrategy = getDefaultAiSynthesizedStrategy();
    this.lastStrategySignal = null;
    this.symbolStates = createSymbolStates("Step Index");
    this.activeSymbol = "Step Index";
    this.lastProcessedTelemetryIndex = 0;
    this.pendingBridgeOrders = [];
    this.pendingEaCommand = null;
    this.webRequestTest = { ... };
    this.nextTicket = 837201;
    this.latestBuyLockedFromEa = false;
    this.latestSellLockedFromEa = false;
  }

  // Persistence methods
  loadFromDb() { ... }
  persistTrade(trade: TradeRecord) { ... }
  persistLog(log: SystemLog) { ... }
  persistAiKnowledge() { ... }
  persistAiStrategy() { ... }
  persistSettings() { ... }
  persistEaConnection(conn: EAConnectionDetails) { ... }

  // State mutation methods
  addLog(source: "SERVER" | "EA" | "AI", level: "INFO" | "SUCCESS" | "WARNING" | "ERROR", message: string) { ... }
  broadcastToDashboards(payload: unknown) { ... }
  broadcastTradesUpdate() { ... }
  
  // Getters for route handlers
  getFullStatusPayload() { ... }
  getAndClearPendingOrders() { ... }
  getPendingEaCommand() { ... }
  
  // Trade execution
  async evaluateSimulatedStrategy() { ... }
  async openSimulatedPosition(type: "BUY" | "SELL", reason: string) { ... }
  closeSimulatedPosition(trade: TradeRecord, reason: string) { ... }
  
  // Settings
  updateSettings(params: Partial<TradeConfig>) { ... }
  toggleTrading(isActive: boolean) { ... }
  async placeTrade(type: "BUY" | "SELL", reason?: string) { ... }
  async closeTrade(tradeId: string) { ... }
  resetStats() { ... }
  
  // Background
  runBackgroundAnalysisWorker() { ... }
}
```

## Implementation Steps

1. Create `backend/src/services/app-store.ts`
   - Define `AppStore` class with all state fields
   - Move `loadStateFromDb` → `loadFromDb()` instance method
   - Move all `persist*` functions → instance methods
   - Move `addLog`, `broadcastToDashboards`, `broadcastTradesUpdate` → instance methods
   - Move trade execution functions → instance methods
   - Move settings/trading functions → instance methods
   - Move `runBackgroundAnalysisWorker` → instance method
   - Add typed getters for route handlers

2. Update `backend/src/index.ts`
   - Replace module-level `let`/`const` state with `const store = new AppStore()`
   - Replace all state mutations with `store.*` calls
   - Pass `store` to route registrations instead of individual closures

3. Update route registrations
   - `registerEaRoutes(app, () => store.getFullStatusPayload(), () => store.tradeConfig, (data, ip) => store.updateMarket(data, ip), () => store.getPendingEaCommand())`
   - Similar pattern for all other routes

4. Add unit tests for `AppStore`
   - Test state initialization
   - Test `loadFromDb` / `resetStats`
   - Test `updateSettings` / `toggleTrading`
   - Test `openSimulatedPosition` / `closeSimulatedPosition`

## Verification

- `npx tsc --noEmit` passes
- `npm run test` passes
- All features work identically
- `AppStore` can be instantiated in tests without Express server
