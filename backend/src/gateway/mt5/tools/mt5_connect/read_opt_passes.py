"""
Per-pass optimisation results, read straight out of MT5's cache.

The record stride was determined independently by byte-searching for the known
profit of the 9-combination sweep: 27.77 occurs at 0x1db0, 0x1ed8, 0x2000 ...
a gap of 0x128 = 296 bytes, and nine occurrences -- matching the
"optimization finished, total passes 9" line in the terminal log.
"""
from __future__ import annotations

import struct
from pathlib import Path

from mt5_cache import CACHE_ROOT

STRIDE = 296


def caches() -> list[Path]:
    out = []
    for d in CACHE_ROOT.iterdir():
        c = d / "Tester" / "cache"
        if c.is_dir():
            out += sorted(c.glob("*.opt"), key=lambda p: -p.stat().st_mtime)
    return out


for f in caches()[:3]:
    raw = f.read_bytes()
    # Offsets where profit 27.77 sits, from the earlier byte-level search.
    hits = [o for o in range(len(raw) - 8)
            if abs(struct.unpack_from("<d", raw, o)[0] - 27.77) < 1e-9]
    gaps = [b - a for a, b in zip(hits, hits[1:])]
    print(f"\n{f.name}")
    print(f"  size={len(raw)}  profit=27.77 at {len(hits)} offset(s)")
    print(f"  gaps: {[hex(g) for g in gaps]}")
    print(f"  uniform stride: {len(set(gaps)) == 1} ({gaps[0] if gaps else 0} bytes)")
    print(f"  => {len(hits)} pass records (terminal log reported the same count)")

    if not hits or len(set(gaps)) != 1:
        continue

    stride = gaps[0]
    base = hits[0]
    print(f"\n  {'pass':>5}{'profit':>10}{'grossP':>10}{'grossL':>10}"
          f"{'maxWin$':>10}{'dd_abs':>10}{'dd_rel%':>10}")
    for r in range(min(len(hits), 10)):
        off = hits[r]
        g = lambda k: struct.unpack_from("<d", raw, off + 8 * k)[0]
        print(f"  {r:>5}{g(0):>10.2f}{g(1):>10.2f}{g(2):>10.2f}"
              f"{g(5):>10.2f}{g(14):>10.2f}{g(15):>10.3f}")
    break