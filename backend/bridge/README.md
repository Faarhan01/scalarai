# ScalarAI MT5 Bridge

Direct Python bridge between the ScalarAI site and a locally running
MetaTrader 5 terminal. Uses the official `MetaTrader5` PyPI package -- no
Expert Advisor (MQL5) required.

## Layout

```
backend/bridge/
├── README.md
├── mt5/                      # Actual MT5 bridge (isolated)
│   ├── services/
│   │   ├── mt5_service.py    # MT5 API wrapper (place/close/modify/ticks/history)
│   │   ├── database.py       # SQLite persistence
│   │   ├── strategy_service.py
│   │   ├── backtest_service.py
│   │   ├── candle_service.py
│   │   ├── ea_generator.py
│   │   ├── bot.py
│   │   └── ea_bridge.py      # Replicates the Expert Advisor's data flow
│   ├── database/             # bridge.db
│   ├── generated/            # Generated EA files
│   ├── scripts/
│   └── templates/            # EA template
└── app/                      # Site integration layer (isolated)
    ├── __init__.py
    ├── integration.py        # Adapts site trade requests to bridge calls
    ├── client.py             # Lets the bridge talk *to* the site
    └── server.py             # HTTP wrapper so the site talks to the bridge
```

The bridge (`mt5/`) never imports the site, and the site never imports the
bridge -- they only communicate through the wrappers in `app/`.

## Replicating the Expert Advisor's data flow

The Expert Advisor used to poll `GET /poll` and push ticks, bulk candles,
positions, confirmations, and logs to the site. `mt5/services/ea_bridge.py`
replaces all of that using the official `MetaTrader5` Python package:

| EA action | Bridge replacement |
|---|---|
| `GET /poll` | `EABridgeService.poll_commands()` |
| `POST /api/ea/tick` | `EABridgeService.send_tick()` |
| `POST /api/market/bulk-candles` | `EABridgeService.send_bulk_candles()` |
| `POST /api/ea/positions` | `EABridgeService.send_positions()` |
| `POST /api/ea/confirm` | `EABridgeService.send_confirmations()` |
| `POST /api/ea/logs` | `EABridgeService.send_logs()` |

```python
from backend.bridge.mt5.services.ea_bridge import EABridgeService
bridge = EABridgeService(site_url="http://127.0.0.1:3000")
bridge.send_tick()          # pushes bid/ask + account to /api/ea/tick
bridge.send_bulk_candles()  # pushes 500 bars to /api/market/bulk-candles
bridge.send_positions()     # pushes open positions to /api/ea/positions
bridge.start()              # runs the heartbeat loop in a background thread
```

## Setup

1. MT5 must be running with Algorithmic Trading enabled.
2. Install dependencies:
   ```bash
   pip install fastapi uvicorn requests MetaTrader5
   ```
3. Run the bridge HTTP server:
   ```bash
   python -m app.server
   ```
   Starts on `http://127.0.0.1:5000`.

## Endpoints

- `GET /health`, `/account`, `/positions`, `/symbols`, `/tick?symbol=X`,
  `/history?symbol=X&count=N&timeframe=1`
- `POST /trade` body: `{"type":"BUY","symbol":"X","lot":0.1,"sl":10,"tp":20}`
- `POST /close` body: `{"ticket":123}`
- `POST /close-all` body: `{"symbol":"X"}` (omit symbol for all)
- `POST /modify` body: `{"ticket":123,"sl":10,"tp":20}`

Trade actions require `Authorization: Bearer <api_key>`.

## How to use

### Directly (Python)

```python
from backend.bridge.mt5.services.mt5_service import MT5Service
svc = MT5Service()
print(svc.get_account())
print(svc.place_trade("Step Index", "BUY", 0.1, sl=10, tp=20))
```

### Via the site integration layer

```python
from backend.bridge.app.integration import create_integration
bridge = create_integration(site_url="http://localhost:3000", api_key="scalarai-local")
print(bridge.place_trade("BUY", "AI signal", {"lot": 0.1, "sl": 10, "tp": 20}))
```

### Via the HTTP server

```bash
curl -X POST http://127.0.0.1:5000/trade \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer scalarai-local" \
  -d '{"type":"BUY","symbol":"Step Index","lot":0.1,"sl":10,"tp":20}'
```

## Notes

- Requires MT5 terminal to be running with Algorithmic Trading enabled.
- Uses the official `MetaTrader5` Python package.
- `sl`/`tp` are expressed in **points** (e.g. `10` = 10 points), not absolute
  price levels. The bridge converts them to absolute prices before sending to
  MT5.
- Default magic number: `20241008`.