import React from "react";
import { Zap } from "lucide-react";

export interface StrategyPanelProps {
  aiSynthesizedStrategy: any;
  aiKnowledgeBase: any;
}

export const StrategyPanel: React.FC<StrategyPanelProps> = ({
  aiSynthesizedStrategy,
  aiKnowledgeBase,
}) => {
  return (
    <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-700/70">
        <Zap className="w-4 h-4 text-amber-400" />
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Active Strategy</h3>
      </div>

      <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/60 flex flex-col justify-between">
        <div className="space-y-4">
          {aiSynthesizedStrategy ? (
            <div className="space-y-4 text-left">
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg">
                <p className="text-[9px] font-bold text-amber-400 uppercase tracking-wider mb-1 font-mono">Active Strategy</p>
                <h4 className="text-xs font-bold text-white uppercase tracking-tight">{aiSynthesizedStrategy.name}</h4>
                <p className="text-[10px] text-slate-300 mt-1.5 leading-relaxed">
                  {aiSynthesizedStrategy.description}
                </p>
                <p className="text-[9px] text-slate-400 font-mono mt-2 font-medium">
                  Mode: {aiSynthesizedStrategy.mode} | Updated: {new Date(aiSynthesizedStrategy.updatedAt).toLocaleTimeString()}
                </p>
              </div>

              {aiSynthesizedStrategy.rules && Object.keys(aiSynthesizedStrategy.rules).length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-700/60">
                  <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Strategy Parameters</p>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    {Object.entries(aiSynthesizedStrategy.rules).map(([key, value]) => (
                      <div key={key} className="bg-slate-800/90 border border-slate-700/60 p-2 rounded">
                        <span className="text-slate-400 block text-[9px] uppercase tracking-wider mb-0.5">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className="text-white font-bold">{typeof value === 'number' ? value.toFixed(2) : String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6 text-[11px] text-slate-400 italic">
              No active strategy configured. Use MCP tools or select a strategy template below.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
