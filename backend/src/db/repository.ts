import Database from "better-sqlite3";
import {
  TradeConfig,
  TradeRecord,
  SystemLog,
  Tick,
  EAConnectionDetails,
  AiKnowledgeBase,
  AiSynthesizedStrategy,
} from "../types";

export class ScalarAiDb {
  constructor(private db: any) {}

  // Trades
  insertTrade(trade: TradeRecord): void {
    this.db.prepare(
      `INSERT INTO trades (id, ticket, type, entry_price, close_price, lot_size, profit, status, open_time, close_time, strategy, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      trade.id,
      trade.ticket,
      trade.type,
      trade.entryPrice,
      trade.closePrice ?? null,
      trade.lotSize,
      trade.profit,
      trade.status,
      trade.openTime,
      trade.closeTime ?? null,
      trade.strategy,
      trade.reason
    );
  }

  updateTrade(id: string, updates: Partial<TradeRecord>): void {
    const sets: string[] = [];
    const values: any[] = [];
    if (updates.closePrice !== undefined) { sets.push("close_price = ?"); values.push(updates.closePrice); }
    if (updates.profit !== undefined) { sets.push("profit = ?"); values.push(updates.profit); }
    if (updates.status !== undefined) { sets.push("status = ?"); values.push(updates.status); }
    if (updates.closeTime !== undefined) { sets.push("close_time = ?"); values.push(updates.closeTime); }
    if (updates.reason !== undefined) { sets.push("reason = ?"); values.push(updates.reason); }
    if (!sets.length) return;
    values.push(id);
    this.db.prepare(`UPDATE trades SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  }

  getTrades(status?: string): TradeRecord[] {
    if (status) {
      return this.db.prepare(`SELECT * FROM trades WHERE status = ? ORDER BY open_time DESC`).all(status) as TradeRecord[];
    }
    return this.db.prepare(`SELECT * FROM trades ORDER BY open_time DESC`).all() as TradeRecord[];
  }

  getOpenTrades(): TradeRecord[] {
    return this.db.prepare(`SELECT * FROM trades WHERE status = 'OPEN' ORDER BY open_time DESC`).all() as TradeRecord[];
  }

  closeTrade(id: string, closePrice: number, profit: number): void {
    this.db.prepare(`UPDATE trades SET close_price = ?, profit = ?, status = 'CLOSED', close_time = ? WHERE id = ?`).run(
      closePrice, profit, new Date().toISOString(), id
    );
  }

  resetTrades(): void {
    this.db.prepare(`DELETE FROM trades`).run();
  }

  // Logs
  insertLog(log: SystemLog): void {
    this.db.prepare(
      `INSERT INTO system_logs (id, timestamp, level, source, message) VALUES (?, ?, ?, ?, ?)`
    ).run(log.id, log.timestamp, log.level, log.source, log.message);
  }

  getLogs(limit = 80, source?: string, level?: string): SystemLog[] {
    if (source && level) {
      return this.db.prepare(`SELECT * FROM system_logs WHERE source = ? AND level = ? ORDER BY timestamp DESC LIMIT ?`).all(source, level, limit) as SystemLog[];
    }
    if (source) {
      return this.db.prepare(`SELECT * FROM system_logs WHERE source = ? ORDER BY timestamp DESC LIMIT ?`).all(source, limit) as SystemLog[];
    }
    if (level) {
      return this.db.prepare(`SELECT * FROM system_logs WHERE level = ? ORDER BY timestamp DESC LIMIT ?`).all(level, limit) as SystemLog[];
    }
    return this.db.prepare(`SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT ?`).all(limit) as SystemLog[];
  }

  // Market ticks
  insertTick(tick: Tick & { velocity?: number; buyLocked?: boolean; sellLocked?: boolean; spread?: number; session?: string }): void {
    this.db.prepare(
      `INSERT INTO market_ticks (time, price, direction, open, high, low, close, velocity, buy_locked, sell_locked, spread, session) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      tick.time,
      tick.price,
      tick.direction,
      tick.open ?? null,
      tick.high ?? null,
      tick.low ?? null,
      tick.close ?? null,
      tick.velocity ?? null,
      tick.buyLocked ? 1 : 0,
      tick.sellLocked ? 1 : 0,
      tick.spread ?? null,
      tick.session ?? null
    );
  }

  getTicks(limit = 150): Tick[] {
    return this.db.prepare(`SELECT * FROM market_ticks ORDER BY time DESC LIMIT ?`).all(limit) as Tick[];
  }

  getTicksSince(timestamp: number): Tick[] {
    return this.db.prepare(`SELECT * FROM market_ticks WHERE time >= ? ORDER BY time ASC`).all(timestamp) as Tick[];
  }

  // AI Knowledge
  getAiKnowledge(): AiKnowledgeBase | null {
    const row = this.db.prepare(`SELECT * FROM ai_knowledge WHERE id = 1`).get() as any;
    if (!row) return null;
    return {
      totalObservations: row.total_observations,
      globalAverageSpeed: row.global_average_speed,
      peakVelocityRegistered: row.peak_velocity_registered,
      timeOfDayPatterns: JSON.parse(row.time_of_day_patterns || "{}"),
      lastUpdated: row.last_updated,
    };
  }

  upsertAiKnowledge(knowledge: AiKnowledgeBase): void {
    this.db.prepare(
      `INSERT INTO ai_knowledge (id, total_observations, global_average_speed, peak_velocity_registered, time_of_day_patterns, last_updated) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET total_observations = excluded.total_observations, global_average_speed = excluded.global_average_speed, peak_velocity_registered = excluded.peak_velocity_registered, time_of_day_patterns = excluded.time_of_day_patterns, last_updated = excluded.last_updated`
    ).run(
      knowledge.totalObservations,
      knowledge.globalAverageSpeed,
      knowledge.peakVelocityRegistered,
      JSON.stringify(knowledge.timeOfDayPatterns),
      knowledge.lastUpdated
    );
  }

  // AI Strategy
  getAiStrategy(): AiSynthesizedStrategy | null {
    const row = this.db.prepare(`SELECT * FROM ai_strategy WHERE id = 1`).get() as any;
    if (!row) return null;
    return {
      id: "ai_adaptive",
      name: row.name || "AI Adaptive",
      description: row.description || "",
      mode: row.mode || "AI_ADAPTIVE",
      rules: JSON.parse(row.rules || "{}"),
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),
    };
  }

  upsertAiStrategy(strategy: AiSynthesizedStrategy): void {
    this.db.prepare(
      `INSERT INTO ai_strategy (id, name, description, mode, rules, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, mode = excluded.mode, rules = excluded.rules, updated_at = excluded.updated_at`
    ).run(
      strategy.name,
      strategy.description,
      strategy.mode,
      JSON.stringify(strategy.rules),
      strategy.createdAt,
      strategy.updatedAt
    );
  }

  // Settings
  getSettings(): TradeConfig | null {
    const row = this.db.prepare(`SELECT * FROM settings WHERE id = 1`).get() as any;
    if (!row) return null;
    return {
      isActive: !!row.is_active,
      selectedStrategy: row.selected_strategy,
      lotSize: row.lot_size,
      takeProfitPoints: row.take_profit_points,
      stopLossPoints: row.stop_loss_points,
      trailingStopPoints: row.trailing_stop_points,
      useTrailingStop: !!row.use_trailing_stop,
      maxTrades: row.max_trades,
      tradingMode: row.trading_mode,
      isAiModeEnabled: !!row.is_ai_mode_enabled,
      mt5Path: row.mt5_path || undefined,
      appEndpoint: row.app_endpoint || undefined,
      selectedAssets: JSON.parse(row.selected_assets || '["Step Index"]'),
    };
  }

  upsertSettings(config: TradeConfig): void {
    this.db.prepare(
      `INSERT INTO settings (id, is_active, selected_strategy, lot_size, take_profit_points, stop_loss_points, trailing_stop_points, use_trailing_stop, max_trades, trading_mode, is_ai_mode_enabled, mt5_path, app_endpoint, selected_assets) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET is_active = excluded.is_active, selected_strategy = excluded.selected_strategy, lot_size = excluded.lot_size, take_profit_points = excluded.take_profit_points, stop_loss_points = excluded.stop_loss_points, trailing_stop_points = excluded.trailing_stop_points, use_trailing_stop = excluded.use_trailing_stop, max_trades = excluded.max_trades, trading_mode = excluded.trading_mode, is_ai_mode_enabled = excluded.is_ai_mode_enabled, mt5_path = excluded.mt5_path, app_endpoint = excluded.app_endpoint, selected_assets = excluded.selected_assets`
    ).run(
      config.isActive ? 1 : 0,
      config.selectedStrategy,
      config.lotSize,
      config.takeProfitPoints,
      config.stopLossPoints,
      config.trailingStopPoints,
      config.useTrailingStop ? 1 : 0,
      config.maxTrades,
      config.tradingMode || "Scalping",
      config.isAiModeEnabled ? 1 : 0,
      config.mt5Path || null,
      config.appEndpoint || null,
      JSON.stringify(config.selectedAssets || ["Step Index"])
    );
  }

  // EA Connection
  getEaConnection(): EAConnectionDetails | null {
    const row = this.db.prepare(`SELECT * FROM ea_connections WHERE id = 1`).get() as any;
    if (!row) return null;
    return {
      isEaConnected: !!row.is_ea_connected,
      clientIp: row.client_ip ?? null,
      lastPing: row.last_ping ?? null,
      broker: row.broker ?? null,
      accountNumber: row.account_number ?? null,
      balance: row.balance ?? null,
      symbol: row.symbol ?? null,
      symbolDigits: row.symbol_digits ?? null,
      symbolTickSize: row.symbol_tick_size ?? null,
      symbolDescription: row.symbol_description ?? null,
      spread: row.spread ?? null,
      session: row.session ?? null,
      margin: row.margin ?? null,
      leverage: row.leverage ?? null,
      swapLong: row.swap_long ?? null,
      swapShort: row.swap_short ?? null,
      profitCalcMode: row.profit_calc_mode ?? null,
    };
  }

  upsertEaConnection(conn: EAConnectionDetails): void {
    this.db.prepare(
      `INSERT INTO ea_connections (id, is_ea_connected, client_ip, last_ping, broker, account_number, balance, symbol, symbol_digits, symbol_tick_size, symbol_description, spread, session, margin, leverage, swap_long, swap_short, profit_calc_mode) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET is_ea_connected = excluded.is_ea_connected, client_ip = excluded.client_ip, last_ping = excluded.last_ping, broker = excluded.broker, account_number = excluded.account_number, balance = excluded.balance, symbol = excluded.symbol, symbol_digits = excluded.symbol_digits, symbol_tick_size = excluded.symbol_tick_size, symbol_description = excluded.symbol_description, spread = excluded.spread, session = excluded.session, margin = excluded.margin, leverage = excluded.leverage, swap_long = excluded.swap_long, swap_short = excluded.swap_short, profit_calc_mode = excluded.profit_calc_mode`
    ).run(
      conn.isEaConnected ? 1 : 0,
      conn.clientIp,
      conn.lastPing,
      conn.broker,
      conn.accountNumber,
      conn.balance,
      conn.symbol,
      conn.symbolDigits,
      conn.symbolTickSize,
      conn.symbolDescription,
      conn.spread,
      conn.session,
      conn.margin,
      conn.leverage,
      conn.swapLong,
      conn.swapShort,
      conn.profitCalcMode
    );
  }

  // Symbol metadata
  upsertSymbolMetadata(symbol: string, data: { description?: string | null; digits?: number | null; tickSize?: number | null; broker?: string | null; accountNumber?: string | null; lastConnected?: string | null }): void {
    this.db.prepare(
      `INSERT INTO symbol_metadata (symbol, description, digits, tick_size, broker, account_number, last_connected) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(symbol) DO UPDATE SET description = excluded.description, digits = excluded.digits, tick_size = excluded.tick_size, broker = excluded.broker, account_number = excluded.account_number, last_connected = excluded.last_connected`
    ).run(
      symbol,
      data.description ?? null,
      data.digits ?? null,
      data.tickSize ?? null,
      data.broker ?? null,
      data.accountNumber ?? null,
      data.lastConnected ?? null
    );
  }

  getSymbolMetadata(symbol: string): any {
    return this.db.prepare(`SELECT * FROM symbol_metadata WHERE symbol = ?`).get(symbol);
  }

  // Strategies
  insertStrategy(strategy: any): void {
    this.db.prepare(
      `INSERT INTO strategies (id, name, description, mode, rules, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      strategy.id,
      strategy.name,
      strategy.description || "",
      strategy.mode || "CUSTOM",
      JSON.stringify(strategy.rules || []),
      strategy.createdAt || new Date().toISOString(),
      strategy.updatedAt || new Date().toISOString()
    );
  }

  getAllStrategies(): any[] {
    return this.db.prepare(`SELECT * FROM strategies ORDER BY updated_at DESC`).all();
  }

  getStrategyById(id: string): any {
    return this.db.prepare(`SELECT * FROM strategies WHERE id = ?`).get(id);
  }

  updateStrategy(id: string, updates: any): void {
    const existing = this.getStrategyById(id);
    if (!existing) return;
    const merged = {
      ...existing,
      ...updates,
      rules: updates.rules !== undefined ? updates.rules : existing.rules,
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(
      `UPDATE strategies SET name = ?, description = ?, mode = ?, rules = ?, updated_at = ? WHERE id = ?`
    ).run(merged.name, merged.description, merged.mode, JSON.stringify(merged.rules), merged.updatedAt, id);
  }

  deleteStrategy(id: string): void {
    this.db.prepare(`DELETE FROM strategies WHERE id = ?`).run(id);
  }

  rawQuery(sql: string, params: any[] = []): any[] {
    const normalized = sql.trim().replace(/\s+/g, " ").toUpperCase();
    if (!normalized.startsWith("SELECT")) return [];
    if (normalized.includes(";")) return [];
    if (normalized.includes("--")) return [];
    if (normalized.includes("/*")) return [];
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  // Maintenance
  cleanupOldData(): { deletedTicks: number; deletedLogs: number } {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    
    const tickResult = this.db.prepare(`DELETE FROM market_ticks WHERE time < ?`).run(sevenDaysAgo);
    const logResult = this.db.prepare(`DELETE FROM system_logs WHERE timestamp < ?`).run(new Date(thirtyDaysAgo).toISOString());
    
    return {
      deletedTicks: tickResult.changes,
      deletedLogs: logResult.changes,
    };
  }

  getDbStats(): { tickCount: number; logCount: number; tradeCount: number; dbSizeBytes: number } {
    const tickCount = (this.db.prepare(`SELECT COUNT(*) as count FROM market_ticks`).get() as any).count;
    const logCount = (this.db.prepare(`SELECT COUNT(*) as count FROM system_logs`).get() as any).count;
    const tradeCount = (this.db.prepare(`SELECT COUNT(*) as count FROM trades`).get() as any).count;
    
    const dbPath = process.cwd() + "/backend/data/scalarai.sqlite";
    const fs = require("fs");
    const dbSizeBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    
    return { tickCount, logCount, tradeCount, dbSizeBytes };
  }

  // Migrations
  migrate(): void {
    // Schema managed externally via schema.sql
  }
}
