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
    <footer className="py-3 sm:h-12 border-t border-slate-800 flex flex-wrap items-center px-4 sm:px-8 bg-slate-900/90 text-[10px] text-slate-400 gap-y-2 gap-x-6">
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className={`w-1.5 h-1.5 rounded-full ${isInternetOnline ? "bg-emerald-500" : "bg-red-500"}`}></span>
        INTERNET: {isInternetOnline ? "ONLINE_STABLE" : "NETWORK_DISCONNECTED"}
      </div>

      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
        PING LATENCY: {latency}MS
      </div>

      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="w-1.5 h-1.5 bg-slate-500 rounded-full"></span>
        SESSION ELAPSED: {elapsedTime}
      </div>

      <div className="sm:ml-auto flex gap-4 uppercase font-bold tracking-tight text-[9px] whitespace-nowrap">
        <span className="text-slate-300">{(activeSymbol || "Symbol") + " (Synthetic M1)"}</span>
        <span className="text-slate-500">v1.20-Production</span>
      </div>
    </footer>
  );
};
