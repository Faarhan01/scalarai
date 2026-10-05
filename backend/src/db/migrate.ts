import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getDefaultTradeConfig, getDefaultAiKnowledgeBase, getDefaultAiSynthesizedStrategy } from "../services/defaults";

const DB_PATH = path.join(process.cwd(), "backend", "data", "scalarai.sqlite");
const KNOWLEDGE_FILE_PATH = path.join(process.cwd(), "backend", "data", "ai_knowledge_profile.json");
const STRATEGY_FILE_PATH = path.join(process.cwd(), "backend", "data", "ai_synthesized_strategy.json");

export function openDb(): any {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function migrate(db: any): void {
  const schemaSql = fs.readFileSync(path.join(process.cwd(), "backend", "src", "db", "schema.sql"), "utf-8");
  db.exec(schemaSql);
  seedDefaults(db);
  migrateJsonData(db);
}

function seedDefaults(db: any): void {
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

function migrateJsonData(db: any): void {
  // Note: JSON migration is a one-time operation. After successful migration,
  // JSON files are moved to backend/data/backups/. If you need to re-migrate,
  // move the files back to backend/data/ and restart the server.
  if (fs.existsSync(KNOWLEDGE_FILE_PATH)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE_PATH, "utf-8"));
      db.prepare(
        `UPDATE ai_knowledge SET total_observations = ?, global_average_speed = ?, peak_velocity_registered = ?, time_of_day_patterns = ?, last_updated = ? WHERE id = 1`
      ).run(
        fileData.totalObservations ?? 0,
        fileData.globalAverageSpeed ?? 0,
        fileData.peakVelocityRegistered ?? 0,
        JSON.stringify(fileData.timeOfDayPatterns || {}),
        fileData.lastUpdated || new Date().toISOString()
      );
      console.log(`Migrated ai_knowledge_profile.json to SQLite (${fileData.totalObservations} observations).`);
    } catch (err: any) {
      console.error("Failed to migrate ai_knowledge_profile.json:", err.message);
    }
  }

  if (fs.existsSync(STRATEGY_FILE_PATH)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(STRATEGY_FILE_PATH, "utf-8"));
      db.prepare(
        `UPDATE ai_strategy SET name = ?, description = ?, mode = ?, rules = ?, updated_at = ? WHERE id = 1`
      ).run(
        fileData.strategyName || "Migrated Strategy",
        fileData.rationale || "",
        "AI_ADAPTIVE",
        JSON.stringify({
          minVelocityFilter: fileData.compiledRules?.minVelocityFilter ?? 0.15,
          slPointsMultiplier: fileData.compiledRules?.slPointsMultiplier ?? 1,
          tpPointsMultiplier: fileData.compiledRules?.tpPointsMultiplier ?? 1,
          allowCounterTrend: fileData.compiledRules?.allowCounterTrend ?? false,
          useEmaConfirmation: fileData.compiledRules?.useEmaConfirmation ?? true,
          maxAllowedPositionDivergence: fileData.compiledRules?.maxAllowedPositionDivergence ?? 2,
        }),
        new Date().toISOString()
      );
      console.log(`Migrated ai_synthesized_strategy.json to SQLite (${fileData.strategyName}).`);
    } catch (err: any) {
      console.error("Failed to migrate ai_synthesized_strategy.json:", err.message);
    }
  }
}
