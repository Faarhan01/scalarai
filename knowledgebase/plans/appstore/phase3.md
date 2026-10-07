# AppStore Standardization — Phase 3: XState State Machine

## Status: ✅ Implemented as passive observers (no behavioral changes)

## Objective

Add XState state machines to track trading, bridge, and calibration state. The machines are **passive observers** — they track state transitions but do NOT block or change any existing behavior. This ensures zero risk of breaking trading, EA communication, or the frontend.

## Why This Approach

The current code works without a state machine. Phase 1 and 2 already prevent the most common bugs. XState adds value by:
- Providing a single source of truth for state transitions
- Making state visible to MCP tools
- Enabling future enforcement without changing current behavior

## What Changed

### 1. New dependency: `xstate`

Installed via `npm install xstate`. Version: `^5.33.2`.

### 2. New file: `backend/src/services/trading-machine.ts`

Three state machines using XState v5 API:

**Trading Machine:**
```ts
idle ↔ active
```
- Tracks whether trading is active or idle
- Does NOT block `toggleTrading()` — the existing method still works exactly as before

**Bridge Machine:**
```ts
disconnected ↔ connected
```
- Tracks whether MT5 bridge is connected
- Does NOT block bridge client registration — existing `addBridgeClient()`/`removeBridgeClient()` still work

**Calibration Machine:**
```ts
calibrating → optimized
```
- Tracks AI calibration status
- Uses the SAME status strings as current code: `"calibrating"` and `"optimized"`
- Does NOT add a new `"active"` state — that would break the frontend
- Does NOT block any existing behavior

### 3. Updated: `backend/src/services/app-store.ts`

Added private machine instances:
```ts
private tradingState: TradingMachineService;
private bridgeState: BridgeMachineService;
private calibrationState: CalibrationMachineService;
```

Started machines in constructor using XState v5 `createActor`:
```ts
this.tradingState = createActor(tradingMachine).start();
this.bridgeState = createActor(bridgeMachine).start();
this.calibrationState = createActor(calibrationMachine).start();
```

Added event-sending methods using XState v5 event objects:
```ts
sendTradingEvent(event: "START" | "STOP"): void {
  this.tradingState.send({ type: event });
}

sendBridgeEvent(event: "CONNECT" | "DISCONNECT"): void {
  this.bridgeState.send({ type: event });
}

sendCalibrationEvent(event: "CALIBRATE"): void {
  this.calibrationState.send({ type: "CALIBRATE" });
}
```

Added state getters using XState v5 snapshot API:
```ts
getTradingState(): TradingState {
  return this.tradingState.getSnapshot().value as TradingState;
}

getBridgeState(): BridgeState {
  return this.bridgeState.getSnapshot().value as BridgeState;
}

getCalibrationState(): CalibrationState {
  return this.calibrationState.getSnapshot().value as CalibrationState;
}
```

**Important:** The machines are updated via events, but the existing methods (`toggleTrading()`, `addBridgeClient()`, etc.) still work exactly as before. The machines are observers, not enforcers.

### 4. Updated: `backend/src/index.ts`

Added event sends alongside existing behavior:

**Bridge events** (lines 132-137):
```ts
(ws: WebSocket) => {
  store.addBridgeClient(ws);
  store.sendBridgeEvent("CONNECT");
},
(ws: WebSocket) => {
  store.removeBridgeClient(ws);
  store.sendBridgeEvent("DISCONNECT");
}
```

**Trading events** (lines 148-149):
```ts
} else if (msg.type === "toggle_trade") {
  store.toggleTrading(!store.config.isActive);
  store.sendTradingEvent(store.config.isActive ? "START" : "STOP");
}
```

**Calibration events** — sent automatically in `updateMarket()` when observations increase.

### 5. Updated: `backend/src/types/index.ts`

Added machine types:
```ts
export type TradingState = "idle" | "active";
export type BridgeState = "disconnected" | "connected";
export type CalibrationState = "calibrating" | "optimized";
```

Updated `McpContext`:
```ts
getTradingState: () => TradingState;
getBridgeState: () => BridgeState;
getCalibrationState: () => CalibrationState;
```

### 6. Updated: `backend/src/mcp_server.ts`

MCP tools can now query machine states:
- `get_trading_state` → returns `"idle"` or `"active"`
- `get_bridge_state` → returns `"disconnected"` or `"connected"`
- `get_calibration_state` → returns `"calibrating"` or `"optimized"`

## What Did NOT Change

1. **No existing method signatures changed**
2. **No existing behavior blocked**
3. **Frontend sees the same `config.isActive` boolean** — no frontend changes needed
4. **EA communication unchanged** — tick ingestion, polling, bridge pings all work identically
5. **Chart and WebSocket messages unchanged** — same broadcast shapes
6. **MCP tools still work** — all existing tools function identically

## Current Machine States

### Trading Machine
- **Current state**: `"idle"` or `"active"` based on `tradeConfig.isActive`
- **Transition**: `START` when `isActive` becomes `true`, `STOP` when `false`
- **Guard**: `isCalibrated` checks `aiKnowledgeBase.totalObservations >= 20` (but NOT enforced yet)

### Bridge Machine
- **Current state**: `"disconnected"` or `"connected"`
- **Transition**: `CONNECT` when bridge client added, `DISCONNECT` when removed
- **Future use**: Could block EA commands when disconnected (not implemented)

### Calibration Machine
- **Current state**: `"calibrating"` or `"optimized"`
- **Transition**: `CALIBRATE` when `totalObservations >= 20`
- **Future use**: Could block trading when calibrating (not implemented)

## Critical Fragility Warnings

### DO NOT BREAK THESE CONTRACTS

1. **Status strings are contracts**: The frontend checks for `"optimized"` and `"calibrating"` in `App.tsx`. Do NOT rename these states.
2. **Trading states are contracts**: If you rename `"idle"` or `"active"`, update all consumers.
3. **Bridge states are contracts**: If you rename `"disconnected"` or `"connected"`, update all consumers.

### DO NOT ADD ENFORCEMENT YET

4. **Machines are currently observers only**: Do NOT guard `toggleTrading()` or `placeTrade()` with machine state checks until you've verified the machines track state correctly over a full trading session.
5. **Do NOT block EA commands**: The bridge machine is for observation only. Do NOT prevent `getPendingEaCommand()` from returning commands.

### DO NOT ADD NEW STATES

6. **Do NOT add `"active"` calibration state**: Current code only uses `"optimized"` and `"calibrating"`. Adding a new state would break the frontend.

## Future Enhancements (Not Implemented)

These are safe to add later once the machines are proven stable:

1. **Guard `toggleTrading()` with calibration machine**: Prevent starting trading when `calibrationState` is `"calibrating"`
2. **Guard `placeTrade()` with trading machine**: Prevent placing trades when `tradingState` is `"idle"`
3. **Guard EA commands with bridge machine**: Prevent sending commands when `bridgeState` is `"disconnected"`
4. **Add `"placing"` and `"stopping"` states**: More granular trading state tracking

## Implementation Safety

### What Was Verified

- `npm install xstate` succeeds
- `npx tsc --noEmit` passes with zero errors
- Server starts on `http://localhost:3000`
- `/api/health` returns `status: ok`
- EA can still send ticks via `POST /api/ea/tick`
- EA can still poll `GET /poll` for commands
- Dashboard WebSocket connects and receives init message
- Frontend chart displays candlesticks
- Settings changes persist
- Trade toggles work
- Symbol switching works
- MCP tools can still call `placeTrade()`
- MCP tools can query `get_trading_state`, `get_bridge_state`, `get_calibration_state`
- No existing behavior changed

### XState v5 API Compatibility

The implementation uses XState v5 (`^5.33.2`) API:
- `createActor()` instead of deprecated `interpret()`
- `actor.getSnapshot().value` instead of deprecated `actor.state.value`
- `actor.send({ type: event })` instead of `actor.send(event string)`
- No `cond` guards in transitions (passive observer pattern)
- No `AnyEventObject` type errors

### What Could Break This

1. **Changing machine state names** — frontend checks for exact strings
2. **Adding enforcement guards** — would block existing behavior
3. **Removing event sends** — machines would stop tracking state
4. **Changing machine initial states** — would change default behavior

## Verification

- [x] `npm install xstate` succeeds
- [x] `npx tsc --noEmit` passes with zero errors
- [x] Server starts on `http://localhost:3000`
- [x] `/api/health` returns `status: ok`
- [x] EA can still send ticks via `POST /api/ea/tick`
- [x] EA can still poll `GET /poll` for commands
- [x] Dashboard WebSocket connects and receives init message
- [x] Frontend chart displays candlesticks
- [x] Settings changes persist
- [x] Trade toggles work
- [x] Symbol switching works
- [x] MCP tools can still call `placeTrade()`
- [x] MCP tools can query `get_trading_state`, `get_bridge_state`, `get_calibration_state`
- [x] No existing behavior changed
