# AppStore Standardization — Phase 3: XState State Machine

## Objective

Add XState to enforce valid trading state transitions and prevent invalid operations.

## Prerequisites

- Phase 1 and Phase 2 must be complete
- `npm install xstate` must be added to dependencies

## Current Problems Without State Machine

Looking at `app-store.ts`:

1. **`placeTrade()` at line 429** can be called even when `tradeConfig.isActive` is false
   - `toggleTrading()` at line 412 sets `isActive`, but nothing prevents `placeTrade()` from being called when `isActive === false`
   
2. **`toggleTrading()` at line 412** can be called without checking calibration
   - The calibration gate (`aiKnowledgeBase.totalObservations >= 20`) is only checked in `index.ts:87-93` for the AI study feed, not for trading
   
3. **`pendingEaCommand` at line 24** can be set without validation
   - `getPendingEaCommand()` at line 138 returns it, but nothing validates it before sending to EA
   
4. **EA commands can be sent while bridge is disconnected**
   - `index.ts:143` adds bridge clients, but there's no check before sending commands

## Proposed State Machines

### 1. Trading State Machine

**File:** `backend/src/services/trading-machine.ts`

```ts
import { createMachine, interpret } from "xstate";

export const tradingMachine = createMachine({
  id: "trading",
  initial: "idle",
  context: {
    calibrationObservations: 0,
  },
  states: {
    idle: {
      on: {
        START: {
          target: "active",
          cond: "isCalibrated",
        },
      },
    },
    active: {
      on: {
        STOP: "stopping",
        PLACE_TRADE: "placing",
      },
    },
    stopping: {
      on: {
        ALL_CLOSED: "idle",
      },
    },
    placing: {
      on: {
        TRADE_PLACED: "active",
        ERROR: "active",
      },
    },
  },
});
```

**Guards:**
- `isCalibrated`: checks `context.calibrationObservations >= 20`

**Transitions map to current methods:**
- `START` → `toggleTrading(true)` (only if calibrated)
- `STOP` → `toggleTrading(false)` → closes all positions → `ALL_CLOSED`
- `PLACE_TRADE` → `placeTrade()` → `TRADE_PLACED` or `ERROR`

### 2. Bridge Connection State Machine

```ts
export const bridgeMachine = createMachine({
  id: "bridge",
  initial: "disconnected",
  states: {
    disconnected: {
      on: { CONNECT: "connected" },
    },
    connected: {
      on: { DISCONNECT: "disconnected" },
    },
  },
});
```

**Usage:**
- `index.ts:143` → send `CONNECT` event
- `index.ts:147` → send `DISCONNECT` event
- Before sending EA commands, check `bridgeMachine.state.matches("connected")`

### 3. Calibration State Machine

```ts
export const calibrationMachine = createMachine({
  id: "calibration",
  initial: "calibrating",
  context: {
    observations: 0,
  },
  states: {
    calibrating: {
      on: {
        CALIBRATE: {
          target: "optimized",
          cond: "hasEnoughObservations",
        },
      },
    },
    optimized: {
      on: {
        ENABLE_AI: "active",
      },
    },
    active: {
      type: "final",
    },
  },
});
```

**Note:** The `active` state is NEW — current code only uses `"optimized"` and `"calibrating"` status strings. Adding `active` requires frontend changes to display the new state.

**Current calibration logic:**
- `app-store.ts:171`: `this.aiKnowledgeBase.totalObservations += 1`
- `app-store.ts:177`: `if (obs % 25 === 0) persistAiKnowledge(this.aiKnowledgeBase);`
- `app-store.ts:303`: `this.aiKnowledgeBase.totalObservations >= 20 ? "optimized" : "calibrating"`
- `index.ts:87-88`: same check for AI study feed status

**Integration:**
- In `updateMarket()` at line 171, also send `CALIBRATE` event to calibration machine
- In `index.ts:87-93`, use machine state instead of direct check
- Frontend `App.tsx` must be updated to handle new `active` state if added

## Implementation Steps

1. Install XState:
   ```bash
   npm install xstate
   ```

2. Create `backend/src/services/trading-machine.ts`:
   - Define `tradingMachine`, `bridgeMachine`, `calibrationMachine`
   - Export machine creators and types

3. Update `backend/src/services/app-store.ts`:
   - Add `private tradingState: Interpreter` field
   - Add `private bridgeState: Interpreter` field
   - Add `private calibrationState: Interpreter` field
   - Start machines in constructor
   - Guard `placeTrade()` (line 429) with `tradingMachine.state.matches("active")`
   - Guard `toggleTrading()` (line 412) with `tradingMachine.state.matches("idle") || tradingMachine.state.matches("active")`
   - Guard `sendEaCommand()` (via `getPendingEaCommand()`) with `bridgeMachine.state.matches("connected")`
   - Update `updateMarket()` line 171 to also transition calibration machine

4. Update `buildMcpContext()` at line 258 to expose machine states:
   ```ts
   getTradingState: () => this.tradingState.state.value,
   getBridgeState: () => this.bridgeState.state.value,
   getCalibrationState: () => this.calibrationState.state.value,
   ```

5. Update `backend/src/types/index.ts` `McpContext` interface:
   ```ts
   export interface McpContext {
     // ... existing methods
     getTradingState: () => string;
     getBridgeState: () => string;
     getCalibrationState: () => string;
   }
   ```

6. Update `backend/src/index.ts`:
   - Line 87: Replace `store.aiKnowledgeBase.totalObservations >= 20` with `store.calibrationState.state.matches("optimized") || store.calibrationState.state.matches("active")`
   - Line 143: Send `CONNECT` event to bridge machine
   - Line 147: Send `DISCONNECT` event to bridge machine
   - Line 161: Send `STOP` or `START` event to trading machine instead of calling `toggleTrading()` directly

7. Update frontend to display machine states (optional):
   - `App.tsx` can read machine states from `FullStatusPayload` or a new WebSocket message

## Critical Fragility Warnings

### STATE MACHINE CHANGES ARE BREAKING

1. **State names are contracts**: If you rename `idle` to `inactive`, you must update:
   - Machine definition
   - All transition targets
   - Frontend displays that check state names
   - MCP tools that read state

2. **Event names are contracts**: If you rename `START` to `BEGIN`, you must update:
   - All `send()` calls in `index.ts`
   - All transition definitions
   - Any frontend buttons that trigger events

3. **Machine context is a contract**: If you add/remove context fields, update:
   - Machine definition
   - All guard functions
   - All places that read `machine.state.context`

### DO NOT BYPASS THE STATE MACHINE

4. **Never call `placeTrade()` directly from a route**: Always send `PLACE_TRADE` event to the machine and let it transition.
   - Current: `index.ts:161` calls `store.toggleTrading(!store.tradeConfig.isActive)`
   - Should be: `store.tradingState.send({ type: "START" })` or `STOP`

5. **Never mutate `pendingEaCommand` without going through the machine**: The machine validates bridge connection before sending commands.
   - Current: `getPendingEaCommand()` at line 138 returns command directly
   - Should be: machine checks bridge state before returning command

## Verification

- `npm install xstate` succeeds
- `npx tsc --noEmit` passes
- Server starts
- Trading only starts when calibration is complete (`totalObservations >= 20`)
- Trades can only be placed when machine is in `active` state
- Bridge commands only sent when bridge is `connected`
- All existing features continue to work
- EA can still send ticks and receive responses
- Dashboard WebSocket connects and receives updates
- Frontend chart displays candlesticks
