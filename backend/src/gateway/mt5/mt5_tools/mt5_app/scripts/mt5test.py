"""
Run the MetaTrader 5 native Strategy Tester headlessly.

    python mt5test.py --expert "Experts\Bots\StrategyForge" --symbol "Step Index" --period M15
    python mt5test.py --expert "Experts\Bots\StrategyForge" --symbol "Step Index" --model real-ticks --dry-run
    python mt5test.py --expert ... --input InpMagic=42 --input InpLots=0.1

Three things about MT5 that will silently waste your time, and are handled here
because all three were found in the documentation rather than guessed:

1. THE INI MUST BE UTF-16-LE WITH A BOM. Written as UTF-8, terminal64 accepts
   the file, logs that it read the config, and then runs nothing. The report is
   never created and there is no error. `write_ini` handles the encoding.

2. THE TERMINAL MUST NOT ALREADY BE RUNNING. Windows reuses the existing
   terminal64.exe process, and the [Tester] block is never applied. The test
   silently does not happen. `preflight` refuses to run in that state unless
   you pass --force.

3. SPREAD IS NOT MODELLED. "During testing, the spread is not modeled but is
   taken from historical data. If the historical spread is less than or equal
   to zero, then the last known spread is used." Every Skew-family symbol
   stores spread = 0 in its bars, so the tester will substitute something
   rather than use the real thing. Anything cost-sensitive needs the live
   spread injected, not the stored column.

Tick generation modes. The `Model=` code is reported inconsistently across
documentation, so both readings are accepted by name and the code actually
written is printed before anything runs:

    every-tick   0    generated from bar data, slowest, no real ticks
    real-ticks   1    broker-accumulated real ticks, the accurate mode
    minute-ohlc  2    four prices per minute bar
    open-only    3    OHLC generated, only the open is used
    math         4    no history, no ticks, OnInit/OnTester/OnDeinit only

If the run produces no report, check the terminal log rather than guessing; the
tail of the last log is printed on failure.
"""
from __future__ import annotations

import argparse
import configparser
import os
import pathlib
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

DEFAULT_TERMINAL = pathlib.Path(r"C:\Program Files\MetaTrader 5\terminal64.exe")
MODELS = {
    "every-tick": 0,
    "real-ticks": 1,
    "minute-ohlc": 2,
    "open-only": 3,
    "math": 4,
}
PERIODS = {"M1": 1, "M5": 5, "M15": 15, "M30": 30,
           "H1": 16385, "H4": 16388, "D1": 16408}


def locate_data_dir(terminal: pathlib.Path) -> pathlib.Path | None:
    """
    The roaming profile folder whose origin.txt points at this terminal.

    origin.txt is UTF-16-LE with a BOM, same as the tester ini. Read as utf-8
    it decodes to nothing and every folder looks like a non-match, which is
    exactly what happened on the first run.
    """
    root = pathlib.Path(os.environ["APPDATA"]) / "MetaQuotes" / "Terminal"
    if not root.is_dir():
        return None
    want = os.path.normcase(os.path.abspath(str(terminal.parent)))
    for d in root.iterdir():
        if not d.is_dir():
            continue
        origin = d / "origin.txt"
        if not origin.is_file():
            continue
        raw = origin.read_bytes()
        for enc in ("utf-16", "utf-8"):
            try:
                text = raw.decode(enc).strip().lstrip("\ufeff").strip()
            except (UnicodeDecodeError, ValueError):
                continue
            if os.path.normcase(os.path.abspath(text)) == want:
                return d
    return None


def all_terminals():
    """Every registered terminal, so a portable second install can be found."""
    out = []
    root = pathlib.Path(os.environ["APPDATA"]) / "MetaQuotes" / "Terminal"
    if not root.is_dir():
        return out
    for d in root.iterdir():
        origin = d / "origin.txt"
        if not origin.is_file():
            continue
        try:
            text = origin.read_bytes().decode("utf-16").strip().lstrip("\ufeff")
        except (UnicodeDecodeError, ValueError):
            continue
        exe = pathlib.Path(text) / "terminal64.exe"
        if exe.exists():
            out.append((exe, d))
    return out


def terminal_running(terminal: pathlib.Path) -> bool:
    if not terminal.exists():
        return False
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "(Get-CimInstance Win32_Process -Filter \"Name='terminal64.exe'\" "
             "| Select-Object -ExpandProperty ExecutablePath)"],
            capture_output=True, text=True, timeout=20)
        paths = [p.strip().lower() for p in out.stdout.splitlines() if p.strip()]
        return str(terminal.resolve()).lower() in paths or bool(paths)
    except Exception:
        return False


def resolve_expert(expert: str, data_dir: pathlib.Path | None):
    """
    Work out what `Expert=` must contain, and prove the .ex5 is really there.

    terminal64 resolves Expert= relative to MQL5\\Experts, so it PREPENDS
    "Experts\\" itself. Passing "Experts\\Bots\\StrategyForge" -- which is what
    the community examples show -- makes it look for
    "Experts\\Experts\\Bots\\StrategyForge.ex5", fail, and exit about ten
    seconds later having produced no report and no useful message. The only
    clue is one line in the tester log.

    So: strip a leading Experts\\ if present, then verify the file exists in
    both the roaming profile and the portable directory. Finding it in neither
    is a preflight failure rather than a silent ten-second run.
    """
    name = expert.strip()
    for suffix in (".ex5", ".mq5"):
        if name.lower().endswith(suffix):
            name = name[: -len(suffix)]
            break
    if name.lower().startswith("experts\\"):
        name = name[len("Experts\\"):]

    found = []
    roots = []
    if data_dir:
        roots.append(data_dir / "MQL5" / "Experts")
    portable = pathlib.Path(r"C:\Program Files\MetaTrader 5")
    roots.append(portable / "MQL5" / "Experts")
    for root in roots:
        cand = root / f"{name}.ex5"
        if cand.exists():
            found.append(cand)
    return name, found


INPUT_RE = re.compile(
    r"^\s*input\s+(?:group\s+)?(?:ENUM_\w+|string|double|int|bool|uint|long|"
    r"char|ulong|ushort)\s+(\w+)\s*(?:=\s*([^;]+))?;", re.M)


def ea_inputs(mq5: pathlib.Path) -> dict:
    """
    Every declared input and its default, read from the EA source.

    terminal64 MERGES [TesterInputs] with the previously persisted input set
    rather than replacing it. A run that names only the values it cares about
    silently inherits the rest from the last run -- observed directly: a run
    meant to use InpTakePips=30 came back with InpTakePips=1.2 and therefore a
    TP edge of 11 ticks, and reported zero trades for a reason that had nothing
    to do with the strategy.

    Emitting the complete set every run makes inheritance impossible. Reading
    them from the source rather than hardcoding a list means a new input cannot
    be silently missed.
    """
    if not mq5.exists():
        return {}
    src = mq5.read_text(encoding="utf-8", errors="surrogateescape")
    out = {}
    for name, default in INPUT_RE.findall(src):
        if default is None:
            continue
        val = default.strip()
        # enum members land as bare identifiers; resolve them against the enum
        out[name] = val
    return out


def enum_members(mq5: pathlib.Path) -> dict:
    """Enum name -> integer value, so FAM_NULL can be written as 13 or its name."""
    if not mq5.exists():
        return {}
    src = mq5.read_text(encoding="utf-8", errors="surrogateescape")
    out = {}
    for body in re.findall(r"enum\s+(\w+)?\s*\{(.*?)\}", src, re.S):
        members, val = body[1], 0
        for line in members.splitlines():
            line = line.split("//")[0].strip()
            m = re.match(r"([A-Z_][A-Z_0-9]*)\s*(?:=\s*(\d+))?\s*,?$", line)
            if not m:
                continue
            # An explicit "= N" resets the counter; otherwise MQL5 implies the
            # previous member plus one. Forgetting to advance the counter
            # collapses every unnumbered enum to 0, which is how InpSLMode
            # came out as SL_PIPS (0) instead of SL_ATR_MULT (1) and the ATR
            # sizing silently never ran.
            if m.group(2) is not None:
                val = int(m.group(2))
            out[m.group(1)] = val
            val += 1
    return out


def render_ini(expert, symbol, period, model, from_date, to_date, deposit,
               currency, leverage, report, inputs, use_local=True,
               replace=True, shutdown=True, visual=True, optimization=0):
    """
    visual defaults to True so the Strategy Tester pane opens on screen, the way
    it did when this was driven by hand. Visual mode costs some speed and
    changes nothing about the numbers -- it just shows the run rather than
    hiding it behind a batch invocation.
    """
    lines = [
        "[Tester]",
        f"Expert={expert}",
        f"Symbol={symbol}",
        f"Period={period}",
        f"Model={model}",
        f"Optimization={optimization}",
        f"FromDate={from_date}",
        f"ToDate={to_date}",
        "ForwardMode=0",
        f"Deposit={deposit}",
        f"Currency={currency}",
        f"Leverage=1:{leverage}",
        "ExecutionMode=0",
        f"Visual={1 if visual else 0}",
        f"Report={report}",
        f"ReplaceReport={1 if replace else 0}",
        f"ShutdownTerminal={1 if shutdown else 0}",
        f"UseLocal={1 if use_local else 0}",
    ]
    if inputs:
        lines.append("")
        lines.append("[TesterInputs]")
        for k, v in inputs.items():
            lines.append(f"{k}={v}")
    return "\n".join(lines) + "\n"


def write_ini(path: pathlib.Path, text: str) -> None:
    """
    UTF-16-LE with BOM. This is the whole reason this function exists.

    A UTF-8 config is accepted by terminal64 and then ignored: the [Tester]
    block never applies, no report is produced, and the terminal exits with no
    diagnostic. Writing the file any other way looks completely correct.
    """
    path.write_bytes(b"\xff\xfe" + text.encode("utf-16-le"))


def preflight(terminal, data_dir, force):
    problems = []
    if not terminal.exists():
        problems.append(f"terminal not found: {terminal}")
        return problems
    if data_dir is None:
        problems.append("could not locate the terminal data folder "
                        "(no origin.txt matched)")
    if terminal_running(terminal) and not force:
        alts = [e for e, _ in all_terminals()
                if os.path.normcase(str(e)) != os.path.normcase(str(terminal))]
        msg = ("a terminal64.exe is already running. Windows reuses the "
               "existing process and the [Tester] block is silently ignored. "
               "Close MT5, or pass --force to try anyway.")
        if alts:
            msg += (" A second installation exists and is not running -- use "
                    "--terminal with: " + ", ".join(str(a) for a in alts))
        problems.append(msg)
    return problems


def newest_log(data_dir):
    """
    The TESTER log, not the terminal's MQL5 log.

    A tester's output goes to Tester\\logs; MQL5\\Logs holds live EA chatter
    from whatever happened to be attached to the chart. Reporting the latter
    when a test fails shows a wall of unrelated lines and hides the one that
    matters.
    """
    for base in (data_dir / "Tester" / "logs", data_dir / "MQL5" / "Logs",
                 data_dir / "logs"):
        if not base.is_dir():
            continue
        files = sorted(base.glob("*.log"), key=lambda p: p.stat().st_mtime)
        if files:
            return files[-1]
    return None


def find_report(data_dir, stem):
    """
    MT5 writes the tester report to the terminal data folder ROOT, not into
    MQL5\\Files. Searching only the Files subtree reports "no report" on a run
    that in fact completed and produced one.
    """
    cands = []
    for base in (data_dir, data_dir / "MQL5" / "Files" / "Reports",
                 data_dir / "reports", data_dir / "MQL5" / "Files"):
        if base.is_dir():
            cands += list(base.glob(f"{stem}*"))
    return max(cands, key=lambda p: p.stat().st_mtime) if cands else None


def parse_report(path: pathlib.Path) -> dict:
    """
    Pull the headline numbers out of the tester's HTML report.

    MT5 writes a wide table; only the totals rows are wanted here, and the
    column layout differs between builds, so the figures are located by their
    row labels rather than by column index.
    """
    raw = path.read_bytes()
    # MT5 writes these reports as UTF-16-LE with a BOM. Reading them as UTF-8
    # with errors="ignore" does not raise -- it silently deletes every second
    # byte of every label, so "Gross Profit" becomes unreadable and a regex
    # looking for it wanders off and matches some other number in the page.
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        html = raw.decode("utf-16", errors="replace")
    else:
        html = raw.decode("utf-8", errors="replace")

    # Walk the rows and keep the label/value pairs. MT5's summary is a two
    # column-per-side table, so "Gross Profit: 30.00" sits beside "Balance
    # Drawdown Maximal: 20.21". Flattening to plain text and regexing for a
    # label then picks up whichever number happens to follow it, which is how
    # "gross_loss" came back as -1: MT5 has no Gross Loss row at all.
    pairs = {}
    for row in re.findall(r"<tr\b.*?</tr>", html, re.S | re.I):
        cells = [re.sub(r"&nbsp;?", " ", re.sub(r"\s+", " ",
                  re.sub(r"<[^>]+>", " ", c))).strip()
                 for c in re.findall(r"<td\b[^>]*>(.*?)</td>", row, re.S | re.I)]
        cells = [c for c in cells if c]
        # The label and its value are SIBLING cells: <td>Gross Profit:</td>
        # <td><b>30.00</b></td>. A label cell is recognised by its trailing
        # colon and paired with the next cell, which is the number.
        for i, cell in enumerate(cells[:-1]):
            if not cell.endswith(":"):
                continue
            label = cell[:-1].strip()
            value = cells[i + 1].strip()
            if label and value and label not in pairs:
                pairs[label] = value
    text = " ".join(f"{k}: {v}" for k, v in pairs.items())
    # MT5 groups thousands with U+00A0 or U+202F, not a comma: "1 702.86".
    # Stripped of the separator that becomes "1702.86"; left in, the value
    # parses as 1 and a gross profit of 1702.86 gets reported as 1.
    text = re.sub(r"[\s\u00a0\u202f\u2009]+(?=[\d])", "", text)
    out = {}
    # MT5 renders these as "Total Net Profit: -504.31" -- label, colon, value.
    # The first version of this parser assumed a space separator and matched
    # nothing at all on a perfectly good 36 KB report.
    for key, pat in (
        ("total_net_profit", r"Total\s+Net\s+Profit:?\s*(-?[\d,.]+)"),
        ("profit_factor", r"Profit\s+Factor:?\s*([\d.,]+)"),
        ("expected_payoff", r"Expected\s+Payoff:?\s*(-?[\d.,]+)"),
        ("total_trades", r"Total\s+Trades:?\s*(\d+)"),
        ("short_trades", r"Short\s+Trades\s*\(won\s*%\):?\s*(\d+)"),
        ("long_trades", r"Long\s+Trades\s*\(won\s*%\):?\s*(\d+)"),
        ("gross_profit", r"Gross\s+Profit:?\s*(-?[\d,.]+)"),
        ("balance_dd_max", r"Balance\s+Drawdown\s+Maximal:?\s*(-?[\d,.]+)"),
        ("equity_dd_max", r"Equity\s+Drawdown\s+Maximal:?\s*(-?[\d,.]+)"),
        ("history_quality", r"History\s+Quality:?\s*([\d.]+)"),
        ("modeling_quality", r"Modeling\s+Quality:?\s*([\d.]+)"),
        ("bars", r"Bars:?\s*(\d+)"),
        ("ticks", r"Ticks:?\s*(\d+)"),
        ("total_buys", r"Total\s+Buys:?\s*(\d+)"),
    ):
        m = re.search(pat, text, re.I)
        if m:
            v = m.group(1).replace(",", "")
            try:
                out[key] = float(v) if "." in v else int(v)
            except ValueError:
                out[key] = v
    # Sharpe and the EA's own t-statistic only appear in the tester log, not
    # in the report table.
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--expert", required=True,
                    help=r'EA path relative to MQL5\Experts, e.g. '
                         r'Experts\Bots\StrategyForge  (omit the .ex5)')
    ap.add_argument("--symbol", default="Step Index")
    ap.add_argument("--period", default="M15", choices=sorted(PERIODS))
    ap.add_argument("--model", default="real-ticks", choices=sorted(MODELS))
    ap.add_argument("--days", type=float, default=90)
    ap.add_argument("--from", dest="from_date")
    ap.add_argument("--to", dest="to_date")
    ap.add_argument("--deposit", type=float, default=10000)
    ap.add_argument("--currency", default="USD")
    ap.add_argument("--leverage", type=int, default=100)
    ap.add_argument("--terminal", type=pathlib.Path, default=DEFAULT_TERMINAL)
    ap.add_argument("--input", action="append", default=[],
                    metavar="NAME=VALUE",
                    help="EA input passed through [TesterInputs]; repeatable")
    ap.add_argument("--optimization", type=int, default=0)
    ap.set_defaults(visual=True)
    ap.add_argument("--no-visual", dest="visual", action="store_false",
                    help="run the tester hidden instead of showing the pane")
    ap.add_argument("--no-shutdown", dest="shutdown", action="store_false")
    ap.add_argument("--force", action="store_true",
                    help="run even if a terminal is already open")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", type=pathlib.Path,
                    default=pathlib.Path(os.environ.get("TEMP", ".")) /
                             "mt5tester")
    args = ap.parse_args()

    if args.from_date:
        frm = datetime.strptime(args.from_date, "%Y-%m-%d").date()
    else:
        frm = (datetime.now(timezone.utc)
               - timedelta(days=args.days)).date()
    to = (datetime.strptime(args.to_date, "%Y-%m-%d").date()
          if args.to_date else datetime.now(timezone.utc).date())

    inputs = {}
    for item in args.input:
        if "=" not in item:
            print(f"  bad --input {item!r}, expected NAME=VALUE")
            return 2
        k, v = item.split("=", 1)
        inputs[k.strip()] = v.strip()

    data_dir = locate_data_dir(args.terminal)
    problems = preflight(args.terminal, data_dir, args.force)

    expert_name, expert_paths = resolve_expert(args.expert, data_dir)
    if not expert_paths:
        problems.append(
            f"expert .ex5 not found for '{args.expert}' (resolved to "
            f"'{expert_name}.ex5'). Expected under "
            f"MQL5\\Experts in the terminal data folder. Note terminal64 "
            f"prepends 'Experts\\' itself, so do not include it here.")

    mq5 = (expert_paths[0].with_suffix(".mq5") if expert_paths else None)
    all_inputs = ea_inputs(mq5) if mq5 else {}
    if not all_inputs:
        problems.append(f"could not read EA inputs from {mq5}")

    # Complete set, defaults first, then the caller's overrides on top. Nothing
    # can be inherited from the persisted set because everything is named.
    members = enum_members(mq5) if mq5 else {}
    final_inputs = dict(all_inputs)
    unknown = []
    for k, v in inputs.items():
        if k not in final_inputs:
            unknown.append(k)
            continue
        final_inputs[k] = v
    if unknown:
        problems.append("unknown input(s), ignored: " + ", ".join(unknown))

    # Every enum-typed value must be written as an INTEGER, including the ones
    # that came from the source defaults.
    #
    # terminal64 silently accepts an unparsable [TesterInputs] line and leaves
    # that input at 0. For every enum in this EA the source default happened to
    # be its 0th member, so the failure was invisible -- until an enum was added
    # whose default is NOT 0 (InpSLMode = SL_ATR_MULT). The ini read
    # "InpSLMode=SL_ATR_MULT", the value arrived as 0 = SL_PIPS, and a backtest
    # meant to size stops by ATR quietly used 20/30 pip stops instead. The run
    # produced a perfectly plausible report either way.
    by_name = {k: (members[v], v) for k, v in final_inputs.items()
               if v in members}
    for k, (num, name) in by_name.items():
        final_inputs[k] = num
    if by_name:
        print(f"  enums     {len(by_name)} written as integers, e.g. " +
              ", ".join(f"{k}={final_inputs[k]}" for k in list(by_name)[:3]))

    stem = f"st_{args.symbol.replace(' ', '_')}_{args.period}_{int(time.time())}"
    report_stem = stem + ".htm"
    ini = render_ini(expert=expert_name, symbol=args.symbol,
                     period=args.period, model=MODELS[args.model],
                     from_date=frm.strftime("%Y.%m.%d"),
                     to_date=to.strftime("%Y.%m.%d"),
                     deposit=args.deposit, currency=args.currency,
                     leverage=args.leverage, report=report_stem,
                     inputs=final_inputs, visual=args.visual,
                     optimization=args.optimization, shutdown=args.shutdown)

    print("=" * 72)
    print("  MT5 STRATEGY TESTER")
    print("=" * 72)
    print(f"  terminal   {args.terminal}")
    print(f"  data dir   {data_dir}")
    print(f"  expert     {args.expert}")
    print(f"  symbol     {args.symbol}   period {args.period}")
    print(f"  model      {args.model} (Model={MODELS[args.model]})")
    print(f"  dates      {frm} to {to}")
    print(f"  inputs     {len(final_inputs)} emitted (all defaults + overrides)")
    print()
    print("  " + "-" * 68)
    print("  ini written as UTF-16-LE with BOM. UTF-8 is silently ignored by")
    print("  terminal64 and produces no report with no error.")
    print("  " + "-" * 68)
    print(ini)
    for p in problems:
        print(f"  PREFLIGHT: {p}")
    if args.dry_run:
        print("  dry run, nothing launched")
        return 0
    if problems and "--force" not in sys.argv:
        print("\n  refusing to launch. Fix the above, or pass --force.")
        return 1

    args.out.mkdir(parents=True, exist_ok=True)
    ini_path = args.out / f"{stem}.ini"
    write_ini(ini_path, ini)
    print(f"  ini -> {ini_path}")

    t0 = time.time()
    proc = subprocess.run([str(args.terminal), f"/config:{ini_path}"],
                          capture_output=True, text=True, timeout=3600)
    elapsed = time.time() - t0
    print(f"  terminal exited after {elapsed:.1f}s   rc={proc.returncode}")

    if data_dir:
        rep = find_report(data_dir, stem)
        if rep:
            print(f"  report -> {rep}")
            try:
                stats = parse_report(rep)
                if stats:
                    print()
                    for k, v in stats.items():
                        print(f"    {k:<20} {v}")
                else:
                    print("    report found but no headline rows parsed")
            except Exception as exc:
                print(f"    report parse failed: {exc}")
        else:
            print("  NO REPORT FOUND")
            log = newest_log(data_dir)
            if log:
                print(f"  last log: {log}")
                tail = log.read_text(encoding="utf-16",
                                     errors="ignore").splitlines()[-25:]
                for line in tail:
                    print(f"    {line}")
            print("  Check that the EA .ex5 exists, is compiled from current")
            print("  .mq5, and that the symbol name is spelled exactly as the")
            print("  broker has it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
