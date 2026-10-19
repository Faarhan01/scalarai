#!/usr/bin/env python3
"""
mt5_bridge_cli.py
Command-line bridge interface connecting the Node.js / Express backend
and MCP server to the MetaTrader 5 direct bridge (`mt5_pkg_bridge`).
"""
from __future__ import annotations
import sys
import os
import json
import logging

# Suppress debug logs to stdout so JSON response remains clean
logging.basicConfig(level=logging.ERROR)

# Add gateway/mt5 to sys.path so mt5_pkg_bridge can be imported without changes
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_MT5_DIR = os.path.join(_SCRIPT_DIR, "mt5")
if _MT5_DIR not in sys.path:
    sys.path.insert(0, _MT5_DIR)

try:
    from mt5_pkg_bridge import (
        ConnectionManager,
        MT5Engine,
        MT5Error,
        MT5ConnectionError,
        SymbolNotFoundError,
        OrderRejectedError,
        InvalidRequestError,
        enums,
    )
    _BRIDGE_AVAILABLE = True
except Exception as _import_err:
    _BRIDGE_AVAILABLE = False
    _IMPORT_ERROR = str(_import_err)

def _get_engine():
    conn = ConnectionManager.active()
    if conn is None:
        conn = ConnectionManager()
        try:
            conn.connect()
        except Exception:
            pass
    return MT5Engine(conn)

def cmd_status(_args):
    conn = ConnectionManager.active()
    is_connected = conn.is_connected if conn else False
    account_info = None
    terminal_info = None

    if is_connected:
        try:
            engine = MT5Engine(conn)
            account_info = engine.get_account_info()
            terminal_info = engine.get_terminal_info()
        except Exception:
            pass

    return {
        "success": True,
        "bridge": "mt5_pkg_bridge",
        "version": "1.2.0",
        "bridge_available": _BRIDGE_AVAILABLE,
        "is_connected": is_connected,
        "connection_info": conn.connection_info() if (conn and hasattr(conn, "connection_info")) else {},
        "account": account_info,
        "terminal": terminal_info,
        "server_time": os.getenv("SERVER_TIME", ""),
        "python_version": sys.version.split()[0],
    }

def cmd_connect(args):
    if not _BRIDGE_AVAILABLE:
        return {"success": False, "error": f"Bridge package not available: {_IMPORT_ERROR}"}
    try:
        conn = ConnectionManager(args if isinstance(args, dict) else {})
        info = conn.connect()
        return {"success": True, "connected": True, "info": info}
    except Exception as exc:
        return {"success": False, "connected": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_disconnect(_args):
    conn = ConnectionManager.active()
    if conn:
        conn.disconnect()
    return {"success": True, "connected": False}

def cmd_account(_args):
    try:
        engine = _get_engine()
        acc = engine.get_account_info()
        return {"success": True, "account": acc}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_terminal(_args):
    try:
        engine = _get_engine()
        term = engine.get_terminal_info()
        return {"success": True, "terminal": term}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_symbols(_args):
    try:
        engine = _get_engine()
        symbols = engine.get_symbols()
        return {"success": True, "count": len(symbols), "symbols": symbols}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_symbol_info(args):
    symbol = args.get("symbol") if isinstance(args, dict) else args
    if not symbol:
        return {"success": False, "error": "Symbol required"}
    try:
        engine = _get_engine()
        info = engine.get_symbol_info(symbol)
        return {"success": True, "symbol_info": info}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_tick(args):
    symbol = args.get("symbol") if isinstance(args, dict) else args
    if not symbol:
        return {"success": False, "error": "Symbol required"}
    try:
        engine = _get_engine()
        tick = engine.get_tick(symbol)
        return {"success": True, "tick": tick}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_rates(args):
    symbol = args.get("symbol", "Step Index")
    timeframe = args.get("timeframe", 1)  # 1 min default
    start_pos = int(args.get("start_pos", 0))
    count = int(args.get("count", 100))
    try:
        engine = _get_engine()
        rates = engine.copy_rates_from_pos(symbol, timeframe, start_pos, count)
        return {"success": True, "symbol": symbol, "count": len(rates), "rates": rates}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_positions(_args):
    try:
        engine = _get_engine()
        pos = engine.get_positions()
        return {"success": True, "count": len(pos), "positions": pos}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_history_deals(args):
    days = int(args.get("days", 30)) if isinstance(args, dict) else 30
    try:
        import datetime
        engine = _get_engine()
        date_to = datetime.datetime.now()
        date_from = date_to - datetime.timedelta(days=days)
        deals = engine.get_history_deals(date_from=date_from, date_to=date_to)
        return {"success": True, "count": len(deals), "deals": deals}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_history_orders(args):
    days = int(args.get("days", 30)) if isinstance(args, dict) else 30
    try:
        import datetime
        engine = _get_engine()
        date_to = datetime.datetime.now()
        date_from = date_to - datetime.timedelta(days=days)
        orders = engine.get_history_orders(date_from=date_from, date_to=date_to)
        return {"success": True, "count": len(orders), "orders": orders}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_buy(args):
    symbol = args.get("symbol", "Step Index")
    volume = float(args.get("volume", 0.1))
    sl = float(args.get("sl", 0.0))
    tp = float(args.get("tp", 0.0))
    comment = str(args.get("comment", "Cotrade Bridge Buy"))
    magic = int(args.get("magic", 20260118))
    try:
        engine = _get_engine()
        res = engine.buy(symbol=symbol, volume=volume, sl=sl, tp=tp, comment=comment, magic=magic)
        return {"success": True, "order": res}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_sell(args):
    symbol = args.get("symbol", "Step Index")
    volume = float(args.get("volume", 0.1))
    sl = float(args.get("sl", 0.0))
    tp = float(args.get("tp", 0.0))
    comment = str(args.get("comment", "Cotrade Bridge Sell"))
    magic = int(args.get("magic", 20260118))
    try:
        engine = _get_engine()
        res = engine.sell(symbol=symbol, volume=volume, sl=sl, tp=tp, comment=comment, magic=magic)
        return {"success": True, "order": res}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_close(args):
    ticket = args.get("ticket") if isinstance(args, dict) else args
    if not ticket:
        return {"success": False, "error": "Ticket required"}
    try:
        engine = _get_engine()
        res = engine.close_position(int(ticket))
        return {"success": True, "result": res}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_close_all(_args):
    try:
        engine = _get_engine()
        res = engine.close_all()
        return {"success": True, "closed": res}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_modify(args):
    ticket = args.get("ticket") if isinstance(args, dict) else None
    if not ticket:
        return {"success": False, "error": "Ticket required"}
    sl = float(args.get("sl", 0.0))
    tp = float(args.get("tp", 0.0))
    try:
        engine = _get_engine()
        res = engine.modify_position(int(ticket), sl=sl if sl > 0 else None, tp=tp if tp > 0 else None)
        return {"success": True, "result": res}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_orders(args):
    symbol = args.get("symbol") if isinstance(args, dict) else None
    try:
        engine = _get_engine()
        orders = engine.get_orders(symbol=symbol)
        return {"success": True, "count": len(orders), "orders": orders}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_market_book(args):
    symbol = args.get("symbol", "Step Index") if isinstance(args, dict) else args
    try:
        engine = _get_engine()
        book = engine.market_book.get(symbol)
        return {"success": True, "symbol": symbol, "book": book}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_totals(_args):
    try:
        engine = _get_engine()
        totals = engine.get_totals()
        return {"success": True, "totals": totals}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_calc_margin(args):
    action = args.get("action", "BUY")
    symbol = args.get("symbol", "Step Index")
    volume = float(args.get("volume", 0.1))
    price = float(args.get("price", 0.0))
    order_type = 0 if str(action).upper() == "BUY" else 1
    try:
        engine = _get_engine()
        res = engine.calc_margin(symbol=symbol, volume=volume, order_type=order_type, price=price)
        return {"success": True, "margin": res}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_calc_profit(args):
    action = args.get("action", "BUY")
    symbol = args.get("symbol", "Step Index")
    volume = float(args.get("volume", 0.1))
    open_price = float(args.get("open_price", 0.0))
    close_price = float(args.get("close_price", 0.0))
    order_type = 0 if str(action).upper() == "BUY" else 1
    try:
        engine = _get_engine()
        res = engine.calc_profit(symbol=symbol, volume=volume, order_type=order_type, open_price=open_price, close_price=close_price)
        return {"success": True, "profit": res}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_functions(_args):
    try:
        from mt5_pkg_bridge.mt5_engine import _FUNCS
        func_list = sorted(list(_FUNCS.keys()))
        engine_methods = [m for m in dir(MT5Engine) if not m.startswith("_") and callable(getattr(MT5Engine, m))]
        return {
            "success": True,
            "bridge": "mt5_pkg_bridge",
            "discovered_mt5_functions_count": len(func_list),
            "discovered_mt5_functions": func_list,
            "engine_methods": engine_methods,
        }
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

def cmd_call(args):
    """
    Dynamically invoke any MT5 engine method or auto-discovered MetaTrader5 function.
    args: { "function": "<func_name>", "args": [...], "kwargs": {...} }
    """
    func_name = args.get("function") or args.get("name")
    if not func_name:
        return {"success": False, "error": "Missing 'function' parameter"}

    call_args = args.get("args") or []
    call_kwargs = args.get("kwargs") or {}
    if not isinstance(call_args, list):
        call_args = [call_args]
    if not isinstance(call_kwargs, dict):
        call_kwargs = {}

    try:
        engine = _get_engine()
        # 1. Check high-level MT5Engine methods
        if hasattr(engine, func_name) and callable(getattr(engine, func_name)):
            fn = getattr(engine, func_name)
            res = fn(*call_args, **call_kwargs)
            return {"success": True, "function": func_name, "result": res}

        # 2. Check auto-discovered wrappers in _FUNCS
        from mt5_pkg_bridge.mt5_engine import _FUNCS
        if func_name in _FUNCS:
            fn = _FUNCS[func_name]
            res = fn(*call_args, **call_kwargs)
            return {"success": True, "function": func_name, "result": res}

        # 3. Check raw mt5 module
        if hasattr(engine.mt5, func_name) and callable(getattr(engine.mt5, func_name)):
            raw_fn = getattr(engine.mt5, func_name)
            raw_res = raw_fn(*call_args, **call_kwargs)
            from mt5_pkg_bridge.serializers import serialize_array, serialize_namedtuple
            if hasattr(raw_res, "dtype") and hasattr(raw_res.dtype, "names"):
                serialized = serialize_array(raw_res)
            elif hasattr(raw_res, "_asdict"):
                serialized = serialize_namedtuple(raw_res)
            elif isinstance(raw_res, list) and len(raw_res) > 0 and hasattr(raw_res[0], "_asdict"):
                serialized = [serialize_namedtuple(r) for r in raw_res]
            else:
                serialized = raw_res
            return {"success": True, "function": func_name, "result": serialized}

        return {"success": False, "error": f"Function '{func_name}' not found on MT5Engine or MetaTrader5"}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

COMMANDS = {
    "status": cmd_status,
    "check": cmd_status,
    "connect": cmd_connect,
    "disconnect": cmd_disconnect,
    "account": cmd_account,
    "terminal": cmd_terminal,
    "symbols": cmd_symbols,
    "symbol_info": cmd_symbol_info,
    "tick": cmd_tick,
    "rates": cmd_rates,
    "positions": cmd_positions,
    "orders": cmd_orders,
    "modify": cmd_modify,
    "modify_position": cmd_modify,
    "history_deals": cmd_history_deals,
    "history_orders": cmd_history_orders,
    "buy": cmd_buy,
    "sell": cmd_sell,
    "close": cmd_close,
    "close_all": cmd_close_all,
    "calc_margin": cmd_calc_margin,
    "calc_profit": cmd_calc_profit,
    "market_book": cmd_market_book,
    "totals": cmd_totals,
    "functions": cmd_functions,
    "call": cmd_call,
}

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: mt5_bridge_cli.py <command> [json_args]"}))
        sys.exit(1)

    cmd_name = sys.argv[1].lower()
    handler = COMMANDS.get(cmd_name)
    if not handler:
        print(json.dumps({"success": False, "error": f"Unknown command '{cmd_name}'. Available: {list(COMMANDS.keys())}"}))
        sys.exit(1)

    args = {}
    if len(sys.argv) > 2:
        try:
            args = json.loads(sys.argv[2])
        except Exception:
            args = {"raw": sys.argv[2]}

    try:
        output = handler(args)
    except Exception as ex:
        output = {"success": False, "error": f"Unhandled {type(ex).__name__}: {ex}"}

    print(json.dumps(output))

if __name__ == "__main__":
    main()
