import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getDefaultTradeConfig, getDefaultAiKnowledgeBase, getDefaultAiSynthesizedStrategy } from "../services/defaults";
import { StrategyMode } from "../types";

const DB_PATH = path.join(process.cwd(), "backend", "data", "scalarai.sqlite");

export function openDb(): InstanceType<typeof Database> {
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

