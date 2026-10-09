"""
HTTP wrapper around the MT5 bridge.

Lets the ScalarAI site talk to the bridge over HTTP instead of the bridge
running its own server. The site can also mount this app under its own
namespace (e.g. /bridge) via a proxy, or run it standalone on a separate
port.

Endpoints (all read-only except the trade actions, which need an API key):
  GET  /health
  GET  /account
  GET  /positions
  GET  /symbols
  GET  /tick?symbol=X
  GET  /history?symbol=X&count=N&timeframe=1
  POST /trade          body: {"type":"BUY","symbol":"X","lot":0.1,"sl":10,"tp":20}
  POST /close          body: {"ticket":123}
  POST /close-all      body: {"symbol":"X"}  (omit symbol for all)
  POST /modify         body: {"ticket":123,"sl":10,"tp":20}
"""

import json
import os
import sys
from typing import Any, Dict, Optional

# Allow importing the bridge services when run as a script.
_BRIDGE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BRIDGE_ROOT not in sys.path:
    sys.path.insert(0, _BRIDGE_ROOT)

try:
    from fastapi import FastAPI, HTTPException, Request  # type: ignore
    from fastapi.responses import JSONResponse  # type: ignore
    from pydantic import BaseModel  # type: ignore
    _FASTAPI = True
except ImportError:  # pragma: no cover
    _FASTAPI = False

from mt5.services.mt5_service import MT5Service  # noqa: E402

# ---------------------------------------------------------------------------
# Request models (only used when FastAPI is available)
# ---------------------------------------------------------------------------
if _FASTAPI:

    class TradeRequest(BaseModel):
        type: str
        symbol: Optional[str] = None
        lot: Optional[float] = None
        sl: Optional[float] = None
        tp: Optional[float] = None
        comment: Optional[str] = None

    class CloseRequest(BaseModel):
        ticket: int

    class ModifyRequest(BaseModel):
        ticket: int
        sl: Optional[float] = None
        tp: Optional[float] = None


def create_app(api_key: Optional[str] = None) -> "FastAPI":
    """Build a FastAPI app wrapping the MT5 bridge."""
    if not _FASTAPI:
        raise RuntimeError("fastapi is not installed; run `pip install fastapi uvicorn`")

    app = FastAPI(title="ScalarAI MT5 Bridge", version="1.0.0")
    service = MT5Service()

    def _check_key(request: Request) -> None:
        if api_key:
            auth = request.headers.get("authorization", "")
            if not auth.startswith(f"Bearer {api_key}"):
                raise HTTPException(status_code=401, detail="Invalid or missing API key")

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "mt5-bridge"}

    @app.get("/account")
    async def account():
        try:
            return service.get_account()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    @app.get("/positions")
    async def positions():
        try:
            return {"positions": service.get_positions()}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    @app.get("/symbols")
    async def symbols():
        try:
            syms = service.get_symbols()
            return {"symbols": syms, "count": len(syms)}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    @app.get("/tick")
    async def tick(symbol: str):
        try:
            return service.get_tick(symbol)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    @app.get("/history")
    async def history(symbol: str, count: int = 100, timeframe: str = "1"):
        try:
            return {"symbol": symbol, "candles": service.get_history(symbol, count, timeframe)}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    @app.post("/trade")
    async def place_trade(request: Request, body: TradeRequest):
        _check_key(request)
        try:
            return service.place_trade(
                symbol=body.symbol or "Step Index",
                trade_type=body.type,
                lot=body.lot or 0.1,
                sl=body.sl,
                tp=body.tp,
                comment=body.comment or "ScalarAI site trade",
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    @app.post("/close")
    async def close_trade(request: Request, body: CloseRequest):
        _check_key(request)
        try:
            return service.close_trade(body.ticket)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    @app.post("/close-all")
    async def close_all(request: Request):
        _check_key(request)
        try:
            symbol = None
            try:
                raw = await request.body()
                if raw:
                    symbol = json.loads(raw).get("symbol")
            except Exception:
                pass
            return service.close_all_positions(symbol)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    @app.post("/modify")
    async def modify(request: Request, body: ModifyRequest):
        _check_key(request)
        try:
            return service.modify_position(body.ticket, body.sl, body.tp)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    return app


def run(host: str = "127.0.0.1", port: int = 5000, api_key: Optional[str] = None) -> None:
    """Run the bridge HTTP server."""
    import uvicorn  # type: ignore
    app = create_app(api_key)
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":  # pragma: no cover
    run()