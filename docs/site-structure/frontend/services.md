# Frontend Services

> Detailed reference for service modules in `frontend/src/services/`.

## `api.ts` — ApiClient Class

```ts
class ApiClient {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T>
}
```

**Methods:**

| Method | Endpoint | HTTP | Description |
|--------|----------|------|-------------|
| `getStatus()` | `/api/status` | GET | Full server status |
| `getAiStudyFeed()` | `/api/ai-study-feed` | GET | AI knowledge base and strategy |
| `updateSettings(params)` | `/api/settings` | POST | Update trade config |
| `toggleTrade(isActive)` | `/api/toggle-trade` | POST | Toggle trading |
| `resetStats()` | `/api/reset-stats` | POST | Reset stats |
| `testWebRequest()` | `/api/test-webrequest/trigger` | POST | Trigger WebRequest test |
| `getWebRequestStatus()` | `/api/test-webrequest/status` | GET | Get WebRequest test status |
| `getGithubStatus()` | `/api/github-status` | GET | Get GitHub status |
| `syncFromGithub()` | `/api/sync-from-github` | POST | Sync from GitHub |
| `logoutGithub()` | `/api/auth/github/logout` | POST | GitHub logout |

**Behavior:**
- All requests prefixed with `/api`
- Sets `Content-Type: application/json` by default
- Throws on non-OK responses with parsed error message
- Returns `{}` for 204 responses

## `ws.ts` — WebSocketClient Class

```ts
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: any = null;
  private pingInterval: any = null;
  private handlers: MessageHandler[] = [];
  private isIntentionallyClosed = false;
}
```

**Methods:**

| Method | Description |
|--------|-------------|
| `connect(url, onOpen?, onClose?)` | Establishes WebSocket connection |
| `onMessage(handler)` | Registers message handler |
| `send(message)` | Sends JSON message if connected |
| `disconnect()` | Gracefully disconnects |
| `isConnected()` | Returns connection status |

**Behavior:**
- Auto-reconnects with 2500ms delay on unexpected close
- Ping/pong every 15 seconds
- Handlers receive parsed JSON messages
- `disconnect()` stops reconnection, clears intervals

**Note:** `frontend/src/hooks/useWebSocket.ts` is the primary WebSocket client used by `App.tsx`. `services/ws.ts` provides a lower-level alternative.
