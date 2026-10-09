"""
Converts ScalarAI site trade requests into MT5 bridge calls and back.

The site's trade handlers expect this shape (see backend/src/routes/trades.ts):
  placeTrade(type, reason, options?) -> { success, message, ticket? }
  closeTrade(tradeId)                -> { success, message }
  closeAllTrades(symbol?)            -> { success, closedCount, message }
  modifyTrade(tradeId, { sl?, tp? }) -> { success, message }

The MT5 bridge (../mt5/services/mt5_service.py) exposes:
  place_trade(symbol, trade_type, lot, sl, tp, comment, magic) -> dict
  close_trade(ticket, magic) -> dict
  close_all(symbol) -> dict
  modify_position(ticket, sl, tp) -> dict

This module is the adapter between the two. It also pulls the active symbol
and lot size from the site client when the site request omits them.
"""

import os
import sys
from typing import Any, Dict, Optional

# Allow importing the bridge services when run as a script.
_BRIDGE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BRIDGE_ROOT not in sys.path:
    sys.path.insert(0, _BRIDGE_ROOT)

from mt5.services.mt5_service import MT5Service  # noqa: E402
from mt5.services.database import Database  # noqa: E402

from .client import SiteClient  # noqa: E402


class SiteBridgeIntegration:
    """Adapts site trade requests to MT5 bridge calls."""

    def __init__(self, site_client: Optional[SiteClient] = None, db_path: Optional[str] = None):
        self.service = MT5Service()
        self.db = Database(db_path or os.path.join(_BRIDGE_ROOT, "mt5", "database", "bridge.db"))
        self.site = site_client or SiteClient()

    # ------------------------------------------------------------------
    # placeTrade(type, reason, options?) -> { success, message, ticket? }
    # ------------------------------------------------------------------
    def place_trade(self, trade_type: str, reason: str, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        options = options or {}
        symbol = options.get("symbol") or self.site.get_active_symbol() or "Step Index"
        lot = options.get("lotSize") or self.site.get_lot_size() or 0.1
        sl = options.get("sl")
        tp = options.get("tp")

        try:
            result = self.service.place_trade(
                symbol=symbol,
                trade_type=trade_type,
                lot=float(lot),
                sl=float(sl) if sl else None,
                tp=float(tp) if tp else None,
                comment=reason or "ScalarAI site trade",
            )
            ticket = result.get("ticket")
            self._record_trade(symbol, trade_type, lot, sl, tp, ticket, reason)
            return {"success": True, "message": f"{trade_type} executed on {symbol}", "ticket": ticket}
        except Exception as exc:
            return {"success": False, "message": f"Trade failed: {exc}"}

    # ------------------------------------------------------------------
    # closeTrade(tradeId) -> { success, message }
    # ------------------------------------------------------------------
    def close_trade(self, trade_id: str) -> Dict[str, Any]:
        try:
            ticket = int(str(trade_id))
            result = self.service.close_trade(ticket)
            if result.get("closed"):
                return {"success": True, "message": f"Position {ticket} closed"}
            return {"success": False, "message": f"Position {ticket} not found or already closed"}
        except Exception as exc:
            return {"success": False, "message": f"Close failed: {exc}"}

    # ------------------------------------------------------------------
    # closeAllTrades(symbol?) -> { success, closedCount, message }
    # ------------------------------------------------------------------
    def close_all_trades(self, symbol: Optional[str] = None) -> Dict[str, Any]:
        try:
            result = self.service.close_all_positions(symbol)
            closed = result.get("closed", 0)
            return {"success": True, "closedCount": closed, "message": f"Closed {closed} position(s)"}
        except Exception as exc:
            return {"success": False, "closedCount": 0, "message": f"Close-all failed: {exc}"}

    # ------------------------------------------------------------------
    # modifyTrade(tradeId, { sl?, tp? }) -> { success, message }
    # ------------------------------------------------------------------
    def modify_trade(self, trade_id: str, options: Dict[str, Any]) -> Dict[str, Any]:
        try:
            ticket = int(str(trade_id))
            sl = options.get("sl")
            tp = options.get("tp")
            result = self.service.modify_position(ticket, sl=float(sl) if sl else None, tp=float(tp) if tp else None)
            if result.get("modified"):
                return {"success": True, "message": f"Position {ticket} modified"}
            return {"success": False, "message": f"Position {ticket} not found or already closed"}
        except Exception as exc:
            return {"success": False, "message": f"Modify failed: {exc}"}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def get_positions(self) -> list:
        try:
            return self.service.get_positions()
        except Exception:
            return []

    def get_account(self) -> Dict[str, Any]:
        try:
            return self.service.get_account()
        except Exception as exc:
            return {"error": str(exc)}

    def _record_trade(self, symbol, trade_type, lot, sl, tp, ticket, reason):
        try:
            self.db.save_trade({
                "symbol": symbol,
                "type": trade_type,
                "lot": float(lot),
                "sl": float(sl) if sl else 0.0,
                "tp": float(tp) if tp else 0.0,
                "ticket": ticket,
                "reason": reason or "",
                "status": "OPEN",
            })
        except Exception:
            pass  # best-effort logging; never break the trade


def create_integration(site_url: Optional[str] = None, api_key: Optional[str] = None) -> SiteBridgeIntegration:
    """Factory used by the site server to wire up the bridge."""
    client = SiteClient(site_url, api_key) if site_url else None
    return SiteBridgeIntegration(site_client=client)