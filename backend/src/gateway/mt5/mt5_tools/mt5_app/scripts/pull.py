"""Step Index history pull. Start small, one request per timeframe.

Deliberately one request per timeframe with a realistic count. The earlier
attempts binary-searched the bar limit and asked for 100k bars at a time,
which the terminal either refuses or takes forever -- hence the aborted runs.
"""
import sys
import pathlib

sys.path.insert(0, r"C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\src\gateway\mt5")

from datetime import datetime, timezone
from mt5_pkg_bridge.connection import ConnectionManager
from mt5_pkg_bridge.mt5_engine import MT5Engine

TF = {"M1": 1, "M5": 5, "M15": 15, "M30": 30,
      "H1": 16385, "H4": 16388, "D1": 16408}

# Bars needed for a given span, at that timeframe's spacing.
DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 5

HERE = pathlib.Path(__file__).resolve().parent
STORE = HERE / "data" / f"data_{DAYS}d"
STORE.mkdir(parents=True, exist_ok=True)

c = ConnectionManager()
c.connect()
e = MT5Engine(c)
e.select_symbol("Step Index")

print(f"asking for {DAYS} days of Step Index\n")
print(f"{'TF':<5}{'bars':>8}{'first':>13}{'last':>13}{'days':>6}")
print("-" * 46)

for name, tf in TF.items():
    minutes = {"M1": 1, "M5": 5, "M15": 15, "M30": 30,
               "H1": 60, "H4": 240, "D1": 1440}[name]
    want = int(DAYS * 1440 / minutes)
    want = min(want, 60000)          # the ceiling the terminal tolerates

    try:
        rows = e.copy_rates_from_pos("Step Index", tf, 0, want) or []
    except Exception as exc:
        print(f"{name:<5} ERROR {type(exc).__name__}: {str(exc)[:40]}")
        continue
    if not rows:
        print(f"{name:<5} no bars returned")
        continue

    with (STORE / f"{name}.csv").open("w", encoding="utf-8") as fh:
        fh.write("time,open,high,low,close,tick_volume,spread\n")
        for r in rows:
            fh.write(f"{r['time']},{r['open']},{r['high']},{r['low']},"
                     f"{r['close']},{r['tick_volume']},{r['spread']}\n")

    first = datetime.fromtimestamp(rows[0]["time"], timezone.utc)
    last = datetime.fromtimestamp(rows[-1]["time"], timezone.utc)
    span = (last - first).days
    flag = "  full" if span >= DAYS - 1 else f"  SHORT of {DAYS}"
    print(f"{name:<5}{len(rows):>8,}{first:%Y-%m-%d %H:%M}{last:%m-%d %H:%M}"
          f"{span:>6}{flag}")

c.disconnect()
print(f"\nsaved -> {STORE}")