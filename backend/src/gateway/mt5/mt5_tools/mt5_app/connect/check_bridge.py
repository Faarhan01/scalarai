"""Regression check for the bridge fixes.

Each assertion corresponds to a defect that was live before this change. If
any of these can fail again, the fix did not hold.
"""
import sys

sys.path.insert(0, r'C:\Users\faarh\Workspaces\Custom-apps\scalarai\backend\mt5')

fails = []


def check(label, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")
    if not ok:
        if detail:
            print(f"         -> {detail}")
        fails.append(label)


print("=== imports (circular-import check) ===")
try:
    import mt5_pkg_bridge as B
    check("package imports cleanly", True)
except Exception as exc:
    check("package imports cleanly", False, f"{type(exc).__name__}: {exc}")
    raise SystemExit(1)

from mt5_pkg_bridge.connection import ConnectionManager
from mt5_pkg_bridge.mt5_engine import MT5Engine
from mt5_pkg_bridge.api_manager import load
from mt5_pkg_bridge.errors import MT5ConnectionError, SymbolNotFoundError

check("errors module importable", True)
check("symbols module importable", hasattr(B, "symbols"))

print("\n=== backwards compatibility of public names ===")
for name in ("MT5Error", "MT5ConnectionError", "SymbolNotFoundError",
             "NotFoundError", "InvalidRequestError", "OrderRejectedError"):
    check(f"mt5_pkg_bridge.{name}", hasattr(B, name))
    check(f"mt5_pkg_bridge.mt5_engine.{name}", hasattr(sys.modules['mt5_pkg_bridge.mt5_engine'], name))

print("\n=== BUG 1: class-level is_connected guard ===")
check("ConnectionManager.is_connected on CLASS is a property (not usable as bool)",
      type(ConnectionManager.is_connected).__name__ == "property",
      "if this is now a real bool, the fix may have changed the shape")
check("is_any_connected() exists", callable(ConnectionManager.is_any_connected))
check("nothing connected yet -> is_any_connected() is False",
      ConnectionManager.is_any_connected() is False,
      "a manager must not claim to be connected before connect()")
check("active() is None before connect", ConnectionManager.active() is None)

fns = load()
check("api_manager still discovers functions", len(fns) > 0, f"{len(fns)} found")

# The guard must now actually fire.
try:
    fns['terminal_info']()
    check("wrapper raises MT5ConnectionError when disconnected", False,
          "guard did not fire -- call returned instead of raising")
except MT5ConnectionError as exc:
    check("wrapper raises MT5ConnectionError when disconnected", True)
except Exception as exc:
    check("wrapper raises MT5ConnectionError when disconnected", False,
          f"raised {type(exc).__name__} instead: {exc}")

print("\n=== connect for real ===")
conn = ConnectionManager()
info = conn.connect()
check("connect() succeeded", info["terminal"]["connected"] is True)
check("active() now returns the manager", ConnectionManager.active() is conn)
check("is_any_connected() now True", ConnectionManager.is_any_connected() is True)
check("active_mt5() returns the module", ConnectionManager.active_mt5() is not None)

print("\n=== BUG 2: enums.resolve_symbol did not exist ===")
import mt5_pkg_bridge.enums as enums
check("enums has no resolve_symbol (as expected)",
      not hasattr(enums, "resolve_symbol"),
      "if it now exists, api_manager may be calling the wrong thing again")

# The exact call that used to explode.
try:
    r = fns['symbol_info']('step index')
    check("wrapper symbol_info('step index') works", True)
    check("  -> resolved to broker spelling",
          (r.get('result') or {}).get('name') == 'Step Index',
          f"got {(r.get('result') or {}).get('name')!r}")
    check("  -> returns plain dict, no namedtuple leak",
          isinstance(r.get('result'), dict))
except Exception as exc:
    check("wrapper symbol_info('step index') works", False,
          f"{type(exc).__name__}: {exc}")

# copy_rates through a wrapper -- the one most tools need.
try:
    r = fns['copy_rates_from_pos']('STEP INDEX', 1, 0, 5)
    rows = r.get('result')
    check("wrapper copy_rates_from_pos('STEP INDEX',...) works", True)
    check("  -> rows returned", isinstance(rows, list) and len(rows) > 0,
          f"result={type(rows).__name__} len={0 if rows is None else len(rows)}")
except Exception as exc:
    check("wrapper copy_rates_from_pos works", False, f"{type(exc).__name__}: {exc}")

print("\n=== numpy arrays no longer leak through the contract ===")
import json
try:
    r = fns['copy_rates_from_pos']('STEP INDEX', 1, 0, 5)
    rows = r.get('result')
    check("copy_rates_* returns a list, not an ndarray",
          isinstance(rows, list), f"got {type(rows).__name__}")
    check("  -> rows are plain dicts", rows and isinstance(rows[0], dict),
          f"got {type(rows[0]).__name__}" if rows else "empty")
    check("  -> values are python floats, not np.float64",
          rows and type(rows[0]['close']) is float,
          f"got {type(rows[0]['close']).__name__}" if rows else "empty")
    try:
        json.dumps(r)
        check("  -> whole envelope is json.dumps-able", True)
    except TypeError as exc:
        check("  -> whole envelope is json.dumps-able", False, str(exc))
except Exception as exc:
    check("copy_rates_* returns a list, not an ndarray", False, f"{type(exc).__name__}: {exc}")

print("\n=== non-symbol string args are NOT blocked ===")
# Pick a discovered function whose first arg is a non-symbol string.
cands = [n for n in fns if n.startswith('set_') or 'version' in n]
print(f"        (candidates: {cands[:5]})")
passed = False
for name in ('set_user_data', 'set_prefix', 'set_compass'):
    if name in fns:
        try:
            fns[name]('not-a-symbol-xyz')
            check(f"wrapper {name}('not-a-symbol-xyz') not blocked", True)
            passed = True
        except MT5ConnectionError:
            check(f"wrapper {name} not blocked", False, "connection guard fired")
            passed = True
        except Exception as exc:
            check(f"wrapper {name} not blocked", False, f"{type(exc).__name__}: {exc}")
            passed = True
        break
if not passed:
    # No suitable function discovered; verify the resolver itself instead.
    from mt5_pkg_bridge.api_manager import _maybe_resolve_symbol
    check("_maybe_resolve_symbol passes a non-symbol string through",
          _maybe_resolve_symbol('not-a-symbol-xyz') == 'not-a-symbol-xyz')
    check("_maybe_resolve_symbol resolves a real symbol",
          _maybe_resolve_symbol('step index') == 'Step Index')
    check("_maybe_resolve_symbol leaves non-strings alone",
          _maybe_resolve_symbol(12345) == 12345)

print("\n=== engine path unchanged (this is what everything actually uses) ===")
engine = MT5Engine(conn)
check("engine.is_connected", engine.is_connected is True)
try:
    si = engine.get_symbol_info('step index')
    check("engine.get_symbol_info('step index') resolves", si['name'] == 'Step Index')
    check("  -> _derived block present", '_derived' in si)
except Exception as exc:
    check("engine.get_symbol_info works", False, f"{type(exc).__name__}: {exc}")

check("engine.symbol_cache_info() works", isinstance(engine.symbol_cache_info(), dict),
      str(getattr(engine, 'symbol_cache_info', lambda: 'missing')()))

engine.invalidate_symbol_cache()
check("engine.invalidate_symbol_cache() works", True)

try:
    engine.resolve_symbol('NOT_A_REAL_SYMBOL_XYZ')
    check("resolve_symbol raises on unknown symbol", False, "no exception raised")
except SymbolNotFoundError:
    check("resolve_symbol raises on unknown symbol", True)

print("\n=== both resolvers still work after a cache clear ===")
check("wrapper path resolves again", fns['symbol_info']('step index')['result']['name'] == 'Step Index')
check("engine path resolves again", engine.get_symbol_info('step index')['name'] == 'Step Index')

print("\n=== paths.py: dead discovery branches removed ===")
from mt5_pkg_bridge import paths
check("ENV_VARS gone", not hasattr(paths, "ENV_VARS"))
check("_LOCAL_CANDIDATES gone", not hasattr(paths, "_LOCAL_CANDIDATES"))
check("find_mt5_package() -> None with no explicit path", paths.find_mt5_package() is None)
check("find_mt5_package(garbage) -> None", paths.find_mt5_package('C:\\nope') is None)
import MetaTrader5 as mt5mod
check("still imports from site-packages",
      'site-packages' in mt5mod.__file__, mt5mod.__file__)

print("\n=== disconnect releases the active slot ===")
conn.disconnect()
check("active() released", ConnectionManager.active() is None)
check("is_any_connected() now False", ConnectionManager.is_any_connected() is False)
check("engine.is_connected now False", engine.is_connected is False)

try:
    fns['terminal_info']()
    check("wrapper raises again after disconnect", False, "guard did not fire")
except MT5ConnectionError:
    check("wrapper raises again after disconnect", True)

print("\n" + "=" * 62)
if fails:
    print(f"{len(fails)} FAILED")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("ALL BRIDGE CHECKS PASS")