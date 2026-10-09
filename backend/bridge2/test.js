/**
 * ScalarAI Bridge 2 - Test Suite
 * Tests MCP JSON-RPC 2.0 tool execution and MT5 client functions.
 */
import { MT5Client } from "./mt5_client.js";
import { SiteClient } from "./site_client.js";
import { MCP_TOOLS, executeToolCall } from "./tools.js";

async function runTests() {
  console.log("🧪 Starting ScalarAI Bridge 2 Test Suite...\n");

  const mt5Client = new MT5Client({ defaultSymbol: "Step Index" });
  const siteClient = new SiteClient({ siteUrl: "http://127.0.0.1:3000" });

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // Test 1: Tool definitions
  assert(MCP_TOOLS.length >= 10, `MCP_TOOLS catalog has ${MCP_TOOLS.length} tools`);
  const toolNames = MCP_TOOLS.map((t) => t.name);
  assert(toolNames.includes("mt5_place_trade"), "Catalog contains mt5_place_trade");
  assert(toolNames.includes("mt5_get_status"), "Catalog contains mt5_get_status");
  assert(toolNames.includes("mt5_get_positions"), "Catalog contains mt5_get_positions");

  // Test 2: mt5_get_status tool execution
  console.log("\nTesting mt5_get_status...");
  const statusRes = await executeToolCall("mt5_get_status", {}, { mt5Client, siteClient });
  assert(statusRes && statusRes.content && statusRes.content[0].text, "mt5_get_status returned content");
  const parsedStatus = JSON.parse(statusRes.content[0].text);
  assert(parsedStatus.bridgeVersion === "2.0.0", "Bridge version is 2.0.0");

  // Test 3: mt5_get_account tool execution
  console.log("\nTesting mt5_get_account...");
  const accountRes = await executeToolCall("mt5_get_account", {}, { mt5Client, siteClient });
  const parsedAccount = JSON.parse(accountRes.content[0].text);
  assert(parsedAccount.balance > 0, `Account balance is positive ($${parsedAccount.balance})`);

  // Test 4: mt5_place_trade tool execution
  console.log("\nTesting mt5_place_trade (BUY 0.2 lots)...");
  const tradeRes = await executeToolCall(
    "mt5_place_trade",
    {
      type: "BUY",
      symbol: "Step Index",
      volume: 0.2,
      sl: 150,
      tp: 300,
      reason: "Automated MCP Unit Test Execution",
    },
    { mt5Client, siteClient }
  );
  const tradeData = JSON.parse(tradeRes.content[0].text);
  assert(tradeData.status === "executed", "Trade status is executed");
  assert(tradeData.mt5 && tradeData.mt5.ticket, `MT5 position ticket created: #${tradeData.mt5?.ticket}`);
  const ticket = tradeData.mt5.ticket;

  // Test 5: mt5_get_positions
  console.log("\nTesting mt5_get_positions...");
  const posRes = await executeToolCall("mt5_get_positions", {}, { mt5Client, siteClient });
  const posData = JSON.parse(posRes.content[0].text);
  assert(posData.count >= 1, `Found ${posData.count} open position(s)`);
  const foundPos = posData.positions.find((p) => p.ticket === ticket);
  assert(!!foundPos, `Position #${ticket} found in open positions list`);

  // Test 6: mt5_modify_trade
  console.log("\nTesting mt5_modify_trade...");
  const modRes = await executeToolCall(
    "mt5_modify_trade",
    {
      ticket: String(ticket),
      sl: 200,
      tp: 500,
    },
    { mt5Client, siteClient }
  );
  const modData = JSON.parse(modRes.content[0].text);
  assert(modData.status === "modified", `Position modified (SL: 200, TP: 500)`);

  // Test 7: mt5_close_trade
  console.log("\nTesting mt5_close_trade...");
  const closeRes = await executeToolCall(
    "mt5_close_trade",
    {
      ticket: String(ticket),
    },
    { mt5Client, siteClient }
  );
  const closeData = JSON.parse(closeRes.content[0].text);
  assert(closeData.status === "closed", `Position #${ticket} closed successfully`);

  // Test 8: mt5_close_all_trades
  console.log("\nTesting mt5_close_all_trades...");
  // Place two dummy positions first
  await mt5Client.placeTrade({ type: "BUY", symbol: "Step Index", volume: 0.1 });
  await mt5Client.placeTrade({ type: "SELL", symbol: "Step Index", volume: 0.1 });
  const closeAllRes = await executeToolCall("mt5_close_all_trades", {}, { mt5Client, siteClient });
  const closeAllData = JSON.parse(closeAllRes.content[0].text);
  assert(closeAllData.status === "liquidated", "Liquidation successful");
  assert(mt5Client.getPositions().length === 0, "All open positions cleared (0 remaining)");

  console.log(`\n========================================`);
  console.log(`🏁 Test Summary: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
