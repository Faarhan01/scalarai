"""
mt5_pkg_bridge — MetaTrader 5 Engine
====================================
A plain Python library over the official MetaTrader5 package.

No HTTP, no server, no JSON concerns - just MT5 operations returning
ordinary dicts, usable from scripts, notebooks, tests or any server layer.

    from mt5_pkg_bridge import ConnectionManager, MT5Engine

    conn = ConnectionManager()
    conn.connect()
    engine = MT5Engine(conn)
    print(engine.get_account_info()["balance"])
    conn.disconnect()
"""

from .connection import ConnectionManager
from .marketbook import MarketBook, MarketBookError
from .mt5_engine import (
    MT5Engine,
    MT5Error,
    MT5ConnectionError,
    SymbolNotFoundError,
    NotFoundError,
    InvalidRequestError,
    OrderRejectedError,
)
from . import enums
from . import errors
from . import paths
from . import raw
from . import mt5_engine
from . import symbols

__version__ = "1.2.0"

__all__ = [
    "ConnectionManager",
    "MT5Engine",
    "MarketBook",
    "MarketBookError",
    "MT5Error",
    "MT5ConnectionError",
    "SymbolNotFoundError",
    "NotFoundError",
    "InvalidRequestError",
    "OrderRejectedError",
    "enums",
    "errors",
    "paths",
    "raw",
    "symbols",
    "mt5_engine",
    "__version__",
]
