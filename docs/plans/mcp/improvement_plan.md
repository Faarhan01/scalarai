# MCP Improvement Plan (Renaming Existing Tools)

## Stage 1: Analysis & Documentation
- [ ] Review all bridge methods (TypeScript) and CLI commands
- [ ] Map each to existing MCP tools
- [ ] Identify any gaps or missing exposures (e.g., getHistoryOrders)
- [ ] Document current MCP tool names and their usability for AI agents
- [ ] Output: `stage1_analysis.md`

## Stage 2: Design Friendly Names
- [ ] Define friendly, consistent naming convention for MT5-related tools (e.g., `mt5_get_account_info`, `mt5_get_tick`)
- [ ] Decide to rename existing MCP tools to these friendly names (not add alongside)
- [ ] Plan to split `execute_mt5_bridge_order` into specific action tools (`mt5_buy`, `mt5_sell`, `mt5_close_position`, `mt5_close_all`)
- [ ] Plan to add missing tool `mt5_get_history_orders`
- [ ] Keep non-MT5 tools unchanged
- [ ] Output: `stage2_design.md`

## Stage 3: Implementation
- [ ] Modify `mcp_server.ts`:
    - Update the `TOOLS` array with new tool names and definitions
    - Update the `callTool` switch statement to handle new names and logic (including split order tools)
    - Remove old tool definitions and cases
- [ ] Ensure JSON-RPC 2.0 compliance
- [ ] Output: Updated `mcp_server.ts`

## Stage 4: Testing & Validation
- [ ] Update any test files that reference old tool names
- [ ] Run existing test suite to ensure no regressions
- [ ] Manually verify each new tool name works correctly via MCP endpoint
- [ ] Verify old tool names return `-32601` (method not found)
- [ ] Validate error handling and performance
- [ ] Output: `stage4_testing.md`

## Stage 5: Documentation
- [ ] Optionally update `commandsideas.md` to reflect the new tool names (reference only)
- [ ] Ensure all examples use the new naming style
- [ ] Output: Final documentation (if needed)

## Notes
- No changes to the bridge (`mt5_bridge_cli.py` or `mt5-bridge.ts`) are required.
- All improvements are in the MCP layer to improve ergonomics and reduce AI errors.
- The goal is to provide intuitive, discoverable, and consistent command names for AI agents.
