"""
Cross-check MT5's tester cache against the CSV the EA wrote.

Part 1 - single test: does MT5's own record agree with our CSV?
Part 2 - optimisation: does the cache hold one record per pass?

Part 2 works on the RAW 8-byte grid rather than a filtered run of doubles,
because the records are separated by zero-filled gaps. A pass repeats every
statistic of the previous pass, so the record stride is the offset that makes
the file maximally self-similar -- found by scoring each candidate stride on
the number of equal doubles one stride apart.
"""
from __future__ import annotations

import csv
import io
import re
import struct
from pathlib import Path

from mt5_cache import CACHE_ROOT

COMMON = CACHE_ROOT / "Common" / "Files"

KEY_INPUTS = ["InpMode", "InpFast", "InpSlow", "InpPeriod", "InpThreshold"]


def caches(suffix: str) -> list[Path]:
    out: list[Path] = []
    for d in CACHE_ROOT.iterdir():
        c = d / "Tester" / "cache"
        if c.is_dir():
            out += sorted(c.glob(f"*.{suffix}"), key=lambda p: -p.stat().st_mtime)
    return out


def grid(raw: bytes) -> list[float]:
    """Every 8-byte double on the natural grid, from the file start."""
    return [struct.unpack_from("<d", raw, o)[0] for o in range(0, len(raw) - 7, 8)]


def inputs_of(raw: bytes) -> dict[str, float]:
    """`InpX=value` strings, which .tst records carry verbatim."""
    out = {}
    for m in re.finditer(rb"(?:[ -~]\x00){3,}", raw[:0x3000]):
        t = m.group().decode("utf-16-le")
        if "=" in t:
            k, _, v = t.partition("=")
            try:
                out[k.strip()] = float(v)
            except ValueError:
                pass
    return out


def read_csv(tag: str) -> dict | None:
    f = COMMON / f"StrategyForge_{tag}.csv"
    if not f.exists():
        return None
    rows = [r for r in f.read_text(encoding="utf-8", errors="ignore").splitlines() if r.strip()]
    if len(rows) < 2:
        return None
    d = max((",", "\t", ";"), key=rows[0].count)
    p = [r for r in csv.reader(io.StringIO("\n".join(rows)), delimiter=d) if r]
    return dict(zip(p[0], p[1])) if len(p) >= 2 and len(p[0]) == len(p[1]) else None


def best_stride(vals: list[float]) -> tuple[int, int]:
    """
    Record stride, from a repeated value rather than raw autocorrelation.

    Autocorrelation is biased towards small strides and picked 176 bytes when
    the real stride is 296, because a short offset trivially matches within a
    record. Instead find the offsets of a value that occurs many times (profit
    from the best pass) and take the GCD of the gaps -- that gives the stride
    directly and is immune to the bias.
    """
    from math import gcd

    counts: dict[float, list[int]] = {}
    for i, v in enumerate(vals):
        if v == v and 1e-9 < abs(v) < 1e9 and float(v) not in (0.0, 1.0):
            counts.setdefault(round(v, 6), []).append(i)

    # The most widely repeated non-trivial value is a statistic shared by many
    # passes, so its occurrence offsets are spaced by whole records.
    best_val, best_offsets = None, []
    for v, offs in counts.items():
        if len(offs) > len(best_offsets):
            best_val, best_offsets = v, offs

    if len(best_offsets) < 2:
        return 0, 0

    gaps = [b - a for a, b in zip(best_offsets, best_offsets[1:]) if b > a]
    if not gaps:
        return 0, 0
    stride = 0
    for g in gaps:
        stride = gcd(stride, g)
    return stride, len(best_offsets)


def part1() -> None:
    print("=" * 74)
    print("1. SINGLE TEST: MT5's own cache vs the EA's CSV")
    print("=" * 74)

    tsts = caches("tst")
    csvs = {p.stem.replace("StrategyForge_", ""): p for p in COMMON.glob("StrategyForge_*.csv")}
    print(f"  {len(tsts)} .tst cache files, {len(csvs)} CSVs")

    pairs = 0
    for f in tsts:
        raw = f.read_bytes()
        inp = inputs_of(raw)
        for tag, csv_path in csvs.items():
            row = read_csv(tag)
            if not row or not inp:
                continue
            try:
                same = (int(float(row["mode"])) == int(inp.get("InpMode", -1))
                        and int(float(row["fast"])) == int(inp.get("InpFast", -1))
                        and int(float(row["slow"])) == int(inp.get("InpSlow", -1))
                        and float(row["threshold"]) == inp.get("InpThreshold", -2))
            except (KeyError, ValueError):
                continue
            if not same:
                continue

            vals = [v for v in grid(raw) if v == v and 1e-12 < abs(v) < 1e12]
            print(f"\n  cache : {f.name}")
            print(f"  csv   : {csv_path.name}   (tag={tag})")
            print(f"  inputs: {({k: inp[k] for k in KEY_INPUTS if k in inp})}")

            def near(x):
                return next((v for v in vals if abs(v - x) <= 1e-6 * max(1.0, abs(x))), None)

            print(f"  {'metric':<14}{'EA CSV':>15}{'MT5 cache':>16}   match")
            for label, key in (("profit", "profit"), ("score", "score"),
                               ("dd_abs", "dd_abs"), ("dd_rel_pct", "dd_rel_pct"),
                               ("sharpe", "sharpe"),
                               ("max_win_money", "max_win_run_money")):
                if key not in row:
                    continue
                a = float(row[key])
                b = near(a)
                shown = f"{b:>16.6f}" if b is not None else f"{'absent':>16}"
                verdict = "YES" if b is not None else "NO"
                print(f"  {label:<14}{a:>15.6f}{shown}   {verdict}")
            pairs += 1
            break
        if pairs >= 2:
            break

    if not pairs:
        print("\n  no matching pair found")


def part2() -> None:
    print("\n" + "=" * 74)
    print("2. OPTIMISATION: per-pass records in the cache?")
    print("=" * 74)

    for f in caches("opt")[:5]:
        raw = f.read_bytes()
        vals = grid(raw)
        stride, reps = best_stride(vals)
        n = len(vals) // stride if stride else 0
        print(f"\n  {f.name}")
        print(f"    grid={len(vals)} doubles  stride={stride}B  "
              f"repeats={reps}  passes~{n}")

        if not stride or not n:
            continue

        # Show each record: the columns that vary across passes are the
        # optimised inputs, the ones that hold still are statistics.
        width = stride
        print(f"    {'pass':>5}" + "".join(f"{'c' + str(c):>12}"
                                          for c in range(0, min(width, 12))))
        for r in range(min(n, 4)):
            chunk = vals[r * width:(r + 1) * width][:12]
            print(f"    {r:>5}" + "".join(f"{v:>12.4f}" for v in chunk))


if __name__ == "__main__":
    part1()
    part2()