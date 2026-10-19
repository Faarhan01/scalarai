"""Spread and minimum stop distance for every Step Index variant.

The numbers that decide whether a strategy is tradeable at all. Measured here
rather than assumed, because they differ per symbol and an assumed value
produces orders the broker silently rejects.
"""
import sys

sys.path.insert(0, r"C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5")

from mt5_pkg_bridge.connection import ConnectionManager  # noqa: E402
from mt5_pkg_bridge.mt5_engine import MT5Engine  # noqa: E402

SYMBOLS = (
    "Step Index", "Step Index 200", "Step Index 300",
    "Step Index 400", "Step Index 500",
    "Skew Step Index 4 Up", "Skew Step Index 5 Up",
)


def main() -> None:
    conn = ConnectionManager()
    conn.connect()
    engine = MT5Engine(conn)
    try:
        print(f"{'symbol':<22}{'digits':>7}{'point':>8}{'tick':>7}"
              f"{'spread(pt)':>12}{'stops_lvl(pt)':>15}{'min stop $':>12}")
        print("-" * 85)
        for name in SYMBOLS:
            try:
                engine.select_symbol(name)
            except Exception as exc:  # noqa: BLE001 - one bad symbol must not stop the table
                print(f"{name:<22}  NOT FOUND ({type(exc).__name__})")
                continue
            i = engine.get_symbol_info(name)
            lvl = i["trade_stops_level"]
            print(f"{name:<22}{i['digits']:>7}{i['point']:>8}"
                  f"{i['trade_tick_size']:>7}{i['spread']:>12}"
                  f"{lvl:>15}{lvl * i['point']:>12.2f}")

        print()
        print("  min stop is in price units. On these indices point=0.1, so a")
        print("  level of 9 means 0.90 -- and the EA's --stop is expressed in")
        print("  pips where 1 pip = point*10 = 1.0 price unit.")
    finally:
        conn.disconnect()


if __name__ == "__main__":
    main()
