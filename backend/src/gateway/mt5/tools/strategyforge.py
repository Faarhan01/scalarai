#!/usr/bin/env python3
"""
strategyforge.py - drive MT5's native Strategy Tester from Python.

AI-facing wrapper around MetaEditor64 /compile and terminal64 /config.
Compiles an .mq5, runs the native tester, and returns parsed statistics.

    python strategyforge.py compile --src mql5/StrategyForge.mq5
    python strategyforge.py run --mode 0 --fast 20 --slow 50
    python strategyforge.py sweep --modes 0,1,2,3,4 --fast 10,20 --slow 40,60
    python strategyforge.py list-reports
    python strategyforge.py read --tag mytest

Exit codes: 0 ok, 1 compile failed, 2 tester produced nothing,
3 run appeared to succeed but no report was written.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

# --- Machine-specific paths -----------------------------------------------
# Two MT5 instances are available:
#
#   PRIMARY   the normal installation under Program Files, whose data lives in
#             %APPDATA%\MetaQuotes\Terminal\<hash>
#   PORTABLE  a copy of that installation launched with /portable, whose data
#             lives inside the installation folder itself
#
# They exist because MT5 allows one terminal per data directory and silently
# ignores /config for an already-running one. With only the primary available,
# an open GUI blocks every headless run; with the portable instance, the GUI can
# stay open and tests use the second one.
#
# They share %APPDATA%\MetaQuotes\Terminal\Common\Files, so CSV reports from
# either instance land in the same place.
MT5_ROOT = Path(r"C:\Program Files\MetaTrader 5")

WORK = Path(__file__).resolve().parent          # ...\scalarai\backend\mt5\tools
MQ5 = WORK / "mql5"

PRIMARY_ROOT = MT5_ROOT


def _find_portable() -> Path | None:
    """
    Locate the second (portable) MT5 installation.

    Searched rather than hardcoded, because this tool has moved twice and the
    portable copy did not move with it. A fixed path silently degrades to "no
    second terminal", which then reads as "portable is broken" rather than
    "portable is not installed here".

    Override with the STRATEGYFORGE_PORTABLE environment variable.
    """
    env = os.environ.get("STRATEGYFORGE_PORTABLE")
    if env:
        return Path(env)
    for cand in (
        WORK / "terminal2",
        WORK.parent / "terminal2",
        Path(r"C:\Users\faarh\Workspaces\Tools\MT5\terminal2"),
    ):
        if (cand / "terminal64.exe").exists():
            return cand
    return None


PORTABLE_ROOT = _find_portable()

# Which instance the runner drives, and which compiler it uses. The compiler
# stays on the primary installation deliberately: the portable copy is a
# byte-identical duplicate, and keeping compilation on one known-good binary
# means a difference in the .ex5 can never be blamed on the compiler.
EDITOR_ROOT = PRIMARY_ROOT
TERMINAL_ROOT = PRIMARY_ROOT
TERMINAL_PORTABLE = False

TERMINAL = MT5_ROOT / "terminal64.exe"
METAEDITOR = MT5_ROOT / "MetaEditor64.exe"

# The single source of truth for the EA. `Tools/MT5/mql5/StrategyForge.mq5` is
# only a compile target: the site regenerates the EA from the scalarai copy,
# so treating the local copy as canonical silently tests whatever was last
# copied in. Both `run` and `optimise` re-sync from here before compiling.
CANON = Path(
    r"C:\Users\faarh\Workspaces\Custom-apps\scalarai\ea\StrategyForge.mq5"
)


def prepare_source(src: Path) -> Path:
    """Copy the requested source onto the compile target and return it.

    Always overwrites. A previous version compared sizes and skipped the copy,
    which meant an edit that happened to keep the byte count (or a source the
    user had edited but not re-synced) was compiled as the previous build.
    """
    src = Path(src)
    if not src.exists():
        raise FileNotFoundError(src)
    target = MQ5 / "StrategyForge.mq5"
    if src.resolve() != target.resolve():
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, target)
        # The old .ex5 is now known-stale; delete it so a failed compile
        # cannot fall through to installing last week's binary.
        stale = target.with_suffix(".ex5")
        if stale.exists():
            stale.unlink()
    return target
OUT = WORK / "out"
REPORTS = WORK / "reports"

# Terminal data dir (where MQL5\Experts lives). Read from origin.txt rather
# than hardcoding the hash, which changes if MT5 is reinstalled or moved.
def _read_text(path: Path) -> str:
    """
    Read a text file whose encoding is not declared.

    MT5 writes origin.txt as UTF-16LE with a BOM and a stray leading byte
    that becomes '?' when decoded naively, so strip both.
    """
    raw = path.read_bytes()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        raw = raw[2:]
        return raw.decode("utf-16-le", errors="ignore").lstrip("?\x00").strip()
    return raw.decode("utf-8", errors="ignore").lstrip("?\x00").strip()


def data_dir() -> Path:
    """Data directory of the instance currently targeted.

    A portable terminal keeps its data INSIDE the installation folder rather
    than in %APPDATA%\MetaQuotes\Terminal\<hash>, so there is no origin.txt to
    search for. Getting this wrong installs the .ex5 into the wrong terminal and
    then reports "tester produced nothing".
    """
    if TERMINAL_PORTABLE:
        return TERMINAL_ROOT
    base = Path(os.environ["APPDATA"]) / "MetaQuotes" / "Terminal"
    for d in base.iterdir():
        origin = d / "origin.txt"
        if not origin.exists():
            continue
        try:
            if Path(_read_text(origin)).resolve() == MT5_ROOT.resolve():
                return d
        except OSError:
            continue
    raise RuntimeError("could not locate the MT5 data directory")


def set_target_terminal(root: Path | None) -> Path:
    """Point the runner at a specific MT5 instance. None restores the primary.

    Returns that instance's data directory. Raises early when the requested root
    has no terminal64.exe, because a wrong path here otherwise surfaces much
    later as an unrelated "tester produced nothing".
    """
    global TERMINAL_ROOT, TERMINAL, TERMINAL_PORTABLE
    if root is None:
        TERMINAL_ROOT = PRIMARY_ROOT
        TERMINAL_PORTABLE = False
    else:
        root = Path(root).resolve()
        if not (root / "terminal64.exe").exists():
            raise FileNotFoundError(
                f"no terminal64.exe in {root} -- is that an MT5 installation?")
        TERMINAL_ROOT = root
        TERMINAL_PORTABLE = True
    TERMINAL = TERMINAL_ROOT / "terminal64.exe"
    return data_dir()


def common_files_dir() -> Path:
    """FILE_COMMON target: ...\Terminal\Common\Files."""
    return Path(os.environ["APPDATA"]) / "MetaQuotes" / "Terminal" / "Common" / "Files"


MODE_NAMES = {
    0: "ma_cross", 1: "rsi_revert", 2: "breakout",
    3: "bollinger", 4: "macd", 5: "pattern",
    6: "momentum", 7: "run_fade",
    8: "vol_expansion", 9: "range_revert", 10: "trend_pullback",
    11: "sequential",
}

CLASS_NAMES = {0: "scalp", 1: "day", 2: "swing"}
GATE_NAMES = {
    0: "none", 1: "ema_trend", 2: "rsi", 3: "bands",
    4: "atr", 5: "adx", 6: "ema_rsi", 7: "macd",
}
PATTERN_NAMES = {
    0: "none", 1: "engulfing", 2: "pinbar", 3: "run",
    4: "inside", 5: "doji", 6: "long_body",
}
TF_NAMES = {0: "any", 1: "scalp", 2: "day", 3: "swing"}
CRIT_NAMES = {
    0: "balance", 1: "sharpe", 2: "profit_factor",
    3: "calmar", 4: "penalised", 5: "trade_count",
}


# --- Compile --------------------------------------------------------------
def compile_mq5(src: Path) -> tuple[bool, str]:
    """Compile and return (ok, log_text). MetaEditor is a real headless
    compiler, so its log is the machine-readable feedback channel."""
    if not METAEDITOR.exists():
        return False, f"MetaEditor not found at {METAEDITOR}"
    if not src.exists():
        return False, f"source not found: {src}"

    OUT.mkdir(parents=True, exist_ok=True)
    log = OUT / f"{src.stem}.compile.log"
    if log.exists():
        log.unlink()

    subprocess.run(
        [str(METAEDITOR), f"/compile:{src}", f"/log:{log}"],
        capture_output=True, timeout=180,
    )
    # MetaEditor returns before the log is fully flushed on some builds.
    for _ in range(40):
        if log.exists() and log.stat().st_size > 0:
            break
        time.sleep(0.25)

    text = _read_text(log) if log.exists() else ""

    ex5 = src.with_suffix(".ex5")
    m = re.search(r"Result:\s*(\d+)\s*errors?,\s*(\d+)\s*warnings?", text)
    if m:
        errs = int(m.group(1))
        return errs == 0 and ex5.exists(), text
    return ex5.exists(), text


# --- Install into the terminal's Experts folder --------------------------
def install_ex5(name: str, src: Path) -> Path | None:
    experts = data_dir() / "MQL5" / "Experts"
    dest_dir = experts / "StrategyForge"
    dest_dir.mkdir(parents=True, exist_ok=True)
    src_ex5 = src.with_suffix(".ex5")
    if not src_ex5.exists():
        return None

    # Refuse to install a binary older than its source. MT5 caches compiled
    # .ex5 by mtime, so a stale artifact produces a run that looks successful
    # while exercising old code -- and the resulting CSV is then read as
    # evidence about a build that is not the one on disk.
    if src_ex5.stat().st_mtime < src.stat().st_mtime:
        raise StaleBinary(
            f"{src_ex5.name} is older than {src.name}; "
            f"recompile before installing"
        )

    dest = dest_dir / f"{name}.ex5"
    shutil.copy2(src_ex5, dest)
    shutil.copy2(src, dest_dir / f"{name}.mq5")
    return dest


class StaleBinary(RuntimeError):
    """Raised when an .ex5 predates its .mq5 -- i.e. the test would lie."""


# --- Run the tester ------------------------------------------------------
@dataclass
class TesterRun:
    """What a tester run actually produced.

    `csv` is the authoritative result: the EA writes it from OnTester() via
    FILE_COMMON, and it carries every metric we need. `report` is MT5's own
    HTML render, which this build does NOT write on a headless /config run --
    it is recorded but never waited on.
    """

    csv: Path | None = None
    report: Path | None = None
    seconds: float = 0.0
    passes: list[Path] | None = None

    @property
    def ok(self) -> bool:
        return self.csv is not None or bool(self.passes)


def terminal_pids() -> list[int]:
    """PIDs of running MT5 terminals (any data directory)."""
    if os.name == "nt":
        out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq terminal64.exe",
                              "/FO", "CSV", "/NH"],
                             capture_output=True, text=True, timeout=30).stdout
        pids = []
        for line in out.splitlines():
            parts = [p.strip('" ') for p in line.split('","')]
            if len(parts) > 1 and parts[1].isdigit():
                pids.append(int(parts[1]))
        return pids
    return []


def close_terminal(timeout: float = 60.0) -> list[int]:
    """Shut any MT5 terminal down, politely then forcibly. Returns survivors.

    Needed between back-to-back passes. ShutdownTerminal=1 in the ini is not
    honoured reliably -- the terminal has been observed still resident minutes
    after a completed run -- and because MT5 allows one terminal per data
    directory and ignores /config for an existing one, the next pass then dies
    with "still running as pid ..." having executed nothing at all.

    Safe to force: only ever called once the run's CSV has been read back, so
    there is no result left to lose.
    """
    if not wait_for_terminal(timeout):
        return []

    survivors = terminal_pids()
    for pid in survivors:
        try:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"],
                               capture_output=True, timeout=30)
            else:
                os.kill(pid, 15)
        except Exception:
            pass
    wait_for_terminal(15.0)
    return terminal_pids()


def wait_for_terminal(timeout: float = 90.0) -> list[int]:
    """
    Block until no MT5 terminal is running.

    MT5 allows only one terminal per data directory, and a terminal that is
    still shutting down when /config arrives silently swallows the request --
    the test never runs and no report is written. Back-to-back runs therefore
    fail in an alternating pattern, which is easy to misread as a bad
    parameter set. Returns any PIDs still alive at the timeout.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        pids = terminal_pids()
        if not pids:
            return []
        time.sleep(1.0)
    return terminal_pids()


def run_tester(expert_rel: str, *, symbol="EURUSD", timeframe="M1",
               frm="2026.09.01", to="2026.09.30", model=0, deposit=10000,
               leverage="1:100", optimization=0,
               tag="default", timeout=900,
               extra: dict | None = None) -> TesterRun:
    """
    Launch the terminal with a [Tester] config and wait for the EA's CSV.

    Two facts drive the design here, both verified on this machine:

      1. A headless /config run does NOT produce a .htm tester report. A
         minimal hand-written config was tried; the test ran and finished
         ("automatic testing finished") but no HTML appeared anywhere under
         the data or install trees. Waiting on it just burns the timeout.
      2. ShutdownTerminal=1 makes the terminal exit immediately after the
         test, so process exit is a reliable "finished" signal.

    So completion is detected from the CSV, with process exit as the
    backstop, and the run returns as soon as either fires.
    """
    REPORTS.mkdir(parents=True, exist_ok=True)
    # Generated configs go in run_ini/ so the tool root stays readable; the
    # terminal needs the path, not a particular location.
    ini_dir = WORK / "run_ini"
    ini_dir.mkdir(parents=True, exist_ok=True)
    now = time.time()
    ini = ini_dir / f"tester_{int(now)}.ini"

    # Absolute, because MT5 resolves a relative Report= against its own
    # working directory (the Program Files install folder).
    report_path = REPORTS / f"sf_{int(now * 1000)}.htm"
    report_name = str(report_path)

    # EA inputs do NOT go in [Tester] as InpX= keys -- MT5 parses those
    # section fine and silently ignores them, so every input kept its
    # compiled default. They must be supplied through a .set file named by
    # ExpertParameters. Writing a .set is what makes --mode/--fast/--tag
    # actually take effect.
    set_name = f"sf_{int(now * 1000)}.set"
    set_path = data_dir() / "MQL5" / "Profiles" / "Tester" / set_name
    # ExpertParameters must be a BARE FILE NAME. Verified by probing all
    # three forms against the terminal log:
    #     "sf_probe.set"                        -> inputs applied
    #     "MQL5\Profiles\Tester\sf_probe.set"  -> ignored, defaults used
    #     "C:\...\sf_probe.set"                -> ignored, defaults used
    # The two failing forms are accepted by the ini parser and then silently
    # dropped, which is easy to miss: the run looks fine and just quietly
    # tests the compiled defaults.
    if extra:
        set_path.parent.mkdir(parents=True, exist_ok=True)
        if optimization:
            # Optimisation ranges live in the .set itself, one field per
            # parameter:  value||start||step||stop||Y|N
            # The trailing flag decides whether MT5 sweeps that input at all.
            # A value on its own pins the parameter. Format taken from the
            # .set that MT5's own GUI writes.
            lines_set = []
            for k, v in extra.items():
                spec = v
                if isinstance(spec, dict):
                    start = spec["start"]
                    step = spec.get("step", 1)
                    stop = spec["stop"]
                    lines_set.append(f"{k}={v.get('value', start)}||{start}||{step}||{stop}||Y")
                else:
                    lines_set.append(f"{k}={v}||{v}||1||{v}||N")
            set_path.write_text("\n".join(lines_set) + "\n", encoding="utf-8")
        else:
            set_path.write_text(
                "".join(f"{k}={v}\n" for k, v in extra.items()), encoding="utf-8")

    lines = [
        "[Experts]",
        "AllowLiveTrading=0",          # a stray test must never place an order
        "AllowDllImport=0",
        "Enabled=1",
        "",
        "[Tester]",
        f"Expert={expert_rel}",
        f"ExpertParameters={set_name if extra else ''}",
        f"Symbol={symbol}",
        f"Period={timeframe}",
        f"Login=123456",
        f"Deposit={deposit}",
        f"Leverage={leverage}",
        f"Model={model}",
        "ExecutionMode=0",
        f"Optimization={optimization}",
        "OptimizationCriterion=6",     # use OnTester()'s return value
        f"FromDate={frm}",
        f"ToDate={to}",
        "ForwardMode=0",
        f"Report={report_name}",
        "ReplaceReport=1",
        "ShutdownTerminal=1",
        "UseLocal=1",
        "UseRemote=0",
        "UseCloud=0",
        "Visual=0",
    ]
    ini.write_text("\n".join(lines), encoding="utf-8")

    # Refuse to launch into a terminal that is still shutting down: the new
    # /config is swallowed and the run produces nothing at all.
    busy = wait_for_terminal()
    if busy:
        raise RuntimeError(
            f"MT5 terminal still running as pid {busy}. Only one instance per "
            f"data directory is allowed, and /config is ignored by an existing "
            f"terminal. Close it first:  Stop-Process -Id {busy[0]}")

# CSVs are the completion signal, so stale copies must not be mistaken for
    # this run's results. Delete them rather than comparing mtimes.
    #
    # In optimisation mode each pass writes its own hashed filename, because
    # all passes run concurrently on separate agents and would otherwise
    # overwrite one shared file and leave a single survivor.
    common = common_files_dir()
    if optimization:
        for old in common.glob(f"StrategyForge_{tag}*.csv"):
            try:
                old.unlink()
            except OSError:
                pass
        csv_path = None
    else:
        csv_path = common / f"StrategyForge_{tag}.csv"
        try:
            csv_path.unlink()
        except OSError:
            pass

    stamp = now
    proc = subprocess.Popen(
        [str(TERMINAL), f"/config:{ini}"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )

    def harvest():
        if optimization:
            return sorted(p for p in common.glob(f"StrategyForge_{tag}_*.csv")
                          if p.stat().st_size > 0)
        return [csv_path] if csv_path and csv_path.exists() else []

    # ShutdownTerminal=1 makes the terminal exit immediately after the test,
    # so process exit plus a short grace period means "nothing more is
    # coming" -- return rather than sitting out the timeout.
    deadline = stamp + timeout
    grace_until = None
    while time.time() < deadline:
        done = harvest()

        # A single pass is finished the moment its CSV appears. An
        # optimisation is only finished when the terminal exits, since any
        # number of passes may still be outstanding.
        if done and not optimization:
            return TesterRun(csv=done[0],
                             report=report_path if report_path.exists() else None,
                             passes=done,
                             seconds=round(time.time() - stamp, 1))

        if proc.poll() is not None:
            if grace_until is None:
                grace_until = time.time() + 15   # let the files flush
            elif time.time() > grace_until:
                return TesterRun(report=report_path if report_path.exists() else None,
                                 passes=harvest(),
                                 seconds=round(time.time() - stamp, 1))
        else:
            grace_until = None

        time.sleep(2)

    return TesterRun(report=report_path if report_path.exists() else None,
                     passes=harvest(),
                     seconds=round(time.time() - stamp, 1))


# --- Read the EA's own CSV ----------------------------------------------
def read_report(tag: str) -> dict | None:
    """
    Read one CSV the EA wrote.

    The delimiter is sniffed rather than assumed. The EA has produced all three
    of these at different times -- no separator at all (FILE_TXT), a tab
    (FILE_CSV with the terminal's default FIO_DELIMITER), and a comma -- and a
    reader that hard-codes ',' silently returns one giant key instead of failing,
    which looks like valid output while every field is garbage.
    """
    f = common_files_dir() / f"StrategyForge_{tag}.csv"
    if not f.exists():
        return None

    text = f.read_text(encoding="utf-8", errors="ignore")
    header = text.splitlines()[0] if text.splitlines() else ""
    delim = max((",", "\t", ";"), key=header.count)

    rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    rows = [r for r in rows if r and any(c.strip() for c in r)]
    if len(rows) < 2:
        return None

    header_row, value_row = rows[0], rows[1]
    if len(value_row) != len(header_row):
        raise ValueError(
            f"{f.name}: header has {len(header_row)} fields but the value row "
            f"has {len(value_row)} (delimiter {delim!r}); refusing to guess a "
            f"mapping because a wrong pairing reads as real data.")

    return dict(zip(header_row, value_row))


def list_reports() -> list[Path]:
    d = common_files_dir()
    if not d.exists():
        return []
    return sorted(d.glob("StrategyForge_*.csv"), key=lambda p: p.stat().st_mtime,
                  reverse=True)


def parse_range(spec: str) -> dict:
    """Parse 'start:stop:step' (step optional) into an optimisation range."""
    parts = spec.split(":")
    if len(parts) == 2:
        start, stop, step = parts[0], parts[1], 1
    elif len(parts) == 3:
        start, stop, step = parts
    else:
        raise argparse.ArgumentTypeError(
            f"expected start[:stop][:step], got {spec!r}")

    def num(x):
        f = float(x)
        return int(f) if f.is_integer() else f

    if num(step) == 0:
        raise argparse.ArgumentTypeError("step cannot be 0")
    return {"start": num(start), "stop": num(stop), "step": num(step)}


def tester_log_tail(n: int = 6) -> str:
    """The last few optimisation lines from the terminal's tester log.

    That log is the only place the pass count and timing survive, since the
    report file is never written by a headless /config run.
    """
    logs = data_dir() / "Tester" / "logs"
    if not logs.exists():
        return "  (no tester log found)"
    newest = max(logs.glob("*.log"), key=lambda p: p.stat().st_mtime)
    text = newest.read_text(encoding="utf-16-le", errors="ignore")
    keep = [l for l in text.splitlines()
            if "optimization" in l.lower() or "passes" in l.lower()]
    return "\n".join("  " + l.strip() for l in keep[-n:]) or "  (nothing found)"


def read_passes(paths: list[Path]) -> list[dict]:
    out = []
    for p in paths:
        r = read_report_path(p)
        if r:
            r["_file"] = p.name
            out.append(r)
    return out


def read_report_path(f: Path) -> dict | None:
    if not f.exists():
        return None
    text = f.read_text(encoding="utf-8", errors="ignore")
    rows = [r for r in text.splitlines() if r.strip()]
    if len(rows) < 2:
        return None
    delim = max((",", "\t", ";"), key=rows[0].count)
    parsed = list(csv.reader(io.StringIO(text), delimiter=delim))
    parsed = [r for r in parsed if r and any(c.strip() for c in r)]
    if len(parsed) < 2 or len(parsed[0]) != len(parsed[1]):
        return None
    return dict(zip(parsed[0], parsed[1]))


def _add_common(p) -> None:
    """Every argument that defines a test, for run and oos alike.

    Kept as one function because the two subcommands drifted apart once already:
    `optimise` still sent InpMode while `run` sent the taxonomy, and the only
    symptom was an optimisation that optimised a strategy nobody had selected.
    """
    p.add_argument("--src", default=str(CANON),
                   help="EA source; re-synced onto the compile target first")
    p.add_argument("--terminal", default=None,
                   help="MT5 instance to test against: 'portable' for the "
                        "second installation in Tools\\MT5\\terminal2, a path "
                        "to an installation, or omit for the primary. Use "
                        "portable so an open GUI cannot block headless runs.")
    p.add_argument("--mode", type=int, default=0, choices=list(MODE_NAMES),
                   help="InpFamily: the entry idea")
    p.add_argument("--fast", type=int, default=20)
    p.add_argument("--slow", type=int, default=50)
    p.add_argument("--period", type=int, default=20)
    p.add_argument("--threshold", type=float, default=2.0)
    p.add_argument("--lots", type=float, default=0.10)
    p.add_argument("--stop", type=float, default=20.0)
    p.add_argument("--take", type=float, default=30.0)
    p.add_argument("--symbol", default="EURUSD")
    p.add_argument("--timeframe", default="M1")
    p.add_argument("--from", dest="frm", default="2026.09.01")
    p.add_argument("--to", default="2026.09.30")
    p.add_argument("--model", type=int, default=0)
    p.add_argument("--criterion", type=int, default=1, choices=list(CRIT_NAMES))
    p.add_argument("--tag", default="default")
    p.add_argument("--class", dest="cls", type=int, default=0, choices=list(CLASS_NAMES))
    p.add_argument("--indicator", type=int, default=0, choices=list(GATE_NAMES))
    p.add_argument("--pattern", type=int, default=0, choices=list(PATTERN_NAMES))
    p.add_argument("--tf-fit", dest="tffit", type=int, default=0, choices=list(TF_NAMES))
    p.add_argument("--run-len", type=int, default=None)
    p.add_argument("--strength-min", type=float, default=None)
    p.add_argument("--range-len", type=int, default=None)
    p.add_argument("--vol-mult", type=float, default=None)
    p.add_argument("--min-edge-ticks", type=int, default=None)
    p.add_argument("--spread-max-ticks", type=int, default=None)
    p.add_argument("--min-trades", type=int, default=None)


def _resolve_terminal_arg(value: str | None) -> Path:
    """Turn --terminal into a root path, and point the runner at it."""
    if not value:
        return set_target_terminal(None)
    if value.lower() in ("portable", "second", "2"):
        if PORTABLE_ROOT is None:
            raise FileNotFoundError(
                "no portable MT5 installation found. Looked in: "
                + ", ".join(str(p) for p in (
                    WORK / "terminal2", WORK.parent / "terminal2",
                    Path(r"C:\Users\faarh\Workspaces\Tools\MT5\terminal2")))
                + ". Set STRATEGYFORGE_PORTABLE to its path, or pass the "
                  "installation path directly to --terminal.")
        return set_target_terminal(PORTABLE_ROOT)
    return set_target_terminal(Path(value))


def _build_inputs(a) -> dict:
    """Translate CLI args into the EA's input dict (InpXxx -> value)."""
    extra = {
        "InpClass": a.cls, "InpFamily": a.mode,
        "InpIndicator": a.indicator, "InpPattern": a.pattern,
        "InpTimeframeFit": a.tffit,
        "InpFast": a.fast, "InpSlow": a.slow,
        "InpPeriod": a.period, "InpThreshold": a.threshold,
        "InpLots": a.lots, "InpStopPips": a.stop,
        "InpTakePips": a.take, "InpCriterion": a.criterion,
        "InpTag": a.tag,
    }
    for flag, key in (("run_len", "InpRunLen"),
                      ("strength_min", "InpStrengthMin"),
                      ("range_len", "InpRangeLen"),
                      ("vol_mult", "InpVolMult"),
                      ("min_edge_ticks", "InpMinEdgeTicks"),
                      ("spread_max_ticks", "InpSpreadMaxTicks"),
                      ("min_trades", "InpMinTrades")):
        v = getattr(a, flag, None)
        if v is not None:
            extra[key] = v
    return extra


def _d(s: str) -> dt.date:
    return dt.datetime.strptime(s, "%Y.%m.%d").date()


def _shift(day: dt.date, **kw) -> str:
    return (day + dt.timedelta(**kw)).strftime("%Y.%m.%d")


def _f(row: dict, key: str, default: float = 0.0) -> float:
    try:
        return float(row.get(key, default))
    except (TypeError, ValueError):
        return default


def _print_oos(rows) -> None:
    """Compare in-sample against out-of-sample, and say plainly what it means.

    A strategy is only interesting if the OOS column holds up. Three failure
    shapes are called out separately because they have different causes:

      edge evaporates   OOS PF drops to ~1 while OOS trades stay plentiful.
                        The rule was fitted to the in-sample window.
      never traded      OOS has too few trades to say anything. Not evidence
                        of anything -- the honest answer is "need more data",
                        so it is reported as such rather than as a pass.
      works out-of-sample  OOS PF > 1 with enough trades. Only now is a
                        candidate, and even then it needs a second, unseen
                        period before it is believed.
    """
    (is_label, isr), (oos_label, oosr) = rows

    print("\n" + "=" * 72)
    print(f"{'metric':<26}{'in-sample':>14}{'out-of-sample':>16}")
    print("-" * 72)

    def row(name: str, key: str, fmt: str = "{:>14.4f}") -> None:
        print(f"{name:<26}" + fmt.format(_f(isr, key))
              + fmt.replace(">14", ">16").format(_f(oosr, key)))

    row("trades", "trades", "{:>14.0f}")
    row("win rate %", "win_rate", "{:>14.2f}")
    row("break-even win rate %", "breakeven_win_rate", "{:>14.2f}")
    row("profit", "profit", "{:>14.2f}")
    row("profit factor", "profit_factor")
    row("avg win (ticks)", "avg_win_ticks", "{:>14.3f}")
    row("avg loss (ticks)", "avg_loss_ticks", "{:>14.3f}")
    row("t-stat", "t_stat", "{:>14.3f}")
    row("max DD %", "dd_rel_pct", "{:>14.2f}")
    print("-" * 72)
    for label, row in (("IS window ", isr), ("OOS window", oosr)):
        print(f"{label:<26}{str(row.get('from_date', '?')):<20}"
              f"{str(row.get('to_date', '?'))}")
    for label, row in (("IS", isr), ("OOS", oosr)):
        v = str(row.get("verdict", "?"))
        print(f"{label + ' verdict':<26}{v[:44]}")
    print("=" * 72)

    min_n = _f(isr, "min_trades", 30.0)
    oos_n = _f(oosr, "trades")
    oos_pf = _f(oosr, "profit_factor")
    oos_wr = _f(oosr, "win_rate")
    oos_be = _f(oosr, "breakeven_win_rate")
    is_wr = _f(isr, "win_rate")
    is_be = _f(isr, "breakeven_win_rate")

    if oos_n < min_n:
        print(f"\nNEVER TRADED OUT-OF-SAMPLE ({oos_n:.0f} trades < {min_n:.0f} "
              f"required).")
        print("This is not evidence either way. Widen the OOS window or pick a")
        print("rule that fires more often before drawing a conclusion.")
        return

    is_bad = is_be > 0 and is_wr < is_be

    if oos_wr >= oos_be and oos_be > 0:
        print(f"\nHOLDS UP OUT-OF-SAMPLE: {oos_wr:.1f}% wins against "
              f"{oos_be:.1f}% needed.")
        if is_bad:
            print("Noted: the in-sample window did NOT support it "
                  f"({is_wr:.1f}% vs {is_be:.1f}% needed), so treat this as a")
            print("lucky window rather than a discovery until a third period")
            print("confirms it.")
        else:
            print("Candidate only. Confirm on a third window that was never")
            print("used for anything before treating it as real.")
    elif is_bad:
        # The honest reading when neither window cleared the bar: the rule was
        # not fitted and then forgotten, it simply never had an edge. Calling
        # that "evaporation" credits it with a beginning it never had.
        print(f"\nNO EDGE IN EITHER WINDOW.")
        print(f"  in-sample  {is_wr:.1f}% wins vs {is_be:.1f}% needed")
        print(f"  OOS        {oos_wr:.1f}% wins vs {oos_be:.1f}% needed")
        print("The two windows agree closely, which is what a rule with no")
        print("directional skill looks like: consistent, and consistently")
        print("below the rate needed to pay for the spread.")
    else:
        print(f"\nEDGE EVAPORATED: in-sample cleared {is_be:.1f}% but OOS "
              f"managed {oos_wr:.1f}% against {oos_be:.1f}% needed.")
        print("The in-sample result was fitted to that window and does not")
        print("generalise to this one.")


# --- CLI -----------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("compile", help="compile an .mq5")
    p.add_argument("--src", default=str(CANON))

    p = sub.add_parser("run", help="one tester pass")
    _add_common(p)

    p = sub.add_parser("oos", help="in-sample vs out-of-sample on one config")
    _add_common(p)
    p.add_argument("--oos-from", dest="oos_frm", default=None,
                   help="OOS start; defaults to the day after --to")
    p.add_argument("--oos-to", dest="oos_to", default=None,
                   help="OOS end; defaults to the day after --to plus the "
                        "in-sample length")

    sub.add_parser("list-reports", help="show CSV reports the EA wrote")

    p = sub.add_parser("read", help="read one CSV report")
    p.add_argument("--tag", required=True)

    p = sub.add_parser("optimise",
                       help="native MT5 optimisation over parameter ranges")
    p.add_argument("--src", default=str(CANON),
                   help="EA source; re-synced onto the compile target first")
    p.add_argument("--mode", type=int, default=0, choices=list(MODE_NAMES))
    p.add_argument("--fast", type=parse_range, help="e.g. 8:24:4")
    p.add_argument("--slow", type=parse_range, help="e.g. 20:60:10")
    p.add_argument("--period", type=parse_range)
    p.add_argument("--threshold", type=parse_range)
    p.add_argument("--lots", type=float, default=0.10)
    p.add_argument("--stop", type=float, default=20.0)
    p.add_argument("--take", type=float, default=30.0)
    p.add_argument("--symbol", default="EURUSD")
    p.add_argument("--timeframe", default="M1")
    p.add_argument("--from", dest="frm", default="2026.09.01")
    p.add_argument("--to", default="2026.09.30")
    p.add_argument("--model", type=int, default=0)
    p.add_argument("--criterion", type=int, default=1, choices=list(CRIT_NAMES))
    p.add_argument("--tag", default="opt")
    p.add_argument("--optmode", dest="optmode", type=int, default=1,
                   choices=[1, 2], help="1 = slow complete, 2 = fast genetic")
    p.add_argument("--timeout", type=float, default=1800)
    p.add_argument("--top", type=int, default=10, help="rows to print")

    a = ap.parse_args()

    # Select the MT5 instance before anything touches it. Must happen before
    # compile/install/run, since all three resolve paths through data_dir().
    # `compile` only needs the primary MetaEditor, but still resolves the
    # target so a bad --terminal fails immediately rather than mid-run.
    if a.cmd in ("run", "oos", "optimise", "compile"):
        try:
            target_data = _resolve_terminal_arg(getattr(a, "terminal", None))
        except FileNotFoundError as e:
            print(f"{e}", file=sys.stderr)
            return 2
        if a.cmd != "compile" or getattr(a, "terminal", None):
            which = ("portable " + str(target_data)) if TERMINAL_PORTABLE \
                else ("primary " + str(target_data))
            print(f"target terminal: {which}")

    if a.cmd == "compile":
        src = prepare_source(a.src)
        ok, log = compile_mq5(src)
        tail = [l for l in log.splitlines()
                if "error" in l.lower() or "Result:" in l]
        print("\n".join(tail[-25:]) or log[-800:])
        print("\nCOMPILE", "OK" if ok else "FAILED")
        return 0 if ok else 1

    if a.cmd == "list-reports":
        for f in list_reports():
            print(f)
        return 0

    if a.cmd == "read":
        r = read_report(a.tag)
        if not r:
            print(f"no report for tag {a.tag!r}")
            return 2
        print(json.dumps(r, indent=2))
        return 0

    if a.cmd == "optimise":
        src = prepare_source(a.src)
        ok, log = compile_mq5(src)
        if not ok:
            print("\n".join(l for l in log.splitlines()
                            if "error" in l.lower())[-2000:])
            print("COMPILE FAILED - not optimising")
            return 1
        print("compiled OK")

        dest = install_ex5("StrategyForge", src)
        if not dest:
            print("could not install the .ex5 into MQL5\\Experts")
            return 2

        extra = {
            "InpClass": a.cls, "InpFamily": a.mode,
            "InpIndicator": a.indicator, "InpPattern": a.pattern,
            "InpTimeframeFit": a.tffit,
            "InpLots": a.lots,
            "InpStopPips": a.stop, "InpTakePips": a.take,
            "InpCriterion": a.criterion, "InpTag": a.tag,
        }

        # Grid size is the product of each swept parameter's step count.
        ranges = {"InpFast": a.fast, "InpSlow": a.slow,
                  "InpPeriod": a.period, "InpThreshold": a.threshold}
        grid = 1
        swept = 0
        for key, rng in ranges.items():
            if not rng:
                continue
            extra[key] = rng
            swept += 1
            grid *= int(abs((rng["stop"] - rng["start"]) / rng["step"]) + 1)

        if not swept:
            print("nothing to sweep: pass at least one of "
                  "--fast/--slow/--period/--threshold as start:stop[:step]")
            return 2
        print(f"sweeping {grid} combinations, optimizer mode {a.optmode} "
              f"({'genetic' if a.optmode == 2 else 'complete'})")

        run = run_tester("StrategyForge\\StrategyForge.ex5",
                         symbol=a.symbol, timeframe=a.timeframe,
                         frm=a.frm, to=a.to, model=a.model,
                         optimization=a.optmode, tag=a.tag,
                         timeout=a.timeout, extra=extra)
        print(f"finished in {run.seconds}s")

        passes = read_passes(run.passes or [])
        if not passes:
            # The optimisation itself ran -- MT5 reports the pass count -- but
            # per-pass results are not retrievable headlessly on this build:
            # OnTester() is not called during optimisation, and a Report= file
            # (either .htm or .xml) is never written by a /config run.
            print(f"optimisation ran in {run.seconds}s, but no per-pass CSV was "
                  f"recoverable.")
            print("  OnTester() is not invoked when Optimization!=0, and this "
                  "build writes no report file headlessly, so per-pass metrics "
                  "are only visible in the GUI's Results tab or by scraping the "
                  "agent logs:")
            print("  %APPDATA%\\MetaQuotes\\Tester\\<id>\\Agent-127.0.0.1-300*\\logs\\")
            print(tester_log_tail())
            return 3
        print(f"passes recovered: {len(passes)}")

        rows = []
        for r in passes:
            try:
                rows.append({
                    "score": float(r["score"]),
                    "trades": int(float(r["trades"])),
                    "profit": float(r["profit"]),
                    "pf": float(r["profit_factor"]),
                    "sharpe": float(r["sharpe"]),
                    "dd_pct": float(r["dd_rel_pct"]),
                    "fast": r["fast"], "slow": r["slow"],
                    "period": r["period"], "threshold": r["threshold"],
                })
            except (KeyError, ValueError):
                continue
        rows.sort(key=lambda x: x["score"], reverse=True)

        print(f"\n{'score':>10} {'trades':>7} {'profit':>9} {'pf':>7} "
              f"{'sharpe':>8} {'dd%':>6}  fast slow period thr")
        for r in rows[:a.top]:
            print(f"{r['score']:>10.4f} {r['trades']:>7} {r['profit']:>9.2f} "
                  f"{r['pf']:>7.3f} {r['sharpe']:>8.3f} {r['dd_pct']:>6.2f}  "
                  f"{r['fast']:>4} {r['slow']:>4} {r['period']:>6} {r['threshold']:>5}")
        return 0

    if a.cmd == "run":
        src = prepare_source(a.src)
        ok, log = compile_mq5(src)
        if not ok:
            print("\n".join(l for l in log.splitlines() if "error" in l.lower())[-2000:])
            print("COMPILE FAILED - not running")
            return 1
        print("compiled OK")

        dest = install_ex5("StrategyForge", src)
        if not dest:
            print("could not install the .ex5 into MQL5\\Experts")
            return 2
        rel = "StrategyForge\\StrategyForge.ex5"
        print(f"installed -> {dest}")

        extra = _build_inputs(a)

        # The criterion reaches the EA as InpCriterion in the .set, not
        # through [Tester] -- the ini always sets OptimizationCriterion=6
        # so MT5 uses OnTester()'s return value as the objective.
        run = run_tester(
            rel, symbol=a.symbol, timeframe=a.timeframe,
            frm=a.frm, to=a.to, model=a.model,
            extra=extra,
            tag=a.tag,
        )
        print(f"run finished in {run.seconds}s")
        if run.csv:
            print("csv report:", run.csv)
        else:
            print("csv report: NONE - OnTester() did not run.")
        print("htm report:", run.report or "(MT5 wrote none headlessly - expected)")

        r = read_report(a.tag)
        if not r:
            print("NO CSV REPORT - the tester did not complete, or OnTester "
                  "never ran. Check the terminal's tester log.")
            return 2
        print(json.dumps(r, indent=2))
        return 0

    if a.cmd == "oos":
        # Two passes of the SAME config on disjoint windows, both on MT5's own
        # tester. This is the only check that catches a strategy fitted to one
        # month and silent about every other.
        src = prepare_source(a.src)
        ok, log = compile_mq5(src)
        if not ok:
            print("\n".join(l for l in log.splitlines()
                            if "error" in l.lower())[-2000:])
            print("COMPILE FAILED - not running")
            return 1
        print("compiled OK")
        dest = install_ex5("StrategyForge", src)
        if not dest:
            print("could not install the .ex5 into MQL5\\Experts")
            return 2
        rel = "StrategyForge\\StrategyForge.ex5"

        # Default OOS window: the same LENGTH as the in-sample window, starting
        # the day after it ends. Same length matters -- a shorter OOS period
        # yields too few trades to rule on, and InpMinTrades will correctly
        # refuse to judge it rather than report noise as a result.
        span = (_d(a.to) - _d(a.frm)).days
        oos_frm = a.oos_frm or _shift(_d(a.to), days=1)
        oos_to = a.oos_to or _shift(_d(oos_frm), days=span)

        base = _build_inputs(a)
        rows = []
        for label, frm, to in (("in-sample", a.frm, a.to),
                               ("out-of-sample", oos_frm, oos_to)):
            tag = a.tag if label == "in-sample" else a.tag + "_oos"
            extra = dict(base)
            extra["InpTag"] = tag
            print(f"\n=== {label}: {frm} -> {to} ===")
            # The previous pass's CSV is already in hand, so it is safe to make
            # sure no terminal is left holding the data directory.
            left = close_terminal()
            if left:
                print(f"could not close MT5 pid(s) {left}; the next pass will "
                      f"not start. Close them and re-run.")
                return 2
            run_tester(rel, symbol=a.symbol, timeframe=a.timeframe,
                       frm=frm, to=to, model=a.model, extra=extra, tag=tag)
            row = read_report(tag)
            if not row:
                print(f"no CSV for {label}; aborting")
                return 2
            rows.append((label, row))

        _print_oos(rows)
        return 0

    return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except StaleBinary as e:
        # Loud and fatal. A stale .ex5 yields a plausible-looking report about
        # code that is not on disk, so this must never be swallowed.
        print(f"STALE BINARY: {e}", file=sys.stderr)
        sys.exit(3)
    except FileNotFoundError as e:
        print(f"source not found: {e}", file=sys.stderr)
        sys.exit(2)
