import { useCallback } from "react";

export interface TradingControls {
  toggleTradingExecution: (sendWsMessage: (msg: any) => boolean, config: any, fetchStatus: () => void) => Promise<void>;
  closeAllPositions: (sendWsMessage: (msg: any) => boolean, fetchStatus: () => void) => Promise<void>;
  resetStats: (sendWsMessage: (msg: any) => boolean, fetchStatus: () => void) => Promise<void>;
}

export function useTradingControls(): TradingControls {
  const toggleTradingExecution = useCallback(async (sendWsMessage: (msg: any) => boolean, config: any, fetchStatus: () => void) => {
    const targetState = !config.isActive;
    const sent = sendWsMessage({ type: "toggle_trade" });
    if (!sent) {
      try {
        const response = await fetch("/api/toggle-trade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: targetState }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data && data.config) {
            // config update handled by caller
          }
        }
      } catch (e) {
        console.error("Error attempting to toggle remote executor state", e);
      }
    }
  }, []);

  const closeAllPositions = useCallback(async (sendWsMessage: (msg: any) => boolean, fetchStatus: () => void) => {
    const sent = sendWsMessage({ type: "close_all" });
    if (!sent) {
      try {
        await fetch("/api/reset-stats", { method: "POST" });
        fetchStatus();
      } catch (e) {
        console.error("Error closing positions:", e);
      }
    }
  }, []);

  const resetStats = useCallback(async (sendWsMessage: (msg: any) => boolean, fetchStatus: () => void) => {
    const sent = sendWsMessage({ type: "reset_stats" });
    if (!sent) {
      try {
        await fetch("/api/reset-stats", { method: "POST" });
        fetchStatus();
      } catch (e) {
        console.error("Failed to reset metrics:", e);
      }
    }
  }, []);

  return { toggleTradingExecution, closeAllPositions, resetStats };
}
