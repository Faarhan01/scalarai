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
    <div className="card-panel flex flex-col gap-4">
      <div className="card-panel-header">
        <div className="card-panel-title">
          <Gauge className="w-4 h-4 text-indigo-400" />
          <span>Session Performance</span>
        </div>
        <button
          type="button"
          onClick={onResetStats}
          className="btn btn-secondary btn-sm"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset Metrics</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Profit Tracking */}
        <div className="metric-box">
          <p className="metric-label">Run Session Profit</p>
          <div className="my-2">
            <p className={`metric-val ${stats.totalProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
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
        <div className="metric-box">
          <p className="metric-label">Calculated Win-Rate</p>
          <div className="my-2 flex items-baseline gap-1">
            <p className="metric-val text-indigo-400">
              {stats.winRate}%
            </p>
            <span className="text-[10px] text-slate-400">({stats.tradesCount} trades)</span>
          </div>
          <p className="text-[9px] text-slate-400 leading-tight">Minimum required: 62% for Step Index cost offset.</p>
        </div>

        {/* Active Positions counter */}
        <div className="metric-box">
          <p className="metric-label">Active Step Trades</p>
          <div className="my-2">
            <p className="metric-val text-white">
              {stats.activePositionsCount} <span className="text-xs text-indigo-400 font-bold uppercase font-sans">Open</span>
            </p>
          </div>
          <p className="text-[9px] text-slate-400 leading-tight">
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
