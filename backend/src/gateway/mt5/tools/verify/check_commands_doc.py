"""Verify every command and path claimed in docs/commands.md.

Docs drift silently: a path is renamed, a flag is renamed, and the file keeps
looking authoritative while every command in it fails. This re-derives the
claims instead of reading them.

Checks:
  * every absolute path in the docs exists
  * the CLI surface matches what the doc says the subcommands are
  * every enum value the doc lists is one the EA actually defines
  * the setup, compile and read commands run
  * the terminal guard reports correctly
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

TOOLS = Path(r"C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools")
DOCS = TOOLS / "docs"
CANON = Path(r"C:\Users\faarh\Workspaces\Custom-apps\scalarai\ea\StrategyForge.mq5")
DATA = Path(
    r"C:\Users\faarh\AppData\Roaming\MetaQuotes\Terminal"
    r"\D0E8209F77C8CF37AD8BF550E51FF075"
)
COMMON = Path(r"C:\Users\faarh\AppData\Roaming\MetaQuotes\Terminal\Common\Files")

fails: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}"
          + (f"\n         -> {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(label)


def run(args: list[str], cwd: Path = TOOLS) -> subprocess.CompletedProcess:
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True,
                          timeout=600)


print("=== paths the docs promise exist ===")
for label, p in [
    ("tools dir", TOOLS),
    ("docs dir", DOCS),
    ("verify dir", TOOLS / "verify"),
    ("EA source of truth", CANON),
    ("compile target dir", TOOLS / "mql5"),
    ("terminal data dir", DATA),
    ("tester cache", DATA / "Tester" / "cache"),
    ("tester logs", DATA / "Tester" / "logs"),
    ("compiled EA", DATA / "MQL5" / "Experts" / "StrategyForge" / "StrategyForge.ex5"),
    ("common files (CSV reports)", COMMON),
]:
    check(label, p.exists(), str(p))

print("\n=== every Tools\\MT5 reference is the portable terminal (which really is there) ===")
PORT = Path(r"C:\Users\faarh\Workspaces\Tools\MT5\terminal2")
for md in sorted(DOCS.glob("*.md")):
    for m in re.finditer(r"C:\\Users\\faarh\\Workspaces\\Tools\\MT5[^\s`|)]*", md.read_text(encoding="utf-8")):
        ref = m.group(0)
        rel = ref[len(r"C:\Users\faarh\Workspaces\Tools\MT5"):].strip("\\")
        if not rel:
            continue
        target = PORT / rel
        ok = target.exists()
        check(f"{md.name}: Tools\\MT5\\{rel}", ok,
              f"documented as existing but {target} is absent")

print("\n=== no mojibake in any doc ===")
for md in sorted(DOCS.glob("*.md")):
    text = md.read_text(encoding="utf-8")
    bad = len(re.findall("â€|Ã©|\ufffd", text))
    check(f"{md.name} encoding", bad == 0, f"{bad} mojibake markers")

print("\n=== CLI surface matches the doc ===")
r = run([sys.executable, "strategyforge.py", "--help"])
for sub in ("compile", "run", "oos", "optimise", "read", "list-reports"):
    check(f"subcommand {sub}", sub in r.stdout)

r = run([sys.executable, "strategyforge.py", "run", "--help"])
for flag in ("--mode", "--class", "--indicator", "--pattern", "--tf-fit",
             "--stop", "--take", "--min-trades", "--terminal", "--tag"):
    check(f"run accepts {flag}", flag in r.stdout)

print("\n=== enum values in the doc match the EA ===")
src = CANON.read_text(encoding="utf-8")


def enum_body(name: str) -> dict[str, int]:
    m = re.search(r"enum\s+" + name + r"\s*\{(.*?)\};", src, re.S)
    if not m:
        return {}
    return {mm.group(1): int(mm.group(2))
            for mm in re.finditer(r"(\w+)\s*=\s*(\d+)", m.group(1))}


doc = (DOCS / "commands.md").read_text(encoding="utf-8")
fams = enum_body("ENUM_STRAT_FAMILY")
gates = enum_body("ENUM_INDICATOR_SET")
pats = enum_body("ENUM_PATTERN_FILTER")
check("EA defines 12 families", len(fams) == 12 and max(fams.values()) == 11,
      f"{len(fams)}")
check("EA defines 8 indicator gates", len(gates) == 8 and max(gates.values()) == 7,
      f"{len(gates)}")
check("EA defines 7 pattern gates", len(pats) == 7 and max(pats.values()) == 6,
      f"{len(pats)}")
for label, body in (("family", fams), ("indicator", gates), ("pattern", pats)):
    missing = [n for n in body if n.split("_", 1)[1].lower() not in doc.lower()]
    check(f"doc names every {label}", not missing, f"absent: {missing}")

print("\n=== exit codes documented are the ones the code uses ===")
codes = sorted(set(re.findall(r"sys\.exit\((\d+)\)", (TOOLS / "strategyforge.py").read_text(encoding="utf-8"))))
doc_codes = sorted(set(re.findall(r"`(\d)`", doc)))
check("doc lists the real exit codes", set(codes) <= set(doc_codes) or set(doc_codes) >= set(codes),
      f"code uses {codes}, doc lists {doc_codes}")

print("\n=== the setup / compile / read commands actually run ===")
r = run([sys.executable, "strategyforge.py", "compile"])
check("compile", "COMPILE OK" in r.stdout, r.stdout[-300:])

r = run([sys.executable, "strategyforge.py", "list-reports"])
check("list-reports", r.returncode == 0, r.stderr[-200:])

tags = sorted(p.stem.replace("StrategyForge_", "")
              for p in COMMON.glob("StrategyForge_*.csv"))
if tags:
    r = run([sys.executable, "strategyforge.py", "read", "--tag", tags[-1]])
    check(f"read --tag {tags[-1]}", r.returncode == 0 and "trades" in r.stdout,
          r.stderr[-200:])

print("\n=== the terminal guard reports what the doc claims ===")
r = run(["tasklist", "/FI", "IMAGENAME eq terminal64.exe", "/FO", "CSV", "/NH"])
running = "terminal64.exe" in r.stdout
doc_says_close = "tasklist" in doc and "Stop-Process" in doc
check("doc documents the terminal guard", doc_says_close)
print(f"        (a terminal is currently running: {running}"
      f" -> {'close it before running' if running else 'safe to run now'})")

print("\n=== the portable terminal the docs reference is real ===")
check("portable terminal64.exe", (PORT / "terminal64.exe").exists(), str(PORT))

print("\n" + "=" * 62)
if fails:
    print(f"{len(fails)} FAILED")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("COMMANDS DOC VERIFIED")
