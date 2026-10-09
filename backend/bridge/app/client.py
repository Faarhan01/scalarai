"""
Client that lets the bridge talk *to* the ScalarAI site.

The site exposes these endpoints (see backend/src/routes/*):
  GET  /api/status            full status payload (activeSymbol, config, etc.)
  GET  /api/settings          current settings (lotSize, selectedStrategy, ...)
  POST /api/trades            place a trade (state-changing, needs API key)
  POST /api/trades/:id/close  close one trade
  POST /api/trades/close-all  close all trades

This client is optional: if no site URL is configured the integration falls
back to defaults (active symbol "Step Index", lot size 0.1).
"""

import os
from typing import Any, Dict, Optional

try:
    import requests  # type: ignore
except ImportError:  # pragma: no cover - requests is optional
    requests = None  # type: ignore


class SiteClient:
    """Minimal HTTP client for the ScalarAI site backend."""

    def __init__(self, url: Optional[str] = None, api_key: Optional[str] = None, timeout: float = 3.0):
        self.url = (url or os.environ.get("SCALARAI_SITE_URL") or "").rstrip("/")
        self.api_key = api_key or os.environ.get("SCALARAI_MCP_API_KEY") or ""
        self.timeout = timeout

    @property
    def enabled(self) -> bool:
        return bool(self.url) and requests is not None

    def _headers(self) -> Dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def _get(self, path: str) -> Optional[Dict[str, Any]]:
        if not self.enabled:
            return None
        try:
            r = requests.get(f"{self.url}{path}", headers=self._headers(), timeout=self.timeout)
            return r.json() if r.ok else None
        except Exception:
            return None

    def _post(self, path: str, body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not self.enabled:
            return None
        try:
            r = requests.post(f"{self.url}{path}", json=body, headers=self._headers(), timeout=self.timeout)
            return r.json() if r.ok else None
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Read-only lookups used by the integration layer
    # ------------------------------------------------------------------
    def get_active_symbol(self) -> Optional[str]:
        data = self._get("/api/status")
        if not data:
            return None
        return data.get("activeSymbol") or data.get("symbol")

    def get_lot_size(self) -> Optional[float]:
        data = self._get("/api/settings")
        if not data:
            return None
        lot = data.get("lotSize")
        return float(lot) if lot else None

    # ------------------------------------------------------------------
    # Write-back: push trade confirmations / positions to the site
    # ------------------------------------------------------------------
    def report_trade(self, trade: Dict[str, Any]) -> None:
        """Push a trade confirmation to the site (best-effort)."""
        if not self.enabled:
            return
        try:
            self._post("/api/trades", trade)
        except Exception:
            pass

    def report_positions(self, positions: list) -> None:
        """Push a positions snapshot to the site (best-effort)."""
        if not self.enabled:
            return
        try:
            self._post("/api/bridge/positions", {"positions": positions})
        except Exception:
            pass