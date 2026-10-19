# MetaTrader 5 Direct Bridge & Strategy Lab

The platform connects directly to MetaTrader 5 via the native Python bridge package (`mt5_pkg_bridge`).
It operates directly with the MetaTrader 5 terminal process, removing the need for a chart-attached Gateway Expert Advisor.

---

## 📁 Architecture & Components

```
backend/src/gateway/
├── mt5/
│   └── mt5_pkg_bridge/           # Direct Python bridge to MetaTrader 5
│       ├── __init__.py           # Package exports (ConnectionManager, MT5Engine, etc.)
│       ├── connection.py         # Terminal connection lifecycle & auto-reconnect
│       ├── mt5_engine.py         # Core engine methods & auto-discovered MT5 API wrappers
│       ├── api_manager.py        # Automatic discovery of public MetaTrader5 functions
│       ├── marketbook.py         # Order book / market depth subscription
│       ├── serializers.py        # Clean serialization of MT5 structs, numpy arrays & ticks
│       └── symbols.py            # Symbol metadata, ticks, and specs
├── mt5_bridge_cli.py             # CLI adapter providing JSON-RPC commands to Node.js backend
├── mt5-bridge.ts                 # TypeScript client service invoking mt5_bridge_cli
├── gateway-manager.ts            # Central telemetry, positions, and live order execution manager
└── routes.ts                     # REST and streaming endpoints for dashboard & MCP clients

ea/
└── StrategyForge.mq5             # Dedicated EA for running native MT5 Strategy Tester passes
```

---

## ⚡ Direct Bridge Operation

1. **Automatic Terminal Connection**:
   - The Python bridge (`mt5_pkg_bridge`) attaches directly to the running MetaTrader 5 terminal using the MetaTrader 5 Python package.
   - Credentials or paths can be configured via standard environment variables or `ConnectionManager`.

2. **Full Dynamic MetaTrader 5 Capabilities**:
   - The bridge auto-discovers all public MetaTrader 5 functions through `api_manager`.
   - Any external AI or frontend subsystem can call high-level operations (`buy`, `sell`, `close`, `modify`, `positions`, `rates`, `ticks`, `market_book`, `calc_margin`, `calc_profit`) or dynamically invoke any discovered MetaTrader 5 function via `call_mt5_function`.

3. **Real-time Live Sync**:
   - Live ticks, candlestick bars, active positions, floating profit/loss, and closed deal history are synced directly from the terminal without simulation.

---

## 🧪 Strategy Lab with StrategyForge

For quantitative backtesting and multi-parameter optimization:
- Download `StrategyForge.mq5` from the **Strategy Lab** or **Downloads** section.
- Run multi-pass optimization directly inside MetaTrader 5 Strategy Tester.
- Export results as CSV or submit directly via `/api/research/strategyforge-result` for Sharpe, Calmar, and win-rate analysis.
