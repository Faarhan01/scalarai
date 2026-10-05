import React from "react";
import { Activity, Gauge, Zap } from "lucide-react";

export interface AiStudyFeedProps {
  aiStudyStatus: string;
  aiStudyMessage: string;
  averageVelocity: number | null;
  aiKnowledgeBase: any;
  telemetryStream: any[];
}

export const AiStudyFeed: React.FC<AiStudyFeedProps> = ({
  aiStudyStatus,
  aiStudyMessage,
  averageVelocity,
  aiKnowledgeBase,
  telemetryStream,
}) => {
  if (aiStudyStatus === "calibrating" || aiStudyStatus === "waiting") {
    return (
      <div className="mb-4">
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
              <Activity className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-300 uppercase tracking-widest leading-none mb-1">AI Speed Baseline Study</p>
              <p className="text-[11px] text-amber-200/80 leading-normal">
                AI is analyzing market speed baseline... Awaiting sufficient expert data stream from MetaTrader 5 terminal.
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-amber-950 border border-amber-500/40 text-amber-300 px-2.5 py-1.5 rounded font-mono font-bold leading-none shrink-0 uppercase tracking-wider">
            Ticks: {aiKnowledgeBase ? aiKnowledgeBase.totalObservations : 0} / 20
          </span>
        </div>
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
    <div className="mb-4">
      <div className="bg-slate-800/90 border border-indigo-500/25 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-indigo-500/15">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
              <Gauge className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest leading-none mb-1 font-mono">AI Speed Study: OPTIMIZED</p>
              <p className="text-[11px] text-slate-350 leading-normal">
                Index velocity baseline is locked. Market metrics telemetry stream is active and STUDYING speed variations.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 rounded-lg shrink-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 leading-none">Market Speed:</span>
            <strong className="text-xs sm:text-sm font-mono font-black leading-none text-indigo-300">{averageVelocity ? `${averageVelocity.toFixed(4)} pt/s` : "0.0000 pt/s"}</strong>
          </div>
        </div>

        {/* Real-Time Market Acceleration Monitor */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300">Market Acceleration:</span>
          </div>
          <div className="flex items-center gap-1">
            {/* Visual meter bars */}
            {[1, 2, 3, 4, 5].map((bar) => {
              const isActive = accelerationVal > (bar * 0.002);
              return (
                <span
                  key={bar}
                  className={`w-3 h-4 rounded-sm transition-all duration-350 ${
                    isActive
                      ? bar > 4 ? "bg-red-500 shadow-md shadow-red-500/20 animate-pulse" : bar > 2 ? "bg-orange-500" : "bg-emerald-500"
                      : "bg-slate-700"
                  }`}
                />
              );
            })}
            <span className="text-xs font-mono font-black text-slate-200 ml-2">
              {accelerationVal.toFixed(4)} pt/s²
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
