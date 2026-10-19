# Stage 1: Analysis of Current MCP Tool Names and Goal to Make Them Friendly

## Current MCP Tool Names (from mcp_server.ts)
The MCP currently exposes tools with names like:
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
- get_mt5_bridge_status
- connect_mt5_bridge
- disconnect_mt5_bridge
- get_mt5_account_info
- get_mt5_terminal_info
- get_mt5_symbols
- get_mt5_symbol_info
- get_mt5_positions
- get_mt5_rates
- get_mt5_history_deals
- execute_mt5_bridge_order
- call_mt5_function
- list_mt5_bridge_functions
- modify_mt5_position
- get_mt5_orders
- get_mt5_tick
- get_mt5_market_depth
- calc_mt5_margin
- calc_mt5_profit
- get_mt5_totals

## Goal: Make Tool Names More Friendly and Consistent
We want to rename the existing MCP tool names to follow a friendly, predictable pattern similar to the mttrade example:
- Use `mt5_` prefix for all MetaTrader 5 related tools.
- Use verb-noun phrasing (e.g., `get_account_info`, `get_tick`, `execute_trade`).
- Keep related tools grouped logically.

Specifically, we aim to rename:
- `get_mt5_bridge_status` → `mt5_get_bridge_status` (or maybe `mt5_bridge_status`? but we'll keep verb)
- `connect_mt5_bridge` → `mt5_connect_bridge`
- `disconnect_mt5_bridge` → `mt5_disconnect_bridge`
- `get_mt5_account_info` → `mt5_get_account_info` (already matches!)
- `get_mt5_terminal_info` → `mt5_get_terminal_info` (already matches!)
- `get_mt5_symbols` → `mt5_get_symbols` (already matches!)
- `get_mt5_symbol_info` → `mt5_get_symbol_info` (already matches!)
- `get_mt5_positions` → `mt5_get_positions` (already matches!)
- `get_mt5_rates` → `mt5_get_rates` (already matches!)
- `get_mt5_history_deals` → `mt5_get_history_deals` (already matches!)
- `execute_mt5_bridge_order` → `mt5_execute_order` (or keep as execute? but we can have `mt5_execute_trade` for BUY/SELL and separate for close?)
- `call_mt5_function` → `mt5_call_function`
- `list_mt5_bridge_functions` → `mt5_list_functions`
- `modify_mt5_position` → `mt5_modify_position` (already matches!)
- `get_mt5_orders` → `mt5_get_orders` (already matches!)
- `get_mt5_tick` → `mt5_get_tick` (already matches!)
- `get_mt5_market_depth` → `mt5_get_market_depth` (already matches!)
- `calc_mt5_margin` → `mt5_calc_margin` (already matches!)
- `calc_mt5_profit` → `mt5_calc_profit` (already matches!)
- `get_mt5_totals` → `mt5_get_totals` (already matches!)

Many of the MT5-related tools already have the `mt5_` prefix and friendly names. The only ones that need renaming are those that lack the prefix or have inconsistent naming:
- `get_mt5_bridge_status` (has prefix but we might want to keep it as is? Actually it's already `get_mt5_bridge_status` which is fine; but the user example had `mt5_get_account_info` etc. They might prefer `mt5_bridge_status`? We'll decide later.)
- `connect_mt5_bridge`, `disconnect_mt5_bridge` (these already have `mt5_` prefix)
- `execute_mt5_bridge_order` (has prefix but verbose; could be `mt5_execute_order` or split into `mt5_buy`, `mt5_sell`, `mt5_close`, `mt5_close_all` for clarity)
- `call_mt5_function` (has prefix)
- `list_mt5_bridge_functions` (has prefix)

Additionally, we need to add the missing tool for `getHistoryOrders` from the bridge, which should be named `mt5_get_history_orders`.

## Non-MT5 Tools
The other tools (system status, trading state, AI strategies, etc.) are not related to MT5 and may keep their current names, or we could add a prefix like `scalarai_` but the user did not ask for that. We'll leave them as they are unless they conflict.

## Missing Tool
- Add `mt5_get_history_orders` (or `get_mt5_history_orders` after renaming) to expose the bridge's `getHistoryOrders` method.

## Summary of Changes
1. Rename a subset of MCP tool names to be more consistent and friendly (focus on MT5-related tools).
2. Add missing tool for historical orders.
3. Ensure all tool input/output schemas remain the same.
4. Update documentation accordingly.
