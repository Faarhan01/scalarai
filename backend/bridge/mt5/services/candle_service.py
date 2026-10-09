from datetime import datetime
from typing import List, Optional
from .mt5_service import MT5Service
from .database import Database


class CandleIngestionService:
    def __init__(self, mt5_service: MT5Service, db: Database):
        self.mt5 = mt5_service
        self.db = db

    def ingest_symbol(self, symbol: str, timeframe: str = "1", count: int = 100) -> dict:
        candles = self.mt5.get_history(symbol, count, timeframe)
        if not candles:
            return {"symbol": symbol, "ingested": 0}

        inserted = 0
        for candle in candles:
            if self.db.insert_candle({
                "symbol": symbol,
                "timeframe": timeframe,
                "time": candle["time"],
                "open": candle["open"],
                "high": candle["high"],
                "low": candle["low"],
                "close": candle["close"],
                "volume": candle["volume"],
                "direction": self._direction(candle),
            }):
                inserted += 1

        self.db.add_log("SUCCESS", "INGESTION", f"Ingested {inserted} candles for {symbol} {timeframe}")
        return {"symbol": symbol, "timeframe": timeframe, "ingested": inserted}

    def ingest_symbols(self, symbols: List[str], timeframe: str = "1", count: int = 100) -> List[dict]:
        results = []
        for symbol in symbols:
            try:
                result = self.ingest_symbol(symbol, timeframe, count)
                results.append(result)
            except Exception as e:
                results.append({"symbol": symbol, "error": str(e), "ingested": 0})
        return results

    def get_latest_candles(self, symbol: str, timeframe: str = "1", limit: int = 50) -> List[dict]:
        return self.db.get_candles(symbol, timeframe, limit)

    def _direction(self, candle: dict) -> str:
        if candle["close"] > candle["open"]:
            return "up"
        elif candle["close"] < candle["open"]:
            return "down"
        return "flat"
