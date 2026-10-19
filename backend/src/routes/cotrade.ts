import { Application } from "express";
import { AppStore } from "../services/app-store";
import { GatewayManager } from "../gateway/gateway-manager";
import { registerCoreRoutes } from "../core/server/routes";

export function registerCotradeRoutes(app: Application, store: AppStore, gateway: GatewayManager) {
  registerCoreRoutes(app, store, gateway);
}
