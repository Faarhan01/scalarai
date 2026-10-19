"""
mt5_pkg_bridge — Raw Access
===========================
The raw MetaTrader5 module, with the raw module's one real hazard removed.

The problem
-----------
The package fails quietly. Every one of these returns `None` with no
explanation:

    mt5.symbol_info('step index')          # wrong case -> None
    mt5.symbol_info('NOT_A_SYMBOL')        # unknown    -> None
    mt5.copy_rates_from('Step Index', ...) # bug on this build -> None

The only diagnostic is `mt5.last_error()`, which reports the *most recent*
call. By the time you read it, the failing call has scrolled off. So a bad
symbol name and a genuinely empty result look identical, and both look like
"no data".

The bridge's methods solve that by raising typed errors, but they return plain
dicts, which is the wrong shape for numeric work -- converting a 90,000-row
structured array to 90,000 dicts costs real time and memory, and you only
wanted `.close` to compute a mean.

This module is the middle: raw numpy arrays, but a silent `None` becomes an
exception that names the call.

Use
---
    from mt5_pkg_bridge.raw import session, bars

    with session() as raw:
        arr = bars('Step Index', raw.TIMEFRAME_M1, 5000)
        print(arr['close'].mean())        # numpy, no dict conversion

    # or, when you already have an engine and want the module off it:
    engine.mt5.copy_rates_from_pos(...)   # same thing, unguarded

`engine.mt5` is the raw module by definition and needs no helper. What this
module adds is the connection handling and the failure checking around it.
"""

from contextlib import contextmanager
from typing import Any, Optional

from .connection import ConnectionManager
from .enums import timeframe_seconds
from .errors import MT5ConnectionError, MT5Error


class RawError(MT5Error):
    """A raw package call returned None. The package does not say why."""


class Raw:
    """
    A live, connected handle on the raw MetaTrader5 module.

    Attributes
    ----------
    mt5:
        The raw module. Everything the package offers, unchanged.
    conn / engine:
        The bridge objects underneath, if you want to drop into them.
    """

    def __init__(self, mt5, conn: ConnectionManager, engine):
        self.mt5 = mt5
        self.conn = conn
        self.engine = engine

    # The timeframe constants, hoisted so callers need not import the package.
    TIMEFRAME_M1 = 1
    TIMEFRAME_M2 = 2
    TIMEFRAME_M3 = 3
    TIMEFRAME_M4 = 4
    TIMEFRAME_M5 = 5
    TIMEFRAME_M6 = 6
    TIMEFRAME_M10 = 10
    TIMEFRAME_M12 = 12
    TIMEFRAME_M15 = 15
    TIMEFRAME_M20 = 20
    TIMEFRAME_M30 = 30
    TIMEFRAME_H1 = 16385
    TIMEFRAME_H2 = 16386
    TIMEFRAME_H3 = 16387
    TIMEFRAME_H4 = 16388
    TIMEFRAME_D1 = 16408
    TIMEFRAME_W1 = 32769
    TIMEFRAME_MN1 = 49153

    def __repr__(self) -> str:
        return f"<Raw {self.mt5.__version__} connected={self.conn.is_connected}>"

    # ── failure checking ───────────────────────────────────────────────

    def check(self, value: Any, what: str) -> Any:
        """
        Return `value`, or raise RawError if it is None.

        None from this package always means the call did not happen, never
        that the answer was empty -- an empty range comes back as an empty
        array, not None. So None is safe to treat as a hard failure.
        """
        if value is None:
            code, desc = self.mt5.last_error()
            raise RawError(
                f"{what} returned None. last_error()=({code}, {desc!r}). "
                f"Common causes on this build: copy_rates_from and "
                f"copy_ticks_from without an explicit `flags` argument, a "
                f"symbol not in MarketWatch, or a range larger than the "
                f"terminal will serve."
            )
        return value

    def check_len(self, value: Any, what: str) -> Any:
        """As `check`, and additionally reject an empty result."""
        self.check(value, what)
        if len(value) == 0:
            raise RawError(f"{what} returned {len(value)} rows -- no data in range.")
        return value

    # ── the calls our tools actually make ──────────────────────────────

    def bars(self, symbol: str, timeframe: int, count: int, **kwargs):
        """
        The most recent `count` bars as a numpy structured array.

        Uses copy_rates_from_pos, which works on this build, rather than
        copy_rates_from, which does not without explicit flags.
        """
        name = self.engine.resolve_symbol(symbol)
        self.engine.select_symbol(name)
        arr = self.check(
            self.mt5.copy_rates_from_pos(name, timeframe, 0, count, **kwargs),
            f"copy_rates_from_pos({name!r}, {timeframe}, 0, {count})",
        )
        return arr

    def ticks(self, symbol: str, seconds_back: int, flags: Optional[int] = None):
        """Ticks over the last `seconds_back` seconds, as a numpy array."""
        from datetime import datetime, timedelta, timezone

        name = self.engine.resolve_symbol(symbol)
        self.engine.select_symbol(name)
        to = datetime.now(timezone.utc)
        frm = to - timedelta(seconds=seconds_back)
        if flags is None:
            # 2 == COPY_TICKS_ALL. Without it the range call returns nothing.
            flags = 2
        return self.check(
            self.mt5.copy_ticks_range(name, frm, to, flags),
            f"copy_ticks_range({name!r}, last {seconds_back}s, flags={flags})",
        )

    def symbol_info(self, symbol: str):
        """Symbol spec as the raw namedtuple, raising if the name is wrong."""
        name = self.engine.resolve_symbol(symbol)
        return self.check(self.mt5.symbol_info(name), f"symbol_info({name!r})")

    def account(self):
        return self.check(self.mt5.account_info(), "account_info()")

    def terminal(self):
        return self.check(self.mt5.terminal_info(), "terminal_info()")


@contextmanager
def session():
    """
    Connect, yield a `Raw`, and always disconnect.

        with session() as raw:
            arr = raw.bars('Step Index', raw.TIMEFRAME_H1, 1000)
    """
    # Imported here rather than at module scope: mt5_engine imports api_manager,
    # which imports this module, so a top-level import would be circular.
    from .mt5_engine import MT5Engine

    conn = ConnectionManager()
    conn.connect()
    engine = MT5Engine(conn)
    try:
        yield Raw(conn.mt5, conn, engine)
    finally:
        conn.disconnect()