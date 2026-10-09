import { describe, it, expect } from "vitest";
import { WebSocket } from "ws";
import { createServer } from "http";
import { createDashboardServer } from "../backend/src/websockets/dashboard";

describe("Dashboard WebSocket", () => {
  it("sends init message on connection", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = (server.address() as any).port;

    const sendInit = () => JSON.stringify({ type: "init", payload: { activeSymbol: "Step Index" } });
    createDashboardServer(server, sendInit, () => {});

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/live`);
    const messages: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {});
      ws.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
        resolve();
      });
      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout waiting for init message")), 2000);
    });

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].type).toBe("init");
    expect(messages[0].payload.activeSymbol).toBe("Step Index");

    ws.close();
    server.close();
  });
});
