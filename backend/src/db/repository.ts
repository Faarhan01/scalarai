import Database from "better-sqlite3";
import {
  TradeConfig,
  TradeRecord,
  SystemLog,
  Tick,
  EAConnectionDetails,
  AiKnowledgeBase,
  AiSynthesizedStrategy,
  SymbolMetadataRow,
  StrategyRow,
  TradeRow,
  SettingsRow,
  EaConnectionRow,
  AiKnowledgeRow,
  AiStrategyRow,
  StrategyMode,
  MarketCandleRow,
  ObservationRow,
  BacktestResultRow,
  StrategyTemplateRow,
  StrategyVersionRow,
  StrategySymbolPerformanceRow,
} from "../types";

export class ScalarAiDb {
  constructor(private db: InstanceType<typeof Database>) {}

  // Trades
  insertTrade(trade: TradeRecord): void {
    this.db.prepare(
      `INSERT INTO trades (id, ticket, symbol, type, entry_price, close_price, lot_size, profit, status, open_time, close_time, strategy, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      trade.id,
      trade.ticket,
      trade.symbol || "Step Index",
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
    const values: unknown[] = [];
    if (updates.closePrice !== undefined) { sets.push("close_price = ?"); values.push(updates.closePrice); }
    if (updates.profit !== undefined) { sets.push("profit = ?"); values.push(updates.profit); }
    if (updates.status !== undefined) { sets.push("status = ?"); values.push(updates.status); }
    if (updates.closeTime !== undefined) { sets.push("close_time = ?"); values.push(updates.closeTime); }
    if (updates.reason !== undefined) { sets.push("reason = ?"); values.push(updates.reason); }
    if (updates.symbol !== undefined) { sets.push("symbol = ?"); values.push(updates.symbol); }
    if (!sets.length) return;
    values.push(id);
    this.db.prepare(`UPDATE trades SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  }

  private mapTradeRow(row: TradeRow): TradeRecord {
    return {
      id: row.id,
      ticket: row.ticket,
      symbol: row.symbol || "Step Index",
      type: row.type,
      entryPrice: row.entry_price,
      closePrice: row.close_price ?? undefined,
      lotSize: row.lot_size,
      profit: row.profit,
      status: row.status,
      openTime: row.open_time,
      closeTime: row.close_time ?? undefined,
      strategy: row.strategy as StrategyMode,
      reason: row.reason,
    };
  }

  getTrades(status?: string, symbol?: string): TradeRecord[] {
    let query = `SELECT * FROM trades`;
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (status) {
      clauses.push(`status = ?`);
      params.push(status);
    }
    if (symbol) {
      clauses.push(`symbol = ?`);
      params.push(symbol);
    }
    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(" AND ")}`;
    }
    query += ` ORDER BY open_time DESC`;
    const rows = this.db.prepare(query).all(...params) as TradeRow[];
    return rows.map((r) => this.mapTradeRow(r));
  }

  getOpenTrades(): TradeRecord[] {
    const rows = this.db.prepare(`SELECT * FROM trades WHERE status = 'OPEN' ORDER BY open_time DESC`).all() as TradeRow[];
    return rows.map((r) => this.mapTradeRow(r));
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
  insertTick(tick: Tick & { velocity?: number; buyLocked?: boolean; sellLocked?: boolean; spread?: number; session?: string }, symbol?: string): void {
    const sym = symbol || tick.symbol || "Step Index";
    this.db.prepare(
      `INSERT INTO market_ticks (symbol, time, price, direction, open, high, low, close, velocity, buy_locked, sell_locked, spread, session) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sym,
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

  getTicks(limit = 150, symbol?: string): Tick[] {
    if (symbol) {
      return this.db.prepare(`SELECT * FROM market_ticks WHERE symbol = ? ORDER BY time DESC LIMIT ?`).all(symbol, limit) as Tick[];
    }
    return this.db.prepare(`SELECT * FROM market_ticks ORDER BY time DESC LIMIT ?`).all(limit) as Tick[];
  }

  getTicksSince(timestamp: number, symbol?: string): Tick[] {
    if (symbol) {
      return this.db.prepare(`SELECT * FROM market_ticks WHERE time >= ? AND symbol = ? ORDER BY time ASC`).all(timestamp, symbol) as Tick[];
    }
    return this.db.prepare(`SELECT * FROM market_ticks WHERE time >= ? ORDER BY time ASC`).all(timestamp) as Tick[];
  }

  // AI Knowledge
  getAiKnowledge(): AiKnowledgeBase | null {
    const row = this.db.prepare(`SELECT * FROM ai_knowledge WHERE id = 1`).get() as AiKnowledgeRow;
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
    const row = this.db.prepare(`SELECT * FROM ai_strategy WHERE id = 1`).get() as AiStrategyRow;
    if (!row) return null;
    return {
      id: "ai_adaptive",
      name: row.name || "AI Adaptive",
      description: row.description || "",
      mode: (row.mode || "AI_ADAPTIVE") as StrategyMode,
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
    const row = this.db.prepare(`SELECT * FROM settings WHERE id = 1`).get() as SettingsRow;
    if (!row) return null;
    return {
      isActive: !!row.is_active,
      selectedStrategy: row.selected_strategy as StrategyMode,
      lotSize: row.lot_size,
      takeProfitPoints: row.take_profit_points,
      stopLossPoints: row.stop_loss_points,
      trailingStopPoints: row.trailing_stop_points,
      useTrailingStop: !!row.use_trailing_stop,
      maxTrades: row.max_trades,
      tradingMode: row.trading_mode as "Scalping" | "Swing",
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
    const row = this.db.prepare(`SELECT * FROM ea_connections WHERE id = 1`).get() as EaConnectionRow;
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

    if (conn.symbol) {
      this.upsertSymbolConnection(conn);
    }
  }

  upsertSymbolConnection(conn: EAConnectionDetails): void {
    if (!conn.symbol) return;
    this.db.prepare(
      `INSERT INTO symbol_connections (symbol, is_ea_connected, client_ip, last_ping, broker, account_number, balance, symbol_digits, symbol_tick_size, symbol_description, spread, session, margin, leverage, swap_long, swap_short, profit_calc_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(symbol) DO UPDATE SET is_ea_connected = excluded.is_ea_connected, client_ip = excluded.client_ip, last_ping = excluded.last_ping, broker = excluded.broker, account_number = excluded.account_number, balance = excluded.balance, symbol_digits = excluded.symbol_digits, symbol_tick_size = excluded.symbol_tick_size, symbol_description = excluded.symbol_description, spread = excluded.spread, session = excluded.session, margin = excluded.margin, leverage = excluded.leverage, swap_long = excluded.swap_long, swap_short = excluded.swap_short, profit_calc_mode = excluded.profit_calc_mode`
    ).run(
      conn.symbol,
      conn.isEaConnected ? 1 : 0,
      conn.clientIp,
      conn.lastPing,
      conn.broker,
      conn.accountNumber,
      conn.balance,
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

  getAllSymbolConnections(): EAConnectionDetails[] {
    const rows = this.db.prepare(`SELECT * FROM symbol_connections`).all() as EaConnectionRow[];
    return rows.map((row) => ({
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
    }));
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

  getSymbolMetadata(symbol: string): SymbolMetadataRow | undefined {
    return this.db.prepare(`SELECT * FROM symbol_metadata WHERE symbol = ?`).get(symbol) as SymbolMetadataRow | undefined;
  }

  // Strategies
  insertStrategy(strategy: StrategyRow): void {
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

  getAllStrategies(): StrategyRow[] {
    return this.db.prepare(`SELECT * FROM strategies ORDER BY updated_at DESC`).all() as StrategyRow[];
  }

  getStrategyById(id: string): StrategyRow | undefined {
    return this.db.prepare(`SELECT * FROM strategies WHERE id = ?`).get(id) as StrategyRow | undefined;
  }

  updateStrategy(id: string, updates: Partial<StrategyRow>): void {
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

  getMaxTicket(): number {
    const row = (this.db.prepare(`SELECT MAX(ticket) as maxTicket FROM trades`).get() as { maxTicket: number | null }) || { maxTicket: null };
    return row.maxTicket ?? 837201;
  }

  rawQuery(sql: string, params: unknown[] = []): unknown[] {
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
    const tickCount = (this.db.prepare(`SELECT COUNT(*) as count FROM market_ticks`).get() as { count: number }).count;
    const logCount = (this.db.prepare(`SELECT COUNT(*) as count FROM system_logs`).get() as { count: number }).count;
    const tradeCount = (this.db.prepare(`SELECT COUNT(*) as count FROM trades`).get() as { count: number }).count;
    
    const dbPath = process.cwd() + "/backend/data/scalarai.sqlite";
    const fs = require("fs");
    const dbSizeBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    
    return { tickCount, logCount, tradeCount, dbSizeBytes };
  }

  // Market candles
  insertCandle(candle: MarketCandleRow): void {
    this.db.prepare(
      `INSERT INTO market_candles (symbol, time, open, high, low, close, volume, direction, minute_bucket) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      candle.symbol,
      candle.time,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume ?? null,
      candle.direction,
      candle.minute_bucket
    );
  }

  insertCandlesBatch(candles: MarketCandleRow[]): void {
    if (!candles || candles.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT INTO market_candles (symbol, time, open, high, low, close, volume, direction, minute_bucket) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertMany = this.db.transaction((items: MarketCandleRow[]) => {
      for (const item of items) {
        stmt.run(
          item.symbol,
          item.time,
          item.open,
          item.high,
          item.low,
          item.close,
          item.volume ?? null,
          item.direction,
          item.minute_bucket
        );
      }
    });
    insertMany(candles);
  }

  getKnownSymbols(): string[] {
    try {
      const rows = this.db.prepare(
        `SELECT DISTINCT symbol FROM symbol_connections WHERE symbol IS NOT NULL AND symbol != ''
         UNION SELECT DISTINCT symbol FROM market_candles WHERE symbol IS NOT NULL AND symbol != ''
         UNION SELECT DISTINCT symbol FROM market_ticks WHERE symbol IS NOT NULL AND symbol != ''
         UNION SELECT DISTINCT symbol FROM trades WHERE symbol IS NOT NULL AND symbol != ''`
      ).all() as Array<{ symbol: string }>;
      return rows.map((r) => r.symbol).filter(Boolean);
    } catch {
      return [];
    }
  }

  getCandles(symbol: string, from?: number, to?: number, limit = 1000): MarketCandleRow[] {
    let query = `SELECT * FROM market_candles WHERE symbol = ?`;
    const params: unknown[] = [symbol];
    if (from !== undefined) {
      query += ` AND time >= ?`;
      params.push(from);
    }
    if (to !== undefined) {
      query += ` AND time <= ?`;
      params.push(to);
    }
    query += ` ORDER BY time ASC LIMIT ?`;
    params.push(Math.min(limit, 10000));
    return this.db.prepare(query).all(...params) as MarketCandleRow[];
  }

  getLatestCandle(symbol: string): MarketCandleRow | undefined {
    return this.db.prepare(`SELECT * FROM market_candles WHERE symbol = ? ORDER BY time DESC LIMIT 1`).get(symbol) as MarketCandleRow | undefined;
  }

  // Observations
  insertObservation(observation: ObservationRow): void {
    this.db.prepare(
      `INSERT INTO observations (id, symbol, timestamp, direction, velocity, price, candle_id, tags, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      observation.id,
      observation.symbol,
      observation.timestamp,
      observation.direction,
      observation.velocity,
      observation.price,
      observation.candle_id ?? null,
      observation.tags,
      observation.metadata
    );
  }

  getObservations(symbol?: string, from?: number, to?: number, limit = 500): ObservationRow[] {
    let query = `SELECT * FROM observations`;
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (symbol) {
      clauses.push(`symbol = ?`);
      params.push(symbol);
    }
    if (from !== undefined) {
      clauses.push(`timestamp >= ?`);
      params.push(from);
    }
    if (to !== undefined) {
      clauses.push(`timestamp <= ?`);
      params.push(to);
    }
    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(" AND ")}`;
    }
    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(Math.min(limit, 5000));
    return this.db.prepare(query).all(...params) as ObservationRow[];
  }

  // Strategy templates
  insertStrategyTemplate(template: StrategyTemplateRow): void {
    this.db.prepare(
      `INSERT INTO strategy_templates (id, name, description, mode, category, rules, default_config, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      template.id,
      template.name,
      template.description,
      template.mode,
      template.category,
      template.rules,
      template.default_config,
      template.tags,
      template.created_at,
      template.updated_at
    );
  }

  getAllStrategyTemplates(): StrategyTemplateRow[] {
    return this.db.prepare(`SELECT * FROM strategy_templates ORDER BY created_at DESC`).all() as StrategyTemplateRow[];
  }

  getStrategyTemplateById(id: string): StrategyTemplateRow | undefined {
    return this.db.prepare(`SELECT * FROM strategy_templates WHERE id = ?`).get(id) as StrategyTemplateRow | undefined;
  }

  upsertStrategyTemplate(template: StrategyTemplateRow): void {
    this.db.prepare(
      `INSERT INTO strategy_templates (id, name, description, mode, category, rules, default_config, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, mode = excluded.mode, category = excluded.category, rules = excluded.rules, default_config = excluded.default_config, tags = excluded.tags, updated_at = excluded.updated_at`
    ).run(
      template.id,
      template.name,
      template.description,
      template.mode,
      template.category,
      template.rules,
      template.default_config,
      template.tags,
      template.created_at,
      template.updated_at
    );
  }

  // Strategy versions
  insertStrategyVersion(version: StrategyVersionRow): void {
    this.db.prepare(
      `INSERT INTO strategy_versions (id, strategy_id, symbol, name, description, mode, rules, config, parent_version_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      version.id,
      version.strategy_id,
      version.symbol,
      version.name,
      version.description,
      version.mode,
      version.rules,
      version.config,
      version.parent_version_id ?? null,
      version.created_by,
      version.created_at
    );
  }

  getStrategyVersions(strategyId: string): StrategyVersionRow[] {
    return this.db.prepare(`SELECT * FROM strategy_versions WHERE strategy_id = ? ORDER BY created_at DESC`).all(strategyId) as StrategyVersionRow[];
  }

  // Backtest results
  insertBacktestResult(result: BacktestResultRow): void {
    this.db.prepare(
      `INSERT INTO backtest_results (id, strategy_id, strategy_version_id, symbol, from_time, to_time, initial_balance, final_balance, total_trades, wins, losses, win_rate, profit_factor, max_drawdown, sharpe_ratio, avg_win, avg_loss, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      result.id,
      result.strategy_id,
      result.strategy_version_id ?? null,
      result.symbol,
      result.from_time,
      result.to_time,
      result.initial_balance,
      result.final_balance,
      result.total_trades,
      result.wins,
      result.losses,
      result.win_rate,
      result.profit_factor,
      result.max_drawdown,
      result.sharpe_ratio,
      result.avg_win,
      result.avg_loss,
      result.metadata,
      result.created_at
    );
  }

  getBacktestResults(strategyId?: string, symbol?: string): BacktestResultRow[] {
    let query = `SELECT * FROM backtest_results`;
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (strategyId) {
      clauses.push(`strategy_id = ?`);
      params.push(strategyId);
    }
    if (symbol) {
      clauses.push(`symbol = ?`);
      params.push(symbol);
    }
    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(" AND ")}`;
    }
    query += ` ORDER BY created_at DESC LIMIT 100`;
    return this.db.prepare(query).all(...params) as BacktestResultRow[];
  }

  // Strategy symbol performance
  upsertStrategySymbolPerformance(perf: StrategySymbolPerformanceRow): void {
    this.db.prepare(
      `INSERT INTO strategy_symbol_performance (id, strategy_id, symbol, total_trades, wins, losses, win_rate, total_profit, avg_profit_per_trade, max_drawdown, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(strategy_id, symbol) DO UPDATE SET total_trades = excluded.total_trades, wins = excluded.wins, losses = excluded.losses, win_rate = excluded.win_rate, total_profit = excluded.total_profit, avg_profit_per_trade = excluded.avg_profit_per_trade, max_drawdown = excluded.max_drawdown, last_updated = excluded.last_updated`
    ).run(
      perf.id,
      perf.strategy_id,
      perf.symbol,
      perf.total_trades,
      perf.wins,
      perf.losses,
      perf.win_rate,
      perf.total_profit,
      perf.avg_profit_per_trade,
      perf.max_drawdown,
      perf.last_updated
    );
  }

  getStrategySymbolPerformance(strategyId: string): StrategySymbolPerformanceRow[] {
    return this.db.prepare(`SELECT * FROM strategy_symbol_performance WHERE strategy_id = ?`).all(strategyId) as StrategySymbolPerformanceRow[];
  }

  // Migrations
  migrate(): void {
    // Schema managed externally via schema.sql
  }
}
