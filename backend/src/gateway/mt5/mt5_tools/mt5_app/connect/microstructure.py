"""
Microstructure of Step Index 200: how does it actually move?

The stepindex.md document states the spread is 0.2 and calls that "exactly one
price step". With digits=1 the minimum price increment is 0.1, so a 0.2 spread
is TWO ticks, not one. That halves the profitable distance and is worth pinning
down before any strategy is designed.

This reads actual ticks rather than M1 bars, because at this granularity the
bar hides the order flow that decides whether anything is tradeable.
"""
from __future__ import annotations

import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

import numpy as np

import MetaTrader5 as mt5

SYMBOL = sys.argv[1] if len(sys.argv) > 1 else "Step Index 200"
HOURS = int(sys.argv[2]) if len(sys.argv) > 2 else 12

if not mt5.initialize():
    raise SystemExit(f"init failed: {mt5.last_error()}")
info = mt5.symbol_info(SYMBOL)
mt5.symbol_select(SYMBOL, True)

utc = lambda t: t.replace(tzinfo=timezone.utc)
# copy_ticks_range fails with "Invalid arguments" for this symbol on this
# build, while copy_ticks_from_pos works, so page backwards by position.
N_TICKS = 400000
ticks = mt5.copy_ticks_from(SYMBOL, mt5.TIMEFRAME_M1, 0, N_TICKS)
if ticks is None or len(ticks) == 0:
    raise SystemExit(f"no ticks: {mt5.last_error()}")

bid = np.array([t["bid"] for t in ticks])
ask = np.array([t["ask"] for t in ticks])
ts = np.array([t["time_msc"] for t in ticks])

print(f"=== {SYMBOL} microstructure ===")
print(f"  ticks            : {len(ticks):,}")
span_h = (ts[-1] - ts[0]) / 3_600_000
print(f"  window           : {datetime.utcfromtimestamp(int(ts[0] / 1000))} .. "
      f"{datetime.utcfromtimestamp(int(ts[-1] / 1000))}  ({span_h:.1f}h)")
print(f"  digits/point     : {info.digits} / {info.point}")
print(f"  tick size        : {info.trade_tick_size}  (one price step)")

# --- the cost question ----------------------------------------------------
spread = ask - bid
print(f"\n--- spread (this is the number that decides feasibility) ---")
print(f"  bid-ask spread   : min {spread.min():.2f}  median {np.median(spread):.2f}  "
      f"mean {spread.mean():.2f}  max {spread.max():.2f}")
print(f"  in TICK steps    : {np.median(spread) / info.trade_tick_size:.2f}x")
print(f"  distinct values  : {sorted(set(np.round(spread, 4)))}")
cnt = Counter(np.round(spread, 4))
for v, n in cnt.most_common(6):
    print(f"    spread {v:<6} : {n:>9,} ticks ({n / len(spread) * 100:.2f}%)")

# --- how big is a move relative to the cost? -----------------------------
mid = (bid + ask) / 2
d = np.diff(mid)
absd = np.abs(d)
nz = absd[absd > 0]

print(f"\n--- move sizes, in tick steps ---")
print(f"  mean |move|      : {absd.mean() / info.trade_tick_size:.3f} ticks")
print(f"  median |move|    : {np.median(nz) / info.trade_tick_size:.2f} ticks")
print(f"  90th pct |move|  : {np.percentile(nz, 90) / info.trade_tick_size:.2f} ticks")
print(f"  max |move|       : {absd.max() / info.trade_tick_size:.1f} ticks")
print(f"  cost per round trip (entry+exit, 1 tick each side): "
      f"{2 * np.median(spread) / info.trade_tick_size:.2f} ticks")

hist = Counter((np.round(absd / info.trade_tick_size, 2)))
print(f"\n  |move| distribution (ticks -> share of all changes):")
for v, n in sorted(hist.items())[:10]:
    print(f"    {v:>5} : {n / len(absd) * 100:6.2f}%")

frac = (absd > np.median(spread)).mean()
print(f"\n  share of moves LARGER than one spread: {frac * 100:.1f}%")

# --- the real question: can direction be predicted at all? ---------------
print(f"\n--- predictability of the next move, from tick-level imbalance ---")
# Mid-price direction is the only thing observable; test persistence.
sgn = np.sign(d)
sgn = sgn[sgn != 0]
same = (sgn[1:] == sgn[:-1]).mean()
print(f"  P(next move = same direction as last) : {same:.4f}  (0.5 = random)")
n = len(sgn) - 1
se = (0.25 / n) ** 0.5
print(f"  z                                  : {(same - 0.5) / se:+.3f}")

# Tick-count imbalance: did the buyer or seller lift the price more often?
upt = int((sgn > 0).sum())
print(f"  up-ticks {upt:,} / down-ticks {n - upt:,}  -> P(up) = {upt / n:.4f}")

print(f"\n--- what a rule must clear ---")
cost = 2 * np.median(spread) / info.trade_tick_size
print(f"  round-trip cost  : {cost:.1f} ticks")
for tp in (5, 10, 20, 50):
    print(f"  TP {tp:>3} ticks, SL {tp:>3} ticks -> breakeven win rate "
          f"{tp / (2 * tp + cost) * 100:.1f}%")
print(f"  observed P(up)   : {upt / n * 100:.2f}%")
print(f"  => a symmetric TP/SL rule needs better than "
      f"{tp / (2 * tp + cost) * 100:.0f}%; the instrument offers "
      f"{upt / n * 100:.1f}%")

mt5.shutdown()