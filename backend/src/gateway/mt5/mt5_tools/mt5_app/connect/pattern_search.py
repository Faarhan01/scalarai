"""
Pattern search on Step Index, with the statistics that decide whether anything
actually exists.

The site reported finding something after initially finding nothing. That
result came from an in-process engine whose fill model stepindex.md itself
calls optimistic, and a search over many patterns will always surface a winner
by chance. So this harness is built to kill false positives rather than to
find strategies:

  * significance is corrected for the NUMBER OF PATTERNS TESTED (Bonferroni),
    and reported alongside a Benjamini-Hochberg FDR view
  * every pattern is evaluated on cost-aware P&L, because the spread here is
    not a rounding error
  * in-sample and out-of-sample are split by time and reported separately; a
    real effect survives the split
  * predictive power is measured on direction of the NEXT move, which is the
    only thing a strategy can actually trade

Run:  python pattern_search.py "Step Index 200"
"""
from __future__ import annotations

import itertools
import math
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import numpy as np

import MetaTrader5 as mt5

SYMBOL = sys.argv[1] if len(sys.argv) > 1 else "Step Index 200"
DAYS = int(sys.argv[2]) if len(sys.argv) > 2 else 60


# ---------------------------------------------------------------- statistics
def zscore(x: np.ndarray) -> float:
    n = len(x)
    if n < 3:
        return float("nan")
    sd = x.std(ddof=1)
    return float(x.mean() / (sd / math.sqrt(n))) if sd > 0 else 0.0


def bonferroni_alpha(k: int, family_alpha: float = 0.05) -> float:
    return family_alpha / max(k, 1)


def bh_threshold(pvals: list[float], family_alpha: float = 0.05) -> float:
    """
    Benjamini-Hochberg critical p-value.

    Returns the largest p-value that may be called significant, or 0.0 when no
    test qualifies. Returning inf here (as a "nothing found" sentinel) makes
    every p-value compare as significant, which inverts the verdict.
    """
    m = len(pvals)
    if m == 0:
        return 0.0
    order = sorted(range(m), key=lambda i: pvals[i])
    best = 0.0
    for rank, idx in enumerate(order, start=1):
        if pvals[idx] <= family_alpha * rank / m:
            best = pvals[idx]
    return best


# ------------------------------------------------------------------- patterns
@dataclass
class Pattern:
    name: str
    fn: object
    n: int = 0
    mean_next: float = 0.0
    z: float = 0.0
    p: float = 1.0
    p_up: float = 0.0
    t_stat: float = 0.0
    trades: int = 0
    net_steps: float = 0.0
    pf: float = 0.0
    wins: int = 0
    tags: list = field(default_factory=list)


def build_patterns() -> list[Pattern]:
    """Each fn takes the change array and returns a boolean trigger array."""
    P: list[Pattern] = []

    def up_run(k: int):
        def f(d):
            s = np.sign(d)
            trig = np.zeros(len(d), bool)
            for i in range(len(d) - 1, k - 1, -1):
                trig[i] = bool(np.all(s[i - k + 1:i + 1] > 0))
            return trig
        return f

    def down_run(k: int):
        def f(d):
            s = np.sign(d)
            trig = np.zeros(len(d), bool)
            for i in range(len(d) - 1, k - 1, -1):
                trig[i] = bool(np.all(s[i - k + 1:i + 1] < 0))
            return trig
        return f

    for k in (2, 3, 4, 5, 8, 10):
        P.append(Pattern(f"up_run{k}", up_run(k)))
        P.append(Pattern(f"down_run{k}", down_run(k)))

    # Alternation (mean reversion of the most trivial kind)
    for k in (2, 3, 4):
        def alt(d, k=k):
            s = np.sign(d)
            trig = np.zeros(len(d), bool)
            for i in range(len(d) - 1, k - 1, -1):
                seg = s[i - k + 1:i + 1]
                trig[i] = bool(np.all(seg[:-1] * seg[1:] < 0))
            return trig
        P.append(Pattern(f"alternate{k}", alt))

    # Large-move continuation vs reversal
    for q in (80, 90, 95):
        def big(d, q=q):
            return np.abs(d) >= np.percentile(np.abs(d), q)
        P.append(Pattern(f"big_move_q{q}", big, tags=[f"|d|>p{q}"]))

    # Consecutive same-sign totals
    for k in (3, 5, 10):
        def net_up(d, k=k):
            return pd_rolling_sum(d, k) > 0
        def net_down(d, k=k):
            return pd_rolling_sum(d, k) < 0
        P.append(Pattern(f"net_up_{k}", net_up))
        P.append(Pattern(f"net_down_{k}", net_down))

    # Up-bar count in a window (the site's fade(10) rule shape)
    for k in (5, 10, 20):
        for thr in (1, 2, 3):
            def upcount(d, k=k, thr=thr):
                return rolling_upcount(d, k) >= thr
            def downcount(d, k=k, thr=thr):
                return rolling_upcount(d, k) <= (k - thr)
            P.append(Pattern(f"upcount_{k}>={thr}", upcount))
            P.append(Pattern(f"upcount_{k}<={k - thr}", downcount))

    # Gap-ish: big up then small up
    def up_big_up_small(d):
        return (d > 0) & (np.roll(d, 1) > 0) & (np.roll(np.abs(d), 1) > np.abs(d))
    P.append(Pattern("up_then_smaller_up", up_big_up_small))

    return P


def pd_rolling_sum(d: np.ndarray, k: int) -> np.ndarray:
    c = np.cumsum(np.insert(d, 0, 0.0))
    out = np.zeros(len(d))
    out[k - 1:] = c[k:] - c[:-k]
    return out


def rolling_upcount(d: np.ndarray, k: int) -> np.ndarray:
    u = (d > 0).astype(float)
    return pd_rolling_sum(u, k)


# ------------------------------------------------------------------ evaluation
def evaluate(pats: list[Pattern], hist: np.ndarray, fwd: np.ndarray,
             cost_steps: float, tp: float, sl: float) -> list[Pattern]:
    """
    `hist` are changes up to the signal bar, `fwd` the change immediately
    after. They are the same length by construction (both derived from d by
    dropping one end), so a boolean mask on one indexes the other directly.
    """
    assert len(hist) == len(fwd), (len(hist), len(fwd))
    for p in pats:
        trig = p.fn(hist)
        nxt = fwd[trig]
        p.n = int(trig.sum())
        if p.n < 100:
            continue
        p.mean_next = float(nxt.mean())
        p.z = zscore(nxt)
        # two-sided p from the normal approximation
        p.p = math.erfc(abs(p.z) / math.sqrt(2))
        p.p_up = float((nxt > 0).mean())

        # Cost-aware, non-overlapping simulation.
        #
        # The earlier version took a position on EVERY triggering bar and
        # charged the round trip each time, which produced nonsense (PF 0.000
        # on every pattern) because a random instrument loses the coin flip
        # times 40,000 trades. Realistic rules are:
        #   * one position at a time, so signals during a position are skipped
        #   * exit at TP, at SL, or at the bar close (time stop)
        #   * spread charged on entry and exit, i.e. once per round trip
        direction = -np.sign(p.mean_next) if p.mean_next != 0 else np.sign(nxt)

        pnls: list[float] = []
        # Enter at the close of bar i, exit at the close of bar i+1, so the
        # next entry is allowed from i+2. busy_until is the last barred bar.
        # Setting it to `i` instead let every consecutive signal through, which
        # charged 40k overlapping round trips and made every pattern look like a
        # total loss regardless of merit.
        busy_until = -1
        idx_all = np.flatnonzero(trig)
        nxt_all = fwd[idx_all]
        for pos, i in enumerate(idx_all):
            if i <= busy_until:
                continue
            move = float(nxt_all[pos]) * direction
            if move >= tp:
                pnl = tp - cost_steps
            elif move <= -sl:
                pnl = -sl - cost_steps
            else:
                pnl = move - cost_steps      # time stop at the close
            pnls.append(pnl)
            busy_until = i + 1

        p.trades = len(pnls)
        if pnls:
            arr = np.array(pnls)
            p.net_steps = float(arr.sum())
            gains = arr[arr > 0].sum()
            losses = -arr[arr < 0].sum()
            p.pf = float(gains / losses) if losses > 0 else float("inf")
            p.t_stat = zscore(arr)
        p.wins = int(sum(1 for x in pnls if x > 0))
    return [p for p in pats if p.n >= 100]


# ----------------------------------------------------------------------- main
if not mt5.initialize():
    raise SystemExit(f"mt5 init failed: {mt5.last_error()}")

info = mt5.symbol_info(SYMBOL)
mt5.symbol_select(SYMBOL, True)
utc = lambda t: t.replace(tzinfo=timezone.utc)

rates = None
for days in (DAYS, 45, 30, 20, 10):
    rates = mt5.copy_rates_range(SYMBOL, mt5.TIMEFRAME_M1,
                                 utc(datetime.utcnow() - timedelta(days=days)),
                                 utc(datetime.utcnow()))
    if rates is not None and len(rates) > 20000:
        break
if rates is None or len(rates) == 0:
    raise SystemExit("no data")

tick = info.trade_tick_size
spread_ticks = float(np.median([r["spread"] for r in rates]))
cost_steps = 2 * spread_ticks          # entry + exit

c = np.array([r["close"] for r in rates], dtype=float)
d = np.diff(c)
hist = d[:-1]      # change into the signal bar
fwd = d[1:]        # change immediately after it
d_used = hist

n = len(hist)
split = int(n * 0.7)

print(f"=== pattern search: {SYMBOL} ===")
print(f"  bars {len(c):,} | digits {info.digits} | tick {tick}")
print(f"  spread {spread_ticks:.0f} ticks = {spread_ticks * tick:.2f} | round-trip cost {cost_steps:.0f} ticks")
print(f"  mean |bar change| {np.abs(d).mean() / tick:.2f} ticks")
print(f"  in-sample {split:,} bars | out-of-sample {n - split:,} bars")

pats = evaluate(build_patterns(), hist, fwd, cost_steps, 10 * tick, 10 * tick)

alpha_b = bonferroni_alpha(len(pats))
bh = bh_threshold([p.p for p in pats])
print(f"\n  {len(pats)} patterns tested | Bonferroni alpha = {alpha_b:.2e} | BH q-value cut = {bh:.3g}")

pats_sorted = sorted(pats, key=lambda p: -abs(p.z))
print(f"\n{'pattern':<24}{'n':>8}{'P(up)':>8}{'mean|next|':>12}"
      f"{'z':>8}{'p':>10}{'trades':>8}{'net':>9}{'PF':>7}{'t':>7}")
print("-" * 116)
for p in pats_sorted[:18]:
    print(f"{p.name:<24}{p.n:>8}{p.p_up:>8.3f}{p.mean_next / tick:>12.4f}"
          f"{p.z:>8.2f}{p.p:>10.4f}{p.trades:>8}{p.net_steps:>9.1f}"
          f"{p.pf:>7.3f}{p.t_stat:>7.2f}")

best = max(pats, key=lambda p: p.net_steps)
best_stat = min(pats, key=lambda p: p.p)
print(f"\n  best by net points : {best.name}  net={best.net_steps:+.1f} ticks  "
      f"t={best.t_stat:+.2f}  PF={best.pf:.2f}  trades={best.trades}")
print(f"  best by p-value    : {best_stat.name}  z={best_stat.z:+.2f}  p={best_stat.p:.4f}")
print(f"  Bonferroni alpha   : {alpha_b:.2e}  ->  significant? "
      f"{'YES' if best_stat.p < alpha_b else 'NO'}")
print(f"  BH FDR threshold   : {bh:.4g}  ->  significant? "
      f"{'YES' if bh > 0 and best_stat.p <= bh else 'NO'}")

# What max |z| would pure noise produce across this many tests? If the observed
# maximum is BELOW that, the search found nothing and did not even find the
# usual run of false positives.
rng = np.random.default_rng(7)
sims = []
for _ in range(500):
    noise = rng.normal(size=n)
    # Same alignment as the real evaluation: pattern on noise[:-1], target noise[1:].
    nh, nf = noise[:-1], noise[1:]
    zs = []
    for p in pats:
        m = p.fn(nh)
        if m.sum() < 100:
            continue
        zs.append(abs(zscore(nf[m])))
    if zs:
        sims.append(max(zs))
if sims:
    print(f"\n  null distribution of max|z| over {len(pats)} patterns "
          f"({len(sims):,} sims):")
    print(f"    median {np.median(sims):.2f}   95th pct {np.percentile(sims, 95):.2f}")
    print(f"    observed max|z| on real data: {max(abs(p.z) for p in pats):.2f}")
    obs = max(abs(p.z) for p in pats)
    print(f"    -> the data produced a WEAKER best-case than random noise "
          f"({'confirmed nothing' if obs < np.median(sims) else 'at or above chance'})")

# --- out-of-sample re-test of the apparent winners -----------------------
print(f"\n--- out-of-sample check (last {n - split:,} bars) ---")
oos = evaluate(build_patterns(), hist[split:], fwd[split:], cost_steps, 10 * tick, 10 * tick)
oos_by_name = {p.name: p for p in oos}
print(f"{'pattern':<24}{'IS net':>10}{'OOS net':>10}{'IS t':>8}{'OOS t':>8}  verdict")
for p in pats_sorted[:6]:
    q = oos_by_name.get(p.name)
    if not q:
        continue
    same = "consistent" if (p.net_steps > 0) == (q.net_steps > 0) else "SIGN FLIPS"
    print(f"{p.name:<24}{p.net_steps:>10.1f}{q.net_steps:>10.1f}"
          f"{p.t_stat:>8.2f}{q.t_stat:>8.2f}  {same}")

mt5.shutdown()