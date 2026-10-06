# Backend Plan — Stage 2: Type Safety Sweep

## Objective

Replace high-value `: any` types with proper interfaces across backend.

## Current State

97 `: any` types remain across backend. Below are the exact locations and recommended replacements.

## Exact Locations & Replacements

### 1. `backend/src/index.ts`

| Line | Current | Recommended |
|------|---------|-------------|
| 174 | `function updateMarket(data: any, clientIp?: string)` | `function updateMarket(data: UpdateMarketPayload, clientIp?: string)` — add `UpdateMarketPayload` to types |
| 338 | `const openTrades = tradesList.filter((t: any) => t.status === "OPEN")` | `const openTrades = tradesList.filter((t: TradeRecord) => t.status === "OPEN")` |
| 340 | `openTrades.forEach((trade: any) => {` | `openTrades.forEach((trade: TradeRecord) => {` |
| 357 | `const activeBuyExists = openTrades.some((t: any) => t.type === "BUY")` | `const activeBuyExists = openTrades.some((t: TradeRecord) => t.type === "BUY")` |
| 358 | `const activeSellExists = openTrades.some((t: any) => t.type === "SELL")` | `const activeSellExists = openTrades.some((t: TradeRecord) => t.type === "SELL")` |
| 381 | `const openTrades = tradesList.filter((t: any) => t.status === "OPEN")` | `const openTrades = tradesList.filter((t: TradeRecord) => t.status === "OPEN")` |
| 382 | `const activeBuyExists = openTrades.some((t: any) => t.type === "BUY")` | `const activeBuyExists = openTrades.some((t: TradeRecord) => t.type === "BUY")` |
| 383 | `const activeSellExists = openTrades.some((t: any) => t.type === "SELL")` | `const activeSellExists = openTrades.some((t: TradeRecord) => t.type === "SELL")` |
| 133 | `const closedPositions = tradesList.filter((t: any) => t.status === "CLOSED")` | `const closedPositions = tradesList.filter((t: TradeRecord) => t.status === "CLOSED")` |
| 134 | `const wins = closedPositions.filter((t: any) => t.profit > 0)` | `const wins = closedPositions.filter((t: TradeRecord) => t.profit > 0)` |
| 135 | `const totalProfit = closedPositions.reduce((sum: number, t: any) => sum + t.profit, 0)` | `const totalProfit = closedPositions.reduce((sum: number, t: TradeRecord) => sum + t.profit, 0)` |
| 137 | `const openPositions = tradesList.filter((t: any) => t.status === "OPEN")` | `const openPositions = tradesList.filter((t: TradeRecord) => t.status === "OPEN")` |
| 549 | `const openTrades = tradesList.filter((t: any) => t.status === "OPEN")` | `const openTrades = tradesList.filter((t: TradeRecord) => t.status === "OPEN")` |
| 551 | `openTrades.forEach((t: any) => closeSimulatedPosition(t, ...))` | `openTrades.forEach((t: TradeRecord) => closeSimulatedPosition(t, ...))` |
| 566 | `const trade = tradesList.find((t: any) => t.id === tradeId && t.status === "OPEN")` | `const trade = tradesList.find((t: TradeRecord) => t.id === tradeId && t.status === "OPEN")` |
| 528 | `function updateSettings(params: any)` | `function updateSettings(params: Partial<TradeConfig>)` |
| 607 | `} catch (err: any) {` | `} catch (err: Error) {` |
| 515 | `} catch (err: any) {` | `} catch (err: Error) {` |
| 702 | `tradesList.forEach((t: any) => { if (t.status === "OPEN") ... })` | `tradesList.forEach((t: TradeRecord) => { if (t.status === "OPEN") ... })` |
| 43 | `let pendingBridgeOrders: any[] = []` | `let pendingBridgeOrders: Array<{ action: string; symbol: string; volume: number; sl: number; tp: number; id: string; ticket: number; timestamp: number }>` |

### 2. `backend/src/types/index.ts`

| Line | Current | Recommended |
|------|---------|-------------|
| 171 | `updateSettings: (params: any) => Promise<TradeConfig>` | `updateSettings: (params: Partial<TradeConfig>) => Promise<TradeConfig>` |
| 123 | `rules: Record<string, any>` in `AiSynthesizedStrategy` | Keep as `Record<string, unknown>` or define `StrategyRules` interface |
| 160 | `getStatus: () => any` | `getStatus: () => FullStatusPayload` — add `FullStatusPayload` to types |
| 161 | `getAiStudyFeed: () => any` | `getAiStudyFeed: () => Promise<AiStudyFeedPayload>` — add payload interface |
| 173 | `placeTrade: (type: "BUY" | "SELL", reason?: string) => Promise<any>` | `placeTrade: (...) => Promise<{ success: boolean; message: string }>` |
| 174 | `closeTrade: (tradeId: string) => Promise<any>` | `closeTrade: (...) => Promise<{ success: boolean; message: string }>` |

### 3. `backend/src/routes/*.ts`

| File | Line | Current | Recommended |
|------|------|---------|-------------|
| `routes/ea.ts` | 9 | `app: any` | `app: express.Application` |
| `routes/ea.ts` | 12 | `onTick: (data: any, clientIp?: string)` | `onTick: (data: UpdateMarketPayload, clientIp?: string)` |
| `routes/market.ts` | 7-8 | `app: any`, `updateMarket: (data: any)` | `app: express.Application`, `updateMarket: (data: UpdateMarketPayload)` |
| `routes/settings.ts` | 6-7 | `app: any`, `updateSettings: (params: any)` | `app: express.Application`, `updateSettings: (params: Partial<TradeConfig>)` |
| `routes/trades.ts` | 5 | `app: any` | `app: express.Application` |
| `routes/status.ts` | 5-6 | `app: any`, `getStatus: () => any` | `app: express.Application`, `getStatus: () => FullStatusPayload` |
| `routes/ai.ts` | 5 | `app: any` | `app: express.Application` |
| `routes/health.ts` | 3 | `app: any` | `app: express.Application` |
| `routes/strategies.ts` | 6 | `app: any` | `app: express.Application` |
| `routes/mcp.ts` | 5 | `app: any` | `app: express.Application` |

### 4. `backend/src/websockets/*.ts`

| File | Line | Current | Recommended |
|------|------|---------|-------------|
| `websockets/bridge.ts` | 3 | `server: any` | `server: import("http").Server` |
| `websockets/bridge.ts` | 6 | `(request: any, socket: any, head: Buffer)` | `(request: import("http").IncomingMessage, socket: import("net").Socket, head: Buffer)` |
| `websockets/dashboard.ts` | 3 | `server: any` | `server: import("http").Server` |
| `websockets/dashboard.ts` | 6 | `(request: any, socket: any, head: Buffer)` | `(request: import("http").IncomingMessage, socket: import("net").Socket, head: Buffer)` |

### 5. `backend/src/mcp_server.ts`

| Line | Current | Recommended |
|------|---------|-------------|
| 482 | `trades.filter((t: any) => t.status === args.status)` | `trades.filter((t: TradeRecord) => t.status === args.status)` |
| 489 | `logs.filter((l: any) => l.source === args.source)` | `logs.filter((l: SystemLog) => l.source === args.source)` |
| 490 | `logs.filter((l: any) => l.level === args.level)` | `logs.filter((l: SystemLog) => l.level === args.level)` |
| 533 | `allTrades.filter((t: any) => t.strategy === mode)` | `allTrades.filter((t: TradeRecord) => t.strategy === mode)` |
| 534 | `const closed = modeTrades.filter((t: any) => t.status === "CLOSED")` | `const closed = modeTrades.filter((t: TradeRecord) => t.status === "CLOSED")` |
| 535 | `const wins = closed.filter((t: any) => t.profit > 0)` | `const wins = closed.filter((t: TradeRecord) => t.profit > 0)` |
| 536 | `const losses = closed.filter((t: any) => t.profit <= 0)` | `const losses = closed.filter((t: TradeRecord) => t.profit <= 0)` |
| 538 | `closed.reduce((sum: number, t: any) => sum + t.profit, 0)` | `closed.reduce((sum: number, t: TradeRecord) => sum + t.profit, 0)` |
| 539 | `wins.reduce((sum: number, t: any) => sum + t.profit, 0)` | `wins.reduce((sum: number, t: TradeRecord) => sum + t.profit, 0)` |
| 540 | `losses.reduce((sum: number, t: any) => sum + t.profit, 0)` | `losses.reduce((sum: number, t: TradeRecord) => sum + t.profit, 0)` |
| 650 | `let data: any` in `export_data` | `let data: TradeRecord[] | SystemLog[] | Tick[]` |

### 6. `backend/src/db/repository.ts`

| Line | Current | Recommended |
|------|---------|-------------|
| 13 | `constructor(private db: any)` | `constructor(private db: Database)` — import `Database` from `better-sqlite3` |
| 37 | `const values: any[] = []` | `const values: unknown[] = []` |
| 275 | `getSymbolMetadata(symbol: string): any` | `getSymbolMetadata(symbol: string): SymbolMetadataRow` — define row interface |
| 280 | `insertStrategy(strategy: any)` | `insertStrategy(strategy: StrategyRow)` |
| 294 | `getAllStrategies(): any[]` | `getAllStrategies(): StrategyRow[]` |
| 298 | `getStrategyById(id: string): any` | `getStrategyById(id: string): StrategyRow \| undefined` |
| 302 | `updateStrategy(id: string, updates: any)` | `updateStrategy(id: string, updates: Partial<StrategyRow>)` |
| 320 | `rawQuery(sql: string, params: any[] = []): any[]` | `rawQuery(sql: string, params: unknown[] = []): unknown[]` |
| 345 | `(this.db.prepare(...).get() as any).count` | `(this.db.prepare(...).get() as { count: number }).count` |
| 346 | same pattern for logCount, tradeCount | same fix |
| 119 | `const row = this.db.prepare(...).get() as any` | `const row = this.db.prepare(...).get() as AiKnowledgeRow` |
| 144 | `const row = this.db.prepare(...).get() as any` | `const row = this.db.prepare(...).get() as AiStrategyRow` |
| 172 | `const row = this.db.prepare(...).get() as any` | `const row = this.db.prepare(...).get() as SettingsRow` |
| 213 | `const row = this.db.prepare(...).get() as any` | `const row = this.db.prepare(...).get() as EaConnectionRow` |

## New Types to Add

### In `backend/src/types/index.ts`

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

## Implementation Steps

1. Add new interfaces to `backend/src/types/index.ts`
2. Update `backend/src/index.ts` — replace `: any` in trade filters, `updateMarket`, `updateSettings`, catch blocks, `pendingBridgeOrders`
3. Update `backend/src/routes/*.ts` — replace `app: any` with `express.Application`, typed callbacks
4. Update `backend/src/websockets/*.ts` — replace `server: any` with `http.Server`
5. Update `backend/src/mcp_server.ts` — replace `t: any` and `l: any` with `TradeRecord` / `SystemLog`
6. Update `backend/src/db/repository.ts` — replace `db: any` with `Database`, add row interfaces
7. Verify with `npx tsc --noEmit` and `npm run test`

## Verification

- `npx tsc --noEmit` passes with zero `any` errors
- `npm run test` passes
- All routes still function correctly
- `backend/src/mcp_server.ts` still handles all MCP tools
