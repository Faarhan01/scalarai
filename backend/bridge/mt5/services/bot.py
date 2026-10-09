import json
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
import math

from .database import Database
from .mt5_service import MT5Service
from .strategy_service import StrategyService
from .candle_service import CandleIngestionService


class TradingBot:
    def __init__(self):
        self.mt5_service = MT5Service()
        self.db = Database()
        self.strategy_service = StrategyService(self.mt5_service, self.db)
        self.candle_service = CandleIngestionService(self.mt5_service, self.db)
        self.running = False
        self._last_cycle_time = {}

    def start(self):
        self.running = True
        self.db.add_log("SUCCESS", "BOT", "Trading bot started")
        return {"status": "started"}

    def stop(self):
        self.running = False
        self.db.add_log("SUCCESS", "BOT", "Trading bot stopped")
        return {"status": "stopped"}

    def run_cycle(self, symbol: str, timeframe: str = "1", count: int = 100):
        if not self.running:
            return {"status": "stopped", "symbol": symbol}

        strategy = self.db.get_active_strategy()
        if not strategy:
            return {"status": "no_active_strategy", "symbol": symbol}

        strategy_symbols = self.db.get_strategy_symbols(strategy["id"])
        if symbol not in strategy_symbols:
            return {"status": "symbol_not_in_strategy", "symbol": symbol, "strategy_symbols": strategy_symbols}

        try:
            candles = self.mt5_service.get_history(symbol, count, timeframe)
        except Exception as e:
            self.db.add_log("ERROR", "BOT", f"Failed to get history for {symbol}: {e}")
            return {"status": "error", "symbol": symbol, "error": str(e)}

        if not candles or len(candles) < 20:
            return {"status": "insufficient_data", "symbol": symbol, "candles": len(candles) if candles else 0}

        try:
            signal = self._evaluate(strategy, candles, symbol)
        except Exception as e:
            self.db.add_log("ERROR", "BOT", f"Strategy evaluation failed for {symbol}: {e}")
            return {"status": "error", "symbol": symbol, "error": str(e)}

        if not signal:
            return {"status": "no_signal", "symbol": symbol}

        try:
            positions = self.mt5_service.get_positions(symbol)
            if positions and len(positions) > 0:
                return {"status": "already_positioned", "symbol": symbol, "positions": len(positions)}

            result = self.mt5_service.place_trade(
                symbol=symbol,
                trade_type=signal["type"],
                lot=signal.get("lot", 0.1),
                sl=signal.get("sl"),
                tp=signal.get("tp"),
                comment=f"Bot {strategy['name']}",
            )

            self.db.insert_trade({
                "ticket": result["ticket"],
                "symbol": result["symbol"],
                "type": result["type"],
                "volume": result["volume"],
                "price_open": result["price"],
                "sl": signal.get("sl", 0),
                "tp": signal.get("tp", 0),
                "status": "OPEN",
                "strategy_id": strategy["id"],
                "magic": strategy.get("magic"),
            })

            self.db.add_log("SUCCESS", "BOT", f"Trade executed: {signal['type']} {symbol} ticket={result['ticket']} reason={signal.get('reason', '')}")
            return {"status": "executed", "signal": signal, "trade": result}
        except Exception as e:
            self.db.add_log("ERROR", "BOT", f"Trade execution failed for {symbol}: {e}")
            return {"status": "error", "symbol": symbol, "error": str(e)}

    def run_backtest(self, strategy_id: str, symbol: str, timeframe: str = "1", from_date: Optional[str] = None, to_date: Optional[str] = None, initial_balance: float = 10000.0) -> Dict[str, Any]:
        strategy = self.db.get_strategy(strategy_id)
        if not strategy:
            raise RuntimeError(f"Strategy not found: {strategy_id}")

        end = datetime.utcnow() if to_date is None else datetime.fromisoformat(to_date)
        start = datetime.utcfromtimestamp(0) if from_date is None else datetime.fromisoformat(from_date)

        try:
            candles = self.mt5_service.get_history_by_range(symbol, timeframe, start, end)
        except Exception as e:
            raise RuntimeError(f"Failed to load history for backtest: {e}")

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

        for candle in candles:
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

            if not position:
                signal = self._evaluate(strategy, [candle], symbol)
                if signal:
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

    def _evaluate(self, strategy: dict, candles: List[dict], symbol: str) -> Optional[dict]:
        if not candles:
            return None

        params = strategy.get("params", {})
        mode = strategy.get("mode", "CUSTOM")
        rules = strategy.get("rules", [])
        sl = params.get("sl", 0)
        tp = params.get("tp", 0)
        lot = params.get("lot", 0.1)

        if len(candles) >= 3:
            current = candles[0]
            previous = candles[1]
            prev_prev = candles[2]

            if current["close"] > previous["close"] > prev_prev["close"]:
                return {"type": "BUY", "lot": lot, "sl": sl, "tp": tp, "reason": "Uptrend continuation"}
            elif current["close"] < previous["close"] < prev_prev["close"]:
                return {"type": "SELL", "lot": lot, "sl": sl, "tp": tp, "reason": "Downtrend continuation"}

        for rule in rules:
            condition = rule.get("condition", "")
            action = rule.get("action", "").upper()
            if not condition or action not in ("BUY", "SELL"):
                continue

            if self._check_condition(condition, candles, symbol):
                return {"type": action, "lot": lot, "sl": sl, "tp": tp, "reason": condition}

        return None

    def _check_condition(self, condition: str, candles: List[dict], symbol: str) -> bool:
        if not candles:
            return False

        current = candles[0]
        closes = [c["close"] for c in candles[:20]]
        highs = [c["high"] for c in candles[:20]]
        lows = [c["low"] for c in candles[:20]]

        if "RSI" in condition:
            rsi = self._calc_rsi(closes, 14)
            if "RSI < 30" in condition and rsi < 30:
                return True
            if "RSI > 70" in condition and rsi > 70:
                return True

        if "MA" in condition or "SMA" in condition:
            ma = sum(closes[-20:]) / min(20, len(closes))
            if "close > MA" in condition and current["close"] > ma:
                return True
            if "close < MA" in condition and current["close"] < ma:
                return True

        if "breakout" in condition.lower():
            if len(highs) >= 20:
                resistance = max(highs[:20])
                if current["close"] > resistance:
                    return True

        return False

    def _calc_rsi(self, closes: List[float], period: int = 14) -> float:
        if len(closes) < period + 1:
            return 50.0

        gains = []
        losses = []
        for i in range(1, len(closes)):
            change = closes[i] - closes[i - 1]
            gains.append(max(0, change))
            losses.append(max(0, -change))

        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period

        for i in range(period, len(gains)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period

        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    def _open_position(self, signal: dict, candle: dict, symbol: str, strategy_id: str) -> dict:
        sl = signal.get("sl", 0)
        tp = signal.get("tp", 0)
        price = candle["close"]
        point = candle.get("point", 0.0001)

        if signal["type"] == "BUY":
            sl_price = price - sl * point if sl > 0 else 0
            tp_price = price + tp * point if tp > 0 else 0
        else:
            sl_price = price + sl * point if sl > 0 else 0
            tp_price = price - tp * point if tp > 0 else 0

        return {
            "symbol": symbol,
            "type": signal["type"],
            "volume": signal.get("lot", 0.1),
            "price_open": price,
            "sl": sl_price,
            "tp": tp_price,
            "opened_at": candle.get("time"),
            "reason": signal.get("reason", ""),
            "strategy_id": strategy_id,
        }

    def _check_exit(self, position: dict, candle: dict) -> bool:
        if position["type"] == "BUY":
            if position["sl"] > 0 and candle["close"] <= position["sl"]:
                return True
            if position["tp"] > 0 and candle["close"] >= position["tp"]:
                return True
        else:
            if position["sl"] > 0 and candle["close"] >= position["sl"]:
                return True
            if position["tp"] > 0 and candle["close"] <= position["tp"]:
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

    def get_status(self) -> dict:
        strategy = self.db.get_active_strategy()
        positions = self.mt5_service.get_positions()
        account = self.mt5_service.get_account()

        return {
            "running": self.running,
            "active_strategy": strategy["name"] if strategy else None,
            "open_positions": len(positions),
            "account_balance": account.get("balance"),
            "account_equity": account.get("equity"),
            "profit": account.get("profit"),
        }
