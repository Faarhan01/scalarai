import sqlite3
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "database", "bridge.db")
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "database", "migrations")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    os.makedirs(MIGRATIONS_DIR, exist_ok=True)
    conn = get_connection()
    cur = conn.cursor()
    cur.executescript("""
        CREATE TABLE IF NOT EXISTS symbols (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            digits INTEGER DEFAULT 0,
            point REAL DEFAULT 0,
            enabled INTEGER DEFAULT 1,
            added_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS strategies (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            mode TEXT DEFAULT 'CUSTOM',
            rules TEXT DEFAULT '[]',
            params TEXT DEFAULT '{}',
            active INTEGER DEFAULT 0,
            version INTEGER DEFAULT 1,
            parent_id TEXT,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS strategy_symbols (
            strategy_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            PRIMARY KEY (strategy_id, symbol),
            FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket INTEGER UNIQUE,
            symbol TEXT NOT NULL,
            type TEXT NOT NULL,
            volume REAL NOT NULL,
            price_open REAL,
            price_close REAL,
            sl REAL DEFAULT 0,
            tp REAL DEFAULT 0,
            profit REAL DEFAULT 0,
            commission REAL DEFAULT 0,
            swap REAL DEFAULT 0,
            status TEXT DEFAULT 'OPEN',
            strategy_id TEXT,
            magic INTEGER,
            comment TEXT,
            reason TEXT,
            opened_at TEXT,
            closed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS market_candles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            timeframe TEXT NOT NULL,
            time TEXT NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            volume INTEGER,
            direction TEXT,
            ingested_at TEXT DEFAULT (datetime('now')),
            UNIQUE(symbol, timeframe, time)
        );

        CREATE TABLE IF NOT EXISTS backtests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            strategy_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            timeframe TEXT NOT NULL,
            from_date TEXT,
            to_date TEXT,
            total_trades INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            win_rate REAL DEFAULT 0,
            profit_factor REAL DEFAULT 0,
            max_drawdown REAL DEFAULT 0,
            avg_win REAL DEFAULT 0,
            avg_loss REAL DEFAULT 0,
            final_balance REAL DEFAULT 0,
            result_json TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ea_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            level TEXT DEFAULT 'INFO',
            source TEXT DEFAULT 'EA',
            message TEXT,
            symbol TEXT,
            timestamp TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS trade_commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            symbol TEXT NOT NULL,
            lot REAL DEFAULT 0.1,
            sl REAL DEFAULT 0,
            tp REAL DEFAULT 0,
            ticket INTEGER,
            trailing_stop REAL DEFAULT 0,
            trailing_step REAL DEFAULT 0,
            reason TEXT,
            status TEXT DEFAULT 'PENDING',
            created_at TEXT DEFAULT (datetime('now')),
            executed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            level TEXT DEFAULT 'INFO',
            source TEXT DEFAULT 'SYSTEM',
            message TEXT,
            timestamp TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
        CREATE INDEX IF NOT EXISTS idx_strategies_mode ON strategies(mode);
        CREATE INDEX IF NOT EXISTS idx_strategy_symbols_strategy ON strategy_symbols(strategy_id);
        CREATE INDEX IF NOT EXISTS idx_trades_symbol_status ON trades(symbol, status);
        CREATE INDEX IF NOT EXISTS idx_trades_opened_at ON trades(opened_at);
        CREATE INDEX IF NOT EXISTS idx_candles_symbol_timeframe_time ON market_candles(symbol, timeframe, time);
        CREATE INDEX IF NOT EXISTS idx_backtests_strategy ON backtests(strategy_id);
        CREATE INDEX IF NOT EXISTS idx_ea_logs_symbol_time ON ea_logs(symbol, timestamp);
        CREATE INDEX IF NOT EXISTS idx_trade_commands_status ON trade_commands(status);
    """)
    conn.commit()
    conn.close()


class Database:
    def __init__(self):
        init_db()

    def execute(self, sql: str, params: tuple = ()) -> sqlite3.Cursor:
        conn = get_connection()
        try:
            cur = conn.execute(sql, params)
            conn.commit()
            return cur
        finally:
            conn.close()

    def query(self, sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
        conn = get_connection()
        try:
            cur = conn.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def add_symbol(self, name: str, description: str = "", digits: int = 0, point: float = 0.0) -> bool:
        try:
            self.execute(
                "INSERT OR IGNORE INTO symbols (name, description, digits, point) VALUES (?, ?, ?, ?)",
                (name, description, digits, point),
            )
            return True
        except Exception:
            return False

    def list_symbols(self, enabled_only: bool = True) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM symbols"
        params: list = []
        if enabled_only:
            sql += " WHERE enabled = ?"
            params.append(1)
        sql += " ORDER BY name ASC"
        return self.query(sql, tuple(params))

    def set_symbol_enabled(self, name: str, enabled: bool):
        self.execute("UPDATE symbols SET enabled = ? WHERE name = ?", (1 if enabled else 0, name))

    def insert_strategy(self, strategy: dict) -> bool:
        try:
            self.execute(
                "INSERT OR REPLACE INTO strategies (id, name, description, mode, rules, params, active, version, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    strategy["id"],
                    strategy["name"],
                    strategy.get("description", ""),
                    strategy.get("mode", "CUSTOM"),
                    json.dumps(strategy.get("rules", [])),
                    json.dumps(strategy.get("params", {})),
                    1 if strategy.get("active") else 0,
                    strategy.get("version", 1),
                    strategy.get("parentId"),
                    strategy.get("createdAt") or datetime.utcnow().isoformat(),
                    datetime.utcnow().isoformat(),
                ),
            )
            return True
        except Exception:
            return False

    def get_strategy(self, strategy_id: str) -> Optional[dict]:
        rows = self.query("SELECT * FROM strategies WHERE id = ?", (strategy_id,))
        if not rows:
            return None
        row = rows[0]
        row["rules"] = json.loads(row.get("rules") or "[]")
        row["params"] = json.loads(row.get("params") or "{}")
        row["createdAt"] = row.pop("created_at")
        row["updatedAt"] = row.pop("updated_at")
        row["active"] = bool(row.get("active", 0))
        row["version"] = row.get("version", 1)
        row["parentId"] = row.get("parent_id")
        return row

    def list_strategies(self) -> List[dict]:
        rows = self.query("SELECT * FROM strategies ORDER BY updated_at DESC")
        for row in rows:
            row["rules"] = json.loads(row.get("rules") or "[]")
            row["params"] = json.loads(row.get("params") or "{}")
            row["createdAt"] = row.pop("created_at")
            row["updatedAt"] = row.pop("updated_at")
            row["active"] = bool(row.get("active", 0))
            row["version"] = row.get("version", 1)
            row["parentId"] = row.get("parent_id")
        return rows

    def set_active_strategy(self, strategy_id: str):
        self.execute("UPDATE strategies SET active = 0")
        self.execute("UPDATE strategies SET active = 1 WHERE id = ?", (strategy_id,))

    def get_active_strategy(self) -> Optional[dict]:
        rows = self.query("SELECT * FROM strategies WHERE active = 1 LIMIT 1")
        if not rows:
            return None
        row = rows[0]
        row["rules"] = json.loads(row.get("rules") or "[]")
        row["params"] = json.loads(row.get("params") or "{}")
        row["createdAt"] = row.pop("created_at")
        row["updatedAt"] = row.pop("updated_at")
        row["active"] = bool(row.get("active", 0))
        return row

    def delete_strategy(self, strategy_id: str) -> bool:
        cur = self.execute("DELETE FROM strategies WHERE id = ?", (strategy_id,))
        return cur.rowcount > 0

    def create_strategy_version(self, parent_id: str) -> Optional[str]:
        parent = self.get_strategy(parent_id)
        if not parent:
            return None
        new_id = f"{parent_id}_v{parent.get('version', 1) + 1}"
        new_strategy = {
            "id": new_id,
            "name": parent["name"],
            "description": parent.get("description", ""),
            "mode": parent.get("mode", "CUSTOM"),
            "rules": parent.get("rules", []),
            "params": parent.get("params", {}),
            "version": parent.get("version", 1) + 1,
            "parentId": parent_id,
        }
        if self.insert_strategy(new_strategy):
            return new_id
        return None

    def add_strategy_symbols(self, strategy_id: str, symbols: list[str]):
        for sym in symbols:
            self.execute("INSERT OR IGNORE INTO strategy_symbols (strategy_id, symbol) VALUES (?, ?)", (strategy_id, sym))

    def get_strategy_symbols(self, strategy_id: str) -> List[str]:
        rows = self.query("SELECT symbol FROM strategy_symbols WHERE strategy_id = ?", (strategy_id,))
        return [r["symbol"] for r in rows]

    def remove_strategy_symbol(self, strategy_id: str, symbol: str):
        self.execute("DELETE FROM strategy_symbols WHERE strategy_id = ? AND symbol = ?", (strategy_id, symbol))

    def insert_trade(self, trade: dict) -> Optional[int]:
        cur = self.execute(
            """INSERT OR REPLACE INTO trades 
               (ticket, symbol, type, volume, price_open, price_close, sl, tp, profit, commission, swap, status, strategy_id, magic, comment, reason, opened_at, closed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                trade.get("ticket"),
                trade.get("symbol"),
                trade.get("type"),
                trade.get("volume"),
                trade.get("price_open"),
                trade.get("price_close"),
                trade.get("sl", 0),
                trade.get("tp", 0),
                trade.get("profit", 0),
                trade.get("commission", 0),
                trade.get("swap", 0),
                trade.get("status", "OPEN"),
                trade.get("strategy_id"),
                trade.get("magic"),
                trade.get("comment"),
                trade.get("reason"),
                trade.get("opened_at") or datetime.utcnow().isoformat(),
                trade.get("closed_at"),
            ),
        )
        return cur.lastrowid

    def update_trade(self, ticket: int, updates: dict) -> bool:
        sets = []
        params = []
        for k, v in updates.items():
            sets.append(f"{k} = ?")
            params.append(v)
        params.append(ticket)
        cur = self.execute(f"UPDATE trades SET {', '.join(sets)} WHERE ticket = ?", tuple(params))
        return cur.rowcount > 0

    def list_trades(self, status: Optional[str] = None, symbol: Optional[str] = None, strategy_id: Optional[str] = None, limit: int = 100) -> List[dict]:
        sql = "SELECT * FROM trades WHERE 1=1"
        params = []
        if status:
            sql += " AND status = ?"
            params.append(status)
        if symbol:
            sql += " AND symbol = ?"
            params.append(symbol)
        if strategy_id:
            sql += " AND strategy_id = ?"
            params.append(strategy_id)
        sql += " ORDER BY opened_at DESC LIMIT ?"
        params.append(limit)
        return self.query(sql, tuple(params))

    def insert_candle(self, candle: dict) -> bool:
        try:
            self.execute(
                "INSERT OR IGNORE INTO market_candles (symbol, timeframe, time, open, high, low, close, volume, direction) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    candle["symbol"],
                    candle.get("timeframe", "1"),
                    candle["time"],
                    candle["open"],
                    candle["high"],
                    candle["low"],
                    candle["close"],
                    candle.get("volume", 0),
                    candle.get("direction", "flat"),
                ),
            )
            return True
        except Exception:
            return False

    def get_candles(self, symbol: str, timeframe: str = "1", limit: int = 100) -> List[dict]:
        return self.query(
            "SELECT * FROM market_candles WHERE symbol = ? AND timeframe = ? ORDER BY time DESC LIMIT ?",
            (symbol, timeframe, limit),
        )

    def get_candles_by_symbols(self, symbols: List[str], timeframe: str = "1", limit: int = 100) -> Dict[str, List[dict]]:
        result = {}
        for sym in symbols:
            result[sym] = self.get_candles(sym, timeframe, limit)
        return result

    def insert_backtest(self, backtest: dict) -> Optional[int]:
        cur = self.execute(
            """INSERT INTO backtests 
               (strategy_id, symbol, timeframe, from_date, to_date, total_trades, wins, losses, win_rate, profit_factor, max_drawdown, avg_win, avg_loss, final_balance, result_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                backtest.get("strategy_id"),
                backtest.get("symbol"),
                backtest.get("timeframe", "1"),
                backtest.get("from"),
                backtest.get("to"),
                backtest.get("totalTrades", 0),
                backtest.get("wins", 0),
                backtest.get("losses", 0),
                backtest.get("winRate", 0),
                backtest.get("profitFactor", 0),
                backtest.get("maxDrawdown", 0),
                backtest.get("avgWin", 0),
                backtest.get("avgLoss", 0),
                backtest.get("finalBalance", 0),
                json.dumps(backtest.get("trades", [])),
            ),
        )
        return cur.lastrowid

    def get_backtests(self, strategy_id: Optional[str] = None, symbol: Optional[str] = None, limit: int = 50) -> List[dict]:
        sql = "SELECT * FROM backtests WHERE 1=1"
        params = []
        if strategy_id:
            sql += " AND strategy_id = ?"
            params.append(strategy_id)
        if symbol:
            sql += " AND symbol = ?"
            params.append(symbol)
        sql += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        rows = self.query(sql, tuple(params))
        for row in rows:
            row["result"] = json.loads(row.get("result_json") or "{}")
            row.pop("result_json", None)
        return rows

    def add_ea_log(self, level: str, message: str, symbol: Optional[str] = None):
        self.execute("INSERT INTO ea_logs (level, source, message, symbol) VALUES (?, ?, ?, ?)", (level, "EA", message, symbol))

    def get_ea_logs(self, symbol: Optional[str] = None, limit: int = 100) -> List[dict]:
        sql = "SELECT * FROM ea_logs WHERE 1=1"
        params = []
        if symbol:
            sql += " AND symbol = ?"
            params.append(symbol)
        sql += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        return self.query(sql, tuple(params))

    def get_ea_logs_by_symbols(self, symbols: List[str], limit: int = 100) -> Dict[str, List[dict]]:
        result = {}
        for sym in symbols:
            result[sym] = self.get_ea_logs(symbol=sym, limit=limit)
        return result

    def add_trade_command(self, command: dict) -> Optional[int]:
        cur = self.execute(
            "INSERT INTO trade_commands (action, symbol, lot, sl, tp, ticket, trailing_stop, trailing_step, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                command.get("action"),
                command.get("symbol"),
                command.get("lot", 0.1),
                command.get("sl", 0),
                command.get("tp", 0),
                command.get("ticket"),
                command.get("trailing_stop", 0),
                command.get("trailing_step", 0),
                command.get("reason"),
                command.get("status", "PENDING"),
            ),
        )
        return cur.lastrowid

    def get_pending_commands(self, limit: int = 50) -> List[dict]:
        return self.query("SELECT * FROM trade_commands WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT ?", (limit,))

    def mark_command_executed(self, command_id: int, success: bool = True):
        status = "EXECUTED" if success else "FAILED"
        self.execute("UPDATE trade_commands SET status = ?, executed_at = ? WHERE id = ?", (status, datetime.utcnow().isoformat(), command_id))

    def add_log(self, level: str, source: str, message: str):
        self.execute("INSERT INTO logs (level, source, message) VALUES (?, ?, ?)", (level, source, message))

    def get_logs(self, limit: int = 50, level: Optional[str] = None, source: Optional[str] = None) -> List[dict]:
        sql = "SELECT * FROM logs WHERE 1=1"
        params = []
        if level:
            sql += " AND level = ?"
            params.append(level)
        if source:
            sql += " AND source = ?"
            params.append(source)
        sql += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        return self.query(sql, tuple(params))

    def set_setting(self, key: str, value: str):
        self.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))

    def get_setting(self, key: str, default: Optional[str] = None) -> Optional[str]:
        rows = self.query("SELECT value FROM settings WHERE key = ?", (key,))
        if rows:
            return rows[0]["value"]
        return default

    def cleanup_old_data(self, max_candles: int = 200000, max_logs: int = 10000, max_ea_logs: int = 5000) -> Dict[str, int]:
        result = {"deleted_candles": 0, "deleted_logs": 0, "deleted_ea_logs": 0}
        try:
            conn = get_connection()
            cur = conn.cursor()
            cur.execute("DELETE FROM market_candles WHERE id NOT IN (SELECT id FROM market_candles ORDER BY time DESC LIMIT ?)", (max_candles,))
            result["deleted_candles"] = cur.rowcount
            cur.execute("DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY timestamp DESC LIMIT ?)", (max_logs,))
            result["deleted_logs"] = cur.rowcount
            cur.execute("DELETE FROM ea_logs WHERE id NOT IN (SELECT id FROM ea_logs ORDER BY timestamp DESC LIMIT ?)", (max_ea_logs,))
            result["deleted_ea_logs"] = cur.rowcount
            conn.commit()
            conn.close()
        except Exception:
            pass
        return result

    def get_stats(self) -> Dict[str, Any]:
        stats = {
            "symbols": self.query("SELECT COUNT(*) as count FROM symbols")[0]["count"],
            "strategies": self.query("SELECT COUNT(*) as count FROM strategies")[0]["count"],
            "trades": self.query("SELECT COUNT(*) as count FROM trades")[0]["count"],
            "open_trades": self.query("SELECT COUNT(*) as count FROM trades WHERE status = 'OPEN'")[0]["count"],
            "candles": self.query("SELECT COUNT(*) as count FROM market_candles")[0]["count"],
            "backtests": self.query("SELECT COUNT(*) as count FROM backtests")[0]["count"],
            "ea_logs": self.query("SELECT COUNT(*) as count FROM ea_logs")[0]["count"],
        }
        return stats
