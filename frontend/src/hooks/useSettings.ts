import { useEffect, useCallback, useState, useMemo } from "react";
import type { StrategyMode, TradeConfig } from "../types";

export interface SettingsState {
  paramInput: {
    lotSize: string;
    takeProfitPoints: string;
    stopLossPoints: string;
    trailingStopPoints: string;
    maxTrades: string;
    useTrailingStop: boolean;
    mt5Path: string;
    appEndpoint: string;
    tradingMode: "Scalping" | "Swing";
    selectedAssets: string[];
    isAiModeEnabled: boolean;
  };
  saveSuccess: boolean;
  copiedUrl: boolean;
  webRequestStatus: {
    status: string;
    lastTested: string;
    error: string;
    details: string;
  } | null;
  isVerifyingWebRequest: boolean;
  setWebRequestStatus: (value: SettingsState["webRequestStatus"]) => void;
}

export interface SettingsActions {
  applySettings: (
    fetchStatus: () => void,
    overrides?: {
      strategyOverride?: StrategyMode;
      mt5PathOverride?: string;
      appEndpointOverride?: string;
      tradingModeOverride?: "Scalping" | "Swing";
      selectedAssetsOverride?: string[];
      isAiModeEnabledOverride?: boolean;
    }
  ) => Promise<void>;
  triggerWebRequestTest: () => void;
  setCopiedUrl: (value: boolean) => void;
}

export interface SettingsOptions extends SettingsActions {
  onParamInputChange: (patch: Partial<SettingsState["paramInput"]>) => void;
  getAppBaseUrl: () => string;
}

export function useSettings(config: TradeConfig): SettingsState & SettingsOptions {
  const [paramInput, setParamInput] = useState<SettingsState["paramInput"]>({
    lotSize: "0.1",
    takeProfitPoints: "300",
    stopLossPoints: "150",
    trailingStopPoints: "100",
    maxTrades: "3",
    useTrailingStop: true,
    mt5Path: "",
    appEndpoint: "http://127.0.0.1:3000",
    tradingMode: "Scalping",
    selectedAssets: ["Step Index"],
    isAiModeEnabled: false,
  });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [webRequestStatus, setWebRequestStatus] = useState<SettingsState["webRequestStatus"]>(null);
  const [isVerifyingWebRequest, setIsVerifyingWebRequest] = useState(false);

  useEffect(() => {
    const savedEndpoint = typeof window !== "undefined" ? localStorage.getItem("mt5_webrequest_endpoint") || "" : "";
    setParamInput({
      lotSize: String(config.lotSize ?? 0.1),
      takeProfitPoints: String(config.takeProfitPoints ?? 300),
      stopLossPoints: String(config.stopLossPoints ?? 150),
      trailingStopPoints: String(config.trailingStopPoints ?? 100),
      maxTrades: String(config.maxTrades ?? 3),
      useTrailingStop: config.useTrailingStop ?? true,
      mt5Path: config.mt5Path || "",
      appEndpoint: config.appEndpoint || savedEndpoint || "http://127.0.0.1:3000",
      tradingMode: config.tradingMode || "Scalping",
      selectedAssets: config.selectedAssets || ["Step Index"],
      isAiModeEnabled: !!config.isAiModeEnabled,
    });
  }, [config]);

  const getAppBaseUrl = useCallback(() => {
    let origin = window.location.origin;
    if (origin.includes("ais-dev-")) {
      origin = origin.replace("ais-dev-", "ais-pre-");
    }
    return origin;
  }, []);

  const applySettings = useCallback(
    async (
      fetchStatus: () => void,
      overrides?: {
        strategyOverride?: StrategyMode;
        mt5PathOverride?: string;
        appEndpointOverride?: string;
        tradingModeOverride?: "Scalping" | "Swing";
        selectedAssetsOverride?: string[];
        isAiModeEnabledOverride?: boolean;
      }
    ) => {
      const finalEndpoint =
        overrides?.appEndpointOverride !== undefined
          ? overrides.appEndpointOverride
          : paramInput.appEndpoint || "http://127.0.0.1:3000";

      if (finalEndpoint) {
        try {
          localStorage.setItem("mt5_webrequest_endpoint", finalEndpoint);
        } catch (err) {
          console.warn("Failed to save endpoint to localStorage:", err);
        }
      }

      try {
        const lotSize = Math.max(0.01, Math.min(100, parseFloat(paramInput.lotSize) || 0.1));
        const takeProfitPoints = Math.max(1, Math.min(10000, parseInt(paramInput.takeProfitPoints) || 300));
        const stopLossPoints = Math.max(1, Math.min(10000, parseInt(paramInput.stopLossPoints) || 150));
        const trailingStopPoints = Math.max(0, Math.min(5000, parseInt(paramInput.trailingStopPoints) || 100));
        const maxTrades = Math.max(1, Math.min(20, parseInt(paramInput.maxTrades) || 3));

        const response = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedStrategy: overrides?.strategyOverride || config.selectedStrategy,
            lotSize,
            takeProfitPoints,
            stopLossPoints,
            trailingStopPoints,
            useTrailingStop: paramInput.useTrailingStop,
            maxTrades,
            mt5Path: overrides?.mt5PathOverride !== undefined ? overrides.mt5PathOverride : paramInput.mt5Path,
            appEndpoint: finalEndpoint,
            tradingMode: overrides?.tradingModeOverride || paramInput.tradingMode,
            selectedAssets: overrides?.selectedAssetsOverride || paramInput.selectedAssets,
            isAiModeEnabled: overrides?.isAiModeEnabledOverride ?? paramInput.isAiModeEnabled,
          }),
        });

        if (response.ok) {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 2500);
          fetchStatus();
        }
      } catch (e) {
        console.error("Failed to commit settings updates to backend.", e);
      }
    },
    [config, paramInput]
  );

  const triggerWebRequestTest = useCallback(async () => {
    setIsVerifyingWebRequest(true);
    try {
      const response = await fetch("/api/test-webrequest/trigger", { method: "POST" });
      if (response.ok) {
        const data = await response.json();
        if (data && data.testState) {
          setWebRequestStatus(data.testState);
        }
      }

      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await fetch("/api/test-webrequest/status");
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData && statusData.testState) {
              setWebRequestStatus(statusData.testState);
              if (statusData.testState.status !== "pending" || attempts > 15) {
                clearInterval(interval);
                setIsVerifyingWebRequest(false);
              }
            }
          }
        } catch {
          clearInterval(interval);
          setIsVerifyingWebRequest(false);
        }
      }, 1000);
    } catch {
      setIsVerifyingWebRequest(false);
    }
  }, []);

  const onParamInputChange = useCallback((patch: Partial<SettingsState["paramInput"]>) => {
    setParamInput((prev) => ({ ...prev, ...patch }));
  }, []);

  return useMemo(
    () => ({
      paramInput,
      saveSuccess,
      copiedUrl,
      webRequestStatus,
      isVerifyingWebRequest,
      setWebRequestStatus,
      applySettings,
      triggerWebRequestTest,
      setCopiedUrl,
      onParamInputChange,
      getAppBaseUrl,
    }),
    [
      paramInput,
      saveSuccess,
      copiedUrl,
      webRequestStatus,
      isVerifyingWebRequest,
      setWebRequestStatus,
      applySettings,
      triggerWebRequestTest,
      setCopiedUrl,
      onParamInputChange,
      getAppBaseUrl,
    ]
  );
}
