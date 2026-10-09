import React from "react";
import { Cpu, Lock, AlertCircle, Square, Play } from "lucide-react";
import type { StrategyMode, TradeConfig } from "../../types";
import type { AiKnowledgeBase } from "../../types";

export interface TradePanelProps {
  config: TradeConfig;
  aiStudyStatus: string;
  aiKnowledgeBase: AiKnowledgeBase | null;
  aiSynthesizedStrategy: any;
  strategiesList: any[];
  onToggleTradingExecution: () => void;
  onApplySettings: (strategyOverride?: StrategyMode) => void;
  selectedStrategy: StrategyMode;
}

export const TradePanel: React.FC<TradePanelProps> = ({
  config,
  aiStudyStatus,
  aiKnowledgeBase,
  aiSynthesizedStrategy,
  strategiesList,
  onToggleTradingExecution,
  onApplySettings,
  selectedStrategy,
}) => {
  const isLocked = config.selectedStrategy === "AI_ADAPTIVE" && aiStudyStatus === "calibrating";

  return (
    <div className={`card-panel flex flex-col justify-between transition-all duration-300 relative overflow-hidden ${
      config.isActive
        ? "border-emerald-500/40 bg-slate-900/90 shadow-emerald-950/20"
        : "border-indigo-500/30 bg-slate-900/90"
    }`}>
      {/* sleek locked screen overlay only for AI_ADAPTIVE mode */}
      {isLocked && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center z-10 animate-fade-in">
          <Lock className="w-6 h-6 text-indigo-400 mb-2.5 animate-bounce" />
          <p className="text-xs font-black text-indigo-300 uppercase tracking-widest mb-1 font-mono">Calibration Gate</p>
          <p className="text-[10px] text-slate-400 max-w-xs leading-normal">
            AI is calibrating long-term behavioral profile... Execution locked.
          </p>
          <div className="mt-3 flex items-center justify-center gap-1.5 bg-indigo-950/50 border border-indigo-500/30 px-3 py-1 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
            <span className="text-[9px] font-mono font-bold text-indigo-300 uppercase tracking-widest">
              Ticks: {aiKnowledgeBase ? aiKnowledgeBase.totalObservations : 0} / 20
            </span>
          </div>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-widest font-mono">Execution Engine</h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {config.isActive
            ? "Expert Advisor trade validation active. Watching for tick signals."
            : "Scalar trading core is idle. Toggle execution keys to initiate scalp signals."
          }
        </p>
      </div>

      {/* Mega Start Button with Glowing pulse styles */}
      <button
        onClick={onToggleTradingExecution}
        disabled={isLocked}
        className={`w-full py-3.5 rounded-lg font-bold text-xs sm:text-sm uppercase tracking-widest leading-none shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer ${
          isLocked
            ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50 shadow-none"
            : config.isActive
            ? "btn-danger shadow-rose-600/20"
            : "btn-success shadow-emerald-600/20"
        }`}
      >
        {isLocked ? (
          <>
            <AlertCircle className="w-5 h-5 text-slate-500 animate-pulse" />
            <span>SPEED STUDY PENDING</span>
          </>
        ) : config.isActive ? (
          <>
            <Square className="w-4 h-4 fill-current" />
            <span>STOP EXPERT WORKER</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4 fill-current" />
            <span>START EXPERT WORKER</span>
          </>
        )}
      </button>
    </div>
  );
};
