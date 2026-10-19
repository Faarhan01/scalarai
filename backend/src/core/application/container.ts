import { AppConfig, config } from "../config";
import { AppStore } from "../../services/app-store";
import { GatewayManager } from "../../gateway/gateway-manager";
import { scalarAiDb } from "../../db";

export class AppContainer {
  public config: AppConfig;
  public store: AppStore;
  public gateway: GatewayManager;
  public db: typeof scalarAiDb;

  constructor(customConfig?: AppConfig, customStore?: AppStore, customGateway?: GatewayManager) {
    this.config = customConfig || config;
    this.store = customStore || new AppStore();
    this.gateway = customGateway || new GatewayManager(this.store);
    this.db = scalarAiDb;
  }
}

let containerInstance: AppContainer | null = null;

export function buildContainer(customConfig?: AppConfig, customStore?: AppStore, customGateway?: GatewayManager): AppContainer {
  if (!containerInstance || customConfig || customStore || customGateway) {
    containerInstance = new AppContainer(customConfig, customStore, customGateway);
  }
  return containerInstance;
}
