# Strategy Testing in MT5

How to actually test a strategy with MetaTrader 5's native Strategy Tester:
the verified pipeline, how to make the optimiser work, and — most importantly —
what makes a result trustworthy rather than merely green.

Companion to `mt5.md` (which covers the mechanics of compiling, installing and
launching). Claims are labelled **[verified]** (executed on this machine,
MT5 build 6235), **[docs]** (MetaQuotes reference, URL given), or
**[unverified]**.

---

## 1. Why the native tester, and not a Python backtester

A custom backtester cannot replicate what MT5 does, so any number it produces
is a guess about a different system:

- MT5 generates ticks from minute bars using a specific algorithm, then models
  bid/ask spread per tick from history. [docs]
- Order filling respects the symbol's execution mode, filling policy, stops
  level and freeze level.
- Margin, leverage, swap and commission are applied per symbol.
- `SYMBOL_SPREAD_FLOAT` is always true in the tester, and the spread is taken
  from history, not modelled. [docs]

And the Python package cannot help: `MetaTrader5` has **zero** matches for
`test|backtest|strategy|expert|compile|inject|optimi` across both its Python
source and its compiled `_core.pyd`. [verified] It does data in, orders out.

**Consequence:** the site/app must never produce backtest numbers. It is a
strategy registry and an execution router. All testing happens in MT5.

---

## 2. The verified single-pass pipeline

End to end, every step executed: [verified]

```powershell
cd C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools

# 1. compile
python strategyforge.py compile
#    Result: 0 errors, 0 warnings

# 2. run one pass through the native tester
python strategyforge.py run --mode 1 --fast 12 --slow 40 --threshold 1.0 `
    --from 2026.09.01 --to 2026.09.30 --criterion 1 --tag verified

# 3. read the report
python strategyforge.py read --tag verified
```

`run` compiles, installs the `.ex5`, writes a `.set` and an `.ini`, launches
`terminal64.exe /config:...`, waits for the EA's CSV, and prints it.

Real output (12.0 s, 2,432,083 ticks, 30,164 bars generated): [verified]

```json
{
  "tag": "verified", "symbol": "EURUSD", "mode": "1",
  "fast": "12", "slow": "40", "threshold": "1.0000",
  "score": "0.67756814", "trades": "32", "wins": "14", "losses": "18",
  "profit": "27.77", "net_pips": "0.8678", "profit_factor": "1.0745",
  "sharpe": "0.6776", "dd_abs": "134.71", "dd_rel_pct": "1.332",
  "max_win_run_money": "116.60", "max_loss_run_money": "-123.48"
}
```

A losing configuration is rejected just as cleanly — mode 2 / fast 10 / slow 30
gave `score -2.8796`, `profit -92.00`, `profit_factor 0.6633`. [verified] The
objective separated signal from noise on real data.

### The figures cross-check, and that is the real test

| Check | Value |
|---|---|
| `wins + losses == trades` | 14 + 18 = 32 ✅ |
| `score == sharpe` (criterion 1 is Sharpe) | 0.6776 ✅ |
| `net_pips == expected_payoff` at 0.1 lots | 0.8678 ✅ |
| `dd_abs / 10000 == dd_rel_pct` | 134.71 → 1.347% vs 1.332% ✅ |
| two identical runs byte-for-byte | ✅ |

Reproducibility: two runs of the same configuration produced **byte-identical**
CSVs apart from the tag column. [verified]

Independent confirmation: MT5's own `.tst` cache record for the same run agrees
with every one of these numbers to full double precision (see `mt5.md` §5).

---

## 3. Custom optimisation criteria — the point of `OnTester()`

`OnTester()` returns a `double` that becomes the optimiser's objective. This is
what lets you optimise *your* definition of good rather than raw profit.

`StrategyForge` exposes six, all verified against a fixed configuration and
cross-checked against the metric each claims to measure: [verified]

| idx | name | score | equals |
|---|---|---|---|
| 0 | `balance` | 10027.77 | `10000 + profit` |
| 1 | `sharpe` | 0.6776 | `STAT_SHARPE_RATIO` |
| 2 | `profit_factor` | 1.0745 | `STAT_PROFIT_FACTOR` |
| 3 | `calmar` | 20.8428 | `profit / dd_rel_pct` |
| 4 | `penalised` | −6707.73 | `profit − InpDrawdownPenalty × dd_abs` |
| 5 | `trade_count` | 32.0 | `STAT_TRADES` |

Two naming traps in my own table, corrected after checking:

- **`calmar` is not annualised.** It is `profit / dd_rel_pct` over the test
  window, so its scale depends on the window length. Two runs over different
  date ranges are not comparable.
- **`penalised` subtracts the penalty from *absolute* drawdown in account
  currency**, not the percentage. At the default weight of 50, a $135 drawdown
  costs ~6,700 points of score — so this criterion is effectively "minimise
  drawdown", not a mild adjustment. Lower `InpDrawdownPenalty` for a gentler
  trade-off. [verified]

### Zero-trade runs must not win

MT5 returns 0 or an enormous number for undefined ratios, which would poison an
optimisation. `Score()` short-circuits on `trades < 1`. Verified: with a
threshold no signal can clear, **all six criteria return 0** and no NaN or
huge value leaks through. [verified]

---

## 4. Parameter ranges live in the `.set` file

MT5's GUI writes its own `.set` when you use the tester. **Read that file to
learn the format** — it is authoritative, written by the thing that consumes it.
[verified]

```ini
InpFast=12||20||1||200||N
InpSlow=40||50||1||500||N
InpThreshold=99.0||2.0||0.2||20.0||N
InpTag=mytag
```

Five fields separated by `||`:

```
name || current || start || step || stop || optimise(Y/N)
```

- Trailing `N` — parameter is **pinned** at the current value.
- Trailing `Y` — MT5 **sweeps** it across start/step/stop.
- A bare `InpName=value` (no fields) pins it too; string inputs appear this way.

### Critical: `ExpertParameters` takes a BARE FILE NAME

Probed against the tester log, all three forms: [verified]

| Value | Result |
|---|---|
| `myinputs.set` | **inputs applied** |
| `MQL5\Profiles\Tester\myinputs.set` | ignored, compiled defaults used |
| `C:\...\myinputs.set` | ignored, compiled defaults used |

The `.set` must live in `<data dir>\MQL5\Profiles\Tester\`. The failing forms
are parsed and then silently dropped — the run succeeds while testing the wrong
parameters. Verify with `started with inputs:` in the tester log. [verified]

---

## 5. Optimisation — what works, and the two walls

Optimisation itself **runs correctly**: verified 9, 27 and 75 passes across the
8 local agents, correct symbol/timeframe/date range, real tick generation per
pass. [verified]

```powershell
python strategyforge.py optimise --mode 1 `
    --fast 8:24:8 --slow 30:50:10 --threshold 1.0:2.0:0.5 `
    --criterion 1 --optmode 1        # 1 = slow complete, 2 = fast genetic
```

### Wall 1 — `OnTester()` is not the optimisation channel

Verified by a diagnostic EA that writes to a file rather than logging: [verified]

| `Optimization=` | `OnTester()` ran | per-pass output |
|---|---|---|
| 0 (single pass) | yes | yes |
| 1 (slow complete) | **no** | no |
| 2 (fast genetic) | **no** | no |

During optimisation MT5 optimises on a built-in statistic instead. So
`OptimizationCriterion` must select the custom option for your `OnTester()`
value to be used at all — **verify which value that is before trusting a sweep**
[unverified — the mapping was not pinned down].

Worse, **file writes from the EA are dropped in that mode**, so the per-pass CSV
trick cannot work either.

Note how this was nearly missed: `Print()` is suppressed during optimisation
(except in `OnInit`), so the absence of `[SF] RESULT` lines *looked* like proof
`OnTester()` never ran. It did run. Absence of a log line is not evidence.
[docs] https://www.mql5.com/en/docs/runtime/testing

### Wall 2 — no report file is written headlessly

`Report=` produced nothing for a single pass with **either** `.htm` or `.xml`,
probed with both a minimal hand-written config and the generated one. The log
ends with `automatic testing finished`. [verified]

`FrameAdd()` — the documented per-pass channel, which should write
`MQL5\Files\Tester\<EA>.MQD` — produced **no `.MQD`** in a headless `/config`
run, single pass or optimisation. The scalar form compiles; the array overload
does not bind. [verified]

### The way out: MT5's own cache

Results are always recorded, independent of `Report=`:

```
<data dir>\Tester\cache\<EA>.<symbol>.<tf>.<from>.<to>.<opt>.<hash>.opt
```

Each `TesterOptCache` holds **one 296-byte record per pass**. Confirmed by
byte-searching for a known profit value: 9 occurrences at a uniform `0x128`
gap, matching the terminal log's `total passes 9`. [verified]

This is the only place per-pass optimisation metrics exist in a headless run.
Parsers are in `..\verify\`.

**Known gap:** `profit`, `gross_profit`, `gross_loss`, `max_win`, `dd_abs`,
`dd_rel`, `balance` are mapped in the record; `trades`, `score` and `sharpe`
are not. `score` is the one that matters, since it is what the optimiser ranks
on. [unverified]

### Genetic mode downgrades itself, silently

```
genetic mode turned off due to 75 passes,
to use it increase amount of optimized parameters
```

[verified] MT5 falls back from genetic to exhaustive when the grid is small. A
75-pass sweep sounds like genetic search and was not. **Always read this line**
before believing a genetic run.

---

## 6. Getting more out of MT5's testing capabilities

Available, worth using: [docs] https://www.mql5.com/en/docs/runtime/testing

**Tick generation modes.** `Model=0` every tick (generated), `1` 1-minute OHLC,
`2` open prices only, `3` math calculations, `4` real ticks. Real ticks are
closest to reality; the tester discards ticks that contradict their minute bar
and substitutes generated ones, so "real" is not absolute. Any accuracy claim
should use `Model=4`.

**`Model=3` — math calculations.** No ticks, no history download; only `OnInit`,
`OnTester`, `OnDeinit` are called. MT5 explicitly supports using the tester as a
general optimisation engine (their example minimises `sin(x²+y²)`). Useful for
fitting anything where you can express the objective as a function. [unverified
here — not exercised]

**Multi-currency testing.** Supported natively: just `SymbolSelect()` or touch
another symbol and the agent fetches its history. Cross rates are handled
automatically — testing EURCHF with a USD deposit pulls EURUSD and USDCHF even
if the EA never mentions them. [docs]

**Analysis inside the EA.** `Trade\HistoryOrderInfo.mqh`,
`Trade\PositionInfo.mqh` and `OrderInfo.mqh` work in the tester, so an EA can
analyse its own deals — per-trade MAE/MFE, holding times, exit-reason
distribution. That is how you build statistics the tester's report does not
have. [unverified — not exercised]

**Alglib in MQL5.** `MQL5\Include\Math\Alglib\optimization.mqh` (2.3 MB) gives
evolutionary optimisation in pure MQL5, independent of MT5's own genetic mode —
useful for objectives MT5 cannot express. [unverified — present, not exercised]

**Testing agents.** Local agents scale with cores (8 here → ports
`Agent-127.0.0.1-3000..3007`). `UseLocal/UseRemote/UseCloud` in the ini select
them; `Port=` gives each its own state for true parallelism. Remote and MQL5
Cloud are available via the same keys. [verified local; remote/cloud
unverified]

**Swap and commission** are modelled per symbol from the broker's contract
specification, so results depend on the account's symbol settings — a
backtest can differ from live purely on swap rollover. [docs]

---

## 7. What actually determines whether a result is trustworthy

This is the part no amount of tooling fixes.

**1. `Model=0` is not real ticks.** Every number in this document used
generated ticks. That is fine for a smoke test and wrong for any accuracy
claim. Re-run the finalists on `Model=4`. [verified that the mode matters; not
re-run here]

**2. The fitting window is not the validation window.** All results here used
2026.09.01–09.30 for both fitting and judging. That is textbook overfitting.
A parameter set chosen on a window and evaluated on the same window tells you
only that you can fit noise.

Minimum discipline: optimise on period A, then evaluate the *chosen* parameters
once on period B, never having looked at B. MT5 supports a custom forward split
(`ForwardMode`) — configure it rather than eyeballing a second date range.
[unverified here]

**3. Optimise the fewest things you can.** Each swept parameter multiplies the
grid and multiplies the chance of a lucky combination. Six inputs over a month
of M1 data will produce a spectacular Sharpe ratio that dies immediately.

**4. Watch the trade count.** A criterion like `profit_factor` on 12 trades is
noise. Require a minimum count before believing any ranking; `trade_count`
exists as criterion 5 for exactly this sanity check.

**5. Prefer ratio criteria to raw profit.** Profit scales with lot size and
window length, so it is not comparable across configurations. Sharpe, profit
factor and drawdown-relative measures are.

**6. Check `entries_skipped` and `position_blocks`.** The EA reports these. A
high skip count means signals were refused (invalid lot, spread filter, cap) —
the result is then a backtest of a *different* strategy than you think.

**7. Confirm with MT5's own record.** Compare your CSV against the `.tst`
cache. If they disagree, one of them is wrong and you want to know which.

---

## 8. Known limitations, stated plainly

| Limitation | Consequence |
|---|---|
| `WebRequest` cannot execute in the tester | results leave via CSV or the cache; live integration needs a chart EA |
| `Print` suppressed during optimisation | log absence proves nothing |
| EA file writes dropped during optimisation | per-pass CSV impossible |
| `Report=` writes nothing headlessly | never block on it |
| `OnTester()` not invoked when `Optimization!=0` | `OptimizationCriterion` must select the custom option — verify which value |
| `.opt` record columns for `score`/`trades` unmapped | cannot rank passes programmatically yet |
| `optimise` command returns exit 3 | the sweep ran; per-pass metrics are in the `.opt` cache, not yet surfaced |
| Genetic mode self-downgrades on small grids | a "genetic" run may be exhaustive |

---

## 9. Quick reference

```powershell
# single pass
python strategyforge.py run --mode 1 --fast 12 --slow 40 --threshold 1.0 `
    --from 2026.09.01 --to 2026.09.30 --criterion 1 --tag t1

# parameter sweep (start:stop[:step])
python strategyforge.py optimise --mode 1 --fast 8:24:8 --slow 30:50:10 `
    --criterion 1 --optmode 1 --tag opt1

# read results
python strategyforge.py read --tag t1
python strategyforge.py list-reports

# MT5's own records
cd verify; python mt5_cache.py
cd verify; python read_opt_passes.py
cd verify; python compare_cache_vs_csv.py
```

Criterion indices: `0` balance, `1` sharpe, `2` profit_factor, `3` calmar,
`4` penalised, `5` trade_count.

Strategy modes (`InpMode`): `0` MA cross, `1` RSI reversion, `2` breakout,
`3` Bollinger, `4` MACD.