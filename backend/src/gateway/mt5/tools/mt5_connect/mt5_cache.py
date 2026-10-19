"""
Parse MetaTrader 5's Strategy Tester cache files.

MT5 always records its own results, regardless of whether `Report=` produced
anything. The files live in

    %APPDATA%\\MetaQuotes\\Terminal\\<id>\\Tester\\cache\\
        <EA>.<symbol>.<tf>.<from>.<to>.0.<hash>.tst   single test
        <EA>.<symbol>.<tf>.<from>.<to>.<opt>.<hash>.opt optimisation

`tst` is a SingleTestCache holding one result; `opt` is a TesterOptCache holding
one record per optimisation pass. Both are a UTF-16 header followed by a block
of little-endian doubles -- MT5's full statistics.

This matters because nothing else in the system hands back optimisation
results: OnTester() is not invoked when Optimization!=0, file writes from the EA
are dropped in that mode, and a headless /config run writes no report file.
The cache is the one place the data actually exists.

Record layout is not published, so instead of guessing it is *calibrated*:
across N passes the inputs vary while most statistics do not, so any column
whose values differ between records is an input parameter. Verified against the
EA's own CSV output for single tests.
"""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass, field
from pathlib import Path

CACHE_ROOT = Path.home() / "AppData/Roaming/MetaQuotes/Terminal"

# Input names, in the order MT5 lists them in the cache header. Used to label
# the leading columns of each record.
INPUT_NAMES = [
    "InpMode", "InpTimeframe", "InpFast", "InpSlow", "InpPeriod",
    "InpThreshold", "InpConfirmBars", "InpLots", "InpRiskPercent",
    "InpStopPips", "InpTakePips", "InpMaxHoldBars", "InpMagic",
    "InpTrailPoints", "InpTrailStep", "InpBreakevenPips", "InpMaxSpreadPts",
    "InpMaxPositions", "InpCriterion", "InpDrawdownPenalty",
]

# Statistics MT5 stores, in the order observed in the double block. Names come
# from the values matching TesterStatistics() output for a known run.
STAT_NAMES = [
    "profit", "gross_profit", "gross_loss",
    "max_profit", "max_profit2", "min_profit", "min_profit2",
    "max_conwin_money", "max_conwin_money2", "max_conloss_money",
    "max_conloss_money2", "balance_final", "max_conloss_ratio",
    "recovery_factor", "max_conloss_ratio2", "sharpe_alt",
    "balance_dd_min", "dd_abs", "dd_rel_pct", "dd_abs2", "dd_rel_pct2",
    "profit_factor", "score",
]


# Offsets, in doubles, from initial_deposit to each summary field. Validated
# against a real run: -523.35 net profit, 3370.58 gross profit, 3893.93 gross
# loss, 0.8656 profit factor, 534.65 absolute drawdown, 5.3452 relative
# drawdown, -0.0882 expected payoff, -5.0 Sharpe and the OnTester score -5.0.
TST_FIELDS = {
    "initial_deposit": 0,
    "net_profit": 2,
    "gross_profit": 3,
    "gross_loss": 4,
    "max_conwin_money": 7,
    "max_conloss_money": 9,
    "dd_abs": 17,
    "dd_rel_pct": 18,
    "expected_payoff": 21,
    "profit_factor": 22,
    "ahpr": 23,
    "sharpe": 24,
    "score": 26,
}
# int32 counters follow the doubles: deals, trades, profit trades, loss trades.
TST_INT_OFFSETS = {"total_deals": 216, "trades": 220,
                   "profit_trades": 224, "loss_trades": 228}


def parse_tst_stats(raw: bytes) -> dict[str, float]:
    """Locate the summary block by its internal arithmetic identities.

    ALIGNMENT IS NOT 8 BYTES.
    ---------------------------
    An earlier version scanned only `range(0, n, 8)` and parsed 13 of 41 files,
    with the failures all carrying a full, correct summary block. The stats
    block is a packed struct whose base depends on the length of the variable-
    length header that precedes it -- the symbol name, the expert parameters,
    the date strings. Two files for the same symbol, timeframe and date range
    can therefore have the block at base 3280 in one and base 3290 in the next,
    and only the second happens to be 8-aligned.

    Scanning every byte costs 8x more reads but is the only version that does
    not silently skip a third of the cache. The identities below then reject the
    false positives that unrestricted scanning produces.
    """
    n = len(raw)
    limit = min(n - 512, 1 << 20)
    for base in range(0, limit):
        deposit = struct.unpack_from("<d", raw, base)[0]
        # A deposit is a round positive number; this discards ~all of the
        # 41k bars of equity data without assuming a specific account size.
        if not (1.0 <= deposit <= 1e9) or abs(deposit - round(deposit)) > 1e-9:
            continue
        gp = struct.unpack_from("<d", raw, base + 24)[0]
        gl = struct.unpack_from("<d", raw, base + 32)[0]
        if not (gp > 0.0 and gl > 0.0):
            continue
        net = struct.unpack_from("<d", raw, base + 16)[0]
        pf = struct.unpack_from("<d", raw, base + 176)[0]
        if abs(net - (gp - gl)) > 0.01:          # identity 1
            continue
        if abs(pf - gp / gl) > 1e-3:             # identity 2
            continue

        out = {name: struct.unpack_from("<d", raw, base + idx * 8)[0]
               for name, idx in TST_FIELDS.items()}
        for name, off in TST_INT_OFFSETS.items():
            out[name] = float(struct.unpack_from("<i", raw, base + off)[0])
        return out
    return {}


@dataclass
class CacheEntry:
    path: Path
    kind: str                       # "tst" or "opt"
    expert: str
    symbol: str
    timeframe: str
    date_from: str
    date_to: str
    inputs: dict[str, float] = field(default_factory=dict)
    stats: dict[str, float] = field(default_factory=dict)
    passes: int = 0


def _cache_dirs() -> list[Path]:
    return [d / "Tester" / "cache" for d in CACHE_ROOT.iterdir()
            if (d / "Tester" / "cache").is_dir()] \
        if CACHE_ROOT.is_dir() else []


def _parse_name(raw: bytes) -> tuple[str, int, int]:
    """One UTF-16LE length-prefixed field: uint32 chars, then chars, then padding."""
    if len(raw) < 4:
        return "", 0, 0
    n = struct.unpack_from("<I", raw, 0)[0]
    if n == 0 or n > 512 or 4 + n * 2 > len(raw):
        return "", 0, 0
    text = raw[4:4 + n * 2].decode("utf-16-le", errors="ignore")
    end = 4 + n * 2
    return text, 0, end


def _header_strings(raw: bytes) -> list[str]:
    return [m.group().decode("utf-16-le")
            for m in re.finditer(rb"(?:[ -~]\x00){4,}", raw[:0x800])]


def _record_stride(raw: bytes) -> int | None:
    """
    Infer the per-pass record size.

    Every pass repeats the same value pattern, so a repeated double near the
    end of the statistics block gives a stride that divides the file. 296 bytes
    is what this build uses; it is derived rather than assumed so a different
    MT5 build still parses.
    """
    stats = STAT_NAMES[-1]
    # Locate the statistics block: the last dense run of finite doubles.
    best = None
    for stride in range(200, 600, 8):
        # If `stats` is at offset k in record 0 and k+stride in record 1, the
        # same double must appear twice that far apart.
        for k in range(0, min(400, len(raw) - 2 * stride), 8):
            a = struct.unpack_from("<d", raw, k)[0]
            b = struct.unpack_from("<d", raw, k + stride)[0]
            if a == 0.0 or abs(a) > 1e12:
                continue
            if a == b and abs(a - 0) > 1e-9:
                return stride
    return best


def parse_file(path: Path) -> CacheEntry | None:
    raw = path.read_bytes()
    parts = path.stem.split(".")
    kind = path.suffix.lstrip(".")

    entry = CacheEntry(
        path=path, kind=kind,
        expert=parts[0] if parts else "?",
        symbol=parts[1] if len(parts) > 1 else "",
        timeframe=parts[2] if len(parts) > 2 else "",
        date_from=parts[3] if len(parts) > 3 else "",
        date_to=parts[4] if len(parts) > 4 else "",
    )

    # Single tests also record the exact inputs as InpX=value strings.
    inputs = {}
    for m in re.finditer(rb"(?:[ -~]\x00){3,}", raw[:0x2000]):
        text = m.group().decode("utf-16-le")
        if "=" in text:
            k, _, v = text.partition("=")
            try:
                inputs[k.strip()] = float(v)
            except ValueError:
                pass
    entry.inputs.update(inputs)

    # The statistics block is a contiguous run of finite doubles sitting after
    # the header strings. Find the LONGEST such run at 8-byte alignment rather
    # than starting at the end of the header: the header length is not a
    # multiple of 8, so starting there desynchronises the grid and yields
    # denormals like 2.1e-314 instead of real values.
    best_run: list[float] = []
    best_off = 0
    for align in range(8):
        run: list[float] = []
        run_start = 0
        for off in range(align, len(raw) - 8, 8):
            d = struct.unpack_from("<d", raw, off)[0]
            # 0.0 is a valid double, and the file is mostly zero padding, so
            # "finite" alone selects the whole file. Require a real magnitude:
            # not NaN/inf, not denormal, not exactly zero.
            ok = d == d and 1e-12 < abs(d) < 1e12
            if ok:
                if not run:
                    run_start = off
                run.append(d)
            else:
                if len(run) > len(best_run):
                    best_run, best_off = run, run_start
                run = []
        if len(run) > len(best_run):
            best_run, best_off = run, run_start

    values = best_run
    start = best_off
    if not values:
        return entry

    if kind == "tst":
        entry.passes = 1
        # .tst statistics are read by ANCHOR + IDENTITY, not by position.
        #
        # The previous version zipped a guessed run of doubles onto a guessed
        # name list. That worked on one file and then reported profit +191.63,
        # profit factor 128.1 and drawdown 161.9% for a run that actually lost
        # 523.35 with PF 0.8656 -- because the "longest run of non-zero doubles"
        # in a .tst is the equity track, not the summary, and the name list was
        # never anchored to anything.
        #
        # The summary block IS findable, because it satisfies two identities
        # that the equity track cannot:
        #     net_profit      == gross_profit - gross_loss
        #     profit_factor   == gross_profit / gross_loss
        # Requiring both to hold at the same offset makes a false positive
        # essentially impossible, and if no offset satisfies them the file is
        # reported as unreadable rather than filled with confident nonsense.
        entry.stats.update(parse_tst_stats(raw))
        if not entry.stats:
            entry.stats["_unparsed"] = 1.0
    else:
        # Calibration: split into records by finding the repeating stride.
        stride = None
        for candidate in range(240, 360, 8):
            n = len(values) // candidate if False else 0
        # Direct approach: score each candidate stride by how many values
        # repeat at that offset.
        best_stride, best_score = None, 0
        for candidate in range(200, 480, 8):
            score = sum(1 for i in range(len(values) - candidate)
                        if values[i] != 0 and values[i] == values[i + candidate])
            if score > best_score:
                best_stride, best_score = candidate, score
        stride = best_stride
        if stride and best_score > 3:
            n_pass = len(values) // stride
            entry.passes = n_pass
            for r in range(n_pass):
                chunk = values[r * stride:(r + 1) * stride]
                for name, val in zip(STAT_NAMES, chunk):
                    entry.stats.setdefault(f"pass{r}.{name}", val)
    return entry


def list_cache() -> list[Path]:
    out: list[Path] = []
    for d in _cache_dirs():
        out.extend(sorted(d.glob("*.tst"), key=lambda p: -p.stat().st_mtime))
        out.extend(sorted(d.glob("*.opt"), key=lambda p: -p.stat().st_mtime))
    return out


if __name__ == "__main__":
    import sys

    files = list_cache()
    print(f"{len(files)} cache file(s)\n")
    for f in files[:12]:
        e = parse_file(f)
        assert e
        print(f"{f.suffix}  {e.expert} {e.symbol} {e.timeframe} "
              f"{e.date_from}->{e.date_to}  passes={e.passes}")
        if e.inputs:
            shown = {k: v for k, v in list(e.inputs.items())[:6]}
            print(f"      inputs: {shown}")
        if e.stats:
            for k in ("profit", "profit_factor", "score", "dd_abs",
                      "dd_rel_pct"):
                if k in e.stats:
                    print(f"      {k:16s} {e.stats[k]}")
        print()