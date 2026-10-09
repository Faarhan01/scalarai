import { useEffect, useCallback, useState } from "react";

export interface NetworkStatus {
  isInternetOnline: boolean;
  wsConnected: boolean;
  latency: number;
  pingLatency: number | null;
}

export function useNetworkStatus() {
  const [isInternetOnline, setIsInternetOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [latency, setLatency] = useState<number>(12);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => setIsInternetOnline(true);
    const handleOffline = () => setIsInternetOnline(false);
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, []);

  const updatePing = useCallback((ms: number) => {
    setPingLatency(ms);
    setLatency(ms);
  }, []);

  return {
    isInternetOnline,
    setWsConnected,
    latency,
    pingLatency,
    updatePing,
  };
}
