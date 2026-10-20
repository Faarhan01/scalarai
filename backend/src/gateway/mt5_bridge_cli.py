#!/usr/bin/env python3
"""
mt5_bridge_cli.py
Command-line bridge interface connecting the Node.js / Express backend
and MCP server to the MetaTrader 5 direct bridge (`mt5_pkg_bridge`).

Extended with `run_tester` command: launches the native MT5 Strategy Tester
for ANY compiled EA (.ex5) installed in the terminal. The tester.ini's
`Expert=` field specifies which EA to run — not limited to StrategyForge.

Usage:
    python mt5_bridge_cli.py run_tester '{"expert":"Experts\\Bots\\StrategyForge","symbol":"Step Index","period":"M15","from":"2026.07.01","to":"2026.10.01"}'
"""
from __future__ import annotations
import sys
import os
import json
import logging
import subprocess
import time
import pathlib
import re
from datetime import datetime, timedelta, timezone

# Suppress debug logs to stdout so JSON response remains clean
logging.basicConfig(level=logging.ERROR)


# Add gateway/mt5 to sys.path so mt5_pkg_bridge can be imported without changes
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_MT5_DIR = os.path.join(_SCRIPT_DIR, "mt5")
if _MT5_DIR not in sys.path:
    sys.path.insert(0, _MT5_DIR)

try:
    from mt5_pkg_bridge import (
        ConnectionManager,
        MT5Engine,
        MT5Error,
        MT5ConnectionError,
        SymbolNotFoundError,
        OrderRejectedError,
        InvalidRequestError,
        enums,
    )
    _BRIDGE_AVAILABLE = True
except Exception as _import_err:
    _BRIDGE_AVAILABLE = False
    _IMPORT_ERROR = str(_import_err)

# ─── Tester constants ────────────────────────────────────────────────────

PERIODS = {"M1": 1, "M5": 5, "M15": 15, "M30": 30,
           "H1": 16385, "H4": 16388, "D1": 16408}
MODELS = {
    "every-tick": 0, "real-ticks": 1, "minute-ohlc": 2,
    "open-only": 3, "math": 4,
}


def _find_terminal():
    """Find terminal64.exe and its data directory."""
    # Try standard install location first
    candidates = [
        pathlib.Path(r"C:\Program Files\MetaTrader 5\terminal64.exe"),
        pathlib.Path(r"C:\Program Files (x86)\MetaTrader 5\terminal64.exe"),
    ]
    # Also check all registered terminals via origin.txt
    root = pathlib.Path(os.environ["APPDATA"]) / "MetaQuotes" / "Terminal"
    if root.is_dir():
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
                candidates.append(exe)

    for exe in candidates:
        if exe.exists():
            # Find matching data dir
            for d in root.iterdir() if root.is_dir() else []:
                origin = d / "origin.txt"
                if not origin.is_file():
                    continue
                try:
                    text = origin.read_bytes().decode("utf-16").strip().lstrip("\ufeff")
                except (UnicodeDecodeError, ValueError):
                    continue
                if os.path.normcase(os.path.abspath(text)) == os.path.normcase(os.path.abspath(str(exe.parent))):
                    return exe, d
            # Fallback: return exe with None data dir
            return exe, None
    return None, None


def _terminal_running(terminal_path):
    """Check if terminal64.exe is already running."""
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "(Get-CimInstance Win32_Process -Filter \"Name='terminal64.exe'\" "
             "| Select-Object -ExpandProperty ExecutablePath)"],
            capture_output=True, text=True, timeout=10,
        )
        for line in out.stdout.splitlines():
            if os.path.normcase(line.strip()) == os.path.normcase(str(terminal_path)):
                return True
    except Exception:
        pass
    return False


def _kill_terminal(terminal_path):
    """Kill the terminal process."""
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-CimInstance Win32_Process -Filter \"Name='terminal64.exe'\" "
             "| Where-Object { $_.ExecutablePath -eq '%s' } "
             "| Invoke-CimMethod -MethodName Terminate" % str(terminal_path).replace("\\", "\\\\")],
            capture_output=True, text=True, timeout=10,
        )
    except Exception:
        pass
    # Also try taskkill as fallback
    try:
        subprocess.run(["taskkill", "/F", "/IM", "terminal64.exe"],
                       capture_output=True, timeout=10)
    except Exception:
        pass
    time.sleep(3)


def _render_ini(expert, symbol, period, model, from_date, to_date, deposit,
                currency, leverage, report, inputs, visual=True, shutdown=True):
    """Render the tester ini file content."""
    lines = [
        "[Tester]",
        f"Expert={expert}",
        f"Symbol={symbol}",
        f"Period={period}",
        f"Model={model}",
        f"Optimization=0",
        f"FromDate={from_date}",
        f"ToDate={to_date}",
        "ForwardMode=0",
        f"Deposit={deposit}",
        f"Currency={currency}",
        f"Leverage=1:{leverage}",
        "ExecutionMode=0",
        f"Visual={1 if visual else 0}",
        f"Report={report}",
        "ReplaceReport=1",
        f"ShutdownTerminal={1 if shutdown else 0}",
        "UseLocal=1",
    ]
    if inputs:
        lines.append("")
        lines.append("[TesterInputs]")
        for k, v in inputs.items():
            lines.append(f"{k}={v}")
    return "\n".join(lines) + "\n"


def _parse_report(report_path):
    """Parse the MT5 HTML report for key metrics."""
    if not report_path.exists():
        return None
    try:
        raw = report_path.read_bytes()
        # MT5 reports are UTF-16-LE
        try:
            text = raw.decode("utf-16-le")
        except UnicodeDecodeError:
            text = raw.decode("utf-8", errors="replace")

        metrics = {}
        # MT5 report uses label/value in sibling <td> cells
        # Pattern: <td>Label</td><td>Value</td>
        for m in re.finditer(r"<td[^>]*>([^<]+)</td>\s*<td[^>]*>([^<]+)</td>", text):
            label = m.group(1).strip().replace("\xa0", " ")
            value = m.group(2).strip().replace("\xa0", " ")
            metrics[label] = value

        # Also try simpler patterns
        for key in ["Total Net Profit", "Profit Factor", "Expected Payoff",
                    "Total Trades", "Short Trades (won %)", "Long Trades (won %)",
                    "Gross Profit", "Gross Loss", "Balance Drawdown Maximal",
                    "Equity Drawdown Maximal", "Sharpe Ratio"]:
            if key not in metrics:
                # Try regex search
                m = re.search(re.escape(key) + r"\s*[:=]?\s*([\d.,\- ]+)", text)
                if m:
                    metrics[key] = m.group(1).strip()

        return metrics
    except Exception as e:
        return {"error": str(e)}


def cmd_run_tester(args):
    """Launch the native MT5 Strategy Tester for any compiled EA."""
    if not isinstance(args, dict):
        args = {}

    expert = args.get("expert", "")
    symbol = args.get("symbol", "Step Index")
    period = args.get("period", "M15")
    model_name = args.get("model", "real-ticks")
    from_date = args.get("from", "")
    to_date = args.get("to", "")
    deposit = args.get("deposit", 10000)
    currency = args.get("currency", "USD")
    leverage = args.get("leverage", 100)
    inputs = args.get("inputs", {})
    visual = args.get("visual", False)
    shutdown = args.get("shutdown", True)
    timeout_sec = args.get("timeout", 300)

    if not expert:
        return {"success": False, "error": "expert is required (e.g. 'Experts\\Bots\\StrategyForge')"}

    # Resolve model code
    model_code = MODELS.get(model_name, 1)
    if isinstance(model_name, int):
        model_code = model_name

    # Resolve period code
    period_code = PERIODS.get(period.upper(), 15)
    if isinstance(period, int):
        period_code = period

    # Default dates
    if not from_date:
        from_date = (datetime.now() - timedelta(days=90)).strftime("%Y.%m.%d")
    if not to_date:
        to_date = datetime.now().strftime("%Y.%m.%d")

    # Find terminal
    terminal, data_dir = _find_terminal()
    if terminal is None:
        return {"success": False, "error": "terminal64.exe not found"}

    # Check if terminal is running
    if _terminal_running(terminal):
        _kill_terminal(terminal)
        # Verify it's actually dead
        for _ in range(10):
            if not _terminal_running(terminal):
                break
            time.sleep(1)
        if _terminal_running(terminal):
            return {"success": False, "error": "could not stop running terminal"}

    # Generate report name and tag
    tag = args.get("tag", "test")
    report_name = f"StrategyForge_{tag}"

    # Ensure InpTag is set in inputs so the EA writes the CSV with the right name
    if "InpTag" not in (inputs or {}):
        inputs = dict(inputs or {})
        inputs["InpTag"] = tag

    # Write ini file
    ini_text = _render_ini(
        expert=expert,
        symbol=symbol,
        period=period_code,
        model=model_code,
        from_date=from_date,
        to_date=to_date,
        deposit=deposit,
        currency=currency,
        leverage=leverage,
        report=report_name,
        inputs=inputs,
        visual=visual,
        shutdown=shutdown,
    )

    ini_path = pathlib.Path(os.environ["TEMP"]) / "mt5tester" / f"st_{symbol.replace(' ', '_')}_{period}_{int(time.time())}.ini"
    ini_path.parent.mkdir(parents=True, exist_ok=True)
    ini_path.write_bytes(b"\xff\xfe" + ini_text.encode("utf-16-le"))

    # Launch terminal
    try:
        proc = subprocess.Popen(
            [str(terminal), f"/config:{ini_path}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as e:
        return {"success": False, "error": f"failed to launch terminal: {e}"}

    # Wait for completion
    try:
        proc.wait(timeout=timeout_sec)
    except subprocess.TimeoutExpired:
        proc.kill()
        return {"success": False, "error": f"tester timed out after {timeout_sec}s"}

    # Find report
    report_path = None
    if data_dir:
        report_path = data_dir / f"{report_name}.htm"
    if not report_path or not report_path.exists():
        # Search common locations
        for search_dir in [pathlib.Path(os.environ["APPDATA"]) / "MetaQuotes" / "Terminal",
                           pathlib.Path(os.environ["TEMP"])]:
            if search_dir.exists():
                for f in search_dir.rglob(f"{report_name}.htm"):
                    report_path = f
                    break
            if report_path and report_path.exists():
                break

    # Parse report
    metrics = _parse_report(report_path) if report_path and report_path.exists() else None

    result = {
        "success": True,
        "expert": expert,
        "symbol": symbol,
        "period": period,
        "from_date": from_date,
        "to_date": to_date,
        "model": model_name,
        "report_path": str(report_path) if report_path else None,
        "report_found": report_path.exists() if report_path else False,
        "metrics": metrics,
    }

    # Also check for CSV output (StrategyForge writes to Common\Files)
    csv_path = None
    if data_dir:
        common_files = data_dir.parent / "Common" / "Files"
        if common_files.exists():
            for f in common_files.glob(f"StrategyForge_{tag}*.csv"):
                csv_path = f
                break
    if csv_path and csv_path.exists():
        result["csv_path"] = str(csv_path)
        # Parse CSV for key metrics
        try:
            import csv
            with open(csv_path, encoding="utf-8") as fh:
                reader = csv.DictReader(fh)
                rows = list(reader)
            if rows:
                result["csv_rows"] = len(rows)
                result["csv_data"] = rows[:5]  # first 5 rows
        except Exception:
            pass

    return result


def _get_engine():
    conn = ConnectionManager.active()
    if conn is None:
        conn = ConnectionManager()
        try:
            conn.connect()
        except Exception:
            pass
    return MT5Engine(conn)


def cmd_status(_args):
    conn = ConnectionManager.active()
    is_connected = conn.is_connected if conn else False
    account_info = None
    terminal_info = None

    if is_connected:
        try:
            engine = MT5Engine(conn)
            account_info = engine.get_account_info()
            terminal_info = engine.get_terminal_info()
        except Exception:
            pass

    return {
        "success": True,
        "bridge": "mt5_pkg_bridge",
        "version": "1.2.0",
        "bridge_available": _BRIDGE_AVAILABLE,
        "is_connected": is_connected,
        "connection_info": conn.connection_info() if (conn and hasattr(conn, "connection_info")) else {},
        "account": account_info,
        "terminal": terminal_info,
        "server_time": os.getenv("SERVER_TIME", ""),
        "python_version": sys.version.split()[0],
    }


def cmd_connect(args):
    if not _BRIDGE_AVAILABLE:
        return {"success": False, "error": f"Bridge package not available: {_IMPORT_ERROR}"}
    try:
        conn = ConnectionManager(args if isinstance(args, dict) else {})
        info = conn.connect()
        return {"success": True, "connected": True, "info": info}
    except Exception as exc:
        return {"success": False, "connected": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_disconnect(_args):
    conn = ConnectionManager.active()
    if conn:
        conn.disconnect()
    return {"success": True, "connected": False}


def cmd_account(_args):
    try:
        engine = _get_engine()
        acc = engine.get_account_info()
        return {"success": True, "account": acc}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_terminal(_args):
    try:
        engine = _get_engine()
        term = engine.get_terminal_info()
        return {"success": True, "terminal": term}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_symbols(_args):
    try:
        engine = _get_engine()
        symbols = engine.get_symbols()
        return {"success": True, "count": len(symbols), "symbols": symbols}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_symbol_info(args):
    symbol = args.get("symbol") if isinstance(args, dict) else args
    if not symbol:
        return {"success": False, "error": "Symbol required"}
    try:
        engine = _get_engine()
        info = engine.get_symbol_info(symbol)
        return {"success": True, "symbol_info": info}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_tick(args):
    symbol = args.get("symbol") if isinstance(args, dict) else args
    if not symbol:
        return {"success": False, "error": "Symbol required"}
    try:
        engine = _get_engine()
        tick = engine.get_tick(symbol)
        return {"success": True, "tick": tick}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_rates(args):
    symbol = args.get("symbol") if isinstance(args, dict) else args
    timeframe = args.get("timeframe", 1) if isinstance(args, dict) else 1
    count = args.get("count", 100) if isinstance(args, dict) else 100
    if not symbol:
        return {"success": False, "error": "Symbol required"}
    try:
        engine = _get_engine()
        rates = engine.copy_rates_from_pos(symbol, timeframe, 0, count)
        return {"success": True, "count": len(rates) if rates else 0, "rates": rates}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_positions(_args):
    try:
        engine = _get_engine()
        positions = engine.get_positions()
        return {"success": True, "positions": positions}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_history_deals(args):
    """
    Closed deals over a date range.

    The old body called history_deals_total(days), but that method takes
    (date_from, date_to) and returns a COUNT. Passing a number raised
    TypeError, so this command has never returned a deal -- it always
    reported success=False and the gateway swallowed the error.
    """
    days = args.get("days", 30) if isinstance(args, dict) else 30
    symbol = args.get("symbol") if isinstance(args, dict) else None
    try:
        engine = _get_engine()
        date_to = datetime.now(timezone.utc)
        date_from = date_to - timedelta(days=days)
        deals = engine.get_history_deals(date_from, date_to, symbol)
        return {"success": True, "count": len(deals) if deals else 0, "deals": deals}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_history_orders(args):
    """Historical orders over a date range. See cmd_history_deals for why."""
    days = args.get("days", 30) if isinstance(args, dict) else 30
    symbol = args.get("symbol") if isinstance(args, dict) else None
    try:
        engine = _get_engine()
        date_to = datetime.now(timezone.utc)
        date_from = date_to - timedelta(days=days)
        orders = engine.get_history_orders(date_from, date_to, symbol)
        return {"success": True, "count": len(orders) if orders else 0, "orders": orders}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_buy(args):
    if not isinstance(args, dict):
        return {"success": False, "error": "args required"}
    symbol = args.get("symbol")
    volume = args.get("volume")
    if not symbol or not volume:
        return {"success": False, "error": "symbol and volume required"}
    try:
        engine = _get_engine()
        result = engine.buy(symbol, volume, args.get("sl"), args.get("tp"), args.get("comment", ""))
        return {"success": True, "result": result}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_sell(args):
    if not isinstance(args, dict):
        return {"success": False, "error": "args required"}
    symbol = args.get("symbol")
    volume = args.get("volume")
    if not symbol or not volume:
        return {"success": False, "error": "symbol and volume required"}
    try:
        engine = _get_engine()
        result = engine.sell(symbol, volume, args.get("sl"), args.get("tp"), args.get("comment", ""))
        return {"success": True, "result": result}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_close(args):
    ticket = args.get("ticket") if isinstance(args, dict) else args
    if not ticket:
        return {"success": False, "error": "ticket required"}
    try:
        engine = _get_engine()
        result = engine.close_position(ticket)
        return {"success": True, "result": result}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_close_all(args):
    symbol = args.get("symbol") if isinstance(args, dict) else None
    try:
        engine = _get_engine()
        result = engine.close_all(symbol)
        return {"success": True, "result": result}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_modify(args):
    if not isinstance(args, dict):
        return {"success": False, "error": "args required"}
    ticket = args.get("ticket")
    if not ticket:
        return {"success": False, "error": "ticket required"}
    try:
        engine = _get_engine()
        result = engine.modify(ticket, args.get("sl"), args.get("tp"))
        return {"success": True, "result": result}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_orders(args):
    symbol = args.get("symbol") if isinstance(args, dict) else None
    try:
        engine = _get_engine()
        orders = engine.get_orders(symbol)
        return {"success": True, "orders": orders}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_market_book(args):
    symbol = args.get("symbol") if isinstance(args, dict) else args
    if not symbol:
        return {"success": False, "error": "symbol required"}
    try:
        engine = _get_engine()
        book = engine.get_market_book(symbol)
        return {"success": True, "market_book": book}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_totals(_args):
    try:
        engine = _get_engine()
        totals = engine.get_totals()
        return {"success": True, "totals": totals}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_call(args):
    if not isinstance(args, dict):
        return {"success": False, "error": "args required"}
    func = args.get("function")
    if not func:
        return {"success": False, "error": "function required"}
    try:
        engine = _get_engine()
        result = engine.call(func, args.get("args", []), args.get("kwargs", {}))
        return {"success": True, "result": result}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_list_functions(_args):
    try:
        engine = _get_engine()
        funcs = engine.list_functions()
        return {"success": True, "functions": funcs}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_calc_margin(args):
    if not isinstance(args, dict):
        return {"success": False, "error": "args required"}
    action = args.get("action")
    symbol = args.get("symbol")
    volume = args.get("volume")
    if not action or not symbol or not volume:
        return {"success": False, "error": "action, symbol, volume required"}
    try:
        engine = _get_engine()
        result = engine.calc_margin(action, symbol, volume, args.get("price", 0))
        return {"success": True, "result": result}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}


def cmd_calc_profit(args):
    if not isinstance(args, dict):
        return {"success": False, "error": "args required"}
    action = args.get("action")
    symbol = args.get("symbol")
    volume = args.get("volume")
    open_price = args.get("open_price")
    close_price = args.get("close_price")
    if not action or not symbol or not volume or open_price is None or close_price is None:
        return {"success": False, "error": "action, symbol, volume, open_price, close_price required"}
    try:
        engine = _get_engine()
        result = engine.calc_profit(action, symbol, volume, open_price, close_price)
        return {"success": True, "result": result}
    except Exception as exc:
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}





# ─── persistent serve mode ────────────────────────────────────────────────
#
# The one-shot mode below spawns a process per command, and each process
# attaches to the MetaTrader 5 terminal. The gateway polls six bridge calls
# every five seconds, and each attach takes about a second, so the terminal
# was held almost continuously. Any other command arriving in that window
# died with STATUS_DLL_INIT_FAILED -- exit code 3221225794, no stderr.
#
# Serve mode keeps ONE process attached and answers commands over stdin:
#
#   in : {"id": 1, "command": "rates", "args": {...}}
#   out: {"id": 1, "success": true, ...}
#
# The connection is made once and reused, so commands are milliseconds
# instead of a second each, and nothing else can contend for the terminal.

def cmd_serve(_args):
    import json as _json
    import sys as _sys

    conn = ConnectionManager()
    engine = MT5Engine(conn)
    try:
        conn.connect()
    except Exception:
        # Not fatal: commands that need the terminal will report the error.
        pass

    out = _sys.stdout
    import time as _time
    for line in _sys.stdin:
        line = line.strip()
        if not line:
            continue
        received = _time.time()
        try:
            req = _json.loads(line)
        except Exception:
            continue

        rid = req.get("id")
        command = req.get("command")
        args = req.get("args") or {}

        handler = COMMANDS.get(command)
        if not handler:
            response = {"success": False, "error": f"Unknown command '{command}'"}
        else:
            try:
                response = handler(args)
            except Exception as ex:
                response = {"success": False, "error": f"{type(exc_name := type(ex)).__name__}: {ex}"}

        response["id"] = rid
        # How long the command itself took, and how long it sat in the queue
        # before the worker picked it up. A large queue wait means the worker
        # is oversubscribed.
        response["_ms"] = round((_time.time() - received) * 1000, 1)
        out.write(_json.dumps(response) + "\n")
        out.flush()

    try:
        conn.disconnect()
    except Exception:
        pass
    return {"success": True}


# ─── Command dispatch ────────────────────────────────────────────────────

COMMANDS = {
    "status": cmd_status,
    "connect": cmd_connect,
    "disconnect": cmd_disconnect,
    "account": cmd_account,
    "terminal": cmd_terminal,
    "symbols": cmd_symbols,
    "symbol_info": cmd_symbol_info,
    "tick": cmd_tick,
    "rates": cmd_rates,
    "positions": cmd_positions,
    "history_deals": cmd_history_deals,
    "history_orders": cmd_history_orders,
    "buy": cmd_buy,
    "sell": cmd_sell,
    "close": cmd_close,
    "close_all": cmd_close_all,
    "modify": cmd_modify,
    "orders": cmd_orders,
    "market_book": cmd_market_book,
    "totals": cmd_totals,
    "call": cmd_call,
    "list_functions": cmd_list_functions,
    "calc_margin": cmd_calc_margin,
    "calc_profit": cmd_calc_profit,
    "run_tester": cmd_run_tester,
    "serve": cmd_serve,
}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No command specified"}))
        sys.exit(1)

    cmd_name = sys.argv[1]
    handler = COMMANDS.get(cmd_name)
    if not handler:
        print(json.dumps({"success": False, "error": f"Unknown command '{cmd_name}'. Available: {list(COMMANDS.keys())}"}))
        sys.exit(1)

    args = {}
    if len(sys.argv) > 2:
        try:
            args = json.loads(sys.argv[2])
        except Exception:
            args = {"raw": sys.argv[2]}

    try:
        output = handler(args)
    except Exception as ex:
        output = {"success": False, "error": f"Unhandled {type(ex).__name__}: {ex}"}

    print(json.dumps(output))


if __name__ == "__main__":
    main()