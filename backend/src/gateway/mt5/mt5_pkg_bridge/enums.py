"""
mt5_pkg_bridge — Enumerations
=====================
MT5 constant maps built by reading the installed MetaTrader5 package rather
than hardcoding integers here. The values are MT5's stable public API, but
deriving them means a package upgrade cannot silently desync the gateway from
what the terminal actually expects.

If the package cannot be imported the module still loads, using the documented
MT5 values, so the gateway can answer requests while disconnected.
"""

import sys
from typing import Optional

from .paths import find_mt5_package

import time

_mt5 = None
_loaded = False
_last_attempt = 0.0
_RETRY_INTERVAL = 30.0


def load() -> Optional[object]:
    """Import and cache the MetaTrader5 module, or None if unavailable.

    A failed import is *not* cached forever: the module is retried after
    ``_RETRY_INTERVAL`` seconds so that a gateway which started before the
    terminal/package was available can pick it up later. Constants are still
    derived from whatever `load()` returns at *module import time*, so callers
    that need fresh values should call `load()` directly.
    """
    global _mt5, _loaded, _last_attempt
    now = time.monotonic()
    if _loaded and _mt5 is not None:
        return _mt5
    if _loaded and (_mt5 is None) and (now - _last_attempt < _RETRY_INTERVAL):
        return None
    _last_attempt = now
    path = find_mt5_package()
    if path and path not in sys.path:
        sys.path.insert(0, path)
    try:
        import MetaTrader5 as module
    except ImportError:
        _mt5 = None
        _loaded = True
        return None
    _mt5 = module
    _loaded = True
    return _mt5


def _value(name: str, default: int) -> int:
    """Read a constant from the package, falling back to the documented value."""
    module = load()
    if module is not None and hasattr(module, name):
        return getattr(module, name)
    return default


def _reverse(prefix: str, names: dict) -> dict:
    """Build {value: name} for a {name: value} map."""
    return {v: k for k, v in names.items()}


# ─── Order types ──────────────────────────────────────────────────────
# order_type for a request maps onto MT5's ORDER_TYPE_* constants.

ORDER_TYPES = {
    "buy": _value("ORDER_TYPE_BUY", 0),
    "sell": _value("ORDER_TYPE_SELL", 1),
    "buy_limit": _value("ORDER_TYPE_BUY_LIMIT", 2),
    "sell_limit": _value("ORDER_TYPE_SELL_LIMIT", 3),
    "buy_stop": _value("ORDER_TYPE_BUY_STOP", 4),
    "sell_stop": _value("ORDER_TYPE_SELL_STOP", 5),
    "buy_stop_limit": _value("ORDER_TYPE_BUY_STOP_LIMIT", 6),
    "sell_stop_limit": _value("ORDER_TYPE_SELL_STOP_LIMIT", 7),
    "close_by": _value("ORDER_TYPE_CLOSE_BY", 8),
}
ORDER_TYPE_NAMES = _reverse("", ORDER_TYPES)
MARKET_ORDER_TYPES = {ORDER_TYPES["buy"], ORDER_TYPES["sell"]}

# ─── Trade actions ────────────────────────────────────────────────────
# The "action" field of an order_send request.

TRADE_ACTIONS = {
    "deal": _value("TRADE_ACTION_DEAL", 1),
    "pending": _value("TRADE_ACTION_PENDING", 5),
    "sltp": _value("TRADE_ACTION_SLTP", 6),
    "modify": _value("TRADE_ACTION_MODIFY", 7),
    "remove": _value("TRADE_ACTION_REMOVE", 8),
    "close_by": _value("TRADE_ACTION_CLOSE_BY", 10),
}
TRADE_ACTION_NAMES = _reverse("", TRADE_ACTIONS)

# ─── Filling modes ────────────────────────────────────────────────────

FILLING_MODES = {
    "fok": _value("ORDER_FILLING_FOK", 0),
    "ioc": _value("ORDER_FILLING_IOC", 1),
    "return": _value("ORDER_FILLING_RETURN", 2),
    "boc": _value("ORDER_FILLING_BOC", 3),
}
FILLING_NAMES = _reverse("", FILLING_MODES)

# SymbolInfo.filling_mode is a bitfield of what the broker will accept for
# that instrument, built from SYMBOL_FILLING_* rather than ORDER_FILLING_*.
SYMBOL_FILLING_FLAGS = {
    "fok": _value("SYMBOL_FILLING_FOK", 1),
    "ioc": _value("SYMBOL_FILLING_IOC", 2),
    "return": _value("SYMBOL_FILLING_RETURN", 4),
}

# Preference when the caller did not choose. RETURN is the broadest but the
# least supported; IOC and FOK cannot leave a partial fill outstanding.
FILLING_PREFERENCE = ("return", "ioc", "fok", "boc")


def supported_filling_modes(symbol_filling_flag) -> list:
    """
    Filling modes a symbol accepts, from its SYMBOL_FILLING_* bitfield.

    A field left at zero is treated as permissive, since some feeds do not
    populate it rather than meaning "none allowed".
    """
    if not symbol_filling_flag:
        return []
    return [
        name
        for name, flag in SYMBOL_FILLING_FLAGS.items()
        if symbol_filling_flag & flag
    ]


def choose_filling_mode(symbol_filling_flag, preferred=None):
    """
    Pick a filling mode the broker will actually accept.

    An unsupported type_filling is refused with retcode 10030, and brokers
    disagree about which they support - this one refuses RETURN on EURUSD.
    Choosing from what the symbol declares avoids a whole class of rejection.

    Returns (filling_mode, supported_list).
    """
    supported = supported_filling_modes(symbol_filling_flag)
    if not supported:
        return FILLING_MODES["return"], []

    if preferred is not None and preferred in FILLING_MODES:
        return FILLING_MODES[preferred], supported

    for name in FILLING_PREFERENCE:
        if name in supported:
            return FILLING_MODES[name], supported
    return FILLING_MODES[supported[0]], supported

# ─── Order lifetime ───────────────────────────────────────────────────

ORDER_TIMES = {
    "gtc": _value("ORDER_TIME_GTC", 0),
    "day": _value("ORDER_TIME_DAY", 1),
    "specified": _value("ORDER_TIME_SPECIFIED", 2),
    "specified_day": _value("ORDER_TIME_SPECIFIED_DAY", 3),
}
ORDER_TIME_NAMES = _reverse("", ORDER_TIMES)

# ─── Timeframes ───────────────────────────────────────────────────────

TIMEFRAMES = {
    "M1": _value("TIMEFRAME_M1", 1),
    "M2": _value("TIMEFRAME_M2", 2),
    "M3": _value("TIMEFRAME_M3", 3),
    "M4": _value("TIMEFRAME_M4", 4),
    "M5": _value("TIMEFRAME_M5", 5),
    "M6": _value("TIMEFRAME_M6", 6),
    "M10": _value("TIMEFRAME_M10", 10),
    "M12": _value("TIMEFRAME_M12", 12),
    "M15": _value("TIMEFRAME_M15", 15),
    "M20": _value("TIMEFRAME_M20", 20),
    "M30": _value("TIMEFRAME_M30", 30),
    "H1": _value("TIMEFRAME_H1", 16384),
    "H2": _value("TIMEFRAME_H2", 16385),
    "H3": _value("TIMEFRAME_H3", 16386),
    "H4": _value("TIMEFRAME_H4", 16388),
    "H6": _value("TIMEFRAME_H6", 16390),
    "H8": _value("TIMEFRAME_H8", 16392),
    "H12": _value("TIMEFRAME_H12", 16396),
    "D1": _value("TIMEFRAME_D1", 16408),
    "W1": _value("TIMEFRAME_W1", 32769),
    "MN1": _value("TIMEFRAME_MN1", 49153),
}
TIMEFRAME_NAMES = _reverse("", TIMEFRAMES)

# ─── Position and deal direction ──────────────────────────────────────

POSITION_TYPES = {
    "buy": _value("POSITION_TYPE_BUY", 0),
    "sell": _value("POSITION_TYPE_SELL", 1),
}
POSITION_TYPE_NAMES = _reverse("", POSITION_TYPES)

DEAL_TYPES = {
    "buy": _value("DEAL_TYPE_BUY", 0),
    "sell": _value("DEAL_TYPE_SELL", 1),
    "balance": _value("DEAL_TYPE_BALANCE", 2),
    "credit": _value("DEAL_TYPE_CREDIT", 3),
    "charge": _value("DEAL_TYPE_CHARGE", 4),
    "correction": _value("DEAL_TYPE_CORRECTION", 5),
    "bonus": _value("DEAL_TYPE_BONUS", 6),
    "commission": _value("DEAL_TYPE_COMMISSION", 7),
    "interest": _value("DEAL_TYPE_INTEREST", 12),
    "dividend": _value("DEAL_DIVIDEND", 15),
    "tax": _value("DEAL_TAX", 17),
}
DEAL_TYPE_NAMES = _reverse("", DEAL_TYPES)

DEAL_ENTRIES = {
    "in": _value("DEAL_ENTRY_IN", 0),
    "out": _value("DEAL_ENTRY_OUT", 1),
    "inout": _value("DEAL_ENTRY_INOUT", 2),
    "out_by": _value("DEAL_ENTRY_OUT_BY", 3),
}
DEAL_ENTRY_NAMES = _reverse("", DEAL_ENTRIES)

# ─── Tick flags ───────────────────────────────────────────────────────

COPY_TICKS_FLAGS = {
    "all": _value("COPY_TICKS_ALL", -1),
    "info": _value("COPY_TICKS_INFO", 1),
    "trade": _value("COPY_TICKS_TRADE", 2),
}
COPY_TICKS_NAMES = _reverse("", COPY_TICKS_FLAGS)

# ─── Market book sides ────────────────────────────────────────────────

BOOK_SIDES = {
    "sell": _value("BOOK_TYPE_SELL", 1),
    "buy": _value("BOOK_TYPE_BUY", 2),
    "sell_market": _value("BOOK_TYPE_SELL_MARKET", 3),
    "buy_market": _value("BOOK_TYPE_BUY_MARKET", 4),
}
BOOK_SIDE_NAMES = _reverse("", BOOK_SIDES)

# ─── Order states ─────────────────────────────────────────────────────

ORDER_STATES = {
    "started": _value("ORDER_STATE_STARTED", 0),
    "placed": _value("ORDER_STATE_PLACED", 1),
    "canceled": _value("ORDER_STATE_CANCELED", 2),
    "partial": _value("ORDER_STATE_PARTIAL", 3),
    "filled": _value("ORDER_STATE_FILLED", 4),
    "rejected": _value("ORDER_STATE_REJECTED", 5),
    "expired": _value("ORDER_STATE_EXPIRED", 6),
    "request_add": _value("ORDER_STATE_REQUEST_ADD", 7),
    "request_modify": _value("ORDER_STATE_REQUEST_MODIFY", 8),
    "request_cancel": _value("ORDER_STATE_REQUEST_CANCEL", 9),
}
ORDER_STATE_NAMES = _reverse("", ORDER_STATES)

# ─── Account modes ────────────────────────────────────────────────────

TRADE_MODES = {
    "demo": _value("ACCOUNT_TRADE_MODE_DEMO", 0),
    "contest": _value("ACCOUNT_TRADE_MODE_CONTEST", 1),
    "real": _value("ACCOUNT_TRADE_MODE_REAL", 2),
}
TRADE_MODE_NAMES = _reverse("", TRADE_MODES)

MARGIN_MODES = {
    "netting": _value("ACCOUNT_MARGIN_MODE_RETAIL_NETTING", 0),
    "exchange": _value("ACCOUNT_MARGIN_MODE_EXCHANGE", 1),
    "hedging": _value("ACCOUNT_MARGIN_MODE_RETAIL_HEDGING", 2),
}
MARGIN_MODE_NAMES = _reverse("", MARGIN_MODES)

SYMBOL_TRADE_MODES = {
    "disabled": _value("SYMBOL_TRADE_MODE_DISABLED", 0),
    "long_only": _value("SYMBOL_TRADE_MODE_LONGONLY", 1),
    "short_only": _value("SYMBOL_TRADE_MODE_SHORTONLY", 2),
    "close_only": _value("SYMBOL_TRADE_MODE_CLOSEONLY", 3),
    "full": _value("SYMBOL_TRADE_MODE_FULL", 4),
}
SYMBOL_TRADE_MODE_NAMES = _reverse("", SYMBOL_TRADE_MODES)


_retcode_reverse = None


def _retcode_lookup() -> dict:
    """
    Map retcode value to name, built once from the installed package.

    Names cannot be derived from the value - MT5 calls 10030
    TRADE_RETCODE_INVALID_FILLING_TYPE, not TRADE_RETCODE_10030 - so the
    mapping has to be read off the module itself.
    """
    global _retcode_reverse
    if _retcode_reverse is not None:
        return _retcode_reverse

    module = load()
    reverse = {}
    if module is not None:
        for name in dir(module):
            if name.startswith("TRADE_RETCODE_"):
                reverse.setdefault(
                    getattr(module, name), name.replace("TRADE_RETCODE_", "")
                )
    _retcode_reverse = reverse
    return reverse


def timeframe_seconds(timeframe: int) -> Optional[int]:
    """
    Seconds per bar for a TIMEFRAME_* constant.

    MT5 packs the unit into the high bits and the period into the low ones:
    M-n is plain n, H-n is n|0x4000, W-n is n|0x8000 and MN-n is n|0xC000, so
    the value is decoded rather than looked up. Needed to bound a date-range
    request before it reaches the terminal - asking for M1 across a decade
    would otherwise pull every bar in existence before any cap could apply.
    """
    if not timeframe:
        return None
    if timeframe >= 0xC000:
        return (timeframe & 0xFFF) * 30 * 86400      # months, ~30 days
    if timeframe >= 0x8000:
        return (timeframe & 0xFFF) * 7 * 86400       # weeks
    if timeframe >= 0x4000:
        return (timeframe & 0xFFF) * 3600            # hours
    return timeframe * 60                            # minutes


def accepted_retcodes() -> tuple:
    """
    Return codes that mean the terminal accepted a request.

    order_send reports acceptance in the result's retcode rather than by
    raising, so every sending path compares against these.
    """
    module = load()
    if module is None:
        return (10009, 10010)
    return (
        getattr(module, "TRADE_RETCODE_DONE", 10009),
        getattr(module, "TRADE_RETCODE_DONE_PARTIAL", 10010),
    )


def retcode_name(retcode: int) -> str:
    """
    Human label for a return code, e.g. 10030 -> "Invalid Filling Type".

    Resolved against the package rather than a local table, so the gateway
    can decode every code MT5 can return.
    """
    found = _retcode_lookup().get(retcode)
    if found:
        return found.replace("_", " ").title()
    return f"Unknown ({retcode})"


def retcode_glossary() -> dict:
    """
    All TRADE_RETCODE_* constants the installed package exposes.

    Lets a caller decode any rejection code without a hardcoded table in
    their own code, and keeps the descriptions in step with the package.
    """
    module = load()
    if module is None:
        return {}
    found = {}
    for name in dir(module):
        if name.startswith("TRADE_RETCODE_"):
            found[name.replace("TRADE_RETCODE_", "")] = getattr(module, name)
    return dict(sorted(found.items(), key=lambda kv: kv[1]))


# ─── Position reasons ─────────────────────────────────────────────────

POSITION_REASONS = {
    "client": _value("POSITION_REASON_CLIENT", 0),
    "mobile": _value("POSITION_REASON_MOBILE", 1),
    "web": _value("POSITION_REASON_WEB", 2),
    "expert": _value("POSITION_REASON_EXPERT", 3),
}
POSITION_REASON_NAMES = _reverse("", POSITION_REASONS)

# ─── Order reasons ───────────────────────────────────────────────────

ORDER_REASONS = {
    "client": _value("ORDER_REASON_CLIENT", 0),
    "mobile": _value("ORDER_REASON_MOBILE", 1),
    "web": _value("ORDER_REASON_WEB", 2),
    "expert": _value("ORDER_REASON_EXPERT", 3),
    "sl": _value("ORDER_REASON_SL", 4),
    "tp": _value("ORDER_REASON_TP", 5),
    "so": _value("ORDER_REASON_SO", 6),
}
ORDER_REASON_NAMES = _reverse("", ORDER_REASONS)

# ─── Deal reasons ────────────────────────────────────────────────────

DEAL_REASONS = {
    "client": _value("DEAL_REASON_CLIENT", 0),
    "mobile": _value("DEAL_REASON_MOBILE", 1),
    "web": _value("DEAL_REASON_WEB", 2),
    "expert": _value("DEAL_REASON_EXPERT", 3),
    "sl": _value("DEAL_REASON_SL", 4),
    "tp": _value("DEAL_REASON_TP", 5),
    "so": _value("DEAL_REASON_SO", 6),
    "rollover": _value("DEAL_REASON_ROLLOVER", 7),
    "vmargin": _value("DEAL_REASON_VMARGIN", 8),
    "split": _value("DEAL_REASON_SPLIT", 9),
}
DEAL_REASON_NAMES = _reverse("", DEAL_REASONS)

# ─── Symbol calc modes ───────────────────────────────────────────────

SYMBOL_CALC_MODES = {
    "forex": _value("SYMBOL_CALC_MODE_FOREX", 0),
    "futures": _value("SYMBOL_CALC_MODE_FUTURES", 1),
    "cfd": _value("SYMBOL_CALC_MODE_CFD", 2),
    "cfdindex": _value("SYMBOL_CALC_MODE_CFDINDEX", 3),
    "cfdleverage": _value("SYMBOL_CALC_MODE_CFDLEVERAGE", 4),
    "forex_no_leverage": _value("SYMBOL_CALC_MODE_FOREX_NO_LEVERAGE", 5),
    "exch_stocks": _value("SYMBOL_CALC_MODE_EXCH_STOCKS", 32),
    "exch_futures": _value("SYMBOL_CALC_MODE_EXCH_FUTURES", 33),
    "exch_options": _value("SYMBOL_CALC_MODE_EXCH_OPTIONS", 34),
    "exch_options_margin": _value("SYMBOL_CALC_MODE_EXCH_OPTIONS_MARGIN", 36),
    "exch_bonds": _value("SYMBOL_CALC_MODE_EXCH_BONDS", 37),
    "exch_stocks_moex": _value("SYMBOL_CALC_MODE_EXCH_STOCKS_MOEX", 38),
    "exch_bonds_moex": _value("SYMBOL_CALC_MODE_EXCH_BONDS_MOEX", 39),
    "serv_collateral": _value("SYMBOL_CALC_MODE_SERV_COLLATERAL", 64),
}
SYMBOL_CALC_MODE_NAMES = _reverse("", SYMBOL_CALC_MODES)

# ─── Symbol trade execution ──────────────────────────────────────────

SYMBOL_TRADE_EXECUTIONS = {
    "request": _value("SYMBOL_TRADE_EXECUTION_REQUEST", 0),
    "instant": _value("SYMBOL_TRADE_EXECUTION_INSTANT", 1),
    "market": _value("SYMBOL_TRADE_EXECUTION_MARKET", 2),
    "exchange": _value("SYMBOL_TRADE_EXECUTION_EXCHANGE", 3),
}
SYMBOL_TRADE_EXECUTION_NAMES = _reverse("", SYMBOL_TRADE_EXECUTIONS)

# ─── Symbol swap modes ──────────────────────────────────────────────

SYMBOL_SWAP_MODES = {
    "disabled": _value("SYMBOL_SWAP_MODE_DISABLED", 0),
    "points": _value("SYMBOL_SWAP_MODE_POINTS", 1),
    "currency_symbol": _value("SYMBOL_SWAP_MODE_CURRENCY_SYMBOL", 2),
    "currency_margin": _value("SYMBOL_SWAP_MODE_CURRENCY_MARGIN", 3),
    "currency_deposit": _value("SYMBOL_SWAP_MODE_CURRENCY_DEPOSIT", 4),
    "interest_current": _value("SYMBOL_SWAP_MODE_INTEREST_CURRENT", 5),
    "interest_open": _value("SYMBOL_SWAP_MODE_INTEREST_OPEN", 6),
    "reopen_current": _value("SYMBOL_SWAP_MODE_REOPEN_CURRENT", 7),
    "reopen_bid": _value("SYMBOL_SWAP_MODE_REOPEN_BID", 8),
}
SYMBOL_SWAP_MODE_NAMES = _reverse("", SYMBOL_SWAP_MODES)

# ─── Account stopout modes ───────────────────────────────────────────

ACCOUNT_STOPOUT_MODES = {
    "percent": _value("ACCOUNT_STOPOUT_MODE_PERCENT", 0),
    "money": _value("ACCOUNT_STOPOUT_MODE_MONEY", 1),
}
ACCOUNT_STOPOUT_MODE_NAMES = _reverse("", ACCOUNT_STOPOUT_MODES)

# ─── Day of week ─────────────────────────────────────────────────────

DAY_OF_WEEK = {
    "sunday": _value("DAY_OF_WEEK_SUNDAY", 0),
    "monday": _value("DAY_OF_WEEK_MONDAY", 1),
    "tuesday": _value("DAY_OF_WEEK_TUESDAY", 2),
    "wednesday": _value("DAY_OF_WEEK_WEDNESDAY", 3),
    "thursday": _value("DAY_OF_WEEK_THURSDAY", 4),
    "friday": _value("DAY_OF_WEEK_FRIDAY", 5),
    "saturday": _value("DAY_OF_WEEK_SATURDAY", 6),
}
DAY_OF_WEEK_NAMES = _reverse("", DAY_OF_WEEK)

# ─── Tick flags ──────────────────────────────────────────────────────

TICK_FLAGS = {
    "bid": _value("TICK_FLAG_BID", 0x02),
    "ask": _value("TICK_FLAG_ASK", 0x04),
    "last": _value("TICK_FLAG_LAST", 0x08),
    "volume": _value("TICK_FLAG_VOLUME", 0x10),
    "buy": _value("TICK_FLAG_BUY", 0x20),
    "sell": _value("TICK_FLAG_SELL", 0x40),
}
TICK_FLAG_NAMES = _reverse("", TICK_FLAGS)

# ─── Symbol chart modes ─────────────────────────────────────────────

SYMBOL_CHART_MODES = {
    "bid": _value("SYMBOL_CHART_MODE_BID", 0),
    "last": _value("SYMBOL_CHART_MODE_LAST", 1),
}
SYMBOL_CHART_MODE_NAMES = _reverse("", SYMBOL_CHART_MODES)

# ─── Symbol option modes ─────────────────────────────────────────────

SYMBOL_OPTION_MODES = {
    "european": _value("SYMBOL_OPTION_MODE_EUROPEAN", 0),
    "american": _value("SYMBOL_OPTION_MODE_AMERICAN", 1),
}
SYMBOL_OPTION_MODE_NAMES = _reverse("", SYMBOL_OPTION_MODES)

# ─── Symbol option rights ────────────────────────────────────────────

SYMBOL_OPTION_RIGHTS = {
    "call": _value("SYMBOL_OPTION_RIGHT_CALL", 0),
    "put": _value("SYMBOL_OPTION_RIGHT_PUT", 1),
}
SYMBOL_OPTION_RIGHT_NAMES = _reverse("", SYMBOL_OPTION_RIGHTS)

# ─── Symbol orders GTC modes ─────────────────────────────────────────

SYMBOL_ORDERS_GTC_MODES = {
    "gtc": _value("SYMBOL_ORDERS_GTC", 0),
    "daily": _value("SYMBOL_ORDERS_DAILY", 1),
    "daily_no_stops": _value("SYMBOL_ORDERS_DAILY_NO_STOPS", 2),
}
SYMBOL_ORDERS_GTC_MODE_NAMES = _reverse("", SYMBOL_ORDERS_GTC_MODES)

# ─── Function error codes (last_error) ───────────────────────────────

RES_CODES = {
    "ok": _value("RES_S_OK", 1),
    "fail": _value("RES_E_FAIL", -1),
    "invalid_params": _value("RES_E_INVALID_PARAMS", -2),
    "no_memory": _value("RES_E_NO_MEMORY", -3),
    "not_found": _value("RES_E_NOT_FOUND", -4),
    "invalid_version": _value("RES_E_INVALID_VERSION", -5),
    "auth_failed": _value("RES_E_AUTH_FAILED", -6),
    "unsupported": _value("RES_E_UNSUPPORTED", -7),
    "auto_trading_disabled": _value("RES_E_AUTO_TRADING_DISABLED", -8),
    "internal_fail": _value("RES_E_INTERNAL_FAIL", -10000),
    "internal_fail_send": _value("RES_E_INTERNAL_FAIL_SEND", -10001),
    "internal_fail_receive": _value("RES_E_INTERNAL_FAIL_RECEIVE", -10002),
    "internal_fail_init": _value("RES_E_INTERNAL_FAIL_INIT", -10003),
    "internal_fail_connect": _value("RES_E_INTERNAL_FAIL_CONNECT", -10004),
    "internal_fail_timeout": _value("RES_E_INTERNAL_FAIL_TIMEOUT", -10005),
}
RES_CODE_NAMES = _reverse("", RES_CODES)


def all_enums() -> dict:
    """Every enum map, for GET /enums and agent discovery."""
    return {
        "order_types": ORDER_TYPES,
        "trade_actions": TRADE_ACTIONS,
        "filling_modes": FILLING_MODES,
        "order_times": ORDER_TIMES,
        "timeframes": TIMEFRAMES,
        "position_types": POSITION_TYPES,
        "position_reasons": POSITION_REASONS,
        "order_reasons": ORDER_REASONS,
        "deal_types": DEAL_TYPES,
        "deal_entries": DEAL_ENTRIES,
        "deal_reasons": DEAL_REASONS,
        "copy_ticks_flags": COPY_TICKS_FLAGS,
        "book_sides": BOOK_SIDES,
        "order_states": ORDER_STATES,
        "trade_modes": TRADE_MODES,
        "margin_modes": MARGIN_MODES,
        "symbol_trade_modes": SYMBOL_TRADE_MODES,
        "symbol_calc_modes": SYMBOL_CALC_MODES,
        "symbol_trade_executions": SYMBOL_TRADE_EXECUTIONS,
        "symbol_swap_modes": SYMBOL_SWAP_MODES,
        "account_stopout_modes": ACCOUNT_STOPOUT_MODES,
        "day_of_week": DAY_OF_WEEK,
        "tick_flags": TICK_FLAGS,
        "symbol_chart_modes": SYMBOL_CHART_MODES,
        "symbol_option_modes": SYMBOL_OPTION_MODES,
        "symbol_option_rights": SYMBOL_OPTION_RIGHTS,
        "symbol_orders_gtc_modes": SYMBOL_ORDERS_GTC_MODES,
        "res_codes": RES_CODES,
    }
