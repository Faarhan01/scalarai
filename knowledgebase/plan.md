# Step Index EA — Kilo Integration Plan

## 1. Goal

Enable Kilo to observe, analyze, and control the locally running Step Index EA stack
with minimal friction and no mandatory infrastructure changes.

## 2. Current State

The project already exposes a rich HTTP API on `http://localhost:3000`:

- `GET  /api/status` — full server state, trades, logs, config, connection info
- `GET  /api/ai-study-feed` — AI knowledge base, synthesized strategy, telemetry stream
- `POST /api/settings` — update strategy, lot size, TP/SL, trading mode, AI toggle
- `POST /api/toggle-trade` — start/stop automated execution
- `POST /api/reset-stats` — clear trade history
- `POST /api/gemini/analyze` — trigger AI analysis report
- `POST /api/gemini/meta-analysis` — trigger meta-analysis summary
- `POST /api/gemini/synthesize-strategy` — synthesize new AI strategy rules
- `GET  /api/ea/download` — download generated MQ5 EA file
- `GET  /api/ea/template` — download MT5 chart template
- `POST /api/ea/tick` — EA heartbeat / tick endpoint
- `POST /api/update-market` — live market telemetry stream
- `GET  /poll` / `/get-pending-trades` / `/api/get-pending-trades` — bridge polling
- `GET  /api/github-status` — GitHub OAuth connection status
- `POST /api/sync-from-github` — pull workspace updates from GitHub
- WebSocket `/mt5-bridge` — real-time bridge signaling

Kilo can already execute shell commands against these endpoints.
The missing piece is a structured event stream so Kilo can react to changes
instead of only polling on demand.

## 3. Recommended Architecture

### 3.1 Monitoring Daemon (background process)

A lightweight TypeScript process (`monitor.ts`) that:

1. Polls `/api/status` and `/api/ai-study-feed` every 2–5 seconds
2. Detects state changes by comparing snapshots
3. Appends structured JSONL events to a local log file:
   - `trade_opened`, `trade_closed`
   - `ea_connected`, `ea_disconnected`
   - `ai_mode_toggled`, `strategy_changed`
   - `ai_synthesized`, `knowledge_updated`
   - `error`, `warning`
4. Rotates the log when it exceeds a configurable size
5. Writes a compact current-state file for fast reads

Event stream location: `C:\Users\faarh\AppData\Local\Temp\kilo\ea_events.jsonl`

### 3.2 Direct API Interaction

Kilo interacts with the running server directly via its shell tools:

- **Read state**: `Invoke-RestMethod http://localhost:3000/api/status`
- **Trigger AI**: `Invoke-RestMethod -Method Post http://localhost:3000/api/gemini/analyze`
- **Modify config**: `Invoke-RestMethod -Method Post http://localhost:3000/api/settings -Body ...`
- **Start/stop**: `Invoke-RestMethod -Method Post http://localhost:3000/api/toggle-trade -Body ...`

No MCP server is required because:
- The REST API is already well-defined and stable
- Kilo's shell access is sufficient to call it
- Adding MCP adds build/run/debug overhead for no gain in this local scenario

### 3.3 State Files

The server already persists:
- `ai_knowledge_profile.json` — long-term market velocity knowledge base
- `ai_synthesized_strategy.json` — current AI strategy rules and rationale

Kilo can read these directly at any time for offline strategy analysis.

## 4. Implementation Steps

### Step 1 — Create `src/monitor.ts`

```typescript
// Polls server APIs, diffs state, writes JSONL event stream.
// Run with: npx tsx src/monitor.ts
```

Key behaviors:
- Load previous snapshot from `ea_snapshot.json` (or start fresh)
- Poll `/api/status` and `/api/ai-study-feed`
- Diff against previous snapshot
- Append new events to `ea_events.jsonl`
- Write current snapshot to `ea_snapshot.json`
- Log to console for visibility
- Handle server-down gracefully (back off and retry)

### Step 2 — Create `src/types.ts` additions (if needed)

Monitor-specific event types:
```typescript
type MonitorEvent =
  | { type: "trade_opened"; trade: TradeRecord; timestamp: number }
  | { type: "trade_closed"; trade: TradeRecord; timestamp: number }
  | { type: "ea_connected"; ip: string; timestamp: number }
  | { type: "ea_disconnected"; timestamp: number }
  | { type: "ai_mode_toggled"; enabled: boolean; timestamp: number }
  | { type: "strategy_changed"; strategy: StrategyMode; timestamp: number }
  | { type: "ai_synthesized"; strategy: AiSynthesizedStrategy; timestamp: number }
  | { type: "knowledge_updated"; kb: AiKnowledgeBase; timestamp: number }
  | { type: "error"; message: string; timestamp: number };
```

### Step 3 — Wire into dev workflow

Optional: add a script to `package.json`:
```json
{ "scripts": { "monitor": "tsx src/monitor.ts" } }
```

Run alongside the server:
```powershell
# Terminal 1
npm run dev

# Terminal 2
npm run monitor
```

Or as a background process managed by Kilo.

### Step 4 — Kilo read loop

Kilo reads `ea_events.jsonl` incrementally:
- Use `Get-Content -Wait` equivalent in PowerShell
- Or read the file on demand with offset tracking
- Parse each line as JSON and act on the event type

### Step 5 — Analysis and action

With the event stream and direct API access, Kilo can:

- **Analyze**: read `ai_knowledge_profile.json` + `ai_synthesized_strategy.json`
- **Improve strategy**: POST `/api/gemini/synthesize-strategy`
- **Modify settings**: POST `/api/settings` with new TP/SL/lot/mode
- **Control execution**: POST `/api/toggle-trade`
- **Review trades**: read trades array from `/api/status`
- **Audit logs**: read logs array from `/api/status`

## 5. Security Considerations

- All API calls are localhost-only by default
- The EA server binds to `0.0.0.0:3000`; if exposed externally, add authentication
- GitHub OAuth tokens are stored in server memory only; not persisted to disk
- The monitoring daemon writes to `%TEMP%`, which is user-writable only
- No secrets are logged to the event stream

## 6. Future: MCP Option (if needed later)

If the project is later deployed to a remote server where shell access is unavailable,
an MCP server could be created to wrap the existing REST API:

- Tools: `ea_status`, `ea_settings_update`, `ea_toggle_trade`, `ea_analyze`, `ea_synthesize`
- Resources: `ea_knowledge_base`, `ea_strategy`, `ea_logs`
- Prompts: none required

This would be a separate project (`mcp-ea-server/`) using the official MCP SDK.
It is **not** needed for the current local development scenario.

## 7. Decision

**Build `src/monitor.ts` and use direct API calls.**
Defer MCP until remote access is required.
