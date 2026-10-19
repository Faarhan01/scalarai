"""
mt5_pkg_bridge — Symbol Resolution
=================================
Case-insensitive symbol lookup, backed by a TTL cache.

Why this is its own module
--------------------------
`resolve_symbol` used to be a method on `MT5Engine`, which left
`api_manager`'s generated wrappers with nowhere to call: they are built at
import time and hold no engine reference. The wrapper was calling
`enums.resolve_symbol(...)`, a function that has never existed in any version
of this bridge -- so every wrapper call whose first positional argument was a
string raised `AttributeError`.

Two options were available:

  * duplicate the lookup into `api_manager` -- two caches to keep in step
  * extract it here and have both callers use one implementation

This is the second. `MT5Engine` still owns a resolver instance so its cache
behaviour is unchanged; `api_manager` uses a module-level one that reaches the
live terminal through the active connection. The logic below is the method's
logic, unchanged.
"""

import threading
import time
from typing import Callable, Dict, Optional

from .errors import MT5ConnectionError, SymbolNotFoundError

DEFAULT_TTL_SECONDS = 300


class SymbolResolver:
    """
    Resolves a symbol name to the broker's exact spelling.

    Parameters
    ----------
    mt5_provider:
        Zero-argument callable returning the live ``MetaTrader5`` module, or
        None when no terminal is attached. A callable rather than the module
        itself, because the module only exists once something has connected
        and this object is constructed before that happens.
    ttl_seconds:
        How long the name map is reused before being rebuilt from the broker.
    """

    def __init__(
        self,
        mt5_provider: Callable[[], Optional[object]],
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
    ):
        self._mt5_provider = mt5_provider
        self._ttl = ttl_seconds
        self._cache: Dict[str, str] = {}
        self._cache_at: float = 0.0
        self._lock = threading.Lock()

    @property
    def ttl_seconds(self) -> int:
        return self._ttl

    def clear(self) -> None:
        """Drop the cached names so the next miss rebuilds them."""
        with self._lock:
            self._cache = {}
            self._cache_at = 0.0

    def info(self) -> dict:
        """Cache state, for observability."""
        with self._lock:
            age = time.monotonic() - self._cache_at if self._cache_at else None
            return {
                "entries": len(self._cache),
                "ttl_seconds": self._ttl,
                "age_seconds": round(age, 1) if age is not None else None,
                "valid": bool(self._cache)
                and (time.monotonic() - self._cache_at) < self._ttl,
            }

    def _module(self):
        """The live MetaTrader5 module, or a clear error explaining its absence."""
        mt5 = self._mt5_provider()
        if mt5 is None:
            raise MT5ConnectionError(
                "No MT5 terminal is attached, so symbols cannot be resolved. "
                "Call ConnectionManager.connect() first."
            )
        return mt5

    def name_map(self) -> Dict[str, str]:
        """
        casefolded name -> broker spelling, rebuilt at most once per TTL.

        Double-checked so concurrent misses do not each pay the terminal round
        trip; the rebuild happens under the lock, the read does not.
        """
        if self._cache and (time.monotonic() - self._cache_at) < self._ttl:
            return self._cache

        with self._lock:
            if self._cache and (time.monotonic() - self._cache_at) < self._ttl:
                return self._cache
            everything = self._module().symbols_get() or ()
            self._cache = {s.name.casefold(): s.name for s in everything}
            self._cache_at = time.monotonic()
            return self._cache

    def resolve(self, symbol: str) -> str:
        """
        Return the symbol spelled exactly as the broker spells it.

        MT5 names are case-sensitive and mixed ("Step Index 200", not
        "STEP INDEX 200"), so a mistyped name cannot be repaired by changing
        case. An exact hit is used as-is; otherwise the cached name map is
        consulted and the broker's canonical spelling returned. That keeps
        "eurusd" working without ever inventing a name the terminal rejects.

        A miss does not force a rebuild - doing so would make every typo pay
        the full scan again, which is the case the cache exists to avoid.
        Freshness is bounded by the TTL.
        """
        if not isinstance(symbol, str) or not symbol.strip():
            raise SymbolNotFoundError(f"Symbol '{symbol}' is not a usable name")

        mt5 = self._module()

        if mt5.symbol_info(symbol) is not None:
            return symbol

        found = self.name_map().get(symbol.strip().casefold())
        if found:
            return found

        raise SymbolNotFoundError(f"Symbol '{symbol}' not found")