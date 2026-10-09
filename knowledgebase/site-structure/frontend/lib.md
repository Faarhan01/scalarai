# Frontend Lib

> Detailed reference for utility libraries in `frontend/src/lib/`.

## `mql5_generator.ts` — MQL5 EA Generator

Frontend mirror of `backend/src/services/ea-generator.ts`.

### Functions

#### `validateAppUrl(appUrl?: string): string`

Validates app URL for inclusion in MQL5 EA code.

**Rules:**
- Must be valid HTTP/HTTPS URL
- Blocks private IPs in production (`localhost`, `127.0.0.1`, `192.168.*`, `10.*`, `172.*`)
- Strips trailing slash

#### `generateMql5Code(appUrl?: string, config?: Partial<TradeConfig>): string`

Generates complete MQL5 EA source code as a string.

**EA properties:**
- Version: 1.50
- Magic number: 20260617
- Copyright: Step Index MT5 Copilot

**Input parameters:**
- `InpLotSize` — lot size
- `InpMaxTrades` — max open positions
- `InpTakeProfitPts` — take profit in points
- `InpStopLossPts` — stop loss in points
- `InpUseTrailing` — enable trailing stop
- `InpTrailingStopPts` — trailing stop distance
- `InpTrailingStepPts` — trailing step (fixed at 50)
- `InpTradingMode` — MODE_SCALPING or MODE_SWING
- `InpMinAtrFilter` — minimum ATR filter
- `InpWebServerUrl` — web server URL
- `InpDashboardUrl` — dashboard update URL
- `InpSyncIntervalSec` — sync interval (default 3s)
- `InpSendTicksToWeb` — broadcast live data

**Indicators:**
- EMA(9/21) — fast/slow exponential moving average
- ADX(14) — average directional index
- BB(20,2) — Bollinger Bands
- Stochastic(5,3,3) — stochastic oscillator
- ATR(14) — average true range

**Strategy modes:**
- `TREND_FOLLOWING` — EMA golden/death cross + ADX > 25
- `MEAN_REVERSION` — Bollinger Bands oversold/overbought + Stochastic cross
- `AI_ADAPTIVE` — same as MEAN_REVERSION

**Execution rules:**
- Anti-hedging lock: blocks BUY if SELL active, blocks SELL if BUY active
- Maximum trades limit
- Swing mode waits for bar completion
- ATR filter suppresses trading in flat markets

**Remote command processing:**
- Parses `pendingAction`, `pendingLot`, `pendingSL`, `pendingTP` from JSON response
- Executes BUY/SELL/CLOSE_ALL via `trade.Buy()`, `trade.Sell()`, `CloseAllPositions()`
- Rejects opposite direction orders

**WebRequest sync:**
- POSTs to `/api/ea/tick` every `InpSyncIntervalSec` seconds
- Broadcasts market updates to `/api/update-market`
- Parses server response for trading active state and strategy mode
