import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getDefaultTradeConfig, getDefaultAiKnowledgeBase, getDefaultAiSynthesizedStrategy } from "../services/defaults";
import { StrategyMode } from "../types";

const DB_PATH = path.join(process.cwd(), "backend", "src", "db", "scalarai.sqlite");

export function openDb(): InstanceType<typeof Database> {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function migrate(db: InstanceType<typeof Database>): void {
  const schemaSql = fs.readFileSync(path.join(process.cwd(), "backend", "src", "db", "schema.sql"), "utf-8");
  db.exec(schemaSql);
  // Migration for existing tables: safely add symbol columns if missing
  try { db.exec("ALTER TABLE trades ADD COLUMN symbol TEXT NOT NULL DEFAULT 'Step Index'"); } catch {}
  try { db.exec("ALTER TABLE market_ticks ADD COLUMN symbol TEXT NOT NULL DEFAULT 'Step Index'"); } catch {}
  // Enhanced backtest_results: cost & split-half fields
  try { db.exec("ALTER TABLE backtest_results ADD COLUMN spread_points REAL DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE backtest_results ADD COLUMN net_after_cost REAL DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE backtest_results ADD COLUMN split_half_agree INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE backtest_results ADD COLUMN null_beaten INTEGER DEFAULT 0"); } catch {}

  // ── market_candles: fidelity fixes ─────────────────────────────────────
  //
  // Two things the raw bridge rows carry that the table did not:
  //   spread    — the per-bar spread in points. Without it the knowledgebase
  //               cannot cost a pattern honestly; it has to take the spread
  //               from a hand-passed parameter instead of the real data.
  //   timeframe — the table had no timeframe, so M1, M15 and H1 bars for the
  //               same symbol landed in one pile and mixed.
  try { db.exec("ALTER TABLE market_candles ADD COLUMN spread REAL DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE market_candles ADD COLUMN timeframe TEXT NOT NULL DEFAULT 'M1'"); } catch {}

  // Duplicates: re-ingesting the same history appended a fresh copy every
  // time, because there was nothing to conflict against. The knowledgebase
  // then scanned the same bar repeatedly — every pattern occurrence was
  // counted multiple times and the forward-return sample held repeated
  // values. Keep the newest snapshot of each bar and make the key unique.
  try {
    db.exec(`DELETE FROM market_candles WHERE id NOT IN (
      SELECT MAX(id) FROM market_candles GROUP BY symbol, timeframe, time
    )`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_market_candles_unique
             ON market_candles(symbol, timeframe, time)`);
  } catch (e) {
    console.error("[db] market_candles dedupe/unique index failed:", e);
  }

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_ticket TEXT UNIQUE,
      order_ticket TEXT,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL,
      volume REAL NOT NULL,
      price REAL NOT NULL,
      profit REAL NOT NULL,
      close_time TEXT NOT NULL
    );`);
  } catch {}
  seedDefaults(db);
}

function seedDefaults(db: InstanceType<typeof Database>): void {
  const config = getDefaultTradeConfig();
  const knowledge = getDefaultAiKnowledgeBase();
  const strategy = getDefaultAiSynthesizedStrategy();

  db.prepare(
    `INSERT OR IGNORE INTO settings (id, is_active, selected_strategy, lot_size, take_profit_points, stop_loss_points, trailing_stop_points, use_trailing_stop, max_trades, trading_mode, is_ai_mode_enabled, mt5_path, app_endpoint, selected_assets) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

  db.prepare(
    `INSERT OR IGNORE INTO ai_knowledge (id, total_observations, global_average_speed, peak_velocity_registered, time_of_day_patterns, last_updated) VALUES (1, ?, ?, ?, ?, ?)`
  ).run(
    knowledge.totalObservations,
    knowledge.globalAverageSpeed,
    knowledge.peakVelocityRegistered,
    JSON.stringify(knowledge.timeOfDayPatterns),
    knowledge.lastUpdated
  );

  db.prepare(
    `INSERT OR IGNORE INTO ai_strategy (id, name, description, mode, rules, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?)`
  ).run(
    strategy.name,
    strategy.description,
    strategy.mode,
    JSON.stringify(strategy.rules),
    strategy.createdAt,
    strategy.updatedAt
  );
}

