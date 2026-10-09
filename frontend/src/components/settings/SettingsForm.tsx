import React from "react";
import { Settings, CheckCircle2 } from "lucide-react";
import type { TradeConfig } from "../../types";
import { WebRequestTest } from "./WebRequestTest";

export interface SettingsFormProps {
  config: TradeConfig;
  paramInput: {
    mt5Path: string;
    appEndpoint: string;
    isAiModeEnabled: boolean;
  };
  saveSuccess: boolean;
  webRequestStatus: any;
  isVerifyingWebRequest: boolean;
  copiedUrl: boolean;
  getAppBaseUrl: () => string;
  onApplySettings: () => void;
  onSetParamInput: (input: Partial<SettingsFormProps["paramInput"]>) => void;
  onTriggerWebRequestTest: () => void;
  onSetCopiedUrl: (val: boolean) => void;
}

export const SettingsForm: React.FC<SettingsFormProps> = ({
  config,
  paramInput,
  saveSuccess,
  webRequestStatus,
  isVerifyingWebRequest,
  copiedUrl,
  getAppBaseUrl,
  onApplySettings,
  onSetParamInput,
  onTriggerWebRequestTest,
  onSetCopiedUrl,
}) => {
  return (
    <div className="max-w-2xl mx-auto w-full animate-fade-in">
      {/* System Settings Panel */}
      <div className="card-panel flex flex-col">
        <div className="card-panel-header">
          <div className="card-panel-title">
            <Settings className="w-4 h-4 text-indigo-400" />
            <span>System Settings</span>
          </div>
          {saveSuccess && (
            <span className="badge badge-success flex items-center gap-1 animate-pulse">
              <CheckCircle2 className="w-2.5 h-2.5" /> Updated
            </span>
          )}
        </div>

        <div className="space-y-4">
          {/* MT5 File Path Input */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider font-mono">
                MT5 terminal64.exe Path
              </label>
              <span className="text-[9px] text-indigo-400 border border-indigo-400/20 px-1.5 py-0.5 rounded bg-indigo-500/10 font-mono">
                Auto-detected if empty
              </span>
            </div>
            <input
              type="text"
              placeholder="e.g. C:\Program Files\Deriv MT5\terminal64.exe"
              value={paramInput.mt5Path}
              onChange={(e) => onSetParamInput({ mt5Path: e.target.value })}
              className="input-control"
            />
            <p className="text-[10px] text-slate-400 leading-normal">
              Leave blank to run smart auto-detection scanning the Program Files directory for foldernames containing 'Deriv' or 'MetaTrader'.
            </p>
          </div>

          {/* App Link/Server Endpoint */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider font-mono">
                App Link / Server Endpoint
              </label>
              <button
                type="button"
                onClick={() => {
                  const detected = window.location.origin;
                  onSetParamInput({ appEndpoint: detected });
                }}
                className="text-[9px] text-indigo-400 hover:text-indigo-300 font-bold uppercase transition-colors cursor-pointer"
              >
                [Use Current Origin]
              </button>
            </div>
            <input
              type="text"
              placeholder={`e.g. ${window.location.origin}`}
              value={paramInput.appEndpoint}
              onChange={(e) => onSetParamInput({ appEndpoint: e.target.value })}
              className="input-control"
            />
            <p className="text-[10px] text-slate-400 leading-normal">
              Used by mt5_bridge.js to poll for signals. Automatically detects window origin, but can be manually overridden.
            </p>
          </div>

          {/* AI Core Execution Mode Toggle */}
          <div className="p-4 bg-slate-900/90 border border-slate-700/70 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-slate-200">
                  AI Core Execution Mode
                </span>
                <span className="text-[10px] text-slate-400">
                  Mandatory verification under complex velocity profiles
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextVal = !paramInput.isAiModeEnabled;
                  onSetParamInput({ isAiModeEnabled: nextVal });
                  onApplySettings();
                }}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  paramInput.isAiModeEnabled ? "bg-emerald-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    paramInput.isAiModeEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <p className="text-[10px] text-slate-400 leading-normal text-left">
              When <strong>ON</strong>, the AI Adaptive strategy uses velocity and acceleration signals.
            </p>
          </div>

          {/* Save Settings Trigger Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={onApplySettings}
              className="btn btn-primary w-full py-2.5"
            >
              Save System Settings
            </button>
          </div>

          {/* WebRequest Verification System Section */}
          <WebRequestTest
            webRequestStatus={webRequestStatus}
            paramInput={{ appEndpoint: paramInput.appEndpoint }}
            copiedUrl={copiedUrl}
            isVerifyingWebRequest={isVerifyingWebRequest}
            suggestedUrl={""}
            getAppBaseUrl={getAppBaseUrl}
            onTriggerWebRequestTest={onTriggerWebRequestTest}
            onSetParamInput={(input) => onSetParamInput(input)}
            onApplySettings={onApplySettings}
            onCopyUrl={() => {
              navigator.clipboard.writeText(paramInput.appEndpoint);
              onSetCopiedUrl(true);
              setTimeout(() => onSetCopiedUrl(false), 2000);
            }}
            onSetCopiedUrl={onSetCopiedUrl}
            onSetSuggestedUrl={() => {}}
          />
        </div>
      </div>
    </div>
  );
};
