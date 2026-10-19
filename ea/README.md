# StrategyForge Expert Advisor (MQL5)

Multi-strategy EA with custom optimization criteria and machine-readable reports for MetaTrader 5's Strategy Tester.

## Strategy Families
- `MODE_MA_CROSS` (0): Fast/slow MA cross
- `MODE_RSI_REVERT` (1): RSI back out of an extreme
- `MODE_BREAKOUT` (2): Close beyond a Donchian range
- `MODE_BOLLINGER` (3): Band touch reversion
- `MODE_MACD` (4): MACD line vs signal

## Optimization Criteria
- `CRIT_BALANCE` (0): Final balance
- `CRIT_SHARPE` (1): Risk-adjusted Sharpe ratio
- `CRIT_PROFIT_FACT` (2): Profit factor
- `CRIT_CALMAR` (3): Profit / max drawdown %
- `CRIT_PENALISED` (4): Profit minus drawdown penalty
- `CRIT_TRADE_COUNT` (5): Total trade count sanity check

Files:
- `StrategyForge.mq5` (Source code)
- `StrategyForge.ex5` (Compiled binary)
