import React from "react";
import { Copy, Check } from "lucide-react";
import { StrategyMode } from "../../types";

export interface WebRequestTestProps {
  webRequestStatus: {
    status: string;
    lastTested: string;
    error: string;
    details: string;
  } | null;
  paramInput: {
    appEndpoint: string;
  };
  copiedUrl: boolean;
  isVerifyingWebRequest: boolean;
  suggestedUrl: string;
  getAppBaseUrl: () => string;
  onTriggerWebRequestTest: () => void;
  onSetParamInput: (input: { appEndpoint: string }) => void;
  onApplySettings: (strategyOverride?: StrategyMode, mt5PathOverride?: string, appEndpointOverride?: string, tradingModeOverride?: "Scalping" | "Swing", selectedAssetsOverride?: string[], isAiModeEnabledOverride?: boolean) => void;
  onCopyUrl: () => void;
  onSetCopiedUrl: (val: boolean) => void;
  onSetSuggestedUrl: (url: string) => void;
}

export const WebRequestTest: React.FC<WebRequestTestProps> = ({
  webRequestStatus,
  paramInput,
  copiedUrl,
  isVerifyingWebRequest,
  suggestedUrl,
  getAppBaseUrl,
  onTriggerWebRequestTest,
  onSetParamInput,
  onApplySettings,
  onCopyUrl,
  onSetCopiedUrl,
  onSetSuggestedUrl,
}) => {
  return (
    <div className="mt-4 pt-4 border-t border-slate-700/60 space-y-3">
      <div className="flex items-center gap-1.5 justify-between">
        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
          MT5 WebRequest Permission
        </span>
        {webRequestStatus ? (
          <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
            webRequestStatus.status === "success"
              ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
              : webRequestStatus.status === "failed"
              ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
              : webRequestStatus.status === "pending"
              ? "text-amber-400 border-amber-500/30 bg-amber-500/10 animate-pulse"
              : "text-slate-400 border-slate-700 bg-slate-900"
          }`}>
            {webRequestStatus.status === "success" && "● WORKING"}
            {webRequestStatus.status === "failed" && "● FAILED"}
            {webRequestStatus.status === "pending" && "● TESTING..."}
            {webRequestStatus.status === "idle" && "● NOT TESTED"}
          </span>
        ) : (
          <span className="text-[9px] font-bold text-slate-400 border border-slate-700 px-2 py-0.5 rounded bg-slate-900 uppercase">
            ● UNKNOWN
          </span>
        )}
      </div>

      <div className="bg-slate-900/90 border border-slate-700/70 rounded-xl p-3.5 space-y-2.5 font-mono">
        <div className="text-[10px] text-slate-300 font-sans leading-relaxed">
          MetaTrader 5 requires adding the allowed WebRequest URL so our Expert Advisor can synchronize ticks & execute trades. Configure and save the MT5 WebRequest link below, then add it inside MT5:
        </div>
        <div className="space-y-2 font-sans text-left">
          <div className="flex gap-1.5">
            <input
              type="text"
              value={paramInput.appEndpoint}
              onChange={(e) => {
                onSetParamInput({ appEndpoint: e.target.value });
                onSetSuggestedUrl("");
              }}
              placeholder={`e.g. ${getAppBaseUrl()}`}
              className="flex-1 bg-slate-850 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-indigo-400 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(paramInput.appEndpoint);
                onSetCopiedUrl(true);
                setTimeout(() => onSetCopiedUrl(false), 2000);
              }}
              className="text-[10px] bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-200 font-bold uppercase px-2.5 py-1.5 rounded transition-all cursor-pointer whitespace-nowrap"
            >
              {copiedUrl ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => onApplySettings(undefined, undefined, paramInput.appEndpoint)}
              className="text-[10px] bg-indigo-600 hover:bg-indigo-550 text-white font-bold uppercase px-3 py-1.5 rounded transition-all cursor-pointer whitespace-nowrap shadow-sm"
            >
              Save
            </button>
          </div>
          <div className="flex gap-2 text-[10px]">
            <button
              type="button"
              onClick={() => {
                onSetParamInput({ appEndpoint: "http://127.0.0.1:3000" });
                onApplySettings(undefined, undefined, "http://127.0.0.1:3000");
              }}
              className="text-slate-400 hover:text-slate-200 underline decoration-dotted transition-colors cursor-pointer"
            >
              Reset to localhost default (127.0.0.1)
            </button>
            <span className="text-slate-600 select-none">|</span>
            <button
              type="button"
              onClick={() => {
                const detected = window.location.origin;
                onSetParamInput({ appEndpoint: detected });
                onApplySettings(undefined, undefined, detected);
              }}
              className="text-slate-400 hover:text-slate-200 underline decoration-dotted transition-colors cursor-pointer"
            >
              Detect live web app origin
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={isVerifyingWebRequest}
        onClick={onTriggerWebRequestTest}
        className={`w-full py-2 border rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
          isVerifyingWebRequest
            ? "bg-slate-900 border-slate-700 text-slate-400 cursor-not-allowed"
            : "bg-slate-800 hover:bg-slate-750 border-indigo-500/30 hover:border-indigo-500/50 text-indigo-300 shadow-sm"
        }`}
      >
        {isVerifyingWebRequest ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
            <span>Testing WebRequest Link...</span>
          </>
        ) : (
          <span>Test MT5 WebRequest Link</span>
        )}
      </button>

      {webRequestStatus && webRequestStatus.details && (
        <div className="text-[10px] text-slate-300 bg-slate-900 p-2.5 rounded-lg border border-slate-700/60 leading-relaxed font-sans">
          <span className="font-semibold text-slate-200 font-mono text-[9px] uppercase tracking-wider block mb-0.5">Test Log:</span>
          {webRequestStatus.details}
        </div>
      )}
    </div>
  );
};
