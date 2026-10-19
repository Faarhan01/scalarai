# Step Index Trading Strategies

## Overview
The Step Index is a synthetic volatility index available on the MetaTrader 5 platform via the mt5_pkg_bridge. It is designed to mimic a random walk with occasional jumps, providing a pure volatility play without directional bias. This document analyzes its behavior based on MCP-derived data and proposes trading strategies for different time horizons: scalping, day trading, and swing trading.

## Data Observations (via MCP)
- **Historical Rates**: Retrieved 100+ 1-minute candles show price oscillating around a central value with occasional sudden steps (jumps) of variable size.
- **Market Telemetry**: Indicates tens of thousands of recorded observations with near-zero global average speed, suggesting the index is mean-reverting over the long term but exhibits bursts of velocity.
- **AI Knowledge Base**:
  - Total observations: ~33,625
  - Global average speed: ~0 (no net drift)
  - Peak velocity registered: 0.02 (small but significant spikes)
  - Time-of-day patterns: (data truncated) likely shows periodic volatility clusters.

## Characteristics
1. **No Directional Bias**: The index has no inherent trend; expected return over long periods is zero.
2. **Volatility Clusters**: Periods of low volatility (small steps) are followed by bursts of high volatility (large steps).
3. **Jump Process**: Price changes are not purely continuous; occasional discrete steps of varying magnitude occur.
4. **Mean Reversion**: After a large move, price tends to revert toward the median.
5. **Session Independence**: Behavior appears consistent across trading sessions (as it is synthetic).

## Strategy Ideas

### 1. Scalping (Multiple Trades Per Day)
**Goal**: Capture small price movements from volatility bursts and mean reversion after jumps.

**Indicators**:
- Short-term velocity (tick-by-tick changes) from `get_mt5_tick` or `get_market_telemetry`.
- Volatility measured via rolling standard deviation of price changes.
- Step detection: identify when absolute price change exceeds a threshold (e.g., 2x recent average step size).

**Entry Rules**:
- Wait for a volatility burst (a step larger than recent average).
- After the step, anticipate a partial reversal (mean reversion).
- Enter a trade in the opposite direction of the step, targeting a retracement of 30-70% of the step size.
- Use tight stop-loss just beyond the extreme of the step.
- Take profit at the retracement level or when velocity shows exhaustion.

**Exit Rules**:
- Exit if price moves against you beyond stop-loss.
- Exit if velocity re-accelerates in the original direction (indicating continuation).
- Time-based exit: close after 5 minutes if neither target nor stop hit.

**Tools**:
- `get_mt5_tick` for real-time price.
- `get_market_telemetry` for recent velocity observations.
- `get_mt5_rates` (1-minute) to confirm step size and context.

**Example MCP Calls**:
- Subscribe to ticks via WebSocket or poll `get_mt5_tick` every few seconds.
- Compute velocity as difference between current and previous tick.
- If |velocity| > threshold * average(abs(velocity)) over last N ticks, flag a step.
- After step, wait 1-2 seconds, then enter opposite direction.

### 2. Day Trading (Single or Few Trades Per Session)
**Goal**: Capture larger intraday moves by trading the volatility regime shifts.

**Approach**:
- Identify low volatility regimes (consolidation) where steps are small and infrequent.
- Wait for a breakout (a step that exceeds a dynamic threshold, e.g., Bollinger Band width).
- Trade in the direction of the breakout, expecting a continuation of the burst for a short period.
- Use volatility-based position sizing: smaller size during high volatility, larger during low volatility (since steps are rarer but larger).

**Indicators**:
- Bollinger Bands (20-period, 2 std dev) on 5-minute or 15-minute candles from `get_mt5_rates`.
- Average True Range (ATR) to measure volatility.
- Volume proxy: tick frequency from `get_market_telemetry` (recentTicksCount).

**Entry Rules**:
- When price closes outside Bollinger Bands on a 5-minute candle, consider it a breakout.
- Confirm with increased tick frequency (indicating market participation).
- Enter in direction of breakout.
- Stop-loss placed just inside the opposite band.
- Target: 1.5x to 2x the ATR, or at the opposite band.

**Exit Rules**:
- Trailing stop using ATR or time-based exit (end of session).
- If volatility collapses (tick frequency drops sharply), consider exiting early.

**Tools**:
- `get_mt5_rates` with timeframe=5 or 15.
- `get_market_telemetry` for tick frequency.
- `get_mt5_symbol_info` for contract details (tick value, etc.).

### 3. Swing Trading (Multi-Day Positions)
**Goal**: Capture larger swings that occur over several hours to days, exploiting the index's occasional sustained directional bursts (though rare due to zero drift).

**Note**: Since the index has no drift, pure directional swings are unlikely to persist. However, occasional regimes of positive or negative skew may appear due to the jump process.

**Approach**:
- Use longer timeframes (30-minute, 1-hour, 4-hour) from `get_mt5_rates`.
- Look for sequences of steps in the same direction (e.g., three consecutive up steps larger than average).
- Enter after confirmation of a directional bias (e.g., two steps up with no down steps in between).
- Expect the bias to last for a limited number of steps before mean reversion kills it.

**Indicators**:
- Sequential step direction count.
- Cumulative sum of steps (to detect drift over short windows).
- Adaptive threshold: step size relative to median absolute deviation of recent steps.

**Entry Rules**:
- After observing N (e.g., 3) steps in the same direction, each larger than X% of median step size, enter in that direction.
- Stop-loss placed beyond the extreme of the Nth step.
- Target: trailing stop or fixed reward/risk ratio (e.g., 1:2).

**Exit Rules**:
- Exit when a step occurs in the opposite direction (signal of reversal).
- Time-based exit: close after M steps or after a fixed time (e.g., 4 hours).

**Tools**:
- `get_mt5_rates` with larger timeframes.
- `get_mt5_history_deals` and `get_mt5_history_orders` (once added) to analyze past trade patterns (optional).

## Risk Management
- **Position Size**: Use volatility-adjusted sizing. For example, risk 1% of account per trade, with stop-loss distance determined by ATR or step size.
- **Max Daily Loss**: Set a daily loss limit (e.g., 5% of account) to prevent ruin during volatile periods.
- **Avoid Overtrading**: During low volatility, refrain from forcing trades; wait for clear signals.
- **Leverage**: The Step Index allows high leverage; use cautiously. Consider using no more than 10-20x effective leverage given the uncertainty.

## Example MCP Usage for Strategy Implementation
An AI agent could:
1. Poll `get_mt5_tick` every second to build a tick stream.
2. Compute rolling statistics (mean, std, velocity) over a window of 100 ticks.
3. Detect steps when absolute velocity exceeds 2.5 * rolling std.
4. After a step, wait 1 second, then place a limit order opposite the step at 50% retracement.
5. Use `place_validated_trade` (or `mt5_buy`/`mt5_sell` after renaming) to submit the order.
6. Monitor via `get_mt5_positions` and `get_mt5_tick` for exit conditions.

## Conclusion
The Step Index offers a unique environment for trading pure volatility. Strategies should focus on capturing short-term mean reversion after jumps (scalping), trading breakouts from consolidations (day trading), and occasionally riding short-lived directional bursts (swing). Success depends on disciplined risk management, adaptive position sizing, and rapid response to volatility changes.

## References
- MCP tools: `get_mt5_rates`, `get_mt5_tick`, `get_market_telemetry`, `get_ai_knowledge_base`, `get_market_observations`.
- Bridge methods: underlying `mt5_pkg_bridge` provides the raw data.
