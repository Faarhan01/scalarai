import { useCallback, useEffect } from "react";

export interface StatusSyncOptions {
  onStatus: (data: any) => void;
  onInit?: (data: any) => void;
}

export function useAppStatus(options: StatusSyncOptions) {
  const { onStatus, onInit } = options;

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        onStatus(data);
      }
    } catch {
      // Fallback
    }
  }, [onStatus]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return { fetchStatus };
}
