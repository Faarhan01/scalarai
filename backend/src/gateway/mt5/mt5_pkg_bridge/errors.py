"""
mt5_pkg_bridge — Errors
=======================
The exception hierarchy, in a module of its own.

Why this exists
---------------
`MT5ConnectionError` and `SymbolNotFoundError` used to live in `mt5_engine`,
which `api_manager` needs in order to guard a wrapper and resolve a symbol.
But `mt5_engine` imports `api_manager` at module scope (to build its dispatch
table), so `api_manager` could only reach those classes through a deferred
`from mt5_pkg_bridge.mt5_engine import ...` inside a function body. That works,
but it means the error contract is defined in the one module that cannot
afford the dependency.

Moving the hierarchy here inverts the dependency cleanly: `errors` depends on
nothing, `api_manager` depends on `errors`, `mt5_engine` depends on `errors`,
and neither imports the other.

`mt5_engine` re-exports every name below, so `from mt5_pkg_bridge.mt5_engine
import SymbolNotFoundError` and `from mt5_pkg_bridge import MT5Error` both keep
working exactly as before. Callers should not have to care which file a class
is defined in.
"""

from typing import Optional


class MT5Error(Exception):
    """Base exception for all bridge errors."""


class MT5ConnectionError(MT5Error):
    """The terminal is not connected."""


class SymbolNotFoundError(MT5Error):
    """The broker does not expose that symbol."""


class NotFoundError(MT5Error):
    """A position or order ticket does not exist."""


class InvalidRequestError(MT5Error):
    """The terminal rejected the request before it reached the broker."""


class OrderRejectedError(MT5Error):
    """The broker or terminal refused the order."""

    def __init__(self, message: str, retcode: int = 0, result: Optional[dict] = None):
        super().__init__(message)
        self.retcode = retcode
        self.result = result or {}