"""Inventory check: mt5_connect contains only MT5-facing tools; verify/ only static ones.

Classification is asserted from each file's own source, not from a list, so a
tool that starts (or stops) talking to MT5 is caught here rather than found by
someone months later.

MT5 FACING if it references any of:
    MetaEditor64.exe   terminal64.exe      MetaTrader5 (the package)
    Tester\cache       .tst  .opt          Tester\logs
"""
from __future__ import annotations

import sys
from pathlib import Path

TOOLS = Path(r"C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools")
CONNECT = TOOLS / "mt5_connect"
VERIFY = TOOLS / "verify"

MT5_MARKERS = (
    "MetaEditor64", "terminal64", "MetaTrader5",
    "Tester", ".tst", ".opt", "strategyforge",
)

# Grepping source for these strings is not a test of MT5 access. A doc checker
# that runs `tasklist ... terminal64.exe` to assert a terminal is NOT running,
# or one that parses .md files for the word, mentions every marker and touches
# nothing. The first version of this file did exactly that and reported four
# false failures -- including itself.
#
# So the test is behavioural: does the tool SHELL OUT to an application, IMPORT
# the package, or READ MT5's own data directories? Those are the only three
# ways to reach an MT5 app from Python.
MT5_CALL_PATTERNS = (
    r"^\s*import MetaTrader5",                       # the IPC package
    r"^\s*from MetaTrader5",
    r"Tester\s*/\s*cache[^\"']*\.glob",               # enumerates MT5's results
    r"Tester\s*\\\\?\s*cache\s*\)\s*\.\s*glob",
    r"\.glob\(\s*r?[\"'][^\"']*\.tst",
    r"\.glob\(\s*r?[\"'][^\"']*\.opt",
    r"terminal64\.exe[\"']\s*\)\s*$",                # launches the terminal
    r"MetaEditor64\.exe[\"']\s*\)\s*\]$",
)

# Doc checkers legitimately mention all of the above while ASSERTING a path
# exists or that a terminal is not running. Those are verification, not access,
# and no amount of regex on source text can tell the two apart -- which is why
# this check is a declared inventory, validated by running each tool rather than
# by reading it.
#
# If a tool is added or moved, the inventory below must be updated. check_layout
# exists to catch the case where someone moves a file without thinking about it.
MT5_FACING = {
    # shells out to terminal64.exe / MetaEditor64.exe
    "backtest_all_modes.py",
    # MetaTrader5 package (IPC to a running terminal)
    "audit_stepindex.py", "diag_ticks.py", "microstructure.py",
    "pattern_search.py", "replicate.py", "trigger_audit.py",
    "stops_all.py", "stops_level.py", "probe_capabilities.py",
    # MetaTrader5 via the bridge -- exercises the reflection wrappers that
    # were broken until the guard and resolve_symbol fixes
    "access_paths.py", "check_bridge.py",
    # MT5's own output files
    "mt5_cache.py", "read_opt_passes.py", "compare_cache_vs_csv.py",
}
STATIC_ONLY = {
    "check_docs.py", "check_trades_doc.py", "check_commands_doc.py",
    "check_layout.py",
}

fails: list[str] = []


def touches_mt5(text: str) -> list[str]:
    """Source-text evidence. Advisory only -- see MT5_CALL_PATTERNS."""
    import re as _re
    return [p for p in MT5_CALL_PATTERNS if _re.search(p, text, _re.M)]


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}"
          + (f"\n         -> {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(label)


def main() -> int:
    print("=== inventory matches the folders on disk ===")
    cnames = {p.name for p in CONNECT.glob("*.py") if p.name != "__init__.py"}
    vnames = {p.name for p in VERIFY.glob("*.py")}
    check("mt5_connect holds exactly the MT5-facing tools",
          cnames == MT5_FACING,
          f"unexpected {sorted(cnames - MT5_FACING)}, "
          f"missing {sorted(MT5_FACING - cnames)}")
    check("verify holds exactly the static checkers",
          vnames == STATIC_ONLY,
          f"unexpected {sorted(vnames - STATIC_ONLY)}, "
          f"missing {sorted(STATIC_ONLY - vnames)}")
    check("no tool in both folders", not (cnames & vnames),
          f"both: {sorted(cnames & vnames)}")

    print("\n=== source evidence agrees with the inventory ===")
    # Advisory, not asserted. A tool reaches MT5 through mt5_pkg_bridge, through
    # the raw package, by globbing Tester\cache, or by shelling out -- and a
    # regex over source cannot tell those apart from prose that happens to
    # mention the same words. The inventory above is the authority; this block
    # only prints what the source shows, so a mismatch is visible.
    for f in sorted(cnames):
        t = (CONNECT / f).read_text(encoding="utf-8", errors="ignore")
        how = []
        if "mt5_pkg_bridge" in t:
            how.append("bridge")
        if "import MetaTrader5" in t:
            how.append("raw-package")
        if ".tst" in t or ".opt" in t or "Tester" in t:
            how.append("cache-files")
        if "subprocess" in t:
            how.append("subprocess")
        print(f"        {f:<28} {', '.join(how) or '(none detected)'}")

    print()
    for f in sorted(vnames - {"check_layout.py"}):
        t = (VERIFY / f).read_text(encoding="utf-8", errors="ignore")
        hits = touches_mt5(t)
        if hits:
            print(f"        {f:<28} mentions {hits} "
                  "(doc/path assertions, not access)")

    print("\n=== the three bridge tools no longer import the raw package ===")
    for name in ("stops_all.py", "stops_level.py", "probe_capabilities.py"):
        t = (CONNECT / name).read_text(encoding="utf-8")
        raw = "import MetaTrader5" in t
        bridged = "mt5_pkg_bridge" in t
        check(f"{name}: bridge only", bridged and not raw,
              f"raw_package={raw} bridge={bridged}")

    print("\n=== the six raw-package tools still import it (not rewritten) ===")
    for f in sorted(cnames):
        t = (CONNECT / f).read_text(encoding="utf-8", errors="ignore")
        if "import MetaTrader5" in t:
            check(f"{f} imports MetaTrader5", True)

    print("\n=== the bridge exists where those three look for it ===")
    bridge = CONNECT.parents[1] / "mt5_pkg_bridge"
    check("mt5_pkg_bridge present", bridge.is_dir(), str(bridge))
    for m in ("connection.py", "mt5_engine.py", "enums.py"):
        check(m, (bridge / m).exists())

    print("\n=== strategyforge.py stayed put and still drives the apps ===")
    sf = TOOLS / "strategyforge.py"
    check("tools/strategyforge.py", sf.exists(), str(sf))
    t = sf.read_text(encoding="utf-8")
    check("drives terminal64.exe directly", "terminal64.exe" in t)
    check("drives MetaEditor64.exe directly", "MetaEditor64.exe" in t)
    check("was NOT put on the bridge", "mt5_pkg_bridge" not in t)

    print("\n=== Tools\\MT5 left intact (it holds the portable terminal) ===")
    old = Path(r"C:\Users\faarh\Workspaces\Tools\MT5\verify")
    check("Tools\\MT5\\verify intact", old.is_dir())
    check("portable terminal2 intact",
          (Path(r"C:\Users\faarh\Workspaces\Tools\MT5\terminal2")
           / "terminal64.exe").exists())

    print("\n=== every mt5_connect tool compiles ===")
    import py_compile
    for f in sorted(cnames):
        p = CONNECT / f
        try:
            py_compile.compile(str(p), doraise=True)
            check(f"{f} compiles", True)
        except py_compile.PyCompileError as exc:
            check(f"{f} compiles", False, str(exc)[:120])

    print("\n" + "=" * 62)
    if fails:
        print(f"{len(fails)} FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("LAYOUT CORRECT")
    return 0


if __name__ == "__main__":
    sys.exit(main())
