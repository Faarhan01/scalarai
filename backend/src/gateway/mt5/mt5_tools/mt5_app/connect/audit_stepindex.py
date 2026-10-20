"""
Independent statistical audit of Step Index 200, from MT5's own history.

The stepindex.md document concludes the instrument has no exploitable
structure. That conclusion is load-bearing, so it gets re-tested here rather
than inherited -- especially since it was produced by the in-app engine, whose
fill model is documented as optimistic.

Method notes that matter:
  * Everything is computed on DIFFERENCES. Correlating price levels across
    independent random walks produces large spurious correlations (the doc
    records -0.8620 between Index and Index 200, entirely fake).
  * Tick granularity matters here: spread is one price step, so the question is
    whether direction is predictable at the precision that can be traded.
  * Autocorrelation is reported with its own standard error, not raw.
"""
from __future__ import annotations

import math
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import numpy as np

import MetaTrader5 as mt5

SYMBOL = sys.argv[1] if len(sys.argv) > 1 else "Step Index 200"
DAYS = int(sys.argv[2]) if len(sys.argv) > 2 else 400


def zscore(x: np.ndarray) -> float:
    n = len(x)
    if n < 3:
        return float("nan")
    sd = x.std(ddof=1)
    return float(x.mean() / (sd / math.sqrt(n))) if sd > 0 else 0.0


def autocorr(x: np.ndarray, lag: int) -> tuple[float, float]:
    """Pearson correlation of x[t] with x[t+lag], plus its z-statistic."""
    a, b = x[:-lag], x[lag:]
    if len(a) < 10:
        return float("nan"), float("nan")
    r = float(np.corrcoef(a, b)[0, 1])
    se = 1.0 / math.sqrt(len(a))
    return r, r / se if se > 0 else float("nan")


def runs_test(d: np.ndarray) -> tuple[int, float]:
    """Wald-Wolfowitz runs test on the sign sequence. z<1.96 => random."""
    signs = np.sign(d)
    signs = signs[signs != 0]
    n_pos, n_neg = int((signs > 0).sum()), int((signs < 0).sum())
    runs = 1 + int((np.diff(signs) != 0).sum())
    n = n_pos + n_neg
    if n == 0:
        return runs, float("nan")
    exp = 2 * n_pos * n_neg / n + 1
    var = (2 * n_pos * n_neg * (2 * n_pos * n_neg - n)) / (n * n * (n - 1))
    z = (runs - exp) / math.sqrt(var) if var > 0 else float("nan")
    return runs, z


def variance_ratio(d: np.ndarray, q: int) -> float:
    """Lo-MacKinlay VR(q). 1 => random walk; >>1 trend; <1 mean reversion."""
    n = len(d)
    mu = d.mean()
    agg = d[: (n // q) * q].reshape(-1, q).sum(axis=1) - q * mu
    lo = np.var(d[: (n // q) * q], ddof=1)
    hi = np.var(agg, ddof=1)
    return float(hi / (q * lo)) if lo > 0 else float("nan")


if not mt5.initialize():
    raise SystemExit(f"mt5.initialize failed: {mt5.last_error()}")

info = mt5.symbol_info(SYMBOL)
if info is None:
    raise SystemExit(f"symbol not found: {SYMBOL}")
mt5.symbol_select(SYMBOL, True)

# copy_rates_range rejects naive datetimes with "Invalid params"; it requires
# timezone-aware UTC.
utc = lambda t: t.replace(tzinfo=timezone.utc)
frm = utc(datetime.utcnow() - timedelta(days=DAYS))
to = utc(datetime.utcnow())
rates = mt5.copy_rates_range(SYMBOL, mt5.TIMEFRAME_M1, frm, to)
if rates is None or len(rates) == 0:
    raise SystemExit(f"no M1 data: {mt5.last_error()}")

o = np.array([r["open"] for r in rates], dtype=float)
h = np.array([r["high"] for r in rates], dtype=float)
lo = np.array([r["low"] for r in rates], dtype=float)
c = np.array([r["close"] for r in rates], dtype=float)
spread = np.array([r["spread"] for r in rates], dtype=float)
vol = np.array([r["tick_volume"] for r in rates], dtype=float)
ts = np.array([r["time"] for r in rates], dtype=np.int64)

d = np.diff(c)                       # step changes, in price steps
gaps = np.diff(ts)
gaps = gaps[gaps > 0]

print(f"=== {SYMBOL} ===")
print(f"  bars           : {len(c):,} M1  ({datetime.utcfromtimestamp(int(ts[0]))} .. "
      f"{datetime.utcfromtimestamp(int(ts[-1]))})")
print(f"  digits         : {info.digits}   point: {info.point}   "
      f"spread: {np.median(spread):.0f} (median of {len(spread):,})")
print(f"  contract size  : {info.trade_contract_size}   min lot {info.volume_min}  step {info.volume_step}")
print(f"  price range    : {c.min():.1f} .. {c.max():.1f}")
print(f"  bar continuity : {len(gaps):,} gaps, min {gaps.min()}s, "
      f"missing minutes: {int((gaps > 60).sum()):,}")

n = len(d)
up = int((d > 0).sum())
print(f"\n--- 1. Direction ---")
print(f"  P(up)          : {up / n:.4f}   (n={n:,})")
print(f"  z              : {zscore(d):+.3f}   |z|>1.96 would be a bias")

print(f"\n--- 2. Random-walk tests ---")
runs, rz = runs_test(d)
print(f"  runs test z    : {rz:+.3f}   ({runs:,} runs)  |z|<1.96 => consistent with random")
vr2, vr5, vr10, vr60 = (variance_ratio(d, q) for q in (2, 5, 10, 60))
print(f"  variance ratio : VR(2)={vr2:.3f}  VR(5)={vr5:.3f}  VR(10)={vr10:.3f}  VR(60)={vr60:.3f}")
print(f"                   1.0 => random walk")

print(f"\n--- 3. Autocorrelation of changes (|z|>3 would be exploitable) ---")
worst = []
for lag in range(1, 61):
    r, z = autocorr(d, lag)
    if not math.isnan(z):
        worst.append((abs(z), lag, r, z))
worst.sort(reverse=True)
print(f"  {'lag':>4}{'r':>10}{'z':>9}")
for _, lag, r, z in worst[:6]:
    print(f"  {lag:>4}{r:>10.5f}{z:>9.3f}")
print(f"  max |z| over lags 1-60: {worst[0][3]:+.3f}")

print(f"\n--- 4. Volatility clustering ---")
absd = np.abs(d)
by_hour: dict[int, list[float]] = defaultdict(list)
for i, t in enumerate(ts[1:]):
    by_hour[datetime.utcfromtimestamp(int(t)).hour].append(absd[i])

print(f"  {'hour':>5}{'mean|d|':>10}{'n':>9}{'t-vs-rest':>11}")
means = {hh: float(np.mean(v)) for hh, v in by_hour.items() if len(v) > 30}
overall = float(np.mean(absd))
for hh in sorted(means, key=lambda k: means[k])[:2] + sorted(means, key=lambda k: means[k])[-2:]:
    rest = np.array([x for k, v in by_hour.items() if k != hh for x in v])
    grp = np.array(by_hour[hh])
    se = rest.std(ddof=1) / math.sqrt(len(grp))
    t = (grp.mean() - rest.mean()) / se if se > 0 else 0.0
    print(f"  {hh:>5}{means[hh]:>10.3f}{len(grp):>9}{t:>11.2f}")
print(f"  overall mean |d| = {overall:.3f} steps;  ratio max/min = "
      f"{max(means.values()) / min(means.values()):.2f}x")

# Volatility autocorrelation: is |d| clustered in time?
print(f"\n  autocorrelation of |change| (clustering check):")
for lag in (1, 5, 10, 60):
    r, z = autocorr(absd, lag)
    print(f"    lag {lag:>3}: r={r:>8.4f}  z={z:>7.2f}")

print(f"\n--- 5. Mean reversion after large moves ---")
big = np.abs(d) >= np.percentile(np.abs(d), 90)
fwd = np.array([d[i:i + 10].mean() if i + 10 < n else np.nan for i in range(0, n, 1)])
idx = np.where(big)[0]
post = fwd[idx]
post = post[~np.isnan(post)]
print(f"  after a top-10% move, mean next-10-bar change: {post.mean():+.5f} steps "
      f"(n={len(post):,}), z={zscore(post):+.2f}")
print(f"  if this were real mean reversion |z| would exceed 2")

print(f"\n--- 6. What a naive rule must beat ---")
step_value = info.trade_contract_size * info.point
spread_steps = float(np.median(spread))
print(f"  spread              : {spread_steps:.1f} price steps = {spread_steps * info.point:.4f} price units")
print(f"  a 10-step TP / 10-step SL rule pays {spread_steps:.1f} steps of cost per side")
print(f"  -> needs >{50 + spread_steps / 2 * 0:.0f}% win rate just to break even; "
      f"P(up) here is {up / n * 100:.2f}%")
print(f"  mean |change| = {absd.mean():.3f} steps, so a 10-step move is "
      f"{10 / absd.mean():.1f}x the average bar")

mt5.shutdown()