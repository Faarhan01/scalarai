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
      <div className="card-panel flex flex-col gap-4">
        <div className="card-panel-header">
          <div className="card-panel-title">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Strategy Performance</span>
          </div>
        </div>

        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/60">
          {strategiesList.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {strategiesList.map((strategy) => (
                <div key={strategy.id} className="bg-slate-800/90 border border-slate-700/60 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[11px] font-bold text-white font-mono">{strategy.name}</h4>
                    <span className="badge badge-info text-[9px]">
                      {strategy.category}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 mb-2 line-clamp-2 font-sans">{strategy.description}</p>

                  {strategy.performance ? (
                    <div className="grid grid-cols-3 gap-2 text-[9px] font-mono">
                      <div className="bg-slate-900/60 p-1.5 rounded">
                        <span className="text-slate-500 block">Win Rate</span>
                        <span className={`font-bold tabular-nums ${strategy.performance.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
                          {strategy.performance.winRate}%
                        </span>
                      </div>
                      <div className="bg-slate-900/60 p-1.5 rounded">
                        <span className="text-slate-500 block">Profit</span>
                        <span className={`font-bold tabular-nums ${strategy.performance.profitFactor >= 1 ? "text-emerald-400" : "text-rose-400"}`}>
                          {strategy.performance.profitFactor}x
                        </span>
                      </div>
                      <div className="bg-slate-900/60 p-1.5 rounded">
                        <span className="text-slate-500 block">Trades</span>
                        <span className="font-bold text-slate-300 tabular-nums">{strategy.performance.totalTrades}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[9px] text-slate-500 italic font-sans">No performance data yet</div>
                  )}

                  <div className="mt-2 pt-2 border-t border-slate-700/40">
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider font-mono">Mode: {strategy.mode.replace("_", " ")}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-[11px] text-slate-400 font-sans">
              Loading strategies...
            </div>
          )}
        </div>
      </div>

      {/* Strategy Library Card */}
      <div className="card-panel flex flex-col gap-4">
        <div className="card-panel-header">
          <div className="card-panel-title">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Strategy Templates</span>
          </div>
        </div>

        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/60">
          <p className="text-[10px] text-slate-400 leading-relaxed mb-3 font-sans">
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
              <div key={template.id} className="bg-slate-800/90 border border-slate-700/60 p-2.5 rounded-lg flex flex-col gap-1.5">
                <span className="text-slate-200 font-semibold font-mono">{template.name}</span>
                <div className="flex gap-1.5">
                  <span className="badge badge-info text-[9px]">
                    {template.category}
                  </span>
                  <span className="badge badge-neutral text-[9px]">
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
