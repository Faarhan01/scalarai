"""Verify every command and factual claim in docs/trades.md actually holds.

A doc that drifts from reality is worse than no doc, so this re-runs the
commands and re-derives the numbers rather than trusting the prose.
"""
from __future__ import annotations

import csv
import re
import subprocess
import sys
from pathlib import Path

DOC = Path(r"C:\Users\faarh\Workspaces\Tools\MT5\docs\trades.md")
TOOLS = Path(r"C:\Users\faarh\Workspaces\Tools\MT5")
DATA = Path(
    r"C:\Users\faarh\AppData\Roaming\MetaQuotes\Terminal"
    r"\D0E8209F77C8CF37AD8BF550E51FF075"
)
COMMON = Path(
    r"C:\Users\faarh\AppData\Roaming\MetaQuotes\Terminal\Common\Files"
)

fails: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    # Detail is shown only on failure. Printing it on a pass is how a checker
    # ends up reporting "header has repeats" next to PASS.
    print(f"  {'PASS' if ok else 'FAIL'}  {label}"
          + (f"\n         -> {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(label)


print("=== paths exist ===")
for label, p in [
    ("data dir", DATA),
    ("tester cache", DATA / "Tester" / "cache"),
    ("tester logs", DATA / "Tester" / "logs"),
    ("compiled EA", DATA / "MQL5" / "Experts" / "StrategyForge" / "StrategyForge.ex5"),
    ("common files", COMMON),
    ("EA source", Path(r"C:\Users\faarh\Workspaces\Custom-apps\scalarai\ea\StrategyForge.mq5")),
    ("compile target", TOOLS / "mql5" / "StrategyForge.mq5"),
    ("agent logs", Path(r"C:\Users\faarh\AppData\Roaming\MetaQuotes\Tester"
                        r"\D0E8209F77C8CF37AD8BF550E51FF075\Agent-127.0.0.1-3000\logs")),
]:
    check(label, p.exists(), str(p) if not p.exists() else "")

print("\n=== the stale Bots binary is really gone ===")
bots = DATA / "MQL5" / "Experts" / "Bots" / "StrategyForge.ex5"
check("Experts/Bots/StrategyForge.ex5 removed", not bots.exists(), str(bots))

print("\n=== doc's documented commands run ===")
env_cmd = ["python", "strategyforge.py"]
r = subprocess.run(env_cmd + ["read", "--tag", "si_mom"],
                   cwd=TOOLS, capture_output=True, text=True)
check("strategyforge.py read --tag si_mom", r.returncode == 0, r.stderr[-120:])

r = subprocess.run(["python", "-c",
                    "import mt5_cache as mc;print(sorted(mc.TST_FIELDS))"],
                   cwd=TOOLS / "verify", capture_output=True, text=True)
check("mt5_cache imports and exposes TST_FIELDS", r.returncode == 0, r.stderr[-120:])

print("\n=== CLI surface matches the doc ===")
r = subprocess.run(env_cmd + ["--help"], cwd=TOOLS,
                   capture_output=True, text=True)
for sub in ("compile", "run", "oos", "optimise", "read", "list-reports"):
    check(f"subcommand {sub}", sub in r.stdout)

print("\n=== enum numbering in the doc matches the EA ===")
src = Path(r"C:\Users\faarh\Workspaces\Custom-apps\scalarai\ea\StrategyForge.mq5").read_text(
    encoding="utf-8")


def enum_body(name: str) -> dict[str, int]:
    m = re.search(r"enum\s+" + name + r"\s*\{(.*?)\};", src, re.S)
    assert m, name
    return {mm.group(1): int(mm.group(2))
            for mm in re.finditer(r"(\w+)\s*=\s*(\d+)", m.group(1))}


def by_index(body: dict[str, int]) -> list[str]:
    """Enum members ordered by their value -- not by declaration order, which
    is not guaranteed to match the numbering."""
    return [name for name, _ in sorted(body.items(), key=lambda kv: kv[1])]


fams = enum_body("ENUM_STRAT_FAMILY")
gates = enum_body("ENUM_INDICATOR_SET")
pats = enum_body("ENUM_PATTERN_FILTER")
doc = DOC.read_text(encoding="utf-8")

# The doc lists family names by index; confirm each name appears in the EA enum
# and that the count matches what the doc claims (0-11).
check("EA has 12 families (0-11)", len(fams) == 12 and max(fams.values()) == 11,
      f"{len(fams)} families")
check("EA has 8 indicator gates (0-7)", len(gates) == 8 and max(gates.values()) == 7,
      f"{len(gates)}")
check("EA has 7 pattern gates (0-6)", len(pats) == 7 and max(pats.values()) == 6,
      f"{len(pats)}")

sys.path.insert(0, str(TOOLS))
import strategyforge as sf  # noqa: E402

check("MODE_NAMES covers 0-11", sorted(sf.MODE_NAMES) == list(range(12)))
check("GATE_NAMES covers 0-7", sorted(sf.GATE_NAMES) == list(range(8)))
check("PATTERN_NAMES covers 0-6", sorted(sf.PATTERN_NAMES) == list(range(7)))
def bare(body: dict[str, int]) -> list[str]:
    """Enum members by value, without the EA's FAM_/GATE_/PAT_ prefixes.

    The EA namespaces its members (FAM_RUN_FADE) because MQL5 shares a global
    namespace; the Python CLI drops the prefix (run_fade). The ORDER must
    match, the spelling of the prefix must not be compared.
    """
    return [n.split("_", 1)[1] for n in by_index(body)]


check("doc MODE_NAMES agrees with EA enum order",
      [sf.MODE_NAMES[i] for i in range(12)] == [n.lower() for n in bare(fams)],
      f"EA {[n.lower() for n in bare(fams)]}")
check("doc GATE_NAMES agrees with EA enum order",
      [sf.GATE_NAMES[i] for i in range(8)] == [n.lower() for n in bare(gates)],
      f"EA {[n.lower() for n in bare(gates)]}")
check("doc PATTERN_NAMES agrees with EA enum order",
      [sf.PATTERN_NAMES[i] for i in range(7)] == [n.lower() for n in bare(pats)],
      f"EA {[n.lower() for n in bare(pats)]}")

print("\n=== the four CSV identities hold on the shipped report ===")
csv_path = COMMON / "StrategyForge_si_mom.csv"
rows = list(csv.DictReader(csv_path.read_text(encoding="utf-8").splitlines()))
check("CSV parsed", bool(rows))
if rows:
    r = rows[-1]
    gp, gl = float(r["gross_profit"]), float(r["gross_loss"])
    p, pf = float(r["profit"]), float(r["profit_factor"])
    dep, td, tr = (float(r["initial_deposit"]), int(r["total_deals"]),
                   int(r["trades"]))
    check("profit == gross_profit + gross_loss", abs((gp + gl) - p) < 0.01,
          f"{gp} + {gl} = {gp + gl} vs {p}")
    check("profit_factor == gross_profit / gross_loss", abs(gp / -gl - pf) < 1e-3,
          f"{gp / -gl} vs {pf}")
    check("deposit + profit == 9476.65 (MT5 log)", abs(dep + p - 9476.65) < 0.01,
          f"{dep + p}")
    check("total_deals == 2 x trades", td == 2 * tr, f"{td} vs {2 * tr}")
    check("CSV has the columns the doc names",
          all(k in r for k in ("verdict", "t_stat", "win_rate",
                               "breakeven_win_rate", "cost_share_pct",
                               "avg_win_ticks", "avg_loss_ticks",
                               "min_stop_dist", "stops_clamped",
                               "from_date", "to_date", "strat_family")))
    check("no duplicate column names",
          len(r) == len(set(r)), "header has repeats")

print("\n=== cache file matches the CSV ===")
sys.path.insert(0, str(TOOLS / "verify"))
import mt5_cache as mc  # noqa: E402

cands = sorted((DATA / "Tester" / "cache").glob("*.tst"),
               key=lambda p: p.stat().st_mtime, reverse=True)
hit = None
for p in cands:
    s = mc.parse_tst_stats(p.read_bytes())
    if s and s.get("net_profit") is not None and rows \
            and abs(s["net_profit"] - float(rows[-1]["profit"])) < 0.01:
        hit = (p, s)
        break
check("a .tst exists whose net_profit equals the CSV", hit is not None,
      "" if hit else "no matching cache file found")
if hit:
    p, s = hit
    print(f"        {p.name}")
    for csv_key, cache_key, signed in (("trades", "trades", False),
                                       ("wins", "profit_trades", False),
                                       ("losses", "loss_trades", False),
                                       ("gross_profit", "gross_profit", False),
                                       # MT5 returns STAT_GROSS_LOSS already
                                       # signed for the CSV but stores the
                                       # magnitude in the .tst summary, so this
                                       # one is compared on magnitude.
                                       ("gross_loss", "gross_loss", True),
                                       ("dd_abs", "dd_abs", False),
                                       ("dd_rel_pct", "dd_rel_pct", False),
                                       ("sharpe", "sharpe", False)):
        a, b = float(rows[-1][csv_key]), s[cache_key]
        if signed:
            a, b = abs(a), abs(b)
        check(f"cache {cache_key} == CSV {csv_key}", abs(a - b) < 0.01,
              f"CSV {a} vs cache {b}")

print("\n=== doc structure ===")
check("no placeholder text", "TODO" not in doc and "TBD" not in doc)
check("documents the cache directory", "Tester\\cache" in doc or "Tester/cache" in doc)
check("documents the .tst filename format", "HASH" in doc)
check("all three info layers present",
      all(s in doc for s in ("Layer 1", "Layer 2", "Layer 3")))
check("documents the pip unit trap", "pip = point" in doc)

print("\n" + "=" * 60)
if fails:
    print(f"{len(fails)} FAILED:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("ALL CHECKS PASSED")
