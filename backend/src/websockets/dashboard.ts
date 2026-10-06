import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";

export function createDashboardServer(
  server: Server,
  sendInit: () => string,
  onMessage: (ws: WebSocket, rawMsg: string) => void,
  onConnect?: (ws: WebSocket) => void,
  onClose?: (ws: WebSocket) => void
) {
  const wssDashboard = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: import("http").IncomingMessage, socket: import("net").Socket, head: Buffer) => {
    try {
      const urlObj = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
      if (urlObj.pathname === "/ws/live" || urlObj.pathname === "/ws" || urlObj.pathname === "/live-feed") {
        wssDashboard.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          wssDashboard.emit("connection", ws, request);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  wssDashboard.on("connection", (ws: WebSocket) => {
    if (onConnect) {
      onConnect(ws);
    }
    try {
      ws.send(sendInit());
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`Dashboard init broadcast failed: ${reason}`);
    }

    ws.on("message", (rawMsg: string) => {
      onMessage(ws, rawMsg);
    });

    ws.on("close", () => {
      if (onClose) {
        onClose(ws);
      }
    });
    ws.on("error", () => {
      if (onClose) {
        onClose(ws);
      }
    });
  });

  return wssDashboard;
}
