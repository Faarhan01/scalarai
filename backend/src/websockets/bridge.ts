import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";

export function createBridgeServer(
  server: Server,
  onMessage: (ws: WebSocket, rawMsg: string) => void,
  onConnect?: (ws: WebSocket) => void,
  onClose?: (ws: WebSocket) => void
) {
  const wssBridge = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: import("http").IncomingMessage, socket: import("net").Socket, head: Buffer) => {
    try {
      const urlObj = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
      if (urlObj.pathname === "/mt5-bridge") {
        wssBridge.handleUpgrade(request, socket, head, (ws: WebSocket) => {
          wssBridge.emit("connection", ws, request);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  wssBridge.on("connection", (ws: WebSocket) => {
    if (onConnect) {
      onConnect(ws);
    }
    const pingInterval = setInterval(() => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 15000);

    ws.on("message", (rawMsg: string) => {
      onMessage(ws, rawMsg);
    });

    ws.on("close", () => {
      clearInterval(pingInterval);
      if (onClose) {
        onClose(ws);
      }
    });

    ws.on("error", () => {
      clearInterval(pingInterval);
      if (onClose) {
        onClose(ws);
      }
    });
  });

  return wssBridge;
}
