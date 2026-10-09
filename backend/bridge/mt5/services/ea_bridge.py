"""Bridge-side service that replicates the Expert Advisor's data flow."""

import os
import sys
import time
import threading
import urllib.request
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

_BRIDGE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BRIDGE_ROOT not in sys.path:
    sys.path.insert(0, _BRIDGE_ROOT)

from mt5.services.mt5_service import MT5Service  # noqa: E402

DEFAULT_SITE_URL = os.environ.get("SCALARAI_SITE_URL", "http://127.0.0.1:3000")
DEFAULT_API_KEY = os.environ.get("SCALARAI_MCP_API_KEY", "")


class EABridgeService:
    """Replicates the Expert Advisor's data flow using the MT5 Python API."""

    def __init__(self, site_url: str = DEFAULT_SITE_URL, api_key: str = DEFAULT_API_KEY):
        self.site_url = site_url.rstrip("/")
        self.api_key = api_key
        self.service = MT5Service()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    @staticmethod
    def _native(value):
        """Convert numpy types to native Python types for JSON serialization."""
        try:
            import numpy as np
            if isinstance(value, np.integer):
                return int(value)
            if isinstance(value, np.floating):
                return float(value)
            if isinstance(value, np.ndarray):
                return value.tolist()
        except ImportError:
            pass
        return value

    def _post(self, path, body):
        if not self.site_url:
            return None
        data = json.dumps(body).encode()
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        try:
            req = urllib.request.Request(f"{self.site_url}{path}", data=data, headers=headers)
            with urllib.request.urlopen(req, timeout=5) as r:
                return json.loads(r.read().decode())
        except Exception:
            return None

    def _get(self, path):
        if not self.site_url:
            return None
        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        try:
            req = urllib.request.Request(f"{self.site_url}{path}", headers=headers)
            with urllib.request.urlopen(req, timeout=5) as r:
                return json.loads(r.read().decode())
        except Exception:
            return None

    def poll_commands(self):
        data = self._get("/poll")
        if not data:
            return []
        if isinstance(data, list):
            return data
        return data.get("pendingTrades", []) if isinstance(data, dict) else []

    def send_tick(self, symbol: str = "Step Index"):
        tick = self.service.get_tick(symbol)
        info = self.service.get_account()
        payload = {
            "symbol": symbol,
            "price": self._native(tick["ask"]),
            "close": self._native(tick["ask"]),
            "bid": self._native(tick["bid"]),
            "ask": self._native(tick["ask"]),
            "account": str(info.get("login", "")),
            "balance": self._native(info.get("balance", 0)),
            "broker": info.get("company", ""),
            "velocity": 0,
            "buyLocked": False,
            "sellLocked": False,
            "spread": 0,
            "session": "bridge",
            "digits": 1,
            "tickSize": 0.1,
            "description": "Step Index",
        }
        return self._post("/api/ea/tick", payload)

    def send_bulk_candles(self, symbol: str = "Step Index", count: int = 500):
        candles = self.service.get_history(symbol, count, "1")
        payload = {
            "symbol": symbol,
            "candles": [
                {
                    "time": int(datetime.fromisoformat(c["time"]).timestamp() * 1000),
                    "open": self._native(c["open"]),
                    "high": self._native(c["high"]),
                    "low": self._native(c["low"]),
                    "close": self._native(c["close"]),
                    "volume": self._native(c.get("volume", 0)),
                }
                for c in candles
            ],
            "digits": 1,
            "tickSize": 0.1,
        }
        return self._post("/api/market/bulk-candles", payload)

    def send_positions(self, symbol: Optional[str] = None):
        positions = self.service.get_positions()
        if symbol:
            positions = [p for p in positions if p.get("symbol") == symbol]
        payload = {
            "positions": [
                {
                    "ticket": self._native(p.get("ticket")),
                    "type": p.get("type"),
                    "symbol": p.get("symbol"),
                    "volume": self._native(p.get("volume")),
                    "openPrice": self._native(p.get("price_open")),
                    "sl": self._native(p.get("sl", 0)),
                    "tp": self._native(p.get("tp", 0)),
                    "profit": self._native(p.get("profit", 0)),
                    "magic": self._native(p.get("magic", 20241008)),
                    "openTime": p.get("time", datetime.now().isoformat()),
                }
                for p in positions
            ]
        }
        return self._post("/api/ea/positions", payload)

    def send_confirmations(self, confirmations: List[Dict[str, Any]]):
        if not confirmations:
            return None
        return self._post("/api/ea/confirm", {"confirmations": confirmations})

    def send_logs(self, logs: List[Dict[str, Any]]):
        if not logs:
            return None
        return self._post("/api/ea/logs", {"logs": logs})

    def run_loop(self, interval: float = 1.5) -> None:
        while not self._stop.is_set():
            try:
                self.send_tick()
                self.send_positions()
            except Exception:
                pass
            self._stop.wait(interval)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self.run_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)