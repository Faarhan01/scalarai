import React from "react";
import { Activity, Gauge, Zap } from "lucide-react";

export interface TelemetryStreamProps {
  aiStudyStatus: string;
  aiStudyMessage: string;
  averageVelocity: number | null;
  aiKnowledgeBase: any;
  telemetryStream: any[];
}

export const TelemetryStream: React.FC<TelemetryStreamProps> = ({
  aiStudyStatus,
  aiStudyMessage,
  averageVelocity,
  aiKnowledgeBase,
  telemetryStream,
}) => {
  if (aiStudyStatus === "calibrating" || aiStudyStatus === "waiting") {
    return (
      <div className="card-panel border-amber-500/30 bg-amber-950/20 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
            <Activity className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <p className="text-xs font-bold text-amber-300 uppercase tracking-widest leading-none mb-1 font-mono">AI Speed Baseline Study</p>
            <p className="text-[11px] text-amber-200/80 leading-normal font-sans">
              AI is analyzing market speed baseline... Awaiting sufficient expert data stream from MetaTrader 5 terminal.
            </p>
          </div>
        </div>
        <span className="badge badge-warning px-3 py-1 font-mono text-xs">
          Ticks: {aiKnowledgeBase ? aiKnowledgeBase.totalObservations : 0} / 20
        </span>
      </div>
    );
  }

  // optimized or active
  let accelerationVal = 0;
  if (telemetryStream.length >= 2) {
    const v1 = telemetryStream[telemetryStream.length - 1].velocity;
    const v0 = telemetryStream[telemetryStream.length - 2].velocity;
    const t1 = telemetryStream[telemetryStream.length - 1].timestamp;
    const t0 = telemetryStream[telemetryStream.length - 2].timestamp;
    const dt = Math.max(0.1, (t1 - t0) / 1000);
    accelerationVal = Math.abs((v1 - v0) / dt);
  }

  return (
    <div className="card-panel border-indigo-500/30 bg-slate-900/90 p-4 flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
            <Gauge className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest leading-none mb-1 font-mono">AI Speed Study: OPTIMIZED</p>
            <p className="text-[11px] text-slate-400 leading-normal font-sans">
              Index velocity baseline is locked. Market metrics telemetry stream is active and STUDYING speed variations.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950/80 border border-indigo-500/30 text-indigo-300 rounded-lg shrink-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 leading-none">Speed:</span>
          <strong className="text-xs sm:text-sm font-mono font-bold leading-none text-indigo-300 tabular-nums">{averageVelocity ? `${averageVelocity.toFixed(4)} pt/s` : "0.0000 pt/s"}</strong>
        </div>
      </div>

      {/* Real-Time Market Acceleration Monitor */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300 font-mono">Market Acceleration:</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Visual meter bars */}
          {[1, 2, 3, 4, 5].map((bar) => {
            const isActive = accelerationVal > (bar * 0.002);
            return (
              <span
                key={bar}
                className={`w-3.5 h-3.5 rounded-sm transition-all duration-300 ${
                  isActive
                    ? bar > 4 ? "bg-rose-500 shadow-md shadow-rose-500/20 animate-pulse" : bar > 2 ? "bg-amber-500" : "bg-emerald-500"
                    : "bg-slate-800 border border-slate-700/50"
                }`}
              />
            );
          })}
          <span className="text-xs font-mono font-bold text-slate-200 ml-2 tabular-nums">
            {accelerationVal.toFixed(4)} pt/s²
          </span>
        </div>
      </div>
    </div>
  );
};
