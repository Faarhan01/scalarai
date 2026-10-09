import os
from pathlib import Path
from datetime import datetime
from typing import Optional

TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "templates" / "ea_template.mq5"
GENERATED_DIR = Path(__file__).resolve().parent.parent / "generated"


class EaTemplateService:
    def __init__(self, server_url: str = "http://127.0.0.1:5000"):
        self.server_url = server_url.rstrip("/")
        self._template = self._load_template()

    def _load_template(self) -> str:
        try:
            return TEMPLATE_PATH.read_text(encoding="utf-8")
        except Exception:
            return ""

    def generate(self, symbols: list[str], is_active: bool = False, magic: Optional[int] = None, lot_size: float = 0.1, sl_points: int = 0, tp_points: int = 0, send_history: bool = True, send_ticks: bool = True, candle_count: int = 100, tick_count: int = 1000) -> str:
        if not symbols:
            symbols = ["Step Index"]

        magic_number = magic or abs(hash(self.server_url)) % 900000 + 100000
        ea_name = "MT5_AI_Bridge_EA"

        return self._template.format(
            ea_name=ea_name,
            server_url=self.server_url,
            version="3.0.0",
            is_active="true" if is_active else "false",
            magic=magic_number,
            symbols=",".join(symbols),
        )

    def save(self, symbols: list[str], filename: Optional[str] = None, **kwargs) -> str:
        GENERATED_DIR.mkdir(parents=True, exist_ok=True)
        for existing in GENERATED_DIR.glob("MT5_AI_Bridge_EA*.mq5"):
            existing.unlink()

        filename = filename or f"MT5_AI_Bridge_EA_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mq5"
        filepath = GENERATED_DIR / filename
        try:
            code = self.generate(symbols, **kwargs)
            filepath.write_text(code, encoding="utf-8")
            return str(filepath)
        except Exception:
            return ""
