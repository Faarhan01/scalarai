# Security Notes

## Context
These are security findings from the 2026-10-07 code review. The app is used locally, so these are not blocking for current usage, but they must be resolved before any remote or multi-user deployment.

## Findings

### 1. WebSocket CSWSH (Cross-Site WebSocket Hijacking)
- **Files:**
  - `backend/src/websockets/dashboard.ts:17`
  - `backend/src/websockets/bridge.ts:16`
- **Issue:** Neither WebSocket upgrade handler validates the `Origin` header. An attacker on a malicious site can open a WebSocket connection and issue state-changing commands (`close_all`, `toggle_trade`, `reset_stats`) and pull market history via `request_history`.
- **Impact:** Complete trading control and data exfiltration from any browser that visits a malicious page while the app is open.
- **Fix direction:** Compare `request.headers.origin` against an allowlist in both upgrade handlers and reject mismatched origins before calling `handleUpgrade`.

### 2. CORS Misconfiguration
- **File:** `backend/src/middleware/cors.ts:4-8`
- **Issue:** The CORS middleware reflects any incoming `Origin` header verbatim (`Access-Control-Allow-Origin: <origin>`) and sets `Access-Control-Allow-Credentials: true`. This is the most permissive possible CORS policy.
- **Impact:** Any origin can make authenticated cross-origin requests, defeating same-origin protections.
- **Fix direction:** Replace dynamic origin reflection with a strict allowlist of trusted origins. Remove `Access-Control-Allow-Credentials: true` unless absolutely required.

### 3. Unhandled JSON.parse on Database Data (Denial of Service)
- **Files:**
  - `backend/src/routes/market.ts:132-133`
  - `backend/src/mcp_server.ts:789`
- **Issue:** `JSON.parse()` is called on `tags` and `metadata` columns read from the database with no error handling. A single malformed or corrupted row will throw an unhandled exception and crash the Node.js process.
- **Impact:** Remote attacker who can influence database contents (e.g., via `/api/update-market` if validation is bypassed) can achieve denial of service.
- **Fix direction:** Wrap both `JSON.parse` calls in `try-catch` and return safe defaults (`[]` / `{}`) on parse failure.

---

*Generated from review: `2026-10-07`*
