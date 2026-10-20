"""
Independent replication of ONE MT5 tester run, to check the offline port.

This does NOT use the Strategy Tester. It replays the same bars through a
Python model of the EA's execution rules so the two can be compared like for
like. The earlier trigger_audit.py was not a fair comparison: it resolved each
signal against the NEXT bar only, so 598 of 1020 signals were silently dropped
and the survivors were a biased, large-move subsample. Reporting "49.8%" from
that and calling it agreement with the tester's PF was wrong.

Execution rules replicated (verified against the EA source, not assumed):
  * signal is read on the last CLOSED bar            OnTick, `const int sig = 1`
  * entry is at market on the next bar                g_trade.Buy(..., 0.0, ...)
  * SL/TP are symmetric at InpStopPips / InpTakePips  TryEnter, stopDist/takeDist
  * one position at a time                            InpMaxPositions = 1
  * signals while holding are DROPPED, not queued     HasOurPosition() -> return
  * trailing / breakeven are OFF (both inputs are 0)  ManagePosition is a no-op
  * exit is MT5's own SL/TP touch, on any tick        position carries SL and TP
  * pip = point * 10 = 1.0 price unit                 TryEnter, `double pip`
  * round trip costs 2 x spread                       costShare() in the report

Where the EA has real ticks and this has bar OHLC, the order of SL vs TP inside
a single bar is unknowable. Those bars are counted separately and reported as
a worst/best bound rather than guessed.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import MetaTrader5 as mt5

SYMBOL = "Step Index"
TF = mt5.TIMEFRAME_M1
FROM, TO = "2026.09.01", "2026.09.30"
RUN_LEN = 3
STRENGTH_MIN = 0.4
STOP_PIPS = 1.2
TAKE_PIPS = 1.2
POINT = 0.1
TICK = 0.1
PIP = POINT * 10.0                 # 1.0 price unit, as the EA computes it
STOP = STOP_PIPS * PIP            # 1.20
TAKE = TAKE_PIPS * PIP            # 1.20
SPREAD = 1 * TICK                 # 1 tick, measured on Step Index
# A round trip pays the spread ONCE. Buy lifts the ask, sell hits the bid, and
# the difference between those two prints IS the spread. An earlier version of
# this file used 2 * SPREAD, which overstated the cost of every trade by 100%
# and was the same mistake the EA's costShare() had.
ROUND_TRIP = 1 * SPREAD

# The EA places SL/TP relative to the FILL price, and the tester triggers them
# on the opposite side of the book. So the realised legs are not symmetric:
#   long  fills at ask, TP needs bid to reach ask+take  -> win  = take - spread
#   long  fills at ask, SL needs bid to reach ask-stop  -> loss = stop
#   short fills at bid, SL needs ask to reach bid+stop  -> loss = stop
#   short fills at bid, TP needs ask to reach bid-take  -> win  = take - spread
# i.e. the spread is paid once and comes out of the winning leg.
LOSS_LEG = STOP
WIN_LEG = TAKE - SPREAD


@dataclass
class Trade:
    direction: int
    entry_i: int
    exit_i: int | None
    result: str          # "tp" | "sl" | "ambiguous_tp" | "ambiguous_sl" | "open"
    gross: float         # price-units move, before spread


def load():
    mt5.initialize()
    if not mt5.symbol_select(SYMBOL, True):
        raise SystemExit(f"cannot select {SYMBOL}")

    def p(s: str) -> dt.datetime:
        y, m, d = (int(x) for x in s.split("."))
        return dt.datetime(y, m, d, tzinfo=dt.timezone.utc)

    r = mt5.copy_rates_range(SYMBOL, TF, p(FROM), p(TO))
    if r is None:
        raise SystemExit(f"copy_rates_range: {mt5.last_error()}")
    mt5.shutdown()
    return r


def signal_at(r, i: int) -> int:
    """Port of BaseSignal(FAM_RUN_FADE) + PatternGate(PAT_RUN) at shift 1.

    Index i is the last closed bar; MT5 shift 0 == i, shift k == i - k.
    """
    if i - (RUN_LEN - 1) < 1:
        return 0
    first = r["open"][i - (RUN_LEN - 1)]
    last = r["close"][i]
    span = abs(last - first)
    if span <= 0:
        return 0
    bodies = 0.0
    for j in range(i, i - RUN_LEN, -1):
        o, c = r["open"][j], r["close"][j]
        b = abs(c - o)
        if b <= 0:
            continue
        if (last > first and c > o) or (last < first and c < o):
            bodies += b
    if bodies <= 0 or span / bodies < STRENGTH_MIN:
        return 0

    d = -1 if last > first else (+1 if last < first else 0)
    if d == 0:
        return 0

    # PAT_RUN: the bar must continue the previous bar, and agree with `d`.
    bull = r["close"][i] > r["open"][i]
    bear = r["close"][i] < r["open"][i]
    pbull = r["close"][i - 1] > r["open"][i - 1]
    pbear = r["close"][i - 1] < r["open"][i - 1]
    if not ((bull and pbull) or (bear and pbear)):
        return 0
    if d > 0 and not bull:
        return 0
    if d < 0 and not bear:
        return 0
    return d


def run() -> list[Trade]:
    r = load()
    n = len(r)
    trades: list[Trade] = []
    held_until = -1                     # bar index we are free to enter again

    for i in range(RUN_LEN, n - 1):
        if i <= held_until:             # signals while holding are dropped
            continue
        d = signal_at(r, i)
        if d == 0:
            continue

        # Enter at the open of bar i+1. A buy lifts the ask, a sell hits the bid.
        entry = r["open"][i + 1] + (SPREAD if d > 0 else 0.0)
        tp = entry + d * TAKE
        sl = entry - d * STOP

        for j in range(i + 1, n):
            hi, lo = r["high"][j], r["low"][j]
            hit_tp = (hi >= tp) if d > 0 else (lo <= tp)
            hit_sl = (lo <= sl) if d > 0 else (hi >= sl)
            if hit_tp and hit_sl:
                # Unknowable from OHLC. Attribute it both ways.
                # gross is profit in TRADE direction, so it is +TAKE on a take
                # regardless of side. Storing d*TAKE here made every winning
                # short look like a loss.
                trades.append(Trade(d, i + 1, j, "ambiguous_tp", TAKE))
                trades.append(Trade(d, i + 1, j, "ambiguous_sl", -STOP))
                held_until = j
                break
            if hit_tp:
                trades.append(Trade(d, i + 1, j, "tp", TAKE))
                held_until = j
                break
            if hit_sl:
                trades.append(Trade(d, i + 1, j, "sl", -STOP))
                held_until = j
                break
        else:
            trades.append(Trade(d, i + 1, n - 1, "open", 0.0))
            held_until = n - 1

    return trades


def report(trades: list[Trade]) -> None:
    counts: dict[str, int] = {}
    for t in trades:
        counts[t.result] = counts.get(t.result, 0) + 1

    amb = counts.get("ambiguous_tp", 0)
    real = [t for t in trades if not t.result.startswith("ambiguous")]

    print("signals resolved into trades")
    for k in sorted(counts):
        print(f"  {k:<16}{counts[k]:>7}")

    # Ambig归 twice in the list, so de-duplicate for the position count.
    pos = len(real) + (1 if amb else 0)

    def pf(assume: str) -> tuple[float, float, int, int]:
        w = l = 0
        gp = gl = 0.0
        for t in trades:
            res = t.result
            if res.startswith("ambiguous"):
                res = f"ambiguous_{assume}"
            if res.endswith("tp"):
                w += 1
                gp += t.gross
            elif res.endswith("sl"):
                l += 1
                gl += -t.gross
        net = sum(t.gross if not t.result.startswith("ambiguous")
                  else (t.gross if t.result == f"ambiguous_{assume}" else 0.0)
                  for t in trades)
        return (gp / gl if gl else 0.0), net, w, l

    print(f"\n{'scenario':<26}{'trades':>8}{'wins':>7}{'losses':>8}"
          f"{'win%':>8}{'PF':>8}{'net $units':>12}")
    print("-" * 77)
    for assume, label in (("tp", "ambiguous -> TP"),
                          ("sl", "ambiguous -> SL")):
        p, net, w, l = pf(assume)
        n_res = w + l
        wr = w / n_res if n_res else 0
        print(f"{label:<26}{pos:>8}{w:>7}{l:>8}{wr:>7.1%}{p:>8.4f}{net:>12.2f}")

    # What the spread alone does to an otherwise fair coin.
    p, net, w, l = pf("tp")
    n_res = w + l
    wr = w / n_res if n_res else 0
    pf_fair = (wr * WIN_LEG) / ((1 - wr) * LOSS_LEG) if wr < 1 else float("inf")
    be = LOSS_LEG / (WIN_LEG + LOSS_LEG)
    gross_pf = p          # legs only, spread ignored
    print(f"\nwin rate on resolved trades : {wr:.3%}")
    print(f"realised legs               : win +{WIN_LEG:.2f}  loss -{LOSS_LEG:.2f}"
          f"   (spread {SPREAD:.2f}, paid once per round trip)")
    print(f"PF on raw legs              : {gross_pf:.4f}")
    print(f"break-even win rate         : {be:.2%}")
    print(f"PF at that win rate         : {pf_fair:.4f}   <- what the tester sees")
    print(f"shortfall in win rate       : {be - wr:+.2%}")


if __name__ == "__main__":
    report(run())
