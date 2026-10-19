import React from "react";

export interface StatusBarProps {
  isInternetOnline: boolean;
  latency: number;
  elapsedTime: string;
  activeSymbol: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  isInternetOnline,
  latency,
  elapsedTime,
  activeSymbol,
}) => {
  return (
    <footer className="py-2.5 sm:h-11 border-t border-slate-800 flex flex-wrap items-center px-4 sm:px-8 bg-slate-950/95 text-[11px] text-slate-400 gap-y-2 gap-x-6 font-mono">
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className={`w-2 h-2 rounded-full ${isInternetOnline ? "bg-emerald-500 shadow-xs shadow-emerald-500/50" : "bg-rose-500 shadow-xs shadow-rose-500/50"}`}></span>
        <span>NET: {isInternetOnline ? "ONLINE_STABLE" : "NETWORK_DISCONNECTED"}</span>
      </div>

      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="w-2 h-2 bg-indigo-500 rounded-full shadow-xs shadow-indigo-500/50"></span>
        <span>LATENCY: <strong className="text-slate-200 tabular-nums">{latency}MS</strong></span>
      </div>

      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="w-2 h-2 bg-slate-500 rounded-full"></span>
        <span>UPTIME: <strong className="text-slate-200 tabular-nums">{elapsedTime}</strong></span>
      </div>

      <div className="sm:ml-auto flex gap-4 uppercase font-bold tracking-tight text-[10px] whitespace-nowrap">
        <span className="text-slate-300">{(activeSymbol || "Symbol") + " (Synthetic M1)"}</span>
        <span className="text-slate-500">Live Workspace</span>
      </div>
    </footer>
  );
};
