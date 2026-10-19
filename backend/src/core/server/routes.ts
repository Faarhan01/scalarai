import { Application } from "express";
import { AppStore } from "../../services/app-store";
import { GatewayManager } from "../../gateway/gateway-manager";
import { CotradeHandlers } from "./handlers";
import { registerBotRoutes } from "./bot_routes";
import { registerDbRoutes } from "./db_routes";
import { registerResearchRoutes } from "./research";

export function registerCoreRoutes(app: Application, store: AppStore, gateway: GatewayManager) {
  const handlers = new CotradeHandlers(store, gateway);

  // 1. Account, Terminal & Totals
  app.get("/api/account", handlers.getAccount);
  app.get("/api/terminal", handlers.getTerminal);
  app.get("/api/totals", handlers.getTotals);
  app.get("/api/portfolio", handlers.getPortfolio);
  app.get("/api/positions", handlers.getPositions);

  // 2. Symbols & Market Data
  app.get("/api/symbols", handlers.getSymbols);
  app.get("/api/symbol/:symbol", handlers.getSymbolDetails);
  app.get("/api/tick/:symbol", handlers.getTick);
  app.get("/api/candles/:symbol", handlers.getCandles);

  // 3. Order Operations & Pre-trade Validation
  app.post("/api/order/check", handlers.checkOrder);
  app.post("/api/order/buy", handlers.executeBuy);
  app.post("/api/order/sell", handlers.executeSell);
  app.post("/api/order/close", handlers.closePosition);
  app.post("/api/order/close_all", handlers.closeAllPositions);
  app.post("/api/order/modify", handlers.executeModify);
  app.post("/api/calculate/profit", handlers.calculateProfit);
  app.post("/api/calculate/margin", handlers.calculateMargin);

  // 4. Trade History Deals & Orders
  app.get("/api/history/deals", handlers.getHistoryDeals);
  app.get("/api/history/orders", handlers.getHistoryOrders);

  // 5. Bot Subsystem
  registerBotRoutes(app, store);

  // 6. Database Subsystem
  registerDbRoutes(app);

  // 7. Research & Quantitative Lab
  registerResearchRoutes(app, store);
}
