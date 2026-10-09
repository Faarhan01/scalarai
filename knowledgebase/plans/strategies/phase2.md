# Strategies Plan — Phase 2: Multi-Symbol Strategy Management

## Status: ⚠️ PARTIALLY IMPLEMENTED

## What Exists

- `settings.selected_assets` stores array of symbols
- `symbol_connections` tracks per-symbol EA connection
- `market_ticks` has `symbol` column
- `strategy_symbol_performance` table exists for per-symbol performance tracking
- `symbol_metadata` table exists for per-symbol metadata

## What's Missing

- No `strategy_symbols` mapping table
- No symbol-specific strategy config overrides
- No MCP tools for multi-symbol strategy management
- Symbol switching does not load symbol-specific strategy config

## Implementation Steps

1. Create `strategy_symbols` table
2. Add symbol-specific strategy config to `AppStore`
3. Update symbol switching logic to load symbol-specific config
4. Add MCP tools for multi-symbol strategy management
5. Update frontend to display per-symbol performance

## Critical Fragility Warnings

1. **Symbol switching must preserve state** — switching symbols shouldn't reset active trades
2. **EA must receive correct symbol config** — MT5 EA trades on one symbol at a time
3. **Performance metrics must be per-symbol** — mixing symbols breaks strategy analysis

## Verification

- Strategy can be assigned to specific symbol
- Performance tracked correctly per symbol
- Symbol switching works without data loss
- MCP tools expose multi-symbol data
