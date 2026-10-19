import { createMachine, createActor } from "xstate";

export interface TradingContext {
  isCalibrated: boolean;
}

export interface BridgeContext {
  clientCount: number;
}

export interface CalibrationContext {
  observations: number;
}

export const tradingMachine = createMachine({
  id: "trading",
  initial: "idle",
  context: {} as TradingContext,
  states: {
    idle: {
      on: {
        START: "active",
      },
    },
    active: {
      on: {
        STOP: "idle",
      },
    },
  },
});

export const bridgeMachine = createMachine({
  id: "bridge",
  initial: "disconnected",
  context: {} as BridgeContext,
  states: {
    disconnected: {
      on: { CONNECT: "connected" },
    },
    connected: {
      on: { DISCONNECT: "disconnected" },
    },
  },
});

export const calibrationMachine = createMachine({
  id: "calibration",
  initial: "calibrating",
  context: { observations: 0 } as CalibrationContext,
  states: {
    calibrating: {
      on: {
        CALIBRATE: "optimized",
      },
    },
    optimized: {
      type: "final",
    },
  },
});

export type TradingState = "idle" | "active";
export type BridgeState = "disconnected" | "connected";
export type CalibrationState = "calibrating" | "optimized";

export type TradingMachineService = ReturnType<typeof createActor<typeof tradingMachine>>;
export type BridgeMachineService = ReturnType<typeof createActor<typeof bridgeMachine>>;
export type CalibrationMachineService = ReturnType<typeof createActor<typeof calibrationMachine>>;
