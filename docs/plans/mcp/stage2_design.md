# Stage 2: Design of Friendly Tool Names for MCP

## Guiding Principles
- Use `mt5_` prefix for all MetaTrader 5 related tools.
- Follow verb-noun naming: `mt5_get_*`, `mt5_execute_*`, `mt5_modify_*`, `mt5_close_*`, `mt5_query_*`.
- Keep input/output behavior identical to the original tools (except where we split execute_mt5_bridge_order into specific action tools).
- Non-MT5 tools (system, AI, trading state, etc.) remain unchanged unless they conflict with naming (they don't).
- Add missing tool for `getHistoryOrders` as `mt5_get_history_orders`.

## Mapping: Current Tool Name → Proposed New Name

| Current Tool Name | Proposed New Name | Notes |
|-------------------|-------------------|-------|
| get_mt5_bridge_status | mt5_get_bridge_status | Added "get" for consistency |
| connect_mt5_bridge | mt5_connect_bridge | Keep as is |
| disconnect_mt5_bridge | mt5_disconnect_bridge | Keep as is |
| get_mt5_account_info | mt5_get_account_info | Already matches |
| get_mt5_terminal_info | mt5_get_terminal_info | Already matches |
| get_mt5_symbols | mt5_get_symbols | Already matches |
| get_mt5_symbol_info | mt5_get_symbol_info | Already matches |
| get_mt5_positions | mt5_get_positions | Already matches |
| get_mt5_rates | mt5_get_rates | Already matches |
| get_mt5_history_deals | mt5_get_history_deals | Already matches |
| execute_mt5_bridge_order | (removed) | Split into four specific tools: |
|  | mt5_buy | Execute a BUY order (requires symbol, volume, sl, tp, comment) |
|  | mt5_sell | Execute a SELL order (requires symbol, volume, sl, tp, comment) |
|  | mt5_close_position | Close a position by ticket (requires ticket, optional volume for partial close) |
|  | mt5_close_all | Close all positions (optional symbol filter) |
| call_mt5_function | mt5_call_function | Renamed for consistency |
| list_mt5_bridge_functions | mt5_list_functions | Renamed for consistency |
| modify_mt5_position | mt5_modify_position | Already matches |
| get_mt5_orders | mt5_get_orders | Already matches |
| get_mt5_tick | mt5_get_tick | Already matches |
| get_mt5_market_depth | mt5_get_market_depth | Already matches |
| calc_mt5_margin | mt5_calc_margin | Already matches |
| calc_mt5_profit | mt5_calc_profit | Already matches |
| get_mt5_totals | mt5_get_totals | Already matches |
| (new) get_mt5_history_orders (bridge method) | mt5_get_history_orders | Add missing tool for historical closed orders |

## Non-MT5 Tools (Unchanged)
All other tools in the MCP tool list retain their current names:
- get_system_status
- get_trading_state
- get_bridge_state
- get_calibration_state
- get_ai_knowledge_base
- get_ai_strategy
- list_strategies
- create_strategy
- update_strategy
- delete_strategy
- activate_strategy
- backtest_strategy
- query_db
- update_trading_settings
- toggle_automated_trading
- get_trade_history
- get_system_logs
- place_validated_trade
- close_trade
- modify_trade_sl_tp
- close_all_trades
- get_symbols
- switch_active_symbol
- get_ea_telemetry
- reset_stats
- ingest_strategyforge_csv
- get_strategyforge_results
- get_market_telemetry
- get_recent_candles
- analyze_strategy_performance
- synthesize_ai_strategy
- get_knowledge_summary
- analyze_market
- get_strategy_performance
- optimize_strategy
- recommend_strategy
- list_strategy_templates
- create_strategy_from_template
- export_data
- get_market_candles
- get_market_observations
- generate_observation_insights
- backtest_strategy_with_history

## Input/Output Schemas
Each new tool will have the same input schema as the original tool it replaces (or derives from), with adjustments for the split order tools:
- **mt5_buy**: same parameters as execute_mt5_bridge_order but action forced to BUY (or we keep action parameter and ignore? Better to have required symbol, volume, sl, tp, comment, and optionally ticket? Actually buy doesn't need ticket. We'll follow the bridge's buy method: symbol, volume, sl, tp, comment. We'll make ticket not required.)
- **mt5_sell**: analogous.
- **mt5_close_position**: requires ticket, optional volume (0 for full close).
- **mt5_close_all**: optional symbol filter (string or "ALL").

These match the bridge's respective methods.

## Backward Compatibility
Note: This change will break existing clients that use the old tool names. Since the user stated they are the only user and want to update the commands to be more friendly, we accept breaking the old names. All internal MCP tool references will be updated accordingly.
