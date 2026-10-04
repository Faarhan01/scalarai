import { WebSocketServer, WebSocket } from "ws";

export function createDashboardServer(server: any, sendInit: () => string, onMessage: (ws: WebSocket, rawMsg: string) => void) {
  const wssDashboard = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: any, socket: any, head: Buffer) => {
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
    try {
      ws.send(sendInit());
    } catch {}

    ws.on("message", (rawMsg: string) => {
      onMessage(ws, rawMsg);
    });

    ws.on("close", () => {});
    ws.on("error", () => {});
  });

  return wssDashboard;
}
