# Trades: making them, testing them, and reading the results

How to turn a trading idea into a StrategyForge configuration, run it on MT5's
native Strategy Tester, and get the full result out — including the parts MT5
records but the EA's CSV does not.

Everything here is verified against this machine's terminal. Commands were run
as written. Where something is an estimate or an assumption it is labelled.

Related: [mt5.md](mt5.md) (terminal and tester plumbing),
[strategytest.md](strategytest.md) (how to design a test),
[ea.md](ea.md) (what the EA does internally).

---

## 1. The one rule

**All P&L comes from MT5's Strategy Tester.** The Python scripts only write a
config file and read the result back. They do not simulate anything.

If a number in a report cannot be traced to either the terminal's tester log or
MT5's own cache file, it is not evidence.

---

## 2. File paths

`%APPDATA%` is `C:\Users\faarh\AppData\Roaming`.

| What | Full path |
|---|---|
| **Terminal data dir** | `C:\Users\faarh\AppData\Roaming\MetaQuotes\Terminal\D0E8209F77C8CF37AD8BF550E51FF075\` |
| **MT5 cache — authoritative results** | `…\D0E8209F77C8CF37AD8BF550E51FF075\Tester\cache\` |
| **EA CSV reports** | `C:\Users\faarh\AppData\Roaming\MetaQuotes\Terminal\Common\Files\StrategyForge_<tag>.csv` |
| **Terminal tester log** | `…\D0E8209F77C8CF37AD8BF550E51FF075\Tester\logs\YYYYMMDD.log` |
| **Tester agent logs** | `C:\Users\faarh\AppData\Roaming\MetaQuotes\Tester\D0E8209F77C8CF37AD8BF550E51FF075\Agent-127.0.0.1-3000\logs\` |
| **Compiled EA the tester runs** | `…\MQL5\Experts\StrategyForge\StrategyForge.ex5` |
| **EA source of truth** | `C:\Users\faarh\Workspaces\Custom-apps\scalarai\ea\StrategyForge.mq5` |
| **Compile target** | `C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools\mql5\StrategyForge.mq5` |
| **Wrapper / verify tools** | `C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools\` and `…\Tools\MT5\verify\` |

The hash directory `D0E8209F77C8CF37AD8BF550E51FF075` is this terminal's data
directory. It changes if you install MT5 again or use a different account.

### Cache filename format

```
StrategyForge.<symbol>.<timeframe>.<from>_<to>.<pass>.<HASH>.tst
```

Example:

```
StrategyForge.Step Index.M1.20260901_20260930.0.B470DFD4D6C9625EDAC42084D7EF8C8F.tst
         └─ expert    └ TF  └─ dates    └pass └──── identity hash ────┘
```

The hash covers the expert, symbol, timeframe, date range, model and inputs, so
changing any input produces a **different file**. Re-running the same config
overwrites the same file. That makes the cache a complete history of every
distinct configuration tested.

List the most recent:

```powershell
Get-ChildItem "$env:APPDATA\MetaQuotes\Terminal\D0E8209F77C8CF37AD8BF550E51FF075\Tester\cache" |
  Sort-Object LastWriteTime -Descending | Select-Object -First 10 Name, LastWriteTime
```

---

## 3. Making trades: the four dropdowns

The EA holds no per-strategy code. A strategy is four enum choices plus numbers,
and MT5 renders every enum as a dropdown in the tester dialog. Command-line
equivalents:

| Dimension | Flag | CLI | Meaning |
|---|---|---|---|
| Class | `--class` | `0` scalp, `1` day, `2` swing | how long a trade should live |
| Family | `--mode` | `0`–`11` (see below) | the entry idea — the only layer that may originate a trade |
| Indicator gate | `--indicator` | `0`–`7` | confirmation filter; may only **veto** |
| Pattern gate | `--pattern` | `0`–`6` | candlestick shape filter; may only **veto** |
| Timeframe fit | `--tf-fit` | `0`–`3` | which chart lengths are eligible |

**Families** (`--mode`): `0` MA_CROSS · `1` RSI_REVERT · `2` BREAKOUT ·
`3` BOLLINGER · `4` MACD · `5` PATTERN · `6` MOMENTUM · `7` RUN_FADE ·
`8` VOL_EXPANSION · `9` RANGE_REVERT · `10` TREND_PULLBACK · `11` SEQUENTIAL

**Indicator gates** (`--indicator`): `0` none · `1` EMA_TREND · `2` RSI ·
`3` BANDS · `4` ATR · `5` ADX · `6` EMA_RSI · `7` MACD

**Pattern gates** (`--pattern`): `0` none · `1` ENGULFING · `2` PINBAR ·
`3` RUN · `4` INSIDE · `5` DOJI · `6` LONG_BODY

### Gates are veto-only, deliberately

```
BaseSignal(family)  ->  IndicatorGate  ->  PatternGate  ->  TimeframeAllowed
   may originate        may only veto     may only veto     may only veto
```

Only the family can decide a direction. This matters when forming strategies: on
an instrument with no directional edge, adding conditions to a signal cannot
manufacture edge, it can only shrink the sample. So gates are for *when to
trade*, never for *which way*. The report's `t_stat` decides whether the smaller
sample is still worth anything.

### Parameters, and the unit trap

`--stop` / `--take` are in **pips**, and on these synthetic indices
`pip = point × 10 = 1.0 price unit` for `Step Index`. So `--stop 1.2` means
1.20 price units = 12 ticks, not 1.2 ticks. Parameters derived from pips
therefore have completely different sensible ranges here than on EURUSD.

**A silent zero-trade result is the symptom of a wrong parameter scale.** Check
`entries_attempted` in the CSV: if it is 0 while `verdict` says `NO TRADES`, the
rule never fired, and that is a parameter problem — not a verdict on the idea.

### Broker constraints the EA handles for you

- **Minimum stop distance.** The EA reads `SYMBOL_TRADE_STOPS_LEVEL` and
  `SYMBOL_TRADE_FREEZE_LEVEL` at run time and floors both SL and TP to the
  larger, with one tick of margin. Every clamp is logged and counted in
  `stops_clamped`. On `Step Index` the advertised level is 8 points but the
  tester's synthetic broker enforces **9** — asking the symbol is not enough.
- **Measured limits** (`verify/stops_all.py`):

  | Symbol | Spread | Min stop |
  |---|---|---|
  | `Step Index` | 1 tick | 0.90 |
  | `Step Index 200` | 2 | 1.10 |
  | `Step Index 300` | 3 | 0.90 |
  | `Step Index 400` | 4 | 1.20 |
  | `Step Index 500` | 5 | 2.00 |

---

## 4. Testing

### One test at a time

Each run opens and closes the terminal. Runs are sequential by necessity — MT5
allows one terminal per data directory, and it **silently ignores `/config` for
an already-running terminal**, so a live GUI means the test executes nothing at
all. That failure looks like a wrong parameter set, not a busy terminal.

> Close MT5 before running. If a run dies with `terminal still running as pid`,
> that is the cause.

### Single pass

```powershell
cd C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools
python strategyforge.py run --mode 6 --class 0 --indicator 1 --pattern 0 `
  --period 14 --threshold 0.2 --fast 10 --slow 30 `
  --stop 1.2 --take 1.2 --lots 0.1 --min-trades 30 `
  --symbol "Step Index" --timeframe M1 `
  --from 2026.09.01 --to 2026.09.30 --tag si_mom
```

Reads as: **scalp · MOMENTUM · EMA_TREND gate · no pattern filter**.

Exit codes: `0` ok · `1` compile failed · `2` tester produced nothing ·
`3` ran but wrote no report · `2` stale binary (refused, on purpose).

### In-sample vs out-of-sample

Two passes of the same config on disjoint windows, both on the real tester:

```powershell
python strategyforge.py oos --mode 6 --class 0 --indicator 1 `
  --stop 1.2 --take 1.2 --symbol "Step Index" --timeframe M1 `
  --from 2026.06.01 --to 2026.06.30 --tag si_oos
```

The OOS window defaults to the same length as the in-sample window, starting the
day after it ends. Same length matters: a shorter OOS period yields too few
trades to rule on, and `InpMinTrades` will correctly refuse rather than report
noise as a result.

The reporter distinguishes three outcomes, because they have different causes:
**no edge in either window** (never had one), **edge evaporated** (fitted to one
window), **never traded out-of-sample** (no evidence either way).

### Optimisation

```powershell
python strategyforge.py optimise --mode 6 --fast 8:24:4 --slow 20:60:10 `
  --period 14:26:6 --threshold 0.1:0.3:0.1 `
  --symbol "Step Index" --timeframe M1 --from 2026.09.01 --to 2026.09.30
```

Ranges are `start:stop:step`. Per-pass results are recoverable from MT5's own
`.opt` cache — see `verify/read_opt_passes.py`.

**Optimisation overfits.** With four dropdowns and five numeric parameters there
are thousands of configurations; the best one in a single month is expected to
look good by chance alone. Optimisation output is a *hypothesis generator*, never
a result. Confirm any survivor on a window it was not fitted to.

### Objective function

`--criterion`: `0` balance · `1` Sharpe · `2` profit factor · `3` Calmar ·
`4` penalised · `5` trade count. Reaches the EA as `InpCriterion` in the `.set`.
Sharpe is the default because profit alone rewards one lucky trade.

---

## 5. Getting the full information

There are three layers, and they answer different questions.

### Layer 1 — the EA's CSV

`…\Terminal\Common\Files\StrategyForge_<tag>.csv`, written by the EA in
`OnTester()` using MT5's `TesterStatistics()` and the tester agent's deal
history. This is what ScalarAI ingests.

```powershell
python strategyforge.py read --tag si_mom
```

**It now self-checks.** These four identities must hold on any row:

```
profit        == gross_profit + gross_loss      (MT5 returns gross_loss signed)
profit_factor == gross_profit / gross_loss
initial_deposit + profit == final balance
total_deals   == 2 x trades                     (one entry deal, one exit deal)
```

If any fails, the report is internally inconsistent and nothing else in the row
can be trusted. Verified on a real run:

```
gross_profit + gross_loss =  3370.58 + -3893.93 =  -523.35  == profit      OK
gross_profit / gross_loss =  3370.58 /   3893.93 =    0.8656 == PF          OK
initial_deposit + profit  = 10000.00 +   -523.35 =   9476.65 == MT5 log     OK
total_deals / trades      =    11864 /     5932 = 2 per trade              OK
```

Fields that matter most when judging a strategy:

| Column | Meaning |
|---|---|
| `verdict` | the EA's own ruling — read this first |
| `t_stat` | significance of realised profit; **|t| < 2 means chance** |
| `win_rate` | **measured** from the deal history |
| `breakeven_win_rate` | win rate needed to pay the spread — the real bar to clear |
| `profit_factor` / `trade_profit_factor` | one from MT5's statistics, one from the deal scan |
| `cost_share_pct` | share of the target eaten by spread (1 spread / target ticks) |
| `avg_win_ticks` / `avg_loss_ticks` | realised legs, in ticks |
| `spread_ticks` | current spread |
| `min_stop_dist` / `stops_clamped` | broker floor, and how often it bound |
| `from_date` / `to_date` | span of the trades, from `DEAL_TIME` |
| `strat_*` | the four dropdowns, as run |

`avg_win_ticks` and `avg_loss_ticks` carry a small uniform scale offset on this
symbol (~2%, most likely an account-currency factor in the money→ticks
conversion). Trust their **ratio**, not their absolute values —
`breakeven_win_rate` divides by their sum, so the scale cancels.

### Layer 2 — MT5's own cache (authoritative)

`…\Tester\cache\*.tst`. This is MT5's record, not ours. Nothing we write can
outrank it.

```powershell
cd C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools\verify
python compare_cache_vs_csv.py
```

Cross-checks every `.tst` against the EA's CSV field by field.

To read one directly:

```python
import mt5_cache as mc
from pathlib import Path

p = Path(r"C:\Users\faarh\AppData\Roaming\MetaQuotes\Terminal\D0E8209F77C8CF37AD8BF550E51FF075"
         r"\Tester\cache\StrategyForge.Step Index.M1.20260901_20260930.0.B470DFD4D6C9625EDAC42084D7EF8C8F.tst")
print(mc.parse_tst_stats(p.read_bytes()))
```

The `.tst` summary block is found by **anchor plus two arithmetic identities**,
not by guessing offsets:

```
net_profit    == gross_profit - gross_loss
profit_factor == gross_profit / gross_loss
```

Both must hold at the same 8-byte-aligned offset. The equity track cannot satisfy
them, so a false positive is effectively impossible, and a file that satisfies
neither is reported as `_unparsed` rather than filled with invented numbers.

> **Caution — history.** An earlier version of this parser zipped a guessed run of
> doubles onto a guessed column-name list. In a `.tst` the longest run of non-zero
> doubles is the *equity track*, not the summary, so it reported profit `+191.63`,
> profit factor `128.1` and drawdown `161.9%` for a run that actually lost `523.35`.
> It worked on one file by coincidence. Anything read from it before the anchor
> fix is unreliable.

Layout, in doubles from `initial_deposit`:

| +0 | +16 | +24 | +32 | +56 | +72 | +136 | +144 | +168 | +176 | +192 | +208 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| deposit | net profit | gross profit | gross loss | max conwin | max conloss | dd abs | dd % | exp. payoff | profit factor | Sharpe | score |

followed by int32 counters at +216 total deals, +220 trades, +224 profit trades,
+228 loss trades.

**One sign convention to know:** `STAT_GROSS_LOSS` comes back from
`TesterStatistics()` already negative, so it lands in the CSV as `-3893.93` and
the identity is a plain sum. The `.tst` stores the same value as a positive
magnitude, `3893.93`. Compare that field on magnitude, not on sign — verified,
and a checker that forgets this reports a false mismatch.

### Layer 3 — the logs

The tester log is where MT5 states what it actually did. Proof that a run used
real ticks:

```
…\Tester\logs\YYYYMMDD.log
```

```
Step Index,M1: 2503294 ticks, 41756 bars generated.
Test passed in 0:00:03.227
final balance 9476.65 USD
OnTester result -5
```

Also useful: `[SF] Ready: …` for the resolved configuration and the broker's
minimum stop, `[SF] entry REJECTED retcode=…` for order rejections, and
`[SF] handles: MA=n RSI=n …` to confirm only the needed indicators were created.

The per-agent log referenced at the end of a tester entry is under
`…\MetaQuotes\Tester\<data-dir>\Agent-127.0.0.1-3000\logs\`.

---

## 6. Judging a result

Do not accept a strategy on profit. The order to check:

1. **Was it tradeable at all?** `min_stop_dist` vs your stop; `stops_clamped`
   > 0 means your requested stop was below the broker floor.
2. **Did it trade?** `entries_attempted` > 0, and `trades` ≥ `InpMinTrades`
   (`30` by default). Below that, `verdict` says `INCONCLUSIVE` and nothing else
   matters.
3. **Is there a signal?** `|t_stat|` ≥ 2. Below that the result is consistent
   with chance however good it looks.
4. **Does it pay for itself?** `win_rate` vs `breakeven_win_rate`. This is the
   bar that matters — a rule can be directionally correct and still lose money
   to spread.
5. **Is `verdict` `CANDIDATE`?** Not before a second, unseen window agrees.

### Verdict values

| Verdict | Meaning |
|---|---|
| `NO TRADES` | the rule never fired — check parameter scale first |
| `INCONCLUSIVE (n < min)` | too few trades to rule on |
| `NEGATIVE EDGE` | a significant **loss**; not the same as "no edge" |
| `NO EDGE` | consistent with chance |
| `CANDIDATE` | cleared the bar — confirm on a third window |

---

## 7. Known traps

- **A live MT5 terminal silently voids headless runs.** Close it first.
- **Stale binaries.** `run` re-syncs the source and refuses to install an `.ex5`
  older than its `.mq5` (exit `3`). `Experts\Bots\StrategyForge.ex5` was removed
  for exactly this reason — it was a stale pre-taxonomy build that could be
  selected by mistake.
- **Zero trades usually means a parameter scale problem**, not a verdict. See §3.
- **Duplicate CSV column names silently overwrite.** `profit_factor` appears
  twice; the deal-derived one is named `trade_profit_factor`. Any parser that
  builds a dict on column names will collapse duplicates — `read_report()`
  refuses a header/value field-count mismatch rather than guess.
- **Commas inside CSV fields shift every later column.** `Verdict()` returns
  semicolons only, and `CsvField()` strips separators from every string written.
- **`WebRequest()` cannot run in the tester** (error `4014`), so the EA's POST is
  a no-op under test. Results reach ScalarAI via the CSV and ingest.
- **The tester agent binds 127.0.0.1:3000.** Keep any web server off port 3000 or
  every test fails with a tester agent authorisation error.
- **History caps.** This symbol silently returns ~62 days; longer requests fail
  with `Invalid params`. `from_date` / `to_date` in the CSV record the span
  actually traded, so a truncated window is visible.
