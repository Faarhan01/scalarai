import React from "react";
import { Gauge, RotateCcw } from "lucide-react";

export interface StatsCardsProps {
  stats: {
    totalProfit: number;
    tradesCount: number;
    winRate: number;
    activePositionsCount: number;
  };
  config: { isActive: boolean };
  onResetStats: () => void;
}

export const StatsCards: React.FC<StatsCardsProps> = ({
  stats,
  config,
  onResetStats,
}) => {
  return (
    <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-slate-700/70">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Session Performance</h3>
        </div>
        <button
          type="button"
          onClick={onResetStats}
          className="py-1 px-2.5 text-[10px] font-extrabold font-mono rounded bg-slate-900 border border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white transition-all duration-200 flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset Metrics</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Profit Tracking */}
        <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Run Session Profit</p>
          <div className="my-2">
            <p className={`text-2xl sm:text-3xl font-black ${stats.totalProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {stats.totalProfit >= 0 ? "+" : ""}${stats.totalProfit.toFixed(2)}
            </p>
          </div>
          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.max(10, stats.winRate))}%` }}
            ></div>
          </div>
        </div>

        {/* Profit Win-Rate */}
        <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Calculated Win-Rate</p>
          <div className="my-2 flex items-baseline gap-1">
            <p className="text-2xl sm:text-3xl font-black text-indigo-400">
              {stats.winRate}%
            </p>
            <span className="text-[10px] text-slate-400">({stats.tradesCount} trades)</span>
          </div>
          <p className="text-[9px] text-slate-400 leading-tight">Minimum required: 62% for Step Index cost offset.</p>
        </div>

        {/* Active Positions counter */}
        <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Step Trades</p>
          <div className="my-2">
            <p className="text-2xl sm:text-3xl font-black text-white">
              {stats.activePositionsCount} <span className="text-xs text-indigo-400 font-bold uppercase">Open</span>
            </p>
          </div>
          <p className="text-[9px] text-slate-350 leading-tight">
            {config.isActive
              ? `Awaiting discrete momentum criteria`
              : "Expert is stopped or paused"
            }
          </p>
        </div>
      </div>
    </div>
  );
};
