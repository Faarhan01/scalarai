# Working with MetaTrader 5 as an AI

How to drive MT5 from a terminal or an AI agent: compile an Expert Advisor,
install it, run the native Strategy Tester unattended, and get results back.

Everything here was verified on this machine against **MT5 build 6235**
(`5.0.0.6235`, Deriv-Demo). Claims are labelled:

- **[verified]** — executed here, output quoted.
- **[docs]** — from MetaQuotes' reference, with the URL.
- **[unverified]** — believed but not confirmed. Treat as a lead, not a fact.

The most important lesson in this document is the one that cost the most time:
**MT5's failure mode is silence.** Nearly every mistake below produced a run
that looked successful while quietly doing the wrong thing. Techniques for
detecting that are the real content.

---

## 1. The mental model

MT5 is a Windows application with four separate moving parts. Confusing them
causes most wasted effort.

| Part | Binary | Role |
|---|---|---|
| Terminal | `terminal64.exe` | UI, data storage, connection to broker |
| Editor | `MetaEditor64.exe` | **the MQL5 compiler**, also runs headless |
| Tester agents | `MetaTester64.exe` | run test/optimisation passes, in separate processes |
| Strategy Tester | (inside terminal) | drives agents, collects results |

Two consequences that matter constantly:

1. **The Python `MetaTrader5` package cannot reach the tester.** It exposes
   35 functions / 11 classes / 223 constants, and searching every name in both
   `__init__.py` and the compiled `_core.pyd` for `test|backtest|strategy|expert|
   compile|file|write|inject|run|eval|exec|optimi|report` gives **zero
   matches**. [verified] Data in, orders out. Testing requires MQL5.
2. **Results are computed by the agents, not the EA.** The EA returns a single
   `double` from `OnTester()`. Everything else MT5 computes internally. The EA
   has no way to *receive* a report — see §7.

### Where things live

```
C:\Program Files\MetaTrader 5\          terminal64.exe, MetaEditor64.exe
%APPDATA%\MetaQuotes\Terminal\<id>\     terminal data dir  (MQL5, Tester, config)
%APPDATA%\MetaQuotes\Tester\<id>\       tester AGENT data dir (separate!)
%APPDATA%\MetaQuotes\Terminal\Common\Files\   FILE_COMMON target
```

`<id>` is a per-install hash that changes on reinstall. **Never hard-code it.**
Read `origin.txt` from each candidate directory and compare against the install
path — [verified] this is what `strategyforge.py:data_dir()` does.

```python
def data_dir():
    base = Path(os.environ["APPDATA"]) / "MetaQuotes" / "Terminal"
    for d in base.iterdir():
        origin = d / "origin.txt"
        if origin.exists() and Path(_read_text(origin)).resolve() == MT5_ROOT.resolve():
            return d
```

Note that agents get their **own** data directory under `MetaQuotes\Tester\`,
which is why an EA's `TERMINAL_DATA_PATH` differs between a live chart and a
tester run. [verified]

---

## 2. Compiling an EA — the compiler is your ground truth

`MetaEditor64.exe` is a real, scriptable compiler. This is the single most
useful thing to know, because it turns "does this idea even work" into a
one-second check.

```powershell
& "C:\Program Files\MetaTrader 5\MetaEditor64.exe" `
    /compile:"C:\path\StrategyForge.mq5" `
    /log:"C:\path\compile.log"
Start-Sleep -Seconds 5
```

Then parse `Result: N errors, M warnings`. [verified]

**The log is UTF-16LE with a BOM and a stray leading byte.** Decoding it
naively throws `ValueError: embedded null character`, or yields a `?` glued to
the first path. Strip the BOM and the leading `?`. [verified]

```python
raw = path.read_bytes()
if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
    return raw[2:].decode("utf-16-le", errors="ignore").lstrip("?\x00").strip()
```

### The errors tell you the real signatures

When a call fails to bind, MQL5 prints **the same `wrong parameters count` for
every overload it tried**, which is useless on its own. But the log also
contains the actual built-ins:

```
: information: info could be one of 2 function(s)
: information: info    built-in: int WebRequest(const string,const string,const string,int,const uchar&[],uchar&[],string&)
```

Read those lines. It is how the working `WebRequest` signature was found, and
it is faster and more reliable than guessing variant after variant. [verified]

I wasted five compile cycles guessing `WebRequest` before reading that block.
Two lines in the log would have answered it immediately.

### Fastest way to check an identifier exists

Probe-compile a scratch file. Costs ~1.5 s and is definitive:

```cpp
#property strict
int OnInit() { FileSetInteger(0, 0, 0); return(0); }
void OnTick() {}
double OnTester() { return(0); }
```

```
error 256: undeclared identifier 'FileSetInteger'
: information: info could be one of 2 function(s)
: information: info    built-in: long FileGetInteger(int,ENUM_FILE_PROPERTY_INTEGER)
```

So: `FileGetInteger` exists, `FileSetInteger` does not. [verified]

Things confirmed **not** to exist in this build: `STAT_VOLUME`,
`STAT_VOLUME_LONG`, `STAT_VOLUME_SHORT`, `STAT_BALANCE`, `STAT_LOTS`,
`STAT_BALANCE_MAX`, `FileNameSeek`, `iDonchian`, `PRICE_SIGNAL`,
`IsOptimization()`, `FileSetInteger`. [verified by probe-compile]

`Point` is a function, not a value — `SymbolInfoDouble(_Symbol, SYMBOL_POINT)`.
[verified]

---

## 3. Installing the EA

The terminal only loads experts from `MQL5\Experts` inside its **data**
directory. A successful compile is not enough.

```
%APPDATA%\MetaQuotes\Terminal\<id>\MQL5\Experts\StrategyForge\StrategyForge.ex5
```

The `[Tester] Expert=` value is relative to `MQL5\Experts\`, i.e.
`StrategyForge\StrategyForge.ex5`. [verified]

MT5 will also cache compiled EAs in `experts.dat`; after replacing an `.ex5`,
a fresh terminal process is required. There is **no API to swap a running
EA**, so a chart-attached EA keeps the old build until the chart is reattached
— that step is manual.

---

## 4. Running the native Strategy Tester unattended

MT5 accepts a config file and does everything else itself. This is the mechanism
the Python package cannot provide.

```powershell
terminal64.exe /config:C:\path\tester.ini
```

```ini
[Experts]
AllowLiveTrading=0          ; a stray test must never place an order
AllowDllImport=0
Enabled=1

[Tester]
Expert=StrategyForge\StrategyForge.ex5
ExpertParameters=myinputs.set
Symbol=EURUSD
Period=M1
Login=123456
Deposit=10000
Leverage=1:100
Model=0                     ; tick model, see strategytest.md
ExecutionMode=0
Optimization=0              ; 0 = one pass, 1 = slow complete, 2 = fast genetic
OptimizationCriterion=6
FromDate=2026.09.01
ToDate=2026.09.30
ForwardMode=0
Report=C:\absolute\path\report.htm
ReplaceReport=1
ShutdownTerminal=1          ; exit when finished -- required for unattended use
UseLocal=1
UseRemote=0
UseCloud=0
Visual=0
```

### Four things that will silently waste your time

**1. `ExpertParameters` must be a BARE FILE NAME.** All three forms were probed
against the tester log: [verified]

| Value | Result |
|---|---|
| `myinputs.set` | **inputs applied** |
| `MQL5\Profiles\Tester\myinputs.set` | ignored, compiled defaults used |
| `C:\...\myinputs.set` (absolute) | ignored, compiled defaults used |

The `.set` must live in `<data dir>\MQL5\Profiles\Tester\`.

The two failing forms are *accepted by the parser and then dropped*. A run with
`--mode 2 --tag live1` cheerfully tested mode 0 and wrote `default.csv`, with
no error anywhere. The only way to notice is the tester log, which echoes what
it actually received:

```
EURUSD,M1: testing of ... started with inputs:
  InpMode=0        <- you asked for 2
  InpTag=default   <- you asked for live1
```

**Always check that line.** [verified]

**2. Only one terminal per data directory — including between runs.** A terminal
still shutting down swallows the next `/config` and nothing happens. Run in a
loop this fails in an **alternating** pattern (pass, fail, pass, fail), which
reads like "every second parameter set is broken". `run_tester` now waits for
`terminal64` to exit and raises with the PID. [verified]

**3. `Report=` produces nothing headlessly.** Not `.htm`, not `.xml` — probed
with both a hand-written minimal config and the generated one. The log ends with
`automatic testing finished` and no report line, and nothing appears anywhere
under the data or install trees. Do not block on it. [verified]

**4. The terminal "crashing" is success.** `ShutdownTerminal=1` exits on
completion; a 3-second pass makes the window appear and vanish. Wait on the
artifact, never on the process or a blind sleep.

---

## 5. Getting results out

MT5 never sends a report to the EA. The relationship is one-way: the EA reads
ticks, returns a `double` from `OnTester()`. `TesterStatistics()` is a *pull*
API for aggregates.

So there are exactly two ways out:

### A. The EA writes its own file (works for single passes)

`FILE_COMMON` from `OnTester()`, read from
`%APPDATA%\MetaQuotes\Terminal\Common\Files\`. [verified end-to-end]

Writing a CSV from MQL5 has three separate traps, all of which compile cleanly:

| Open flags | What you actually get |
|---|---|
| `FILE_TXT` + `FileWrite` | **no separator** — the whole row is one token |
| `FILE_CSV` + `FileWrite` | **tab** — `FIO_DELIMITER` defaults to tab here |
| `FILE_BIN` + `FileWriteString` | **UTF-16**, because `FILE_ANSI` was missing |
| `FILE_BIN \| FILE_ANSI` + `FileWriteString` | **correct** |

`FIO_DELIMITER` cannot be corrected after opening (`FileSetInteger` does not
exist). The only reliable form is to assemble the row as a string and write it
yourself — no field can contain a comma when names are literals and numbers come
from `DoubleToString`. [verified]

Add a field-count assertion so a regression fails loudly instead of producing
one giant key that looks like data:

```cpp
string probe[];
if(StringSplit(header, ',', probe) != StringSplit(values, ',', probe))
   Print("[SF] WARNING: header/row field count mismatch");
```

### B. Read MT5's own cache (works for single passes AND optimisations)

This is the one I missed for a long time, and it is the complete answer for
optimisation results.

```
<data dir>\Tester\cache\
    <EA>.<symbol>.<tf>.<from>.<to>.0.<hash>.tst      single test
    <EA>.<symbol>.<tf>.<from>.<to>.<opt>.<hash>.opt  optimisation
```

`tst` is a `SingleTestCache`, `opt` a `TesterOptCache`. Both are a UTF-16 header
followed by little-endian doubles: MT5's full statistics. [verified]

`.tst` records the inputs verbatim as `InpX=value` strings, so parameters are
independently confirmable. [verified]

Cross-checked against the EA's own CSV on identical runs — exact agreement:

| Metric | EA CSV | MT5 cache |
|---|---|---|
| profit | 27.770000 | 27.770000 |
| dd_abs | 134.710000 | 134.710000 |
| max_win_run_money | 116.600000 | 116.600000 |
| dd_rel_pct | 1.332 | 1.33235 |
| score | 0.67756814 | 0.6775681432 |

`.opt` holds **one 296-byte record per pass** (stride verified uniform, and the
record count matches the terminal log's `total passes`). [verified]

That closes the gap: `OnTester()` is *not* invoked when `Optimization!=0`, and
EA file writes are dropped in that mode — but the data is still there.

Parsers live in `..\verify\`: `mt5_cache.py`, `read_opt_passes.py`,
`compare_cache_vs_csv.py`. The record layout is unpublished, so it is
**calibrated** rather than hard-coded — across N passes the inputs vary while
statistics do not.

**Known gap:** in the 296-byte record, `profit`, `gross_profit`, `gross_loss`,
`max_win`, `dd_abs`, `dd_rel`, `balance` are mapped; `trades`, `score` and
`sharpe` are not yet. `score` matters most, since it is what the optimiser
ranks on. [unverified]

---

## 6. Reading the logs — the only evidence channel

Three log trees, all UTF-16LE:

```
<data dir>\Tester\logs\<date>.log            the orchestrator: setup, pass count, timing
%APPDATA%\MetaQuotes\Tester\<id>\Agent-127.0.0.1-300*\logs\<date>.log   per-pass detail
<data dir>\logs\<date>.log                   the terminal itself
```

Example of what only the log tells you: [verified]

```
Tester  complete optimization started
Tester  optimization finished, total passes 9
Stats   optimization done in 0 minutes 09 seconds
Stats   shortest pass 0:00:02.647, longest pass 0:00:05.957, average pass 0:00:04.222
```

And the genetic downgrade, which happens silently: [verified]

```
Tester  genetic mode turned off due to 75 passes,
        to use it increase amount of optimized parameters
```

### `Print()` is suppressed during optimisation

> To increase performance, `Comment()`, `Print()` and `PrintFormat()` functions
> are not executed when optimizing the trading robot's parameters. The exception
> is the use of these functions inside the `OnInit()` handler.
> — [docs] https://www.mql5.com/en/docs/runtime/testing

This corrupted a whole diagnosis. `[SF] RESULT ...` lines were absent from
optimisation logs, which looked like "`OnTester()` never runs". In fact
`OnTester()` *does* run — the lines were merely suppressed. **Absence of a log
line is not evidence of absence of an event.** [verified]

Same reason file writes produced nothing in optimisation mode. When you need
per-pass facts, write them to the cache or read agent logs — not to stdout.

---

## 7. What the tester cannot do (platform limits)

| Function | Behaviour in tester | Source |
|---|---|---|
| `WebRequest()` | **never executes** | [docs] |
| `SendMail/SendFTP/SendNotification` | never executes | [docs] |
| `Print/Comment/PrintFormat` | suppressed except in `OnInit` | [docs] |
| `Alert/MessageBox/PlaySound` | never executes | [docs] |

### `WebRequest` — do not go down this road

The reference states plainly: *"WebRequest() cannot be executed in the Strategy
Tester."* [docs] https://www.mql5.com/en/docs/network/webrequest

A live call returns `-1` with **error 4014**, which the same page defines as
*"Function is not allowed for call"* — **not** "URL not allow-listed". [verified]

So **adding `http://127.0.0.1:5000` to Tools → Options → Expert Advisors →
Allow WebRequest changes nothing.** It changes the code path from one kind of
`-1` to another, if anything. Confirmed error text from a diagnostic EA: [verified]

```
WebRequest res=-1 err=4014
```

This EA was already in the tester agent sandbox the whole time; the allow-list
is not consulted. Any bridge integration must run from a **live chart EA**,
not from the tester. Use the CSV for tester results.

Note the contrast with chart EAs, which report `5203` for a genuinely
non-allow-listed URL — different error, different cause. Don't conflate them.

---

## 8. Where to look for more information

**Official reference** (the pages that actually settled questions here):

| Topic | URL |
|---|---|
| Testing, tick modes, limits | `/en/docs/runtime/testing` |
| `WebRequest` | `/en/docs/network/webrequest` |
| Optimisation results / frames | `/en/docs/optimization_frames` |
| Statistics enum | `/en/docs/constants/environment_state/statistics` |
| Event handlers | `/en/docs/event_handlers` |
| Compiler errors | MetaQuotes terminal help, "Error descriptions" |

**On this machine, better than the web:**

- `MQL5\Include\` — the full standard library. Particularly:
  - `Trade\Trade.mqh` (CTrade), `Trade\HistoryOrderInfo.mqh`,
    `PositionInfo.mqh`, `OrderInfo.mqh` — all usable *inside* the tester, which
    lets an EA analyse its own trades
  - `Math\Alglib\optimization.mqh` — 2.3 MB Alglib, evolutionary optimisation
    in pure MQL5
  - `Files\FilePipe.mqh` — IPC
- `MQL5\Profiles\Tester\*.set` — **MT5 writes its own `.set` when you use the
  GUI.** Read it to learn the format (see `strategytest.md`).
- `%APPDATA%\MetaQuotes\Tester\<id>\` — agent logs, per-pass detail.
- `<data dir>\Tester\cache\` — the results themselves.

Read the GUI-written `.set`: it is the authoritative format spec, written by the
thing that consumes it.

**Search technique that works:** grep the local standard library before guessing
whether a function exists, and probe-compile before relying on the web. A 1.5 s
compile beats a 60 s doc hunt, and it is authoritative for *your* build —
documentation describes MT5 generally, your build is what you must satisfy.

---

## 9. Rules for an agent driving MT5

1. **Never trust exit codes.** Verify the artifact: exists, non-empty, fresh,
   and internally consistent.
2. **Check `started with inputs:` in the tester log** after any run whose
   parameters matter. It is the only proof the inputs landed.
3. **Cross-check numbers against each other.** `wins + losses == trades`,
   `score == sharpe` when the criterion is Sharpe, `dd_abs / deposit == dd_rel`.
   A mismatch reveals a units or wiring bug immediately. This caught `net_pips`
   reported as −46000 "pips" for a −92.00 loss (money divided by a price
   distance), and `max_consec_wins` reporting 90 when only 6 trades won — the
   constant is documented as a count but returns money in this build. [verified]
4. **Do not trust a statistic's name.** Verify it against a case where the
   answer is known.
5. **Prefer `MQL_OPTIMIZATION`-style guards over guessing**, and when no API
   exists, detect the situation from evidence rather than from a flag.
6. **One terminal at a time.** Wait for exit; raise with the PID otherwise.
7. **Isolate before concluding.** A 40-line diagnostic EA that writes to a file
   settles in 20 s what an hour of log-scraping cannot. `verify/` holds several.
8. **Delete probes after use** and generate configs into a subdirectory, or the
   tool root becomes unreadable (it briefly held 50 `.ini` files).

---

## 10. Quick reference

```powershell
# compile
python strategyforge.py compile

# one pass
python strategyforge.py run --mode 1 --fast 12 --slow 40 --threshold 1.0 `
    --from 2026.09.01 --to 2026.09.30 --criterion 1 --tag mytest

# read the EA's own report
python strategyforge.py read --tag mytest

# MT5's own records
cd verify; python mt5_cache.py
cd verify; python read_opt_passes.py
```

| Path | Purpose |
|---|---|
| `%APPDATA%\MetaQuotes\Terminal\<id>\Tester\logs\` | orchestrator log |
| `%APPDATA%\MetaQuotes\Tester\<id>\Agent-*\logs\` | per-pass log |
| `<data dir>\Tester\cache\*.tst` | single-test results |
| `<data dir>\Tester\cache\*.opt` | per-pass optimisation results |
| `Common\Files\StrategyForge_<tag>.csv` | EA-written report |
| `<data dir>\MQL5\Profiles\Tester\*.set` | EA inputs |
| `run_ini\` | generated configs |