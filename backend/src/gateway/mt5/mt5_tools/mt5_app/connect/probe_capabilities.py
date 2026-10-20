"""Capability probe: what can be read out of MT5 from Python, and by what route.

Read-only. It places no orders and writes nothing.

Run it after an MT5 upgrade or a package update to find out what still works.
The interesting output is usually the FAIL lines: this build has
`copy_ticks_from` and `copy_rates_from` returning -2 / None on some symbols
while `copy_rates_range` and `copy_ticks_range` work, and that is not
discoverable without asking.

Reached through mt5_pkg_bridge. Note the difference that matters: the bridge
returns dicts and raises typed errors, so a missing symbol reads as
SymbolNotFoundError rather than as a None that looks like empty data.
"""
import datetime as dt
import sys
import time

sys.path.insert(0, r"C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5")

from mt5_pkg_bridge.connection import ConnectionManager  # noqa: E402
from mt5_pkg_bridge.mt5_engine import MT5Engine  # noqa: E402

SYMBOL = "Step Index"


def hdr(t: str) -> None:
    print(f"\n{'=' * 66}\n{t}\n{'=' * 66}")


def attempt(label, fn):
    """Run fn, print OK/FAIL with the value or the error. Never raises."""
    try:
        value = fn()
    except Exception as exc:  # noqa: BLE001 - a probe must survive anything
        print(f"  FAIL  {label:<34} {type(exc).__name__}: {str(exc)[:44]}")
        return None
    text = f"{len(value)} rows" if isinstance(value, list) else str(value)[:44]
    print(f"  ok    {label:<34} {text}")
    return value


def main() -> None:
    conn = ConnectionManager()
    info = conn.connect()
    engine = MT5Engine(conn)
    now = dt.datetime.now(dt.timezone.utc)

    try:
        hdr("1. CONNECT")
        print(f"  package            : {engine.package_version()}")
        print(f"  terminal           : build {info['terminal']['build']}"
              f" {info['terminal']['name']}")
        print(f"  connected          : {info['connected']}")
        acc = info["account"]
        print(f"  account            : {acc['login']} {acc['server']}"
              f" ({acc['trade_mode']})")

        hdr("2. SYMBOL")
        engine.select_symbol(SYMBOL)
        i = engine.get_symbol_info(SYMBOL)
        for k in ("digits", "point", "trade_tick_size", "trade_tick_value",
                  "spread", "trade_stops_level", "trade_freeze_level",
                  "volume_min", "volume_step"):
            print(f"  {k:<20}: {i[k]}")

        hdr("3. BAR HISTORY (the 'chart')")
        from mt5_pkg_bridge import enums as sf_enums  # noqa: E402
        tf = sf_enums.TIMEFRAMES["M1"]
        for days in (1, 7, 30, 62, 120):
            attempt(f"copy_rates_range last {days}d",
                    lambda d=days: engine.copy_rates_range(
                        SYMBOL, tf, now - dt.timedelta(days=d), now))

        hdr("4. TICK HISTORY")
        attempt("copy_ticks_range 2d (COPY_TICKS_ALL)",
                lambda: engine.copy_ticks_range(
                    SYMBOL, now - dt.timedelta(days=2), now))
        attempt("copy_ticks_from 2d (known-broken on some builds)",
                lambda: engine.copy_ticks_from(
                    SYMBOL, now - dt.timedelta(days=2), 2000))
        attempt("get_all_ticks", lambda: engine.get_all_ticks([SYMBOL]))

        hdr("5. LIVE TICKS (poll for 20s)")
        window = now - dt.timedelta(hours=2)
        baseline = engine.copy_ticks_range(SYMBOL, window, now)
        seen = {(int(t["time"]), float(t["bid"]), float(t["ask"]))
                for t in (baseline or [])}
        print(f"  baseline           : {len(seen)} distinct ticks")
        arrivals = 0
        bid = ask = None
        t0 = time.time()
        while time.time() - t0 < 20:
            n = engine.copy_ticks_range(SYMBOL, window, dt.datetime.now(dt.timezone.utc))
            for t in (n or []):
                key = (int(t["time"]), float(t["bid"]), float(t["ask"]))
                if key not in seen:
                    seen.add(key)
                    arrivals += 1
                    bid, ask = key[1], key[2]
            time.sleep(0.5)
        print(f"  NEW ticks in 20s   : {arrivals}   last bid/ask {bid} / {ask}")

        hdr("6. ACCOUNT STATE")
        attempt("get_account_info", engine.get_account_info)
        attempt("get_positions", engine.get_positions)
        attempt("get_orders", engine.get_orders)
        attempt("get_totals", engine.get_totals)
        attempt("history_deals_total 30d",
                lambda: engine.history_deals_total(
                    now - dt.timedelta(days=30), now))

        hdr("7. ROUTES NOT TAKEN")
        print("  This tool places no orders and holds no positions.")
        print("  Order routing goes through engine.check_order first, and")
        print("  engine.mt5 / choose_filling_mode picks a mode the broker")
        print("  accepts -- 'Step Index' declares FOK only, and IOC returns")
        print("  retcode 10030 Unsupported filling mode.")
    finally:
        conn.disconnect()


if __name__ == "__main__":
    main()
