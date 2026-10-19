"""
mt5_pkg_bridge — Connection Manager
==========================
Owns the lifecycle of the terminal connection: import, attach, authenticate,
reconnect and detach.

Kept separate from MT5Engine so the engine stays a thin set of operations and
the connection concerns (locking, retry, background reconnect) live in one
place.
"""

import threading
from typing import Optional

from . import enums
from .paths import ensure_on_path

# The MetaTrader5 package talks to exactly one terminal per process, so the
# bridge only ever has one meaningful connection either. Tracking it here
# gives code that has no manager instance -- notably api_manager's generated
# wrappers, which are built at import time -- a way to ask "is anything
# connected?" that is actually true.
_ACTIVE: Optional["ConnectionManager"] = None
_ACTIVE_LOCK = threading.Lock()


class ConnectionManager:
    """
    Thread-safe connection state for the MT5 terminal.

    Usage:
        conn = ConnectionManager({"package_path": ...})
        conn.connect()
        engine = MT5Engine(conn)
        ...
        conn.disconnect()
    """

    def __init__(self, config: Optional[dict] = None):
        self._mt5 = None
        self._connected = False
        self._lock = threading.RLock()
        self._connect_lock = threading.RLock()
        self._reconnect_thread: Optional[threading.Thread] = None
        self._stop_reconnect = threading.Event()
        self._connection_info: dict = {}
        self._config = dict(config or {})
        # Callbacks fired on disconnect so dependent state (market book
        # subscriptions) can be dropped along with the connection.
        self._on_disconnect: list = []

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def mt5(self):
        return self._mt5

    @classmethod
    def active(cls) -> "Optional[ConnectionManager]":
        """The manager currently attached to a terminal, or None."""
        with _ACTIVE_LOCK:
            return _ACTIVE

    @classmethod
    def active_mt5(cls):
        """The live MetaTrader5 module, or None when nothing is attached."""
        mgr = cls.active()
        return mgr.mt5 if mgr is not None and mgr.is_connected else None

    @classmethod
    def is_any_connected(cls) -> bool:
        """Whether a terminal is attached right now."""
        return cls.active_mt5() is not None

    def _claim_active(self) -> None:
        global _ACTIVE
        with _ACTIVE_LOCK:
            _ACTIVE = self

    def on_disconnect(self, callback):
        """Register a callback invoked whenever the connection drops."""
        self._on_disconnect.append(callback)

    def _import_mt5(self):
        """Import the MetaTrader5 package, adding its directory if needed."""
        resolved = ensure_on_path(self._config.get("package_path"))
        try:
            import MetaTrader5 as mt5
        except ImportError as exc:
            hint = (
                f"Set CONY_MT5_PACKAGE (or PERON_PACKAGE_PATH) to the directory containing "
                f"MetaTrader5/. Searched: {resolved or 'site-packages only'}. "
                f"The package must match this interpreter "
                f"(cp{__import__('sys').version_info.major}"
                f"{__import__('sys').version_info.minor}-win_amd64)."
            )
            raise ConnectionError(f"Failed to import MetaTrader5. {hint} Original error: {exc}")
        return mt5

    def connect(self, **overrides) -> dict:
        """
        Attach to the running terminal.

        Any parameter left out falls back to the config this manager was built
        with. Credentials are only needed when the terminal is not already
        logged in; without them initialize() attaches to the current session.
        """
        with self._lock:
            self._mt5 = self._import_mt5()

            kwargs = {}
            for key, config_key in (
                ("login", "login"),
                ("password", "password"),
                ("server", "server"),
                ("path", "terminal_path"),
                ("timeout", "timeout"),
            ):
                value = self._config.get(config_key)
                if value is not None:
                    kwargs[key] = value
            kwargs.update({k: v for k, v in overrides.items() if v is not None})
            kwargs.setdefault("timeout", 60000)

            if not self._mt5.initialize(**kwargs):
                raise ConnectionError(
                    f"initialize() failed: {self._mt5.last_error()}. "
                    f"Is the MT5 terminal running and logged in?"
                )

            self._connected = True
            self._stop_reconnect.clear()
            self._claim_active()

            terminal = self._mt5.terminal_info()
            account = self._mt5.account_info()

            self._connection_info = {
                "connected": True,
                "package_version": getattr(self._mt5, "__version__", None),
                "terminal": {
                    "name": terminal.name if terminal else None,
                    "company": terminal.company if terminal else None,
                    "build": terminal.build if terminal else None,
                    "connected": terminal.connected if terminal else None,
                    "community_account": terminal.community_account if terminal else None,
                    "language": terminal.language if terminal else None,
                },
                "account": {
                    "login": account.login if account else None,
                    "server": account.server if account else None,
                    "currency": account.currency if account else None,
                    "leverage": account.leverage if account else None,
                    "trade_mode": (
                        enums.TRADE_MODE_NAMES.get(account.trade_mode)
                        if account
                        else None
                    ),
                },
            }
            return self._connection_info

    def disconnect(self):
        """Detach from the terminal and stop the reconnect loop."""
        with self._lock:
            self._stop_reconnect.set()
            if self._mt5 and self._connected:
                try:
                    self._mt5.shutdown()
                finally:
                    self._connected = False
                    self._connection_info = {}
                    self._release_active()
                    for callback in self._on_disconnect:
                        try:
                            callback()
                        except Exception:  # noqa: BLE001 - cleanup must not block shutdown
                            pass

    def ensure_connected(self):
        """
        Make sure a connection exists, connecting on demand.

        A read-only call while disconnected therefore reconnects rather than
        failing, which keeps a caller from having to re-issue POST /connect
        after a terminal restart.
        """
        with self._connect_lock:
            with self._lock:
                if self._connected:
                    return
            if self._config.get("auto_reconnect", True):
                self.connect()
            else:
                raise ConnectionError(
                    "Not connected to the MT5 terminal. POST /connect first."
                )

    def recover(self, last_error=None):
        """
        Handle a call that failed because the IPC link died.

        `import MetaTrader5` hands back the same module object for the life of
        the process, so if the terminal restarts that object's IPC handle is
        dead and re-calling initialize() on it is not always enough. The only
        reliable recovery is to drop the module and import it again, which is
        what this does.

        Returns True if the module was replaced and the caller may retry once.
        """
        code = last_error[0] if isinstance(last_error, (tuple, list)) and last_error else None
        # 1 = IPC failure, -10001 = "IPC send failed" reported through an
        # account/tool call. Both mean the channel, not the request.
        if code not in (1, -10001, -10000):
            return False

        with self._lock:
            self._connected = False
            self._connection_info = {}
            self._mt5 = None
        self._release_active()

        import importlib
        import MetaTrader5 as mt5
        importlib.reload(mt5)
        return True

    def mark_dropped(self):
        """Record an unexpected drop so the next call reconnects."""
        with self._lock:
            self._connected = False
            self._connection_info = {}
        self._release_active()

    def _release_active(self) -> None:
        """Give up the active slot, but only if this manager still holds it."""
        global _ACTIVE
        with _ACTIVE_LOCK:
            if _ACTIVE is self:
                _ACTIVE = None

    def start_auto_reconnect(self, interval: int = 20):
        """Run a background loop that reattaches whenever the link drops."""
        if self._reconnect_thread and self._reconnect_thread.is_alive():
            return
        self._stop_reconnect.clear()
        self._reconnect_thread = threading.Thread(
            target=self._reconnect_loop,
            args=(interval,),
            daemon=True,
            name="mt5pkg-reconnect",
        )
        self._reconnect_thread.start()

    def stop_auto_reconnect(self):
        self._stop_reconnect.set()

    def _reconnect_loop(self, interval: int):
        # Check often enough to notice a drop promptly, but not busy-loop.
        tick = min(max(interval // 4, 1), 5)
        while not self._stop_reconnect.is_set():
            if not self._connected:
                try:
                    self.connect()
                except ConnectionError:
                    pass
            self._stop_reconnect.wait(tick)

    def get_connection_info(self) -> dict:
        with self._lock:
            return dict(self._connection_info)
