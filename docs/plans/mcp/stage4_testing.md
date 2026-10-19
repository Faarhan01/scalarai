# Stage 4: Testing and Validation of Renamed MCP Tools

## Goal
Confirm that the MCP tool renaming works correctly, that the new friendly names are functional, and that the old names are no longer recognized (unless we decide to keep them as aliases, but per user request we are updating the old ones, so we will not keep aliases).

## Test Environment
- Local development server (`npm run dev`)
- MCP endpoint: `POST http://localhost:4000/mcp`
- Required header: `Authorization: Bearer scalarai-local` (from `.env`)

## Test Plan

### 1. Unit Tests (Existing)
- Run the existing test suite to ensure no regressions in non-MT5 related functionality.
  ```bash
  npm run test
  ```
- Expect all existing tests to pass. Note: Some tests may fail if they invoke the old MT5 tool names directly (e.g., in `tests/cotrade_and_gateway.test.ts`). We will need to update those tests to use the new names. However, the user said they are the only user; we can update the test files as part of this stage.

### 2. Update Test Files (if necessary)
Check if any test files invoke MCP tools directly. Search for "mcp" or "/mcp" in tests.

If found, update the tool names in the test payloads to the new names.

Example: In `tests/cotrade_and_gateway.test.ts`, there may be calls to MT5-related tools. We'll update them accordingly.

After updating tests, run `npm run test` again and expect all to pass.

### 3. Manual API Testing
Use PowerShell's Invoke-WebRequest to test each new tool name.

#### a) Test Renamed Core MT5 Tools
```powershell
# mt5_get_bridge_status
$payload = @{ jsonrpc="2.0"; id=1; method="tools/call"; params=@{ name="mt5_get_bridge_status"; arguments=@{}} } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:4000/mcp" -Method Post -Body $payload -Headers @{ "Authorization"="Bearer scalarai-local"; "Content-Type"="application/json" } -UseBasicParsing

# mt5_get_account_info
$payload = @{ jsonrpc="2.0"; id=2; method="tools/call"; params=@{ name="mt5_get_account_info"; arguments=@{}} } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:4000/mcp" -Method Post -Body $payload -Headers @{ "Authorization"="Bearer scalarai-local"; "Content-Type"="application/json" } -UseBasicParsing

# mt5_get_symbols
$payload = @{ jsonrpc="2.0"; id=3; method="tools/call"; params=@{ name="mt5_get_symbols"; arguments=@{}} } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:4000/mcp" -Method Post -Body $payload -Headers @{ "Authorization"="Bearer scalarai-local"; "Content-Type"="application/json" } -UseBasicParsing

# mt5_get_tick
$payload = @{ jsonrpc="2.0"; id=4; method="tools/call"; params=@{ name="mt5_get_tick"; arguments=@{ symbol="EURUSD" }} } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:4000/mcp" -Method Post -Body $payload -Headers @{ "Authorization"="Bearer scalarai-local"; "Content-Type"="application/json" } -UseBasicParsing

# mt5_buy (expect error if market closed, but should not be method not found)
$payload = @{ jsonrpc="2.0"; id=5; method="tools/call"; params=@{ name="mt5_buy"; arguments=@{ symbol="EURUSD"; volume=0.01; sl=1.08; tp=1.09; comment="test" }} } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:4000/mcp" -Method Post -Body $payload -Headers @{ "Authorization"="Bearer scalarai-local"; "Content-Type"="application/json" } -UseBasicParsing

# mt5_sell
# mt5_close_position
# mt5_close_all
# mt5_modify_position
# mt5_get_orders
# mt5_get_history_deals
# mt5_get_history_orders (new)
# mt5_call_function
# mt5_list_functions
# mt5_calc_margin
# mt5_calc_profit
# mt5_get_totals
```

Each request should return a JSON-RPC 2.0 response with `result.content` containing data (or an error from the bridge, but not `-32601` method not found).

#### b) Verify Old Names Are No Longer Recognized
Test a few old names to ensure they return `-32601` (method not found).

```powershell
$payload = @{ jsonrpc="2.0"; id=99; method="tools/call"; params=@{ name="get_mt5_bridge_status"; arguments=@{}} } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:4000/mcp" -Method Post -Body $payload -Headers @{ "Authorization"="Bearer scalarai-local"; "Content-Type"="application/json" } -UseBasicParsing
```
Expected: JSON-RPC error with code -32601.

Do the same for `execute_mt5_bridge_order`, `call_mt5_function`, etc.

#### c) Test Error Handling
- Call a tool with missing required parameters and verify you get `-32602` (invalid params).
- Call with invalid types and verify appropriate error.

### 4. Performance and Discovery
- Call `tools/list` via MCP and verify that the new names appear and old names are absent.
- Ensure the response time is reasonable.

### 5. Acceptance Criteria
- [ ] All existing tests pass (after updating test tool names).
- [ ] All new friendly tool names return correct data or bridge-appropriate errors.
- [ ] Old tool names return `-32601` method not found.
- [ ] Error handling is consistent and JSON-RPC 2.0 compliant.
- [ ] The MCP server starts without errors.
- [ ] No modifications to bridge files.

## Output
Record test results in `test_results.md` under the same directory.
