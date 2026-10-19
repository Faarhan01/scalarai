"""
Offline trigger-rate audit: which layer of the taxonomy is killing the trades.

The tester reported Trades=0 with handles correctly reported as "not needed"
and stops correctly clamped, so the block is inside SignalFor. Rather than burn
another terminal run per hypothesis, this replicates BaseSignal / PatternGate
exactly against the same bars the tester sees and counts how many bars each
filter removes.

Everything here is a faithful port of StrategyForge.mq5:
  StairStrength  L236
  BaseSignal     FAM_RUN_FADE
  PatternGate    PAT_RUN
The only differences are index direction (Python array is oldest-first,
MT5 shift 0 is newest) and that this reads from MetaTrader5's own history
rather than the tester's, so the dates must match what the tester loaded.
"""
from __future__ import annotations

import MetaTrader5 as mt5
import numpy as np

SYMBOL = "Step Index"
TF = mt5.TIMEFRAME_M1
FROM, TO = "2026.09.01", "2026.09.30"
RUN_LEN = 3
STRENGTH_MIN = 0.4


def rates() -> dict[str, np.ndarray]:
    mt5.initialize()
    mt5.symbol_select(SYMBOL, True)
    if not mt5.symbol_select(SYMBOL, True):
        raise SystemExit(f"cannot select {SYMBOL}")
    import datetime as dt

    def p(s: str) -> dt.datetime:
        # DD.MM.YYYY -- "2026.09.01" splits to year, month, day, which is the
        # trap here: reading them as d, m, y gives day=2026 and raises.
        y, m, d = (int(x) for x in s.split("."))
        return dt.datetime(y, m, d, tzinfo=dt.timezone.utc)

    r = mt5.copy_rates_range(SYMBOL, TF, p(FROM), p(TO))
    if r is None:
        raise SystemExit(f"copy_rates_range failed: {mt5.last_error()}")
    bars = r  # structured array; keep field names, coerce per column below
    print(f"{len(bars)} M1 bars  {bars[0]['time']} .. {bars[-1]['time']}")
    cols = {k: np.asarray(bars[k], dtype=float) for k in
            ("open", "high", "low", "close", "time")}
    return {"o": cols["open"], "h": cols["high"], "l": cols["low"],
            "c": cols["close"], "t": cols["time"]}


def stair_strength(B, n: int, i: int) -> float:
    """Port of StrategyForge.mq5 StairStrength(n, shift)."""
    # MT5 shift 0 == index -1 here; the n bars are offsets 0..n-1.
    idx = [i - k for k in range(n)]
    first = B["o"][idx[-1]]
    last = B["c"][idx[0]]
    span = abs(last - first)
    if span <= 0:
        return 0.0
    bodies = 0.0
    for j in idx:
        o, c = B["o"][j], B["c"][j]
        b = abs(c - o)
        if b <= 0:
            continue
        if (last > first and c > o) or (last < first and c < o):
            bodies += b
    if bodies <= 0:
        return 0.0
    return min(1.0, span / bodies)


def pattern_run(B, i: int, dirn: int) -> bool:
    """Port of PatternGate PAT_RUN, including the early-outs.

    The EA rejects any signal bar whose high == low BEFORE it looks at the
    pattern. On a 1-decimal synthetic index many M1 bars have zero range, and
    those bars were never counted by the first version of this function --
    which is exactly how an offline count and the tester can disagree by 100%.
    """
    if B["h"][i] - B["l"][i] <= 0.0:          # EA: if(rng <= 0.0) return(0);
        return False
    bull = B["c"][i] > B["o"][i]
    bear = B["c"][i] < B["o"][i]
    pbull = B["c"][i - 1] > B["o"][i - 1]
    pbear = B["c"][i - 1] < B["o"][i - 1]
    if bull and pbull:
        pass
    elif bear and pbear:
        pass
    else:
        return False
    if dirn > 0 and not bull:
        return False
    if dirn < 0 and not bear:
        return False
    return True


def zero_range_rate(B) -> None:
    """How common is a zero-range bar on this symbol?"""
    rng = B["h"] - B["l"]
    n = len(rng)
    zero = int((rng <= 0).sum())
    print(f"\nzero-range M1 bars: {zero}/{n} ({zero / n:.2%})")
    print(f"  mean range {rng.mean():.3f}, median {np.median(rng):.3f}, "
          f"max {rng.max():.3f}")


def main() -> None:
    B = rates()
    zero_range_rate(B)
    N = len(B["c"])
    print(f"\n{'':28}{'count':>10}{'rate':>10}")
    print("-" * 48)

    stages = {
        "all bars": N,
    }
    passed_stair = 0
    passed_dir = 0
    passed_pat = 0
    lo, hi = RUN_LEN, N - 1
    for i in range(lo, hi):
        s = stair_strength(B, RUN_LEN, i)
        if s < STRENGTH_MIN:
            continue
        passed_stair += 1
        first = B["o"][i - (RUN_LEN - 1)]
        last = B["c"][i]
        if last > first:
            d = -1          # ran up -> fade the sell
        elif last < first:
            d = +1
        else:
            continue
        passed_dir += 1
        if pattern_run(B, i, d):
            passed_pat += 1

    stages["1. StairStrength >= %.2f" % STRENGTH_MIN] = passed_stair
    stages["2. + non-flat direction"] = passed_dir
    stages["3. + PAT_RUN agrees"] = passed_pat

    prev = None
    for k, v in stages.items():
        rate = v / N if N else 0
        drop = ""
        if prev is not None and prev:
            drop = f"  (-{100 * (1 - v / prev):.1f}%)"
        print(f"{k:<28}{v:>10}{rate:>9.2%}{drop}")
        prev = v

    # A spread of 1 tick and a minimum stop of 9 ticks mean the EA refuses to
    # hold more than one position at a time, so consecutive triggers collapse.
    print("\nsignals vs. tradable entries")
    print(f"  triggers (raw bars)        : {passed_pat}")
    print(f"  one position at a time     : at most {passed_pat} entries, "
          f"each held until SL/TP")

    # --- Outcome is deliberately NOT computed here. ------------------------
    # The first version of this script resolved each signal against the NEXT
    # bar only, so 598 of 1020 signals silently vanished and the survivors were
    # a biased large-move subsample. It then printed "210 TP / 212 SL
    # (49.8% win)" as if that were a result. It is not: the EA holds until SL
    # or TP on any tick across as many bars as it takes, so the next-bar
    # sample and the executed sample are different populations.
    #
    # See replicate.py for a like-for-like replay of the EA's execution model.
    print("\nNo outcome is computed here -- see replicate.py.")
    print("This script only answers: how often does the rule fire at all.")

    mt5.shutdown()


if __name__ == "__main__":
    main()
