from typing import List, Optional, Dict, Any
from .mt5_service import MT5Service
from .database import Database


class StrategyService:
    def __init__(self, mt5_service: MT5Service, db: Database):
        self.mt5 = mt5_service
        self.db = db

    def create_strategy(self, name: str, description: str = "", mode: str = "CUSTOM", rules: List[dict] = None, params: dict = None, symbols: List[str] = None) -> dict:
        strategy_id = f"strategy_{abs(hash(name))}"
        strategy = {
            "id": strategy_id,
            "name": name,
            "description": description,
            "mode": mode,
            "rules": rules or [],
            "params": params or {},
            "active": False,
        }
        if self.db.insert_strategy(strategy):
            if symbols:
                self.db.add_strategy_symbols(strategy_id, symbols)
            self.db.add_log("SUCCESS", "STRATEGY", f"Created strategy: {name}")
            return {"success": True, "strategy": strategy}
        raise RuntimeError("Failed to create strategy")

    def get_strategy(self, strategy_id: str) -> Optional[dict]:
        strategy = self.db.get_strategy(strategy_id)
        if strategy:
            strategy["symbols"] = self.db.get_strategy_symbols(strategy_id)
        return strategy

    def list_strategies(self) -> List[dict]:
        strategies = self.db.list_strategies()
        for s in strategies:
            s["symbols"] = self.db.get_strategy_symbols(s["id"])
        return strategies

    def activate_strategy(self, strategy_id: str) -> dict:
        strategy = self.db.get_strategy(strategy_id)
        if not strategy:
            raise RuntimeError(f"Strategy not found: {strategy_id}")
        self.db.set_active_strategy(strategy_id)
        self.db.add_log("SUCCESS", "STRATEGY", f"Activated strategy: {strategy['name']}")
        return {"success": True, "activeStrategy": strategy}

    def get_active_strategy(self) -> Optional[dict]:
        strategy = self.db.get_active_strategy()
        if strategy:
            strategy["symbols"] = self.db.get_strategy_symbols(strategy["id"])
        return strategy

    def update_strategy(self, strategy_id: str, updates: dict) -> dict:
        existing = self.db.get_strategy(strategy_id)
        if not existing:
            raise RuntimeError(f"Strategy not found: {strategy_id}")

        updated = {
            "id": strategy_id,
            "name": updates.get("name", existing["name"]),
            "description": updates.get("description", existing["description"]),
            "mode": updates.get("mode", existing["mode"]),
            "rules": updates.get("rules", existing["rules"]),
            "params": updates.get("params", existing["params"]),
        }
        if self.db.insert_strategy(updated):
            self.db.add_log("SUCCESS", "STRATEGY", f"Updated strategy: {updated['name']}")
            return {"success": True, "strategy": updated}
        raise RuntimeError("Failed to update strategy")

    def delete_strategy(self, strategy_id: str) -> bool:
        if self.db.delete_strategy(strategy_id):
            self.db.add_log("SUCCESS", "STRATEGY", f"Deleted strategy: {strategy_id}")
            return True
        return False

    def validate_strategy(self, strategy_id: str) -> Dict[str, Any]:
        strategy = self.db.get_strategy(strategy_id)
        if not strategy:
            raise RuntimeError(f"Strategy not found: {strategy_id}")

        symbols = self.db.get_strategy_symbols(strategy_id)
        if not symbols:
            raise RuntimeError("Strategy has no symbols assigned")

        errors = []
        for sym in symbols:
            try:
                info = self.mt5.get_symbol_info(sym)
            except Exception as e:
                errors.append(f"Symbol {sym}: {str(e)}")

        if errors:
            return {"valid": False, "errors": errors}

        return {"valid": True, "symbols": symbols, "mode": strategy["mode"], "rules_count": len(strategy.get("rules", []))}

    def create_version(self, strategy_id: str) -> dict:
        new_id = self.db.create_strategy_version(strategy_id)
        if not new_id:
            raise RuntimeError(f"Failed to create version for: {strategy_id}")
        strategy = self.db.get_strategy(new_id)
        strategy["symbols"] = self.db.get_strategy_symbols(new_id)
        self.db.add_log("SUCCESS", "STRATEGY", f"Created version {new_id} for {strategy_id}")
        return {"success": True, "strategy": strategy}
