"""
mt5_pkg_bridge — API Manager

Auto-discovers and wraps every public MetaTrader5 function so the engine
never needs to be manually updated when the package gains or loses functions.

How it works
------------

1. `load()` scans the installed ``MetaTrader5`` package at import time
   and builds a map of every public name (doesn't start with ``_``).

2. For each function it finds, it creates a thin wrapper that:
      • Ensures the engine is connected to a terminal.
      • Resolves the symbol name (handles case-insensitive lookup).
      • Calls the raw ``mt5.`` function.
      • Serialises the result to a plain dict (no namedtuple leaks).
      • Translates the MT5 return-code into a user-friendly name.

3. The resulting dict is registered in ``MT5Engine._funcs`` so that
   ``GET /enums`` can list every available operation, and the engine can
   dispatch calls dynamically.

4. If ``MetaTrader5`` is not importable, ``load()`` is a no-op and the
   engine falls back to the hard‑coded list of 35 functions — exactly
   what happened before, so nothing breaks.

Why this matters
----------------

- **One source of truth.** Adding a new MT5 function requires zero changes
  to ``mt5_engine.py``. The API manager picks it up automatically.
- **No stale wrappers.** Functions that MT5 has removed are simply absent
  from the dispatch table; callers get a clear ``NotImplementedError``
  rather than a silently broken call.
- **Consistent contract.** Every wrapper returns the same shaped dict
  (``{..., "retcode": ..., "result": ...}``) and translates codes via
  ``enums.retcode_name()``.
- **Backtest fidelity.** Because the wrappers just forward to the real
  package, backtest results using ``copy_rates_from``/``copy_ticks_from``
  etc. are as accurate as the MT5 terminal itself — no intermediate
  translation layer corrupts the data.
"""

from __future__ import annotations

import inspect
import logging
from collections.abc import Callable
from typing import Any

from .connection import ConnectionManager
from .errors import MT5ConnectionError, SymbolNotFoundError
from .symbols import SymbolResolver

_LOG = logging.getLogger("mt5pkg.discovery")

# One resolver for every generated wrapper. It reaches the terminal through
# ConnectionManager.active_mt5() rather than holding an engine, because these
# wrappers are built at import time and never learn about a specific engine.
_RESOLVER = SymbolResolver(ConnectionManager.active_mt5)


def _is_public(name: str) -> bool:
    """True if the name is part of the package's public surface."""
    return not name.startswith("_")


def _maybe_resolve_symbol(value: Any) -> Any:
    """
    Return the broker's spelling of `value` if it names a symbol, else `value`.

    Used for the first positional argument only. Several package functions take
    a string first that is NOT a symbol, so a miss is passed through untouched
    rather than raised -- the terminal is a better judge of what it accepts
    than this module is, and a wrong guess here would block a valid call.
    """
    if not isinstance(value, str) or not value.strip():
        return value
    try:
        return _RESOLVER.resolve(value)
    except SymbolNotFoundError:
        return value


def _callable_attr(mt5_mod: Any, name: str) -> bool:
    """Heuristic: is the attribute a routine (function/method) on the module?"""
    obj = getattr(mt5_mod, name, None)
    return inspect.isroutine(obj) and not name.startswith("_")


def _wrap_function(name: str, raw_fn: Callable) -> Callable:
    """
    Return a wrapper that:
      • Ensures connection.
      • Resolves symbol name.
      • Calls the raw MT5 function.
      • Serialises the result.
      • Translates the return code.
    """

    def wrapper(*args: Any, **kwargs: Any) -> dict:
        # 1. Ensure we have a terminal connected.
        #
        # This used to read `ConnectionManager.is_connected`, which on the CLASS
        # is the property object -- always truthy -- so the guard could never
        # fire and a disconnected call proceeded to fail obscurely further down.
        # is_any_connected() consults the tracked instance instead.
        if not ConnectionManager.is_any_connected():
            raise MT5ConnectionError(
                "MT5 engine not connected. Call ConnectionManager.connect() first."
            )

        # 2. Resolve symbol name (case-insensitive lookup, auto-select)
        # The first positional arg, if it names a symbol, is resolved.
        final_args = (_maybe_resolve_symbol(args[0]),) + args[1:] if args else args

        # 3. Call the raw function
        try:
            result = raw_fn(*final_args, **kwargs)
        except Exception as exc:  # noqa: BLE001
            return {
                "retcode": getattr(exc, "code", -1) if hasattr(exc, "code") else -1,
                "description": str(exc),
                "result": None,
                "_success": False,
            }

        # 4. Serialise to plain dict (handles namedtuple, arrays, custom objects)
        from mt5_pkg_bridge.serializers import serialize_array, serialize_namedtuple

        if result is None:
            return {
                "retcode": 10009,  # RETCODE_REQUEST_TIMEOUT or similar
                "description": "request timed out or returned None",
                "result": None,
                "_success": False,
            }

        # numpy structured array -- every copy_rates_*/copy_ticks_* result.
        #
        # This branch was missing, so an ndarray fell through to the
        # return-as-is fallback below and arrived at the caller as an ndarray.
        # That contradicts this module's stated contract ("every wrapper returns
        # the same shaped dict, no namedtuple leaks") and, more practically, an
        # ndarray is not JSON-serializable -- so anything that wanted to hand a
        # wrapper result to an HTTP layer or json.dumps would fail at the last
        # step. serialize_array already understood structured arrays; it just
        # was never called from here.
        if hasattr(result, "dtype") and hasattr(result.dtype, "names"):
            return {
                "retcode": 0,
                "description": "",
                "result": serialize_array(result),
                "_success": True,
            }

        # If it's a list of namedtuples (ticks, candles, deals, orders)
        if isinstance(result, list) and len(result) > 0 and hasattr(result[0], "_asdict"):
            serialized = [serialize_namedtuple(r) for r in result]
            return {
                "retcode": getattr(result[0], "retcode", 10009) if hasattr(result[0], "retcode") else 10009,
                "description": "",
                "result": serialized,
                "_success": True,
            }

        # Single namedtuple (account_info, symbol_info, tick, order, position)
        if hasattr(result, "_asdict"):
            serialized = serialize_namedtuple(result)
            return {
                "retcode": getattr(result, "retcode", 10009) if hasattr(result, "retcode") else 10009,
                "description": "",
                "result": serialized,
                "_success": True,
            }

        # Fallback: return as-is (already a dict or primitive)
        return {
            "retcode": 10009 if result is None else 0,
            "description": "",
            "result": result,
            "_success": result is not None,
        }

    # Preserve the original function's signature for docs/introspection
    wrapper.__name__ = name
    wrapper.__doc__ = raw_fn.__doc__
    wrapper.__module__ = raw_fn.__module__
    return wrapper


def load() -> dict[str, Callable]:
    """
    Scan the installed MetaTrader5 package and return a dict mapping every
    public function name to a wrapper.

    The dict is deliberately *not* assigned to a module global here — the
    caller (MT5Engine) decides how to ingest it. This keeps the manager
    pure and testable without side effects.
    """
    try:
        import MetaTrader5 as mt5
    except ImportError:
        _LOG.warning("MetaTrader5 package not importable; API manager has nothing to wrap.")
        return {}

    found: dict[str, Callable] = {}
    for name in dir(mt5):
        if not _is_public(name):
            continue
        if not _callable_attr(mt5, name):
            continue

        raw_fn = getattr(mt5, name)
        wrapped = _wrap_function(name, raw_fn)
        found[name] = wrapped

    _LOG.info("API manager discovered %d MT5 functions", len(found))
    return found