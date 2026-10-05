import React from "react";
import { Layers, Sliders, CheckCircle2 } from "lucide-react";
import { StrategyMode, type TradeConfig } from "../../types";

export interface AssetSelectorProps {
  config: TradeConfig & { saveSuccess?: boolean };
  paramInput: {
    selectedAssets: string[];
    tradingMode: "Scalping" | "Swing";
    lotSize: string;
    takeProfitPoints: string;
    stopLossPoints: string;
    trailingStopPoints: string;
    maxTrades: string;
    useTrailingStop: boolean;
  };
  selectedStrategy: StrategyMode;
  onApplySettings: (strategyOverride?: StrategyMode, mt5PathOverride?: string, appEndpointOverride?: string, tradingModeOverride?: "Scalping" | "Swing", selectedAssetsOverride?: string[], isAiModeEnabledOverride?: boolean) => void;
  onSetParamInput: (input: Partial<AssetSelectorProps["paramInput"]>) => void;
  onSetConfig: (config: Partial<TradeConfig>) => void;
}

export const AssetSelector: React.FC<AssetSelectorProps> = ({
  config,
  paramInput,
  selectedStrategy,
  onApplySettings,
  onSetParamInput,
  onSetConfig,
}) => {
  return (
    <div className="max-w-2xl mx-auto w-full flex flex-col gap-6 animate-fade-in">
      {/* MULTI-INDEX ASSET SELECTION GRID */}
      <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Multi-Index Selector</h3>
        </div>
        <p className="text-[11px] text-slate-350 leading-normal -mt-1">
          Deploys concurrent signal scrapers over linked MT5 charts.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {["Step Index", "Volatility 75", "Boom 500", "Crash 500"].map((asset) => {
            const isSelected = paramInput.selectedAssets.includes(asset);
            return (
              <button
                key={asset}
                type="button"
                onClick={() => {
                  let newList = [...paramInput.selectedAssets];
                  if (newList.includes(asset)) {
                    if (newList.length > 1) {
                      newList = newList.filter(a => a !== asset);
                    }
                  } else {
                    newList.push(asset);
                  }
                  onSetParamInput({ selectedAssets: newList });
                  onApplySettings(undefined, undefined, undefined, undefined, newList);
                }}
                className={`py-2 px-2.5 text-[11px] font-extrabold font-mono rounded-xl border flex items-center justify-between transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? "bg-indigo-600/25 border-indigo-500 text-indigo-200 shadow-sm shadow-indigo-500/10"
                    : "bg-slate-900/90 border-slate-700/70 text-slate-300 hover:border-slate-600 hover:text-white"
                }`}
              >
                <span>{asset}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-indigo-400 animate-pulse" : "bg-slate-700"}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* STRATEGY OPTIONS: EXECUTION STYLE */}
      <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Execution Profile</h3>
        </div>
        <p className="text-[11px] text-slate-350 leading-normal -mt-1">
          Define frequency parameters for incoming market speed spikes.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            type="button"
            onClick={() => {
              onSetParamInput({ tradingMode: "Scalping" });
              onApplySettings(undefined, undefined, undefined, "Scalping", undefined);
            }}
            className={`py-2 px-3 text-xs font-extrabold font-mono rounded-xl border transition-all duration-200 uppercase tracking-wider cursor-pointer text-center ${
              paramInput.tradingMode === "Scalping"
                ? "bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-lg shadow-indigo-500/10"
                : "bg-slate-900/90 border-slate-700/70 text-slate-300 hover:border-slate-600 hover:text-white"
            }`}
          >
            Scalping
          </button>
          <button
            type="button"
            onClick={() => {
              onSetParamInput({ tradingMode: "Swing" });
              onApplySettings(undefined, undefined, undefined, "Swing", undefined);
            }}
            className={`py-2 px-3 text-xs font-extrabold font-mono rounded-xl border transition-all duration-200 uppercase tracking-wider cursor-pointer text-center ${
              paramInput.tradingMode === "Swing"
                ? "bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-lg shadow-indigo-500/10"
                : "bg-slate-900/90 border-slate-700/70 text-slate-300 hover:border-slate-600 hover:text-white"
            }`}
          >
            Swing
          </button>
        </div>
      </div>

      {/* Control & Parameters Card */}
      <div className="p-5 bg-slate-800/90 border border-slate-700/70 rounded-2xl flex flex-col shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-700/70">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Risk & Strategy</h3>
          </div>
          {config.saveSuccess && (
            <span className="text-[10px] text-emerald-400 bg-emerald-500/15 px-2 py-0.5 border border-emerald-500/30 rounded-full flex items-center gap-1 animate-pulse">
              <CheckCircle2 className="w-2.5 h-2.5" /> Updated
            </span>
          )}
        </div>

        {/* Form Input fields */}
        <div className="space-y-4">

          {/* Active Strategy Mode selection */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Trading Algorithm</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onSetConfig({ selectedStrategy: StrategyMode.TREND_FOLLOWING });
                  onApplySettings(StrategyMode.TREND_FOLLOWING);
                }}
                className={`py-2 px-1 text-[10px] font-bold rounded-lg border leading-tight transition-all cursor-pointer ${
                  selectedStrategy === StrategyMode.TREND_FOLLOWING
                    ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                    : "bg-slate-900/90 border-slate-700/70 text-slate-300 hover:text-white hover:border-slate-600"
                }`}
              >
                Trend Following
              </button>
              <button
                type="button"
                onClick={() => {
                  onSetConfig({ selectedStrategy: StrategyMode.MEAN_REVERSION });
                  onApplySettings(StrategyMode.MEAN_REVERSION);
                }}
                className={`py-2 px-1 text-[10px] font-bold rounded-lg border leading-tight transition-all cursor-pointer ${
                  selectedStrategy === StrategyMode.MEAN_REVERSION
                    ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                    : "bg-slate-900/90 border-slate-700/70 text-slate-300 hover:text-white hover:border-slate-600"
                }`}
              >
                Mean Reversion
              </button>
              <button
                type="button"
                onClick={() => {
                  onSetConfig({ selectedStrategy: StrategyMode.AI_ADAPTIVE });
                  onApplySettings(StrategyMode.AI_ADAPTIVE);
                }}
                className={`py-2 px-1 text-[10px] font-bold rounded-lg border leading-tight transition-all cursor-pointer ${
                  selectedStrategy === StrategyMode.AI_ADAPTIVE
                    ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                    : "bg-slate-900/90 border-slate-700/70 text-slate-300 hover:text-white hover:border-slate-600"
                }`}
              >
                AI Adaptive
              </button>
            </div>
          </div>

          {/* Lot size */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[11px] text-slate-300 uppercase font-semibold">
              <span>Lot Allocation</span>
              <span className="text-white font-mono">{paramInput.lotSize} Lots</span>
            </div>
            <input
              type="range"
              className="w-full accent-indigo-500 h-1.5 rounded-lg bg-slate-900 cursor-pointer"
              min="0.01"
              max="2.0"
              step="0.01"
              value={paramInput.lotSize}
              onChange={(e) => onSetParamInput({ lotSize: e.target.value })}
              onMouseUp={() => onApplySettings()}
              onTouchEnd={() => onApplySettings()}
            />
            <div className="flex justify-between text-[9px] text-slate-400 font-mono">
              <span>0.01 Min</span>
              <span>2.0 Max</span>
            </div>
          </div>

          {/* Target Trailing Configuration slider */}
          <div className="p-3 bg-slate-900/90 border border-slate-700/70 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                Trailing Stop-Loss
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={paramInput.useTrailingStop}
                  className="sr-only peer"
                  onChange={(e) => {
                    const val = e.target.checked;
                    onSetParamInput({ useTrailingStop: val });
                    onSetConfig({ useTrailingStop: val });
                    setTimeout(() => onApplySettings(), 50);
                  }}
                />
                <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-200 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {paramInput.useTrailingStop && (
              <div className="space-y-1 pt-1.5 border-t border-slate-800">
                <div className="flex justify-between text-[10px] text-slate-300">
                  <span>Trailing Distance</span>
                  <span className="text-indigo-400 font-mono font-bold">{paramInput.trailingStopPoints} Points</span>
                </div>
                <input
                  type="range"
                  className="w-full accent-indigo-500 h-1 bg-slate-800 cursor-pointer"
                  min="20"
                  max="500"
                  step="10"
                  value={paramInput.trailingStopPoints}
                  onChange={(e) => onSetParamInput({ trailingStopPoints: e.target.value })}
                  onMouseUp={() => onApplySettings()}
                  onTouchEnd={() => onApplySettings()}
                />
              </div>
            )}
          </div>

          {/* Take Profit & Stop loss parameters */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase block text-slate-300">Take Profit (Pts)</label>
              <input
                type="number"
                value={paramInput.takeProfitPoints}
                onChange={(e) => onSetParamInput({ takeProfitPoints: e.target.value })}
                onBlur={() => onApplySettings()}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500 text-center"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase block text-slate-300">Stop Loss (Pts)</label>
              <input
                type="number"
                value={paramInput.stopLossPoints}
                onChange={(e) => onSetParamInput({ stopLossPoints: e.target.value })}
                onBlur={() => onApplySettings()}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-xs font-mono font-bold text-rose-400 focus:outline-none focus:border-rose-500 text-center"
              />
            </div>
          </div>

          {/* Max Open trades */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[10px] text-slate-300 font-bold uppercase">
              <span>Max Concurrent Trades</span>
              <span className="text-white font-mono">{paramInput.maxTrades}</span>
            </div>
            <input
              type="range"
              className="w-full accent-indigo-500 h-1 cursor-pointer"
              min="1"
              max="10"
              step="1"
              value={paramInput.maxTrades}
              onChange={(e) => onSetParamInput({ maxTrades: e.target.value })}
              onMouseUp={() => onApplySettings()}
              onTouchEnd={() => onApplySettings()}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
