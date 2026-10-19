# Commands

Every command used to compile the EA, install it, run backtests and read the
results. All are run from this directory unless stated otherwise.

**Windows PowerShell.** Where a command sets `$env:PYTHONIOENCODING="utf-8"`,
that is not decoration: the EA's CSV carries a `verdict` field with non-ASCII
characters in some locales, and without it PowerShell's default code page
mangles the output into mojibake that then gets misread as a parsing failure.

---

## 0. Setup — run this first, every session

```powershell
$env:PYTHONIOENCODING="utf-8"
cd C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools
```

### Check nothing is holding MT5

**Required before every `run`.** MT5 allows one terminal per data directory and
**silently ignores `/config` for an already-running terminal** — the test then
executes nothing and writes no report, which looks like a bad parameter set.

```powershell
tasklist /FI "IMAGENAME eq terminal64.exe" /FO CSV /NH
```

- `No tasks are running` → safe to proceed.
- A PID is listed → close MT5 yourself, or force it:

```powershell
Stop-Process -Id <PID> -Force
Start-Sleep -Seconds 3
```

---

## 1. `compile` — build the EA

```powershell
python strategyforge.py compile
```

Compiles `…\scalarai\ea\StrategyForge.mq5` (the source of truth) and writes the
`.ex5` next to the compile target. Expect `0 errors, 0 warnings`.

| Flag | Meaning |
|---|---|
| `--src PATH` | compile a different `.mq5` instead of the canonical one |

**A stale binary is refused, not used.** If the `.ex5` is older than its `.mq5`
the run aborts with exit code `3`. This is deliberate: an old `.ex5` produces a
plausible-looking report about code that is not on disk.

---

## 2. `run` — one native tester pass

```powershell
python strategyforge.py run --mode 6 --class 0 --indicator 1 --pattern 0 `
  --period 14 --threshold 0.2 --fast 10 --slow 30 `
  --stop 1.2 --take 1.2 --lots 0.1 --min-trades 30 `
  --symbol "Step Index" --timeframe M1 `
  --from 2026.09.01 --to 2026.09.30 --tag si_mom
```

Reads as: **scalp · MOMENTUM · EMA_TREND gate · no pattern filter**. Takes
~12s (it launches and closes a whole MT5 terminal) and prints the CSV as JSON.

### The four strategy dropdowns

| Flag | Values |
|---|---|
| `--class` | `0` scalp, `1` day, `2` swing |
| `--mode` | family `0`–`11` (table below) |
| `--indicator` | `0` none, `1` EMA_TREND, `2` RSI, `3` BANDS, `4` ATR, `5` ADX, `6` EMA_RSI, `7` MACD |
| `--pattern` | `0` none, `1` ENGULFING, `2` PINBAR, `3` RUN, `4` INSIDE, `5` DOJI, `6` LONG_BODY |
| `--tf-fit` | `0` any, `1` scalp, `2` day, `3` swing |

Families: `0` MA_CROSS · `1` RSI_REVERT · `2` BREAKOUT · `3` BOLLINGER ·
`4` MACD · `5` PATTERN · `6` MOMENTUM · `7` RUN_FADE · `8` VOL_EXPANSION ·
`9` RANGE_REVERT · `10` TREND_PULLBACK · `11` SEQUENTIAL

### Other flags

| Flag | Default | Meaning |
|---|---|---|
| `--fast` / `--slow` / `--period` | 20 / 50 / 20 | indicator periods |
| `--threshold` | 2.0 | family threshold — **scale depends on the instrument** |
| `--stop` / `--take` | 20 / 30 | in pips; see the warning below |
| `--lots` | 0.10 | fixed size |
| `--min-trades` | 30 | below this the verdict is `INCONCLUSIVE` |
| `--criterion` | 1 | `0` balance, `1` Sharpe, `2` PF, `3` Calmar, `4` penalised, `5` trade count |
| `--model` | 0 | `0` = every tick based on real ticks |
| `--tag` | `default` | label for the stored CSV |
| `--terminal` | primary | `portable` to use the second MT5 install |
| `--run-len`, `--strength-min`, `--range-len`, `--vol-mult`, `--min-edge-ticks`, `--spread-max-ticks` | — | family/gate specific; omitted means "don't send" |

### Two warnings that cost real time

**Zero trades usually means a wrong parameter scale, not a verdict.** On these
synthetic indices `pip = point × 10 = 1.0 price unit`, so `--threshold 1.5` on
MOMENTUM is unreachable — the usable range is ~0.1–0.3. Check `entries_attempted`
in the output: if it is `0` while the verdict says `NO TRADES`, the rule never
fired and that is a parameter problem.

**`--stop` must clear the broker floor.** `Step Index` enforces a **0.90**
minimum stop (0.80 price units). The EA floors SL and TP automatically and logs
every clamp, but knowing the floor saves a wasted run.

---

## 3. `oos` — in-sample vs out-of-sample

```powershell
python strategyforge.py oos --mode 7 --class 0 --pattern 3 --run-len 3 --strength-min 0.4 `
  --stop 1.2 --take 1.2 --lots 0.1 --min-trades 30 `
  --symbol "Step Index" --timeframe M1 `
  --from 2026.06.01 --to 2026.06.30 --tag si_oos
```

Two passes of one config on disjoint windows, both on MT5's own tester. The OOS
window defaults to the same length as the in-sample window, starting the day
after it ends.

| Flag | Meaning |
|---|---|
| `--oos-from` | OOS start; defaults to the day after `--to` |
| `--oos-to` | OOS end; defaults to OOS start plus the in-sample length |

**Prefer this over `run` for judging a strategy.** It separates three different
outcomes: an edge that holds up, one that was fitted to a single month, and one
that never existed. The summary table reports win rate against break-even, so
"profitable" cannot be mistaken for "pays for its spread".

---

## 4. `read` / `list-reports` — read stored results

```powershell
python strategyforge.py read --tag si_mom
python strategyforge.py list-reports
```

Prints one stored CSV as JSON, or every stored CSV path. Both read from
`%APPDATA%\MetaQuotes\Terminal\Common\Files`.

---

## 5. `optimise` — native MT5 optimisation

```powershell
python strategyforge.py optimise --mode 6 --fast 8:24:4 --slow 20:60:10 `
  --period 14:26:6 --threshold 0.1:0.3:0.1 `
  --symbol "Step Index" --timeframe M1 --from 2026.09.01 --to 2026.09.30
```

Ranges are `start:stop:step`. | `--optmode` | `1` slow complete, `2` fast genetic |
| `--top` | rows to print (default 10) |

**Optimisation output is a hypothesis generator, never a result.** With four
dropdowns and five numeric parameters there are thousands of configurations;
the best one in a single month is expected to look good by chance. Confirm any
survivor with `oos` on a window it was not fitted to.

---

## 6. Exit codes

| Code | Meaning |
|---|---|
| `0` | ok |
| `1` | compile failed |
| `2` | tester produced nothing / bad `--terminal` path |
| `3` | **stale binary refused** — recompile before installing |

---

## 7. Verification tools (`verify\`)

```powershell
cd C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools\verify
```

| Command | What it does |
|---|---|
| `python check_docs.py` | docs structural checks — balanced fences, sequential sections |
| `python check_trades_doc.py` | re-runs `trades.md`'s commands, re-derives its claims, diffs `.tst` against CSV |
| `python compare_cache_vs_csv.py` | cross-checks MT5's cache against the EA's CSV, field by field |
| `python read_opt_passes.py` | recovers per-pass results from `.opt` cache files |
| `python mt5_cache.py` | lists/parses every cached run |
| `python stops_all.py` | spread and minimum stop for every Step Index variant |
| `python probe_capabilities.py` | read-only capability probe of the `MetaTrader5` package |

`check_docs.py` and `check_trades_doc.py` are the ones to run after editing any
doc — they fail rather than warn when a claim stops being true.

---

## 8. Inspecting MT5 directly

**The terminal log** — proof a run used real ticks:

```powershell
$tl = "$env:APPDATA\MetaQuotes\Terminal\D0E8209F77C8CF37AD8BF550E51FF075\Tester\logs\$(Get-Date -Format yyyyMMdd).log"
Select-String -Path $tl -Pattern "ticks, .* bars generated" | Select-Object -Last 3
```

```
Step Index,M1: 2503294 ticks, 41756 bars generated.
Test passed in 0:00:03.227
final balance 9476.65 USD
```

**The cache directory** — one file per distinct configuration ever tested:

```powershell
Get-ChildItem "$env:APPDATA\MetaQuotes\Terminal\D0E8209F77C8CF37AD8BF550E51FF075\Tester\cache" |
  Sort-Object LastWriteTime -Descending | Select-Object -First 10 Name, LastWriteTime
```

**Read one cache file:**

```powershell
python -c @"
import mt5_cache as mc
from pathlib import Path
p = Path(r'C:\Users\faarh\AppData\Roaming\MetaQuotes\Terminal\D0E8209F77C8CF37AD8BF550E51FF075\Tester\cache')
for f in sorted(p.glob('*.tst'), key=lambda x: x.stat().st_mtime, reverse=True)[:3]:
    s = mc.parse_tst_stats(f.read_bytes())
    if s:
        print(f.name[:56], '->', {k: round(v, 4) for k, v in list(s.items())[:6]})
"@
```

**Note on the parser:** the `.tst` summary block is **not reliably 8-byte
aligned** — its base shifts with the length of the header before it, so two
files for the same symbol can sit at different alignments. `mt5_cache.py`
therefore scans every byte and relies on two arithmetic identities
(`net == gross_profit − gross_loss` and `pf == gross_profit / gross_loss`) to
avoid false positives. An earlier 8-aligned-only version silently parsed just
13 of 41 files.

---

## 9. Housekeeping

**Close a terminal left behind by an interrupted run:**

```powershell
taskkill /IM terminal64.exe /F
```

**Kill a specific PID** (from the `tasklist` output above):

```powershell
Stop-Process -Id <PID> -Force
```

**Confirm the EA source and compiled binary agree:**

```powershell
python -c @"
from pathlib import Path
import strategyforge as sf
ex5, mq5 = sf.MQ5 / 'StrategyForge.ex5', sf.MQ5 / 'StrategyForge.mq5'
print('mq5', mq5.exists(), '| ex5', ex5.exists())
print('stale' if ex5.exists() and ex5.stat().st_mtime < mq5.stat().st_mtime else 'current')
"@
```

---

## 10. A complete session

```powershell
# 0. setup
$env:PYTHONIOENCODING="utf-8"
cd C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools
tasklist /FI "IMAGENAME eq terminal64.exe" /FO CSV /NH     # must show none

# 1. build
python strategyforge.py compile

# 2. one pass to sanity-check the configuration
python strategyforge.py run --mode 7 --class 0 --pattern 3 --run-len 3 `
  --strength-min 0.4 --stop 1.2 --take 1.2 --lots 0.1 --min-trades 30 `
  --symbol "Step Index" --timeframe M1 `
  --from 2026.09.01 --to 2026.09.30 --tag check

# 3. does it hold up out of sample?
python strategyforge.py oos --mode 7 --class 0 --pattern 3 --run-len 3 `
  --strength-min 0.4 --stop 1.2 --take 1.2 --lots 0.1 --min-trades 30 `
  --symbol "Step Index" --timeframe M1 `
  --from 2026.06.01 --to 2026.06.30 --tag check

# 4. read it back any time
python strategyforge.py read --tag check

# 5. keep the docs honest
cd verify
python check_docs.py
python check_trades_doc.py
```

**Run one test at a time.** Each run opens and closes a terminal; they cannot
be parallelised, and overlapping them silently produces nothing.
