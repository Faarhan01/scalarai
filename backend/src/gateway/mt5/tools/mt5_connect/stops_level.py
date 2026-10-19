"""Why were 34,476 Step Index entries rejected with retcode 10016?

Checks SYMBOL_TRADE_STOPS_LEVEL against the stop distance the EA asks for,
and derives the smallest tradeable take-profit/stop pair.

Reached through mt5_pkg_bridge rather than the raw MetaTrader5 package, so a
terminal restart mid-run reconnects instead of silently returning None and
printing a table that reads as "this symbol does not exist".
"""
import sys

# mt5_pkg_bridge lives at backend/mt5/mt5_pkg_bridge. Putting it on sys.path
# keeps this runnable as a plain script from any working directory -- no
# server, no install step, no PYTHONPATH to set by hand.
sys.path.insert(0, r"C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5")

from mt5_pkg_bridge.connection import ConnectionManager  # noqa: E402
from mt5_pkg_bridge.mt5_engine import MT5Engine  # noqa: E402


def main() -> None:
    conn = ConnectionManager()
    conn.connect()
    engine = MT5Engine(conn)
    try:
        s = "Step Index 200"
        engine.select_symbol(s)
        info = engine.get_symbol_info(s)

        stops = info["trade_stops_level"]
        print(f"digits                    : {info['digits']}")
        print(f"point                     : {info['point']}")
        print(f"trade_tick_size           : {info['trade_tick_size']}")
        print(f"spread                    : {info['spread']} points"
              f" = {info['spread'] * info['point']:.2f} price units")
        print(f"SYMBOL_TRADE_STOPS_LEVEL  : {stops} points")
        print(f"  minimum stop distance    = {stops * info['point']:.2f}"
              f" price units ({stops / 10:.1f} pips)")
        print(f"min lot {info['volume_min']}, step {info['volume_step']},"
              f" freeze {info['trade_freeze_level']}")

        print()
        print("  InpStopPips -> points    verdict")
        for pips in (0.5, 1.0, 1.05, 1.1, 1.2, 1.5, 2.0, 3.0):
            pts = pips * 10
            ok = "OK" if pts >= stops else "REJECTED retcode=10016"
            print(f"  {pips:>5}      -> {pts:>6.1f}      {ok}")

        print()
        minpips = stops / 10
        # One spread per round trip, not two: buy lifts the ask, sell hits the
        # bid, and the difference between those prints IS the spread.
        cost = info["spread"] * info["point"]
        print(f"smallest usable stop       : {minpips:.2f} pips")
        print(f"round-trip cost            : {cost:.2f} price units")
        print(f"cost as % of a {minpips:.2f}-pip stop : "
              f"{cost / (minpips * info['point']) * 100:.1f}%")
        print()
        print("stepindex.md specifies TP/SL of 10 'points' = 1.0 price units on")
        print("this symbol. That is BELOW the broker's minimum stop distance, so")
        print("MT5 rejects every order with 10016. The in-process engine used to")
        print("produce that document does not enforce stops level, so the result")
        print("was never tradeable.")
    finally:
        conn.disconnect()


if __name__ == "__main__":
    main()
