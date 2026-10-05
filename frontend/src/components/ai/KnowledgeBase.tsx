import React from "react";
import { TrendingUp, Layers } from "lucide-react";

export interface StrategyItem {
  id: string;
  name: string;
  description: string;
  mode: string;
  category: string;
  tags: string[];
  performance?: {
    winRate: number;
    profitFactor: number;
    totalTrades: number;
  };
}

export interface KnowledgeBaseProps {
  strategiesList: StrategyItem[];
}

export const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({
  strategiesList,
}) => {
  return (
    <div className="space-y-4">
      {/* Strategy Performance Dashboard */}
      <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-700/70">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Strategy Performance</h3>
        </div>

        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/60">
          {strategiesList.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {strategiesList.map((strategy) => (
                <div key={strategy.id} className="bg-slate-800/90 border border-slate-700/60 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[11px] font-bold text-white">{strategy.name}</h4>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-mono ${
                      strategy.category === "scalping" ? "bg-emerald-500/20 text-emerald-300" :
                      strategy.category === "day_trading" ? "bg-blue-500/20 text-blue-300" :
                      strategy.category === "adaptive" ? "bg-purple-500/20 text-purple-300" :
                      "bg-slate-700 text-slate-400"
                    }`}>
                      {strategy.category}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 mb-2 line-clamp-2">{strategy.description}</p>

                  {strategy.performance ? (
                    <div className="grid grid-cols-3 gap-2 text-[9px] font-mono">
                      <div className="bg-slate-900/60 p-1.5 rounded">
                        <span className="text-slate-500 block">Win Rate</span>
                        <span className={`font-bold ${strategy.performance.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
                          {strategy.performance.winRate}%
                        </span>
                      </div>
                      <div className="bg-slate-900/60 p-1.5 rounded">
                        <span className="text-slate-500 block">Profit</span>
                        <span className={`font-bold ${strategy.performance.profitFactor >= 1 ? "text-emerald-400" : "text-rose-400"}`}>
                          {strategy.performance.profitFactor}x
                        </span>
                      </div>
                      <div className="bg-slate-900/60 p-1.5 rounded">
                        <span className="text-slate-500 block">Trades</span>
                        <span className="font-bold text-slate-300">{strategy.performance.totalTrades}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[9px] text-slate-500 italic">No performance data yet</div>
                  )}

                  <div className="mt-2 pt-2 border-t border-slate-700/40">
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Mode: {strategy.mode.replace("_", " ")}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-[11px] text-slate-400">
              Loading strategies...
            </div>
          )}
        </div>
      </div>

      {/* Strategy Library Card */}
      <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-700/70">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Strategy Templates</h3>
        </div>

        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/60">
          <p className="text-[10px] text-slate-400 leading-relaxed mb-3">
            Available strategy templates for different trading styles. Create and activate strategies using MCP tools.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
            {[
              { id: "scalping_ema_cross", name: "Quick Scalp EMA Cross", category: "scalping", mode: "TREND_FOLLOWING" },
              { id: "scalping_momentum", name: "Velocity Scalper", category: "scalping", mode: "AI_ADAPTIVE" },
              { id: "day_trading_trend", name: "Day Trend Rider", category: "day_trading", mode: "TREND_FOLLOWING" },
              { id: "day_trading_breakout", name: "Opening Range Breakout", category: "day_trading", mode: "CUSTOM" },
              { id: "momentum_bb_momentum", name: "Bollinger Momentum", category: "momentum", mode: "MEAN_REVERSION" },
              { id: "breakout_atr", name: "ATR Breakout", category: "breakout", mode: "CUSTOM" },
              { id: "reversal_rsi", name: "RSI Reversal", category: "reversal", mode: "MEAN_REVERSION" },
              { id: "adaptive_velocity", name: "Adaptive Velocity", category: "adaptive", mode: "AI_ADAPTIVE" },
            ].map((template) => (
              <div key={template.id} className="bg-slate-800/90 border border-slate-700/60 p-2 rounded flex flex-col gap-1">
                <span className="text-slate-200 font-semibold">{template.name}</span>
                <div className="flex gap-1.5">
                  <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[9px] uppercase font-mono">
                    {template.category}
                  </span>
                  <span className="px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded text-[9px] uppercase font-mono">
                    {template.mode.replace("_", " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
