from datetime import datetime
from typing import List, Dict, Any, Optional
from .mt5_service import MT5Service
from .database import Database


class BacktestService:
    def __init__(self, mt5_service: MT5Service, db: Database):
        self.mt5 = mt5_service
        self.db = db

    def run_backtest(self, strategy_id: str, symbol: str, timeframe: str = "1", from_date: Optional[str] = None, to_date: Optional[str] = None, initial_balance: float = 10000.0) -> Dict[str, Any]:
        strategy = self.db.get_strategy(strategy_id)
        if not strategy:
            raise RuntimeError(f"Strategy not found: {strategy_id}")

        end = datetime.utcnow() if to_date is None else datetime.fromisoformat(to_date)
        start = datetime.utcfromtimestamp(0) if from_date is None else datetime.fromisoformat(from_date)

        candles = self.mt5.get_history_by_range(symbol, timeframe, start, end)
        if not candles:
            raise RuntimeError("No historical data available for backtest")

        balance = initial_balance
        trades = []
        position = None
        peak = balance
        max_dd = 0.0
        wins = 0
        losses = 0
        gross_profit = 0.0
        gross_loss = 0.0

        for candle in reversed(candles):
            signal = self._evaluate(strategy, candle)
            if position:
                close_reason = self._check_exit(position, candle)
                if close_reason:
                    pnl = self._close_position(position, candle)
                    balance += pnl
                    trades.append({**position, "close": candle, "pnl": pnl})
                    if pnl >= 0:
                        wins += 1
                        gross_profit += pnl
                    else:
                        losses += 1
                        gross_loss += abs(pnl)
                    if balance > peak:
                        peak = balance
                    dd = (peak - balance) / peak if peak > 0 else 0
                    if dd > max_dd:
                        max_dd = dd
                    position = None

            if not position and signal:
                position = self._open_position(signal, candle, symbol, strategy_id)

        win_rate = (wins / len(trades) * 100) if trades else 0
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (float('inf') if gross_profit > 0 else 0)
        avg_win = (gross_profit / wins) if wins > 0 else 0
        avg_loss = (gross_loss / losses) if losses > 0 else 0

        result = {
            "strategyId": strategy_id,
            "symbol": symbol,
            "timeframe": timeframe,
            "from": from_date,
            "to": to_date,
            "totalTrades": len(trades),
            "wins": wins,
            "losses": losses,
            "winRate": round(win_rate, 2),
            "profitFactor": round(profit_factor, 2) if profit_factor != float('inf') else 99999,
            "maxDrawdown": round(max_dd * 100, 2),
            "avgWin": round(avg_win, 2),
            "avgLoss": round(avg_loss, 2),
            "finalBalance": round(balance, 2),
            "trades": trades,
        }

        self.db.insert_backtest(result)
        return result

    def _evaluate(self, strategy: dict, candle: dict) -> Optional[dict]:
        rules = strategy.get("rules", [])
        for rule in rules:
            if rule.get("action") == "BUY" and candle.get("direction") == "up":
                return {"type": "BUY", "reason": rule.get("condition", "Signal")}
            if rule.get("action") == "SELL" and candle.get("direction") == "down":
                return {"type": "SELL", "reason": rule.get("condition", "Signal")}
        return None

    def _open_position(self, signal: dict, candle: dict, symbol: str, strategy_id: str) -> dict:
        return {
            "symbol": symbol,
            "type": signal["type"],
            "volume": 0.1,
            "price_open": candle["close"],
            "sl": candle["close"] - 10 * 0.0001,
            "tp": candle["close"] + 20 * 0.0001,
            "opened_at": candle["time"],
            "reason": signal["reason"],
            "strategy_id": strategy_id,
        }

    def _check_exit(self, position: dict, candle: dict) -> bool:
        if position["type"] == "BUY":
            if candle["close"] <= position["sl"] or candle["close"] >= position["tp"]:
                return True
        else:
            if candle["close"] >= position["sl"] or candle["close"] <= position["tp"]:
                return True
        return False

    def _close_position(self, position: dict, candle: dict) -> float:
        close_price = candle["close"]
        open_price = position["price_open"]
        volume = position["volume"]
        if position["type"] == "BUY":
            return (close_price - open_price) * volume * 100000
        else:
            return (open_price - close_price) * volume * 100000

    def get_backtests(self, strategy_id: Optional[str] = None, symbol: Optional[str] = None, limit: int = 50) -> List[dict]:
        return self.db.get_backtests(strategy_id, symbol, limit)
