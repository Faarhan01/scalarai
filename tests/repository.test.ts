import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { ScalarAiDb } from "../backend/src/db/repository";

function createMemoryDb() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = `
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      ticket INTEGER,
      symbol TEXT NOT NULL DEFAULT 'Step Index',
      type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
      entry_price REAL NOT NULL,
      close_price REAL,
      lot_size REAL NOT NULL,
      profit REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
      open_time TEXT NOT NULL,
      close_time TEXT,
      strategy TEXT NOT NULL,
      reason TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS system_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL CHECK (level IN ('INFO', 'SUCCESS', 'WARNING', 'ERROR')),
      source TEXT NOT NULL CHECK (source IN ('SERVER', 'EA', 'AI')),
      message TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS market_ticks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL DEFAULT 'Step Index',
      time INTEGER NOT NULL,
      price REAL NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('up', 'down', 'flat')),
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      velocity REAL,
      buy_locked INTEGER NOT NULL DEFAULT 0,
      sell_locked INTEGER NOT NULL DEFAULT 0,
      spread REAL,
      session TEXT
    );
    CREATE TABLE IF NOT EXISTS ai_knowledge (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_observations INTEGER NOT NULL DEFAULT 0,
      global_average_speed REAL NOT NULL DEFAULT 0,
      peak_velocity_registered REAL NOT NULL DEFAULT 0,
      time_of_day_patterns TEXT NOT NULL DEFAULT '{}',
      last_updated TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_strategy (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL DEFAULT 'AI Adaptive',
      description TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'AI_ADAPTIVE',
      rules TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      is_active INTEGER NOT NULL DEFAULT 0,
      selected_strategy TEXT NOT NULL DEFAULT 'TREND_FOLLOWING',
      lot_size REAL NOT NULL DEFAULT 0.1,
      take_profit_points INTEGER NOT NULL DEFAULT 300,
      stop_loss_points INTEGER NOT NULL DEFAULT 150,
      trailing_stop_points INTEGER NOT NULL DEFAULT 100,
      use_trailing_stop INTEGER NOT NULL DEFAULT 1,
      max_trades INTEGER NOT NULL DEFAULT 3,
      trading_mode TEXT NOT NULL DEFAULT 'Scalping',
      is_ai_mode_enabled INTEGER NOT NULL DEFAULT 0,
      mt5_path TEXT,
      app_endpoint TEXT,
      selected_assets TEXT NOT NULL DEFAULT '["Step Index"]'
    );
    CREATE TABLE IF NOT EXISTS ea_connections (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      is_ea_connected INTEGER NOT NULL DEFAULT 0,
      client_ip TEXT,
      last_ping TEXT,
      broker TEXT,
      account_number TEXT,
      balance REAL,
      symbol TEXT,
      symbol_digits INTEGER,
      symbol_tick_size REAL,
      symbol_description TEXT,
      spread REAL,
      session TEXT,
      margin REAL,
      leverage INTEGER,
      swap_long REAL,
      swap_short REAL,
      profit_calc_mode INTEGER
    );
    CREATE TABLE IF NOT EXISTS symbol_metadata (
      symbol TEXT PRIMARY KEY,
      description TEXT,
      digits INTEGER,
      tick_size REAL,
      broker TEXT,
      account_number TEXT,
      last_connected TEXT
    );
    CREATE TABLE IF NOT EXISTS strategies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'CUSTOM',
      rules TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
  db.exec(schema);
  return db;
}

describe("ScalarAiDb", () => {
  let db: ScalarAiDb;
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = createMemoryDb();
    db = new ScalarAiDb(sqlite);
  });

  it("inserts and gets trades", () => {
    db.insertTrade({
      id: "t1",
      ticket: 1,
      type: "BUY",
      entryPrice: 100,
      lotSize: 0.1,
      profit: 0,
      status: "OPEN",
      openTime: "2024-01-01T00:00:00Z",
      strategy: "TREND_FOLLOWING",
      reason: "test",
    });
    const trades = db.getTrades();
    expect(trades).toHaveLength(1);
    expect(trades[0].id).toBe("t1");
  });

  it("closes trade and updates fields", () => {
    db.insertTrade({
      id: "t1",
      ticket: 1,
      type: "SELL",
      entryPrice: 100,
      lotSize: 0.1,
      profit: 0,
      status: "OPEN",
      openTime: "2024-01-01T00:00:00Z",
      strategy: "TREND_FOLLOWING",
      reason: "test",
    });
    db.closeTrade("t1", 99, 10);
    const trades = db.getTrades();
    expect(trades[0].status).toBe("CLOSED");
    expect(trades[0].closePrice).toBeCloseTo(99);
    expect(trades[0].profit).toBeCloseTo(10);
  });

  it("resets trades", () => {
    db.insertTrade({
      id: "t1",
      ticket: 1,
      type: "BUY",
      entryPrice: 100,
      lotSize: 0.1,
      profit: 0,
      status: "OPEN",
      openTime: "2024-01-01T00:00:00Z",
      strategy: "TREND_FOLLOWING",
      reason: "test",
    });
    db.resetTrades();
    expect(db.getTrades()).toHaveLength(0);
  });

  it("inserts and gets logs", () => {
    db.insertLog({
      id: "l1",
      timestamp: "2024-01-01T00:00:00Z",
      level: "INFO",
      source: "SERVER",
      message: "hello",
    });
    const logs = db.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe("hello");
  });

  it("inserts and gets ticks", () => {
    db.insertTick({
      time: Date.now(),
      price: 100,
      direction: "up",
      velocity: 0.5,
      buyLocked: false,
      sellLocked: false,
    });
    const ticks = db.getTicks();
    expect(ticks).toHaveLength(1);
  });

  it("persists AI knowledge and strategy", () => {
    db.upsertAiKnowledge({
      totalObservations: 10,
      globalAverageSpeed: 0.1,
      peakVelocityRegistered: 0.5,
      timeOfDayPatterns: {},
      lastUpdated: new Date().toISOString(),
    });
    db.upsertAiStrategy({
      id: "ai_adaptive",
      name: "AI Adaptive",
      description: "",
      mode: "AI_ADAPTIVE",
      rules: {},
      createdAt: "",
      updatedAt: "",
    });
    expect(db.getAiKnowledge()?.totalObservations).toBe(10);
    expect(db.getAiStrategy()?.name).toBe("AI Adaptive");
  });

  it("rawQuery allows SELECT and rejects non-SELECT", () => {
    const select = db.rawQuery("SELECT * FROM trades");
    expect(select).toEqual([]);
    const bad = db.rawQuery("DROP TABLE trades");
    expect(bad).toEqual([]);
  });

  it("cleanupOldData returns counts", () => {
    const result = db.cleanupOldData();
    expect(result).toHaveProperty("deletedTicks");
    expect(result).toHaveProperty("deletedLogs");
  });
});
