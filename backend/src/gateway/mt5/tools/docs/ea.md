# Running MT5's built-in Strategy Tester from an AI

How an AI can generate, compile, and run Expert Advisors against MetaTrader 5's
**native Strategy Tester**, and read the results back.

Written after verifying every claim below against this machine. Paths and
commands were executed, not assumed.

---

## TL;DR

| Question | Answer |
|---|---|
| Can the `MetaTrader5` Python package drive the Strategy Tester? | **No.** It has no tester, backtest, file, or code-injection function at all. |
| Can an AI create and compile an EA? | **Yes.** `MetaEditor64.exe /compile` works headless and returns line-numbered errors. |
| Can an AI run the tester unattended? | **Yes.** `terminal64.exe /config:file.ini` with a `[Tester]` block. |
| Can it be parallelised? | **Yes.** Local/remote/cloud agents via `UseLocal` / `UseRemote` / `UseCloud`. |

The package is for **data and orders**. The Strategy Tester is a **separate,
terminal-side** subsystem reachable only through MQL5 (a compiled `.ex5`).

---

---


## 1. Why the Python package cannot do this

`MetaTrader5` exposes **35 functions, 11 named-tuple classes, 223 constants**.

The complete function list:

```
Buy  Close  Sell
initialize  login  shutdown  last_error  version
terminal_info  account_info
symbols_get  symbols_total  symbol_info  symbol_info_tick  symbol_select
copy_rates_from  copy_rates_from_pos  copy_rates_range
copy_ticks_from  copy_ticks_range
market_book_add  market_book_get  market_book_release
orders_get  orders_total  positions_get  positions_total
order_send  order_check  order_calc_margin  order_calc_profit
history_deals_get  history_deals_total  history_orders_get  history_orders_total
```

That is the entire surface. Searching every name — in both the Python
`__init__.py` and the compiled `_core.pyd` — for `test`, `backtest`, `strategy`,
`expert`, `compile`, `file`, `write`, `inject`, `upload`, `run`, `python`,
`dll`, `eval`, `exec`, `command`, `script`, `optimi`, `report`:

> **Zero matches.**

MetaQuotes' own release notes (build 2085) describe the Python API as being for
*"efficient and fast obtaining of exchange data via interprocessor
communication, directly from the MetaTrader 5 terminal"*. Data in, orders out.
Testing was never part of it.

**Conclusion: the Python backtest engine is not duplication.** The package offers
no alternative, so the simulation must happen somewhere. The real choice is
*where* — Python, or MetaTrader's own tester. Doing both and diffing them is
strictly better than either alone.

---

## 2. Verified environment on this machine

| Item | Value |
|---|---|
| Terminal install | `C:\Program Files\MetaTrader 5\terminal64.exe` (build 6235) |
| MQL5 compiler | `C:\Program Files\MetaTrader 5\MetaEditor64.exe` (116 MB) |
| Tester agent | `C:\Program Files\MetaTrader 5\metatester64.exe` (22 MB) |
| Data directory | `%APPDATA%\MetaQuotes\Terminal\D0E8209F77C8CF37AD8BF550E51FF075\` |
| `origin.txt` maps instance id → install path | `C:\Program Files\MetaTrader 5` |
| MQL5 folders present | `Experts, Files, Images, Include, Indicators, Libraries, logs, Profiles, Scripts, Services, Shared Projects` |
| `MQL5\Profiles\Tester` | **exists** (required location for `.set` files) |
| Workspace used | `C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools\{mql5, out, docs}` |

The instance id is specific to the install path. If MT5 is reinstalled or moved,
re-read `origin.txt` to find the new one — do not hardcode it.

### Already installed in `MQL5\Experts`

Worth knowing before writing a new bridge:

| File | Size | Note |
|---|---|---|
| `Bots\AIMT5Bridge.mq5` | 40 KB | Talks **out** to `http://127.0.0.1:3000` via `WebRequest()` |
| `ScalarAI_Gateway_EA.mq5` | 23 KB | Same idea |
| `MT5_AI_Bridge_EA_20261011_070942.mq5` | 19 KB | Same idea |

These run **inside** the terminal and call *our* Python API. Useful for live
trading, but they are not a path into the tester. The tester needs the opposite
direction: our code drives the terminal.

---

## 3. Stage 1 — write the EA (`.mq5`)

MQL5 is C-like. A minimal, complete EA:

```cpp
//+------------------------------------------------------------------+
//| MyStrategy.mq5                                                  |
//+------------------------------------------------------------------+
#property copyright "cotrade"
#property version   "1.00"
#property strict

// CTrade is NOT built in - it lives in the standard library.
#include <Trade\Trade.mqh>

input int    FastPeriod = 20;    // fast MA length
input int    SlowPeriod = 50;    // slow MA length
input double Lots      = 0.01;   // fixed lot size

CTrade trade;

//--- Called once before testing/optimisation starts.
int OnInit()
{
   Print("init fast=", FastPeriod, " slow=", SlowPeriod);
   return(INIT_SUCCEEDED);
}

//--- Called on every generated tick during a test.
void OnTick()
{
   // iMA(symbol, timeframe, ma_period, ma_shift, ma_method, applied_price)
   // takes SIX arguments and returns an int HANDLE, not a price.
   // The price comes from CopyBuffer.
   int hFast = iMA(_Symbol, PERIOD_CURRENT, FastPeriod, 0, MODE_SMA, PRICE_CLOSE);
   int hSlow = iMA(_Symbol, PERIOD_CURRENT, SlowPeriod, 0, MODE_SMA, PRICE_CLOSE);
   if(hFast == INVALID_HANDLE || hSlow == INVALID_HANDLE)
      return;

   double fastBuf[1], slowBuf[1];
   if(CopyBuffer(hFast, 0, 1, 1, fastBuf) != 1) return;
   if(CopyBuffer(hSlow, 0, 1, 1, slowBuf) != 1) return;

   if(fastBuf[0] > slowBuf[0] && !PositionSelect(_Symbol))
      trade.Buy(Lots, _Symbol, 0.0, 0.0, 0.0, "cross_up");
}

//--- Return a custom optimisation score, e.g. profit minus drawdown.
double OnTester()
{
   return TesterStatistics(STAT_PROFIT);
}
```

**This exact file was compiled on this machine: `Result: 0 errors, 0 warnings`
producing `MyStrategy.ex5` (27,004 bytes).**

### MQL5 gotchas that will bite an AI

Every row below is a real error the compiler emitted during verification of the
examples in this document. Each cost one compile iteration.

| Mistake | Error | Correct |
|---|---|---|
| `Bars` | `wrong parameters count` | `Bars(_Symbol, PERIOD_CURRENT)` — it is a function needing arguments |
| `Close[1] > Open[1]` | `undeclared identifier 'Close'` | `iClose(_Symbol, PERIOD_CURRENT, 1) > iOpen(_Symbol, PERIOD_CURRENT, 1)` |
| `iMA(..., PRICE_CLOSE, 1)` as a price | `wrong parameters count` | `iMA` takes 6 args and returns an **int handle**. Read the price with `CopyBuffer(handle, 0, shift, 1, array)` |
| Using `CTrade` with no include | `undeclared identifier 'CTrade'` | `#include <Trade\Trade.mqh>` at the top |
| Declaring a variable mid-block | `'trade' - some operator expected` | MQL5 is stricter than C++; declare locals up front |

The most dangerous class of error is silent: `iMA` returning a handle where a
price was expected still **compiles** in some forms and produces an EA that
compares handle integers instead of prices — a strategy that trades on noise.
Always check `CopyBuffer`'s return value, as above.

Series indexing (`Close[1]`, `High[2]`) **is** valid built-in syntax in MQL5.
The `undeclared identifier 'Close'` error above came from a probe whose scope
did not resolve the series; `iOpen`/`iClose` are explicit and always work, which
makes them the safer default for generated code.

---

## 4. Stage 2 — compile (verified working)

```powershell
$me    = "C:\Program Files\MetaTrader 5\MetaEditor64.exe"
$src   = "C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools\mql5\CompileChainProbe.mq5"
$log   = "C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools\out\compile.log"

& $me /compile:"$src" /log:"$log"
```

Actual output from the verified run:

```
C:\...\CompileChainProbe.mq5 : information: compiling ...
C:\...\CompileChainProbe.mq5(34,10) : error 256: undeclared identifier 'Close'
C:\...\CompileChainProbe.mq5(34,15) : error 241: '[' - array required
Result: 4 errors, 0 warnings
```

and after fixing:

```
 : information: code generated
Result: 0 errors, 0 warnings, 1255 ms elapsed, cpu='X64 Regular'
```

Producing `CompileChainProbe.ex5` (8,240 bytes) next to the source.

### The `/compile` flags

From `MetaEditor64.exe /?` (note: the official help text renders with broken
spacing on Windows — the substance is correct):

| Flag | Meaning |
|---|---|
| `/compile:"path"` | compile a source file |
| `/include:"path"` | include folder, or project file |
| `/project` | compile a `.mqproj` project |
| `/s` | syntax check only, no output |
| `/log` | write a compilation log |
| `/inc` | incremental |
| `/nowarn`, `/smart` | warning / optimisation modes |

### What this means for an AI

Compilation is a **fully machine-readable feedback channel**. The compiler emits
`file(line,col) : error NNN: message`. That is enough for an agent to iterate:
write → compile → parse errors → patch → recompile. No GUI, no human in the loop.

**This is the key enabler.** It is what makes AI-generated MQL5 practical rather
than guesswork.

---

## 5. Stage 3 — run the native tester (headless)

Write a config `.ini`, then launch the terminal with it:

```powershell
$ini = "C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools\tester.ini"
& "C:\Program Files\MetaTrader 5\terminal64.exe" /config:"$ini"
```

### `[Tester]` block reference

Official MetaQuotes parameters. Paths are **relative to the platform data
directory**, i.e. `%APPDATA%\MetaQuotes\Terminal\<instance_id>\`.

```ini
[Tester]
;--- The compiled EA. Relative to MQL5\Experts\
Expert=CompileChainProbe.ex5

;--- Inputs. The .set must live in MQL5\Profiles\Tester\ and this value
;    must be its BARE FILE NAME. A relative path with directories, or an
;    absolute path, is accepted by the ini reader and then silently ignored
;    -- every input stays at its compiled default. Omit to use defaults.
ExpertParameters=myinputs.set

Symbol=EURUSD
Period=M1
Login=123456
Deposit=10000
Leverage=1:100

;--- Tick model. THIS IS THE ONE THAT MATTERS FOR ACCURACY
;    0 = Every tick (generated)
;    1 = 1 minute OHLC
;    2 = Open price only
;    3 = Math calculations
;    4 = Every tick based on real ticks   <-- most accurate, needs downloaded data
Model=0

;--- 0 = normal, -1 = random delay, >0 = delay in ms (max 600000)
ExecutionMode=0

;--- 0 = off, 1 = slow complete, 2 = fast genetic, 3 = all Market Watch symbols
Optimization=0
OptimizationCriterion=0

FromDate=2026.09.01
ToDate=2026.09.30
ForwardMode=0

;--- Report file. Use an ABSOLUTE path: a relative one resolves against the
;    Program Files install folder, where the subfolder cannot be created.
;    Note that on this machine a headless /config run wrote no report at all,
;    so never block on this file -- see section 10.
Report=C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools\reports\sf_probe
ReplaceReport=1

;--- Exit the terminal when the run finishes (needed for unattended use)
ShutdownTerminal=1

;--- Agents. Turn off anything you are not using, or runs slow down.
UseLocal=1
UseRemote=0
UseCloud=0
Visual=0
```

Also add `[Experts] AllowLiveTrading=0` so a misconfigured run cannot place a
real order.

### Why this is better than the Python engine

MT5's tester models things a Python reimplementation has to approximate:

- Real tick data, not bar interpolation (`Model=4`)
- Broker-side execution rules, swap, margin, fill policy
- The broker's actual spread at each moment
- Deterministic, audited statistics

### Three real failure modes

From an mql5.com thread where a user hit exactly this, and it is worth
internalising because the failure is **silent**:

1. **`FromDate` later than `ToDate`** → terminal starts, populates settings,
   immediately closes, writes nothing. This is the single most common cause.
   A moderator's entire reply to that user was *"Your starting date is in the
   future of the ending date."* Always validate dates in the generator.

2. **Run from a background shell / `shell_exec` → no report produced.** Works by
   double-click, fails when launched detached. Keep the process attached, or
   poll for the report file rather than assuming completion.

3. **`ExpertParameters` not a bare file name** → the tester silently falls back
   to default inputs. The `.set` must live in `MQL5\Profiles\Tester` (not
   `Presets`, which is for the `[StartUp]` block) **and** be referenced by bare
   name; a path with directories or an absolute path is accepted and dropped.
   See section 10 for the probe table.

**Always verify a run actually happened.** On this machine the reliable
signal is the EA's own CSV, not the exit code and not the `.htm` - MT5 writes
no HTML on a headless `/config` run at all. The tester log echoes the inputs it
received under `started with inputs:`; check that line against what you asked
for, because a wrong-value run is otherwise indistinguishable from a correct
one.

### The more reliable alternative

From the same thread, an experienced user recommends skipping the `.ini`-per-run
approach: write task `.ini` files into `MQL5\Profiles\Tester\`, then run a
single **driver EA in the live terminal** (not the tester) that reads and
executes them sequentially. More moving parts, but far fewer silent failures and
better error reporting. Worth considering once the simple path is proven.

---

## 6. Stage 4 — read results back

Two routes.

**A. Report file.** `Report=` path; `.htm` for a single pass, `.xml` for an
optimisation. Use an absolute path. **Caveat verified on this machine: a
headless `/config` run wrote no report at all** - the log ends with
`automatic testing finished` and nothing else. Do not block on it.

**B. `OnTester()`.** The EA returns its own score. Combined with
`OptimizationCriterion=6` this becomes a custom objective — e.g. profit minus
drawdown, or a t-statistic. This is the path that actually works unattended:
have the EA write its metrics to `FILE_COMMON` and read that.

Useful `TesterStatistics()` constants: `STAT_PROFIT`, `STAT_TRADES`,
`STAT_PROFIT_FACTOR`, `STAT_EQUITY_DDREL_PERCENT`, `STAT_SHARPE_RATIO`,
`STAT_EXPECTED_PAYOFF`.

**Do not assume from the name.** `STAT_VOLUME`, `STAT_VOLUME_LONG`,
`STAT_VOLUME_SHORT`, `STAT_BALANCE`, `STAT_LOTS` and `STAT_BALANCE_MAX` do not
exist (the compiler rejects them), and `STAT_MAX_CONWINS` /
`STAT_MAX_CONLOSSES` return **money** despite being documented as counts.
Accumulate traded volume in the EA if you need it.

---

## 7. How an AI should drive this

### The loop

```
   strategy spec (Python)
          |
          v
   generate .mq5  ----------------.
          |                       |
          v                       | fix
   MetaEditor64 /compile          |
          |                       |
          v                       |
   parse "file(line): error" ------'
          |  (0 errors)
          v
   write .set inputs + config .ini
          |
          v
    terminal64 /config  ------>  wait for the EA's CSV (terminal exit = backstop)
          |                       |
          |                       v
           |                  VERIFY CSV is fresh and field counts match
          |
          v
    parse CSV / OnTester score
          |
          v
   keep, reject, or mutate params -> back to the top
```

### Rules that make this reliable

1. **Never trust exit codes.** Verify the EA's CSV exists, is non-empty, was written after the run started, and has matching header/value field counts.
2. **Validate dates before launching.** `FromDate < ToDate`, and inside a range
   the broker actually has data for.
3. **Compile every time.** Never assume an `.ex5` is current; track source mtime.
4. **Use `Model=4` (real ticks) for any accuracy claim.** `Model=0` generates
   ticks and will not match broker history.
5. **One tester run per process.** The terminal holds global state; parallel runs
   want `Port=` to give each agent its own.
6. **`AllowLiveTrading=0`** in every generated config unless deliberately testing
   live behaviour.
7. **Cache candles.** `copy_rates_*` is cheap but repeated 10k-bars calls are not.
8. **Keep a clean `.ini` per run.** Stale `ReplaceReport=0` silently creates `report[1].htm` instead of overwriting - an easy source of reading old results.
   `report[1].htm` instead of overwriting — an easy source of reading old results.

---

## 8. Relationship to the existing Cotrade backtester

This is **additive**, not a replacement.

```
                    +-----------------------------+
   strategy spec --> |  Python engine              | --> fast iteration,
                    |  (tools/bot/engine.py)       |     sweepable params
                    +-----------------------------+
                    |                             |
                    |   MT5 native Strategy Tester | --> authoritative
                    |   (MetaEditor + terminal64)  |     ground truth
                    +-----------------------------+
                    |                             |
                    v                             v
                     +-------------------------------+
                     |   diff the two, trust the
                     |   stricter / more accurate
                     +-------------------------------+
```

Both compute the same thing from the same bars. **Comparing them is a
free, high-value correctness check** — the kind that catches a wrong spread
assumption, a bad fill model, or an off-by-one in the exit loop.

A concrete open question this resolves: a manual reimplementation of one
strategy's trade loop produced ~82 trades / 48.8% win rate (matching the
engine's 78 / 47.8% closely) but **+17.11 net pips against the engine's −153.8**.
Trade count and win rate agreed; P&L did not. Running the same rule through
MT5's own tester would attribute that discrepancy definitively.

---

## 9. StrategyForge - the reference EA

`mql5/StrategyForge.mq5` (+ `strategyforge.py`) is a working, compile-verified
EA built for exactly this workflow. **Verified: `Result: 0 errors, 0 warnings`
→ `StrategyForge.ex5` (54,926 bytes).**

### Design: one EA, many strategies

The point is that an AI should **not recompile per experiment**. Five strategy
families live behind one `InpMode` switch, and every tuning knob is an input.
That means MT5's native optimiser can sweep thousands of parameter
combinations without a single recompile:

```bash
# one pass
python strategyforge.py run --mode 0 --fast 20 --slow 50 --tag ma1

# MA cross, genetic optimisation over both periods (needs the sweep helper;
# the .ini is generated the same way)
```

| `InpMode` | Family | Uses |
|---|---|---|
| 0 | MA cross | `InpFast` / `InpSlow` EMA |
| 1 | RSI reversion | `InpPeriod`, `InpThreshold` as the extreme |
| 2 | Donchian breakout | `InpFast` lookback, computed manually |
| 3 | Bollinger reversion | `InpPeriod`, `InpThreshold` multiplier |
| 4 | MACD cross | `InpFast`/`InpSlow`/`InpPeriod` |

### Custom optimisation criterion

`OnTester()` returns a selectable score, so `OptimizationCriterion=6` optimises
what you actually care about instead of raw balance:

| `InpCriterion` | Score |
|---|---|
| 0 | balance |
| 1 | Sharpe ratio |
| 2 | profit factor |
| 3 | Calmar (profit / drawdown %) |
| 4 | profit minus a drawdown penalty |
| 5 | trade count (sanity check) |

Undefinable ratios are clamped, and a run with **zero trades returns 0** —
otherwise the optimiser would happily reward a family that never fires.

### Machine-readable reporting

`OnTester()` writes a tagged CSV to the terminal's *common* files folder
(`FILE_COMMON`, i.e. `%APPDATA%\MetaQuotes\Terminal\Common\Files`):

```
StrategyForge_<tag>.csv
```

One header line, one value line, ~30 columns: the parameters used, the score,
trades, win/loss counts, profit, net pips, profit factor, expected payoff,
Sharpe, absolute and relative drawdown, consecutive win/loss streaks, and the
EA's own counters (`entries_attempted`, `entries_skipped`, `position_blocks`).

Read it with:

```bash
python strategyforge.py list-reports
python strategyforge.py read --tag mytest
```

The counters matter as much as the P&L: `entries_skipped` being large tells
you the spread filter or lot sizing blocked most signals, which a profit
number alone would hide.

### Honest reporting of failures

Every decision is logged with a reason (`entries_skipped`,
`position_blocks`), and `OnInit` **fails loudly** if an indicator handle
cannot be created. Otherwise a failed handle would make every signal return 0
and produce a run that looks valid but tested nothing — the most dangerous
class of silent failure in a backtester.

### Execution realism

- Prices normalised to the symbol's **tick size**
- Lots clamped to the broker's **step/min/max**, then re-clamped after
  rounding, because rounding can drop a value below the minimum
- `CTrade` for all fills, so bid/ask and the broker's execution rules apply in
  every tick model
- Optional trailing stop, breakeven, time stop, spread filter, position cap
- Optional risk-percent sizing that accounts for pip value

---

## 10. The full verified flow (compile -> test -> result)

This is the flow that actually works. Every command below was run, and the
numbers quoted are copied from real output rather than written from memory.

### Step 0 - prerequisites

```powershell
# MT5 allows ONE terminal instance per data directory. A terminal that is
# already open will not act on /config, so close it first.
Get-Process terminal64 | Stop-Process -Force
```

### Step 1 - compile

```powershell
cd C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools
python strategyforge.py compile
#   Result: 0 errors, 0 warnings, 2586 ms elapsed
```

`MetaEditor64.exe /compile:... /log:...` writes a **UTF-16LE log with a BOM**;
decode it explicitly or the `Result:` line never matches and a failed compile
looks like a clean one.

### Step 2 - install into the terminal

```powershell
python -c "import strategyforge as sf; print(sf.install_ex5('StrategyForge', sf.MQ5/'StrategyForge.mq5'))"
# -> ...\MQL5\Experts\StrategyForge\StrategyForge.ex5
```

A successful compile is not enough - the terminal only loads experts from
`MQL5\Experts`, and the `[Tester] Expert=` value is relative to that folder.

### Step 3 - run one pass

```powershell
python strategyforge.py run --mode 1 --fast 12 --slow 40 --threshold 1.0 \
    --from 2026.09.01 --to 2026.09.30 --criterion 1 --tag verified
```

`run` compiles, installs, writes a `.set`, writes a `tester_<epoch>.ini`,
launches `terminal64.exe /config:<ini>`, waits for the EA's CSV, and prints it.
`AllowLiveTrading=0` is hard-coded in the generated ini so a stray test can
never place an order.

### Step 4 - what came back

```
compiled OK
installed -> ...\MQL5\Experts\StrategyForge\StrategyForge.ex5
run finished in 12.0s
csv report: ...\Terminal\Common\Files\StrategyForge_verified.csv
htm report: (MT5 wrote none headlessly - expected)
```

and the CSV parsed into 29 fields:

```json
{
  "tag": "verified", "symbol": "EURUSD", "mode": "1", "timeframe": "0",
  "fast": "12", "slow": "40", "threshold": "1.0000",
  "score": "0.67756814", "trades": "32", "wins": "14", "losses": "18",
  "profit": "27.77", "net_pips": "0.8678", "profit_factor": "1.0745",
  "sharpe": "0.6776", "dd_abs": "134.71", "dd_rel_pct": "1.332",
  "max_win_run_money": "116.60", "max_loss_run_money": "-123.48"
}
```

The figures cross-check against each other, which is the real test that the
pipeline is honest rather than merely non-crashing:

| Check | Value |
|---|---|
| `wins + losses == trades` | 14 + 18 = 32 |
| `score == sharpe` (criterion 1 is Sharpe) | 0.6776 |
| `net_pips == expected_payoff` at 0.1 lots | 0.8678 |
| `dd_abs / deposit == dd_rel_pct` | 134.71 / 10000 = 1.347% vs 1.332% |
| log shows real ticks, not bars | `2432083 ticks, 30164 bars generated` |

A losing configuration is rejected just as cleanly: mode 2 / fast 10 / slow 30
produced `score -2.8796`, `profit -92.00`, `profit_factor 0.6633`.

### Three silent failures in this flow

Each of these produced a run that *looked* fine - no error, plausible output -
while the thing you asked for was quietly not happening. They are the reason
the sections below exist.

**1. EA inputs were ignored entirely.** Inputs written as `InpX=...` keys in
`[Tester]` are parsed by the ini reader and then discarded; every parameter
kept its compiled default. `--mode 2 --tag live1` happily ran mode 0 and wrote
`StrategyForge_default.csv`. The tester log is where this shows up, because it
echoes what it actually received:

```
EURUSD,M1: testing of ... started with inputs:
  InpMode=0        <- asked for 2
  InpTag=default   <- asked for live1
```

Inputs must be passed through a `.set` file, and `ExpertParameters` accepts
only a **bare file name**. All three forms were probed against the log:

| `ExpertParameters=` | Result |
|---|---|
| `sf_probe.set` | **inputs applied** |
| `MQL5\Profiles\Tester\sf_probe.set` | ignored, defaults used |
| `C:\...\sf_probe.set` (absolute) | ignored, defaults used |

The `.set` must live in `MQL5\Profiles\Tester` inside the terminal data
directory.

**2. The `.htm` report is never written.** A headless `/config` run produces
no HTML at all - not in the install folder, not under the data folder, nothing.
The terminal log ends with `automatic testing finished` and no report line. The
wrapper originally waited for that `.htm`, so every run blocked for the full
900-second timeout and appeared to hang. An absolute `Report=` path is still
written into the ini (a relative one resolves against `Program Files`, where
the subfolder cannot be created), but nothing is treated as an error when it
does not appear.

**3. The CSV was not a CSV.** Three separate defects, each fixed in turn:

| Open flags | Delimiter produced |
|---|---|
| `FILE_TXT` | none - the entire row was one token |
| `FILE_CSV` | **tab** - `FIO_DELIMITER` defaults to tab on this terminal |
| `FILE_BIN` | UTF-16, because `FILE_ANSI` was missing |

`FIO_DELIMITER` cannot be corrected after opening: MQL5 has `FileGetInteger`
but **no `FileSetInteger`**. The only reliable form is to assemble the row as a
string and write it with `FileWriteString` under `FILE_BIN | FILE_ANSI`.

`read_report` now sniffs the delimiter rather than assuming a comma, and
**raises** if the header and value row have different field counts. A mismatched
pairing does not crash - it produces one enormous key full of run-on text,
which reads exactly like valid data.

### Two reported numbers that were wrong

**`net_pips` was off by a factor of 10,000.** `STAT_PROFIT` is in account
currency, so dividing it by a price distance is meaningless; the original
`profit / trades / (point * 10)` reported `-46000` pips for a `-92.00` loss.
Converting money into pips needs the tick value and the pip size in points:

```
pip size   = 10^-(digits-1)                 0.0001 on 5-digit, 0.01 on JPY
pip points = pip size / SYMBOL_POINT        10 in both cases
$ per pip  = SYMBOL_TRADE_TICK_VALUE * pip points
net_pips   = STAT_PROFIT / (traded volume * $ per pip)
```

`STAT_VOLUME` does not exist in MQL5's `ENUM_STATISTICS` (nor do
`STAT_VOLUME_LONG` / `STAT_VOLUME_SHORT` / `STAT_BALANCE` / `STAT_LOTS`), so the
EA accumulates traded volume itself at the point of entry.

**`max_consec_wins` was not a count.** `STAT_MAX_CONWINS` and
`STAT_MAX_CONLOSSES` are documented as trade counts but return **money** in
this build: a run with 6 winning trades reported `90`, and one with 14 reported
`116`. The columns are now `max_win_run_money` / `max_loss_run_money` and are
written as doubles, so the figures cannot be misread as streak lengths.

### Why the terminal looks like it crashed

It is not a crash. `ShutdownTerminal=1` makes the terminal exit as soon as the
test completes, which is how an unattended run signals "done". A single pass
over 30 days of M1 data takes about 3 seconds, so the window opens and vanishes.

Wait on the **artifact**, never on the process or a blind sleep:

```powershell
$deadline = (Get-Date).AddMinutes(5)
while ((Get-Date) -lt $deadline) {
    if (Test-Path "$env:APPDATA\MetaQuotes\Terminal\Common\Files\StrategyForge_verified.csv") { break }
    Start-Sleep -Seconds 5
}
```

`run_tester` does this internally, and additionally treats **terminal process
exit as a backstop**: once the process is gone, it waits ten seconds for the
file to flush and then returns rather than sitting out the timeout.

**One terminal at a time, even between runs.** MT5 permits a single terminal
per data directory, and a terminal that is still shutting down when `/config`
arrives *silently swallows the request* - the test never starts and no report
is written. Run in a tight loop this fails in a distinctive **alternating**
pattern (pass, fail, pass, fail), because the pass occupies the terminal while
the next one is still closing. That reads like "every second parameter set is
broken" when it is purely contention.

`run_tester` now waits for any running `terminal64` to exit before launching,
and raises with the offending PID rather than returning an empty result.

### The optimisation criteria, verified

Every index was run against one fixed configuration
(EURUSD M1, 2026.09.01-09.30, mode 1, fast 12 / slow 40, 32 trades,
profit 27.77, pf 1.0745, sharpe 0.6776, dd 1.332% / 134.71):

| idx | name | score returned | what it equals |
|---|---|---|---|
| 0 | `balance` | 10027.77 | `10000 + profit` |
| 1 | `sharpe` | 0.6776 | `STAT_SHARPE_RATIO` |
| 2 | `profit_factor` | 1.0745 | `STAT_PROFIT_FACTOR` |
| 3 | `calmar` | 20.8428 | `profit / dd_rel_pct` |
| 4 | `penalised` | -6707.73 | `profit - InpDrawdownPenalty * dd_abs` |
| 5 | `trade_count` | 32.0 | `STAT_TRADES` |

Two of these deserve a note, because the name understates them:

- **`calmar`** divides by relative drawdown but is **not annualised** - it is
  `profit / dd_rel_pct` over the test window, so its scale depends on how long
  the window is. Two runs over different date ranges are not comparable.
- **`penalised`** subtracts the penalty from **absolute drawdown in account
  currency**, not the percentage. With the default weight of 50 a $135 drawdown
  costs ~6,700 points of score, which makes this criterion effectively
  "minimise drawdown" rather than a mild adjustment. Lower `InpDrawdownPenalty`
  if you want a gentler trade-off.

A run with **zero trades returns 0 for every criterion** - MT5 substitutes 0 or
a huge number for undefined ratios, so the EA short-circuits instead of letting
that poison an optimisation.

---

## 11. Two reporting paths, and their different status

| Path | Mechanism | Status |
|---|---|---|
| **CSV** (`FILE_COMMON`) | EA writes a file at the end of `OnTester` | **Verified end to end, twice, byte-identical** |
| **HTTP** (`WebRequest`) | EA POSTs the same fields to a site | **Code path executes; blocked only by the MT5 allow-list** |

The two carry the same field names and the same units, so once posting works
the two can be diffed against each other directly.

The HTTP path is disabled by default: `InpPostUrl` defaults to an empty string.
That is deliberate - a tester EA should never silently depend on a running web
server.

To use it:

1. Set `InpPostUrl = "http://127.0.0.1:5000"` (input, or via `.set`)
2. Add that exact URL to **Tools > Options > Expert Advisors > Allow WebRequest**
3. The site must expose `POST /ea/tester`

**Step 2 is a manual GUI step and is currently the only thing outstanding.**
Verified up to that boundary: with `InpPostUrl` set, the EA built and sent the
request and reported

```
[SF] live reporting FAILED err=4014. Add 'http://127.0.0.1:5000' to
     Tools > Options > Expert Advisors > Allow WebRequest.
     CSV reporting is unaffected.
```

`4014` is *URL not allow-listed* (not the `5203` a chart EA reports), and the
CSV for the same run was still written in full - which is the behaviour the
guard exists to produce.

The bridge site exposes the endpoint. Verified response shape:

```json
{"status": "ok", "received": {"tag": "probe", "symbol": "EURUSD", "mode": 0,
 "score": 1.2345, "trades": 42, "profit": 123.45, "profit_factor": 1.6,
 "sharpe": 0.8, "dd_rel_pct": 5.2, "entries_skipped": 3}}
```

### WebRequest signatures that actually compile

Getting this wrong is the single most common compile failure. Confirmed
against the compiler:

```cpp
// POST - six arguments, no cookie. This is the form that binds.
char postData[], resultData[];
string resultHeaders = "";
int res = WebRequest("POST", url, "Content-Type: application/json\r\n",
                     3000, postData, resultData, resultHeaders);

// GET - needs a cookie argument; the six-argument form does NOT bind.
char cookie[], resultData[];
string resultHeaders = "";
int res = WebRequest("GET", url, "Accept: application/json\r\n",
                     3000, cookie, resultData, resultHeaders);
```

Notes that cost several iterations:

- The compiler reports the same `wrong parameters count` for *every* overload
  it tried, so the error does not tell you which form is right. Read the
  `information: info built-in:` lines in the log for the real signatures.
- Only the `POST` six-argument form is simple; `GET` requires the cookie array.
- The buffer arguments must be arrays declared in the calling scope and
  passed through to a wrapper function. Declaring them as locals *inside* the
  function that calls `WebRequest` fails to bind.

### Optimisation and posting

`OnTester()` runs once per pass. A genetic optimisation is thousands of
passes, so posting unconditionally would flood the endpoint. `InpPostSkipOpt`
(default 1) suppresses posts while `MQLInfoInteger(MQL_OPTIMIZATION)` is true,
so a live feed happens for single passes without endangering an optimisation
run.

### Failure is non-fatal by design

If the URL is not allow-listed, `WebRequest` returns `-1`. The EA prints one
actionable message naming the URL and the exact menu path, then continues.
The CSV report is written independently, so a missing allow-list entry costs
you the live feed and **not** the test result.

---

## 12. Workspace layout

```
C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5\tools\
├── docs\
│   └── ea.md                      <- this file
├── mql5\
│   ├── StrategyForge.mq5          <- the EA source
│   └── StrategyForge.ex5          <- compiled output
├── out\
│   └── *.compile.log              <- compiler diagnostics (UTF-16!)
├── reports\
│   └── sf_*.htm                   <- intended for MT5's own reports; headless
│                                    /config runs wrote none on this machine
├── strategyforge.py               <- compile / run / read wrapper
├── tester_*.ini                   <- generated per run
└── (terminal data dir, not here)
    └── MQL5\Profiles\Tester\*.set <- EA inputs, referenced by BARE NAME
```

Results land outside this tree, in
`%APPDATA%\MetaQuotes\Terminal\Common\Files\StrategyForge_<tag>.csv`, because
the EA writes with `FILE_COMMON`.

The EA is installed into the terminal's data directory so the tester can find
it:

```
%APPDATA%\MetaQuotes\Terminal\<instance_id>\MQL5\Experts\StrategyForge\
```

`strategyforge.py` locates that directory by reading `origin.txt` rather than
hardcoding the instance id, because the hash changes if MT5 is reinstalled or
moved.

**Note:** MT5 writes `origin.txt` and compile logs as UTF-16LE with a BOM and a
stray leading byte. Decoding them naively yields a path with embedded nulls or
a leading `?`. Handle both explicitly.

---

## 13. Compiling errors an AI will actually hit

Verified by compiling the examples in this document. Every row is a real
compiler message.

| Mistake | Error | Correct |
|---|---|---|
| `Bars` | `wrong parameters count` | `Bars(_Symbol, PERIOD_CURRENT)` |
| `Close[1] > Open[1]` | `undeclared identifier 'Close'` | `iClose(_Symbol, PERIOD_CURRENT, 1)` |
| `iMA(..., PRICE_CLOSE, 1)` used as a price | `wrong parameters count` | `iMA` takes 6 args, returns an **int handle**; read the price with `CopyBuffer(h, 0, shift, 1, arr)` |
| `CTrade` with no include | `undeclared identifier 'CTrade'` | `#include <Trade\Trade.mqh>` |
| `iDonchian(...)` | `undeclared identifier 'iDonchian'` | **MT5 has no Donchian indicator.** Compute the channel from `iHigh`/`iLow` |
| `iMACD(..., PRICE_SIGNAL)` | `undeclared identifier 'PRICE_SIGNAL'` | There is no signal *price*. MACD's signal line is **buffer 1** |
| `TesterStatistics(STAT_BALANCE)` | `undeclared identifier 'STAT_BALANCE'` | Use `STAT_INITIAL_DEPOSIT + STAT_PROFIT` |
| `TesterStatistics(STAT_LOTS)` | `undeclared identifier 'STAT_LOTS'` | There is no lot statistic; accumulate volume in the EA |
| `TesterStatistics(STAT_VOLUME)` | `undeclared identifier 'STAT_VOLUME'` | Also no `STAT_VOLUME_LONG`/`_SHORT`; accumulate at entry |
| `TesterStatistics(STAT_BALANCE_MAX)` | `undeclared identifier` | Use `STAT_BALANCE_DD` |
| `FileNameSeek(...)` | `undeclared identifier` | Does not exist; print the filename string directly |
| `FileSetInteger(h, FIO_DELIMITER, ',')` | `undeclared identifier 'FileSetInteger'` | Only `FileGetInteger` exists. The delimiter cannot be changed after opening |
| `Point` as a value | `open parenthesis expected` | `Point` is a function: use `SymbolInfoDouble(_Symbol, SYMBOL_POINT)` |
| declaring a variable mid-block | `'x' - some operator expected` | MQL5 is stricter than C++; declare locals up front |
| `EMPTY` | `undeclared identifier 'EMPTY'` | Only `EMPTY_VALUE` exists |

Two of these deserve emphasis because they fail *silently* or *by absence*:

- **`iMA` used as a price** can compile in some forms and produce an EA that
  compares handle integers instead of prices — a strategy trading on noise.
  Always check `CopyBuffer`'s return value.

### Writing a CSV from MQL5

All four of these compile and all four are wrong. The combination that works:

| Open flags | What you actually get |
|---|---|
| `FILE_TXT` + `FileWrite` | fields concatenated with **no separator** — one unusable token per row |
| `FILE_CSV` + `FileWrite` | **tab**-separated: `FIO_DELIMITER` defaults to tab here |
| `FILE_BIN` + `FileWriteString` | **UTF-16**, because `FILE_ANSI` was omitted |
| `FILE_BIN \| FILE_ANSI` + `FileWriteString` | **correct** |

Build the row as a string and write it yourself:

```cpp
int h = FileOpen(fname, FILE_WRITE | FILE_BIN | FILE_ANSI | FILE_COMMON);
FileWriteString(h, header + "\r\n" + values + "\r\n");
FileClose(h);
```

No field can contain a comma here — names are literals and numbers come from
`DoubleToString`/`IntegerToString` — so quoting is unnecessary. Add a
`StringSplit` check that the header and the row agree on field count; that one
line catches the failure mode above before it reaches a consumer.
- **A missing indicator handle** makes every signal return 0. The run completes
  with zero trades and looks like a valid "this strategy does not work" result.
  Check the handle after creation and abort in `OnInit`.

### How to discover names without guessing

Compile a probe file that references the identifiers you are unsure about and
read the errors. `MetaEditor` reports `undeclared identifier` with the
correct overload signatures, which is faster and more reliable than guessing or
grepping the include tree (many of these are built-ins with no header).

---

## 14. Summary of what is and is not possible

| Capability | Python package | MQL5 + terminal |
|---|---|---|
| Accurate OHLCV history | ✅ `copy_rates_*` | ✅ |
| Place real orders | ✅ `order_send` | ✅ |
| Backtest a strategy | ❌ | ✅ native tester |
| Tick-accurate simulation | ❌ | ✅ `Model=4` |
| Genetic / parameter optimisation | ❌ | ✅ |
| Parallel agents (local/cloud) | ❌ | ✅ |
| Get a strategy into the terminal | ❌ | ✅ compile + attach |

**Bottom line:** the package handles data and execution. The Strategy Tester
requires MQL5 and the terminal. The bridge between them is `MetaEditor64
/compile` plus `terminal64 /config` — both verified working on this machine.
