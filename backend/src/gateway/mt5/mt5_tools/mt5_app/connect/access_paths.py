"""
Reference for the two access paths. Read this before writing a new tool.

Both end at the same 110 KB binary in site-packages and the same
terminal64.exe. They differ only in what you get back and what happens when
something is wrong.

  PATH A -- engine methods. Dicts, typed errors, reconnect, symbol tolerance.
  PATH B -- raw module. Numpy arrays, no conversion cost.
  PATH C -- raw.session(). Numpy arrays AND a loud failure. This is the one
            to prefer when you want raw.

Why Path C exists
----------------
Path B's failure mode is silent. `mt5.symbol_info('step index')` returns
None because the name is wrong, and `mt5.symbol_info('Step Index')` returns
None because the call failed -- identical results, and `last_error()` only
describes the most recent call, so the evidence is gone by the time you look.
Path A raises instead, but converts to dicts, which you do not want for
90,000 rows.

Run this file to see all three behave correctly.
"""
import sys

sys.path.insert(0, r"C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5")

from mt5_pkg_bridge.connection import ConnectionManager
from mt5_pkg_bridge.errors import SymbolNotFoundError
from mt5_pkg_bridge.mt5_engine import MT5Engine
from mt5_pkg_bridge.raw import RawError, session


def path_a_dicts():
    """Safe, JSON-ready, one dict per bar. Best for anything user-facing."""
    conn = ConnectionManager()
    conn.connect()
    try:
        engine = MT5Engine(conn)
        bars = engine.copy_rates_from_pos("step index", 1, 0, 5)
        return f"{type(bars).__name__}[{type(bars[0]).__name__}] " \
               f"last close {bars[-1]['close']}"
    finally:
        conn.disconnect()


def path_b_raw_quiet():
    """Raw numpy. Fast. Fails silently -- note it returns None, no exception."""
    import MetaTrader5 as mt5

    mt5.initialize()
    try:
        bars = mt5.copy_rates_from_pos("step index", 1, 0, 5)
        return f"{type(bars).__name__}  (the wrong-case name gave {bars!r})"
    finally:
        mt5.shutdown()


def path_c_raw_loud():
    """Raw numpy, and a None becomes an exception naming the call."""
    with session() as raw:
        bars = raw.bars("step index", raw.TIMEFRAME_M1, 5)
        return f"{type(bars).__name__}  last close {bars['close'][-1]}"


def failures():
    """The same mistake, three ways."""
    out = []

    # A -- typed, names the symbol.
    with session() as raw:
        try:
            raw.symbol_info("NOT_A_SYMBOL")
        except SymbolNotFoundError as exc:
            out.append(f"A  SymbolNotFoundError : {exc}")

        # C -- RawError, explains the likely causes.
        try:
            raw.check(None, "copy_rates_from_pos('Step Index', 1, 0, 99999)")
        except RawError as exc:
            out.append(f"C  RawError            : {str(exc)[:78]}...")

    # B -- silence. This is the whole reason Path C exists.
    import MetaTrader5 as mt5
    mt5.initialize()
    try:
        result = mt5.symbol_info("NOT_A_SYMBOL")
        out.append(f"B  returned {result!r} with no exception and no reason")
    finally:
        mt5.shutdown()

    return out


if __name__ == "__main__":
    print("=== the same request three ways ===")
    for label, fn in (("A  engine  ", path_a_dicts),
                      ("B  raw     ", path_b_raw_quiet),
                      ("C  raw sess", path_c_raw_loud)):
        print(f"  {label}  {fn()}")

    print("\n=== the same failure three ways ===")
    for line in failures():
        print(f"  {line}")