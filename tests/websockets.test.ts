import { describe, it, expect } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { createDashboardServer } from "../backend/src/websockets/dashboard";

describe("Dashboard WebSocket", () => {
  it("sends init message on connection", async () => {
    const server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.listen(() => resolve()));

    const sendInit = () => JSON.stringify({ type: "init", payload: {} });
    createDashboardServer(server as any, sendInit, () => {});

    const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as any).port}/ws/live`);
    const messages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {});
      ws.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
        resolve();
      });
      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 2000);
    });

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].type).toBe("init");

    ws.close();
    server.close();
  });
});
