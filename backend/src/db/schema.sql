PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  ticket INTEGER,
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

CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_open_time ON trades(open_time);
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_logs_source ON system_logs(source);
CREATE INDEX IF NOT EXISTS idx_market_ticks_time ON market_ticks(time);
CREATE INDEX IF NOT EXISTS idx_strategies_mode ON strategies(mode);
