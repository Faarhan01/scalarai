"""Backtest the v2 StrategyForge across all eight modes.

Modes 5, 6 and 7 are new relative to v1.5/7, so the point is not just "does it
run" but whether the new engines produce plausible, internally consistent
results -- the two silent failure classes are an indicator handle that failed
to open (every signal reads 0) and a mode that never fires.

Run straight from Experts\\Bots\\StrategyForge.ex5, the copy that came from the
site, not the older Experts\\StrategyForge\\ one.
"""
import strategyforge as sf

EX5 = "Bots" + chr(92) + "StrategyForge.ex5"

MODES = {
    0: ("MA_CROSS", {"InpFast": 12, "InpSlow": 26}),
    1: ("RSI_REVERT", {"InpPeriod": 14, "InpThreshold": 30.0}),
    2: ("BREAKOUT", {"InpFast": 20}),
    3: ("BOLLINGER", {"InpPeriod": 20, "InpThreshold": 2.0}),
    4: ("MACD", {"InpFast": 12, "InpSlow": 26}),
    5: ("PATTERN_SCAN", {"InpFast": 20}),
    6: ("INDICATOR_INSP", {"InpFast": 12, "InpSlow": 26, "InpPeriod": 20}),
    7: ("AI_ADAPTIVE", {"InpPeriod": 14, "InpThreshold": 2.0}),
}

EXTRA = {"InpLots": 0.10, "InpStopPips": 20.0, "InpTakePips": 30.0,
         "InpCriterion": 1, "InpPostUrl": ""}

print(f"{'mode':<15}{'trades':>7}{'wins':>6}{'losses':>7}{'profit':>10}"
      f"{'pf':>8}{'sharpe':>9}{'dd%':>7}{'net_pips':>10}{'secs':>7}")
print("-" * 86)

results = {}
for mode, (name, params) in MODES.items():
    tag = f"v2_{name.lower()}"
    r = sf.run_tester(
        EX5, symbol="EURUSD", timeframe="M1",
        frm="2026.09.01", to="2026.09.30", model=0,
        tag=tag, timeout=300,
        extra={**EXTRA, **params, "InpMode": mode, "InpTag": tag},
    )
    d = sf.read_report(tag)
    if not d:
        print(f"{name:<15}{'NO CSV':>7}   ok={r.ok} {r.seconds}s")
        continue

    row = {k: d[k] for k in ("trades", "wins", "losses", "profit", "net_pips",
                             "profit_factor", "sharpe", "dd_rel_pct")}
    results[mode] = (name, row)
    print(f"{name:<15}{row['trades']:>7}{row['wins']:>6}{row['losses']:>7}"
          f"{row['profit']:>10}{row['profit_factor']:>8}{row['sharpe']:>9}"
          f"{row['dd_rel_pct']:>7}{row['net_pips']:>10}{r.seconds:>7.0f}")

print("\nConsistency checks")
print("-" * 46)
for mode, (name, row) in results.items():
    t = int(row["trades"])
    w, l = int(row["wins"]), int(row["losses"])
    fires = "OK" if t > 0 else "NEVER FIRED"
    sums = "OK" if w + l == t else f"MISMATCH ({w}+{l}!={t})"
    sharpe_ok = abs(float(row["sharpe"]) - 0.0) < 1e-9 and t == 0
    print(f"  {name:<15} trades={t:<5} {fires:<12} wins+losses {sums}"
          + ("  (sharpe==0 as expected)" if sharpe_ok else ""))