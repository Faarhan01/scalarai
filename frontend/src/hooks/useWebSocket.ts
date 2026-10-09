import { useEffect, useRef, useCallback } from "react";

export function useWebSocket(options: {
  onInit: (data: Record<string, any>) => void;
  onTick: (data: Record<string, any>) => void;
  onTrades: (data: Record<string, any>) => void;
  onLog: (log: Record<string, any>) => void;
  onConfig: (config: Record<string, any>) => void;
  onConnection: (data: Record<string, any>) => void;
  onWebRequestTest: (testState: Record<string, any>) => void;
  onAiStrategy: (strategy: Record<string, any>) => void;
  onFetchStrategies: () => void;
  onPong?: (pingLatency: number) => void;
  onStatusChange?: (connected: boolean) => void;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectedRef = useRef(false);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const isUnmountedRef = useRef(false);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  const sendWsMessage = useCallback((msg: Record<string, any>): boolean => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(msg));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  useEffect(() => {
    isUnmountedRef.current = false;

    function connectWs() {
      if (isUnmountedRef.current) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/live`;

      try {
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          if (isUnmountedRef.current) return;
          wsConnectedRef.current = true;
          optionsRef.current.onStatusChange?.(true);
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: "ping", clientTime: Date.now() }));
            }
          }, 8000);
        };

        socket.onmessage = (event) => {
          if (isUnmountedRef.current) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "pong" && msg.clientTime) {
              const rtt = Math.max(1, Date.now() - msg.clientTime);
              optionsRef.current.onPong?.(rtt);
            } else if (msg.type === "init" && msg.payload) {
              optionsRef.current.onInit(msg.payload);
            } else if (msg.type === "tick") {
              optionsRef.current.onTick(msg);
            } else if (msg.type === "trades") {
              optionsRef.current.onTrades(msg);
            } else if (msg.type === "log" && msg.log) {
              optionsRef.current.onLog(msg.log);
            } else if (msg.type === "config" && msg.config) {
              optionsRef.current.onConfig(msg.config);
            } else if (msg.type === "connection") {
              optionsRef.current.onConnection(msg);
            } else if (msg.type === "webrequest_test" && msg.testState) {
              optionsRef.current.onWebRequestTest(msg.testState);
            } else if (msg.type === "ai_strategy" && msg.aiSynthesizedStrategy) {
              optionsRef.current.onAiStrategy(msg.aiSynthesizedStrategy);
              optionsRef.current.onFetchStrategies?.();
            }
          } catch {
            // ignore parse errors
          }
        };

        socket.onclose = () => {
          if (isUnmountedRef.current) return;
          wsConnectedRef.current = false;
          optionsRef.current.onStatusChange?.(false);
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          reconnectTimeoutRef.current = window.setTimeout(connectWs, 2500);
        };

        socket.onerror = () => {
          try {
            socket.close();
          } catch {
            // ignore
          }
        };
      } catch {
        reconnectTimeoutRef.current = window.setTimeout(connectWs, 3000);
      }
    }

    connectWs();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return { wsRef, wsConnectedRef, sendWsMessage };
}
