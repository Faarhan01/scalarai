import MetaTrader5 as mt5
from datetime import datetime
from typing import Optional, List, Dict, Any


class MT5Service:
    def __init__(self):
        if not mt5.initialize():
            raise RuntimeError(f"MT5 init failed: {mt5.last_error()}")

    def shutdown(self):
        mt5.shutdown()

    def is_connected(self) -> bool:
        return mt5.terminal_info() is not None

    def get_account(self) -> Dict[str, Any]:
        info = mt5.account_info()
        if info is None:
            raise RuntimeError(f"Failed to get account info: {mt5.last_error()}")
        return {
            "login": info.login,
            "company": info.company,
            "balance": info.balance,
            "equity": info.equity,
            "margin": info.margin,
            "profit": info.profit,
            "leverage": info.leverage,
        }

    def get_symbols(self) -> List[Dict[str, Any]]:
        symbols = mt5.symbols_get()
        if symbols is None:
            raise RuntimeError(f"Failed to get symbols: {mt5.last_error()}")
        return [{"name": s.name, "description": s.description, "digits": s.digits, "point": s.point} for s in symbols]

    def get_tick(self, symbol: str) -> Dict[str, Any]:
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            raise RuntimeError(f"Failed to get tick: {mt5.last_error()}")
        return {
            "symbol": symbol,
            "bid": tick.bid,
            "ask": tick.ask,
            "time": datetime.fromtimestamp(tick.time).isoformat(),
        }

    def get_history(self, symbol: str, count: int = 100, timeframe: str = "1") -> List[Dict[str, Any]]:
        self.ensure_symbol_visible(symbol)
        tf_map = {
            "1": mt5.TIMEFRAME_M1,
            "5": mt5.TIMEFRAME_M5,
            "15": mt5.TIMEFRAME_M15,
            "30": mt5.TIMEFRAME_M30,
            "60": mt5.TIMEFRAME_H1,
            "240": mt5.TIMEFRAME_H4,
            "1440": mt5.TIMEFRAME_D1,
        }
        tf = tf_map.get(timeframe, mt5.TIMEFRAME_M1)

        rates = mt5.copy_rates_from(symbol, tf, 0, count)
        if rates is None or len(rates) == 0:
            ticks = mt5.copy_ticks_from(symbol, 0, count * 10, mt5.COPY_TICKS_ALL)
            if ticks is None or len(ticks) == 0:
                raise RuntimeError(f"Failed to get history/ticks for {symbol}: {mt5.last_error()}")
            return [
                {
                    "time": datetime.fromtimestamp(t[0]).isoformat(),
                    "open": t[1],
                    "high": t[2],
                    "low": t[3],
                    "close": t[4],
                    "volume": t[5] if len(t) > 5 else 0,
                }
                for t in ticks
            ]

        return [
            {
                "time": datetime.fromtimestamp(r[0]).isoformat(),
                "open": r[1],
                "high": r[2],
                "low": r[3],
                "close": r[4],
                "volume": r[5],
            }
            for r in rates
        ]

    def get_history_by_range(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> List[Dict[str, Any]]:
        self.ensure_symbol_visible(symbol)
        tf_map = {
            "1": mt5.TIMEFRAME_M1,
            "5": mt5.TIMEFRAME_M5,
            "15": mt5.TIMEFRAME_M15,
            "30": mt5.TIMEFRAME_M30,
            "60": mt5.TIMEFRAME_H1,
            "240": mt5.TIMEFRAME_H4,
            "1440": mt5.TIMEFRAME_D1,
        }
        tf = tf_map.get(timeframe, mt5.TIMEFRAME_M1)
        rates = mt5.copy_rates_range(symbol, tf, start, end)
        if rates is None:
            raise RuntimeError(f"Failed to get history range: {mt5.last_error()}")
        return [
            {
                "time": datetime.fromtimestamp(r[0]).isoformat(),
                "open": r[1],
                "high": r[2],
                "low": r[3],
                "close": r[4],
                "volume": r[5],
            }
            for r in rates
        ]

    def ensure_symbol_visible(self, symbol: str):
        info = mt5.symbol_info(symbol)
        if info is None:
            return
        if not info.visible:
            mt5.symbol_select(symbol, True)

    def get_history_by_range(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> List[Dict[str, Any]]:
        tf_map = {
            "1": mt5.TIMEFRAME_M1,
            "5": mt5.TIMEFRAME_M5,
            "15": mt5.TIMEFRAME_M15,
            "30": mt5.TIMEFRAME_M30,
            "60": mt5.TIMEFRAME_H1,
            "240": mt5.TIMEFRAME_H4,
            "1440": mt5.TIMEFRAME_D1,
        }
        tf = tf_map.get(timeframe, mt5.TIMEFRAME_M1)
        rates = mt5.copy_rates_range(symbol, tf, start, end)
        if rates is None:
            raise RuntimeError(f"Failed to get history range: {mt5.last_error()}")
        return [
            {
                "time": datetime.fromtimestamp(r[0]).isoformat(),
                "open": r[1],
                "high": r[2],
                "low": r[3],
                "close": r[4],
                "volume": r[5],
            }
            for r in rates
        ]

    def place_trade(self, symbol: str, trade_type: str, lot: float, sl: Optional[float] = None, tp: Optional[float] = None, comment: str = "AI Bridge Trade", magic: Optional[int] = None) -> Dict[str, Any]:
        symbol_info = mt5.symbol_info(symbol)
        if symbol_info is None:
            raise RuntimeError(f"Symbol not found: {symbol}")

        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            raise RuntimeError(f"Failed to get tick: {mt5.last_error()}")

        if trade_type.upper() == "BUY":
            price = tick.ask
            order_type = mt5.ORDER_TYPE_BUY
        elif trade_type.upper() == "SELL":
            price = tick.bid
            order_type = mt5.ORDER_TYPE_SELL
        else:
            raise RuntimeError("type must be BUY or SELL")

        # sl/tp are expressed in *points* (e.g. 10, 20). MT5's order_send expects
        # absolute price levels, so convert them here.
        point = symbol_info.point
        sl_price = None
        tp_price = None
        if sl and sl > 0:
            sl_price = price - sl * point if order_type == mt5.ORDER_TYPE_BUY else price + sl * point
        if tp and tp > 0:
            tp_price = price + tp * point if order_type == mt5.ORDER_TYPE_BUY else price - tp * point

        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": lot,
            "type": order_type,
            "price": price,
            "deviation": 10,
            "magic": magic or 20241008,
            "comment": comment,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_FOK,
        }
        if sl_price:
            request["sl"] = sl_price
        if tp_price:
            request["tp"] = tp_price

        result = mt5.order_send(request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            raise RuntimeError(f"Trade failed: {result.retcode} {result.comment}")

        return {
            "ticket": result.order,
            "price": result.price,
            "volume": result.volume,
            "type": trade_type.upper(),
            "symbol": symbol,
        }

    def close_trade(self, ticket: int, magic: Optional[int] = None) -> Dict[str, Any]:
        positions = mt5.positions_get(ticket=ticket)
        if positions is None or len(positions) == 0:
            raise RuntimeError(f"Position not found: {ticket}")

        pos = positions[0]
        tick = mt5.symbol_info_tick(pos.symbol)
        if tick is None:
            raise RuntimeError(f"Failed to get tick: {mt5.last_error()}")

        if pos.type == mt5.ORDER_TYPE_BUY:
            price = tick.bid
            close_type = mt5.ORDER_TYPE_SELL
        else:
            price = tick.ask
            close_type = mt5.ORDER_TYPE_BUY

        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": pos.symbol,
            "volume": pos.volume,
            "type": close_type,
            "position": ticket,
            "price": price,
            "deviation": 10,
            "magic": magic or 20241008,
            "comment": "AI Bridge Close",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_FOK,
        }

        result = mt5.order_send(request)
        if result is None:
            raise RuntimeError(f"Close failed: order_send returned None ({mt5.last_error()})")
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            raise RuntimeError(f"Close failed: {result.retcode} {result.comment}")

        return {"ticket": ticket, "closed": True}

    def close_all_positions(self, symbol: Optional[str] = None, magic: Optional[int] = None) -> Dict[str, Any]:
        if symbol:
            positions = mt5.positions_get(symbol=symbol)
        else:
            positions = mt5.positions_get()
        if positions is None:
            return {"closed": 0}

        closed = 0
        errors = []
        for pos in positions:
            if magic and pos.magic != magic:
                continue
            try:
                self.close_trade(pos.ticket, magic)
                closed += 1
            except Exception as e:
                errors.append({"ticket": pos.ticket, "error": str(e)})

        return {"closed": closed, "errors": errors}

    def get_positions(self, symbol: Optional[str] = None, magic: Optional[int] = None) -> List[Dict[str, Any]]:
        if symbol:
            positions = mt5.positions_get(symbol=symbol)
        else:
            positions = mt5.positions_get()
        if positions is None:
            return []
        result = []
        for p in positions:
            if magic and p.magic != magic:
                continue
            pos_dict = {
                "ticket": p.ticket,
                "symbol": p.symbol,
                "type": "BUY" if p.type == mt5.ORDER_TYPE_BUY else "SELL",
                "volume": p.volume,
                "price_open": p.price_open,
                "sl": p.sl,
                "tp": p.tp,
                "profit": p.profit,
                "swap": getattr(p, 'swap', 0),
                "magic": p.magic,
                "time": datetime.fromtimestamp(p.time).isoformat(),
            }
            if hasattr(p, 'commission'):
                pos_dict["commission"] = p.commission
            result.append(pos_dict)
        return result

    def modify_position(self, ticket: int, sl: Optional[float] = None, tp: Optional[float] = None) -> Dict[str, Any]:
        positions = mt5.positions_get(ticket=ticket)
        if positions is None or len(positions) == 0:
            raise RuntimeError(f"Position not found: {ticket}")

        pos = positions[0]
        new_sl = sl if sl is not None else pos.sl
        new_tp = tp if tp is not None else pos.tp

        request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "position": ticket,
            "symbol": pos.symbol,
            "sl": new_sl,
            "tp": new_tp,
            "magic": pos.magic,
        }

        result = mt5.order_send(request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            raise RuntimeError(f"Modify failed: {result.retcode} {result.comment}")

        return {"ticket": ticket, "sl": new_sl, "tp": new_tp, "modified": True}

    def apply_trailing_stop(self, symbol: Optional[str] = None, magic: Optional[int] = None, trailing_stop: int = 0, trailing_step: int = 0) -> Dict[str, Any]:
        if trailing_stop <= 0 or trailing_step <= 0:
            return {"applied": 0}

        positions = self.get_positions(symbol, magic)
        applied = 0
        for pos in positions:
            try:
                current_sl = pos.get("sl", 0)
                tick = mt5.symbol_info_tick(pos["symbol"])
                if tick is None:
                    continue

                if pos["type"] == "BUY":
                    new_sl = tick.bid - trailing_stop * mt5.symbol_info(pos["symbol"]).point
                    if new_sl > current_sl:
                        self.modify_position(pos["ticket"], sl=new_sl)
                        applied += 1
                else:
                    new_sl = tick.ask + trailing_stop * mt5.symbol_info(pos["symbol"]).point
                    if new_sl < current_sl or current_sl == 0:
                        self.modify_position(pos["ticket"], sl=new_sl)
                        applied += 1
            except Exception:
                pass

        return {"applied": applied}

    def get_symbol_info(self, symbol: str) -> Dict[str, Any]:
        info = mt5.symbol_info(symbol)
        if info is None:
            raise RuntimeError(f"Symbol not found: {symbol}")
        result = {
            "name": info.name,
            "description": info.description,
            "digits": info.digits,
            "point": info.point,
            "spread": info.spread,
            "trade_mode": info.trade_mode,
            "trade_calc_mode": info.trade_calc_mode,
            "ticks_bookdepth": info.ticks_bookdepth,
        }
        for attr in ["lot_size", "lot_min", "lot_max", "lot_step", "margin_initial", "margin_maintenance", "margin_hedged"]:
            if hasattr(info, attr):
                result[attr] = getattr(info, attr)
        return result
