import React from "react";
import { Terminal, Cpu } from "lucide-react";
import { SystemLog } from "../../types";

export interface LogsViewerProps {
  logs: SystemLog[];
  filterLogLevel: string;
  onFilterChange: (level: string) => void;
}

export const LogsViewer: React.FC<LogsViewerProps> = ({
  logs,
  filterLogLevel,
  onFilterChange,
}) => {
  const filteredLogs = logs.filter((log) => {
    if (filterLogLevel === "ALL") return true;
    return log.level === filterLogLevel;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fade-in">
      {/* Left Column: Console Logs */}
      <section className="lg:col-span-8 card-panel flex flex-col">
        <div className="card-panel-header">
          <div className="card-panel-title">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span>System Control Logs</span>
          </div>

          {/* Filter buttons */}
          <div className="flex bg-slate-900/90 p-1 rounded-lg border border-slate-700/80 gap-1 text-[10px] overflow-x-auto">
            {["ALL", "INFO", "SUCCESS", "WARNING", "ERROR"].map((level) => (
              <button
                key={level}
                onClick={() => onFilterChange(level)}
                className={`py-1 px-2.5 rounded font-mono font-bold uppercase transition-all whitespace-nowrap cursor-pointer ${
                  filterLogLevel === level
                    ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Console Text block */}
        <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 h-[500px] overflow-y-auto flex flex-col gap-1.5 font-mono text-xs text-slate-300">
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log) => {
              let colorClass = "text-slate-300";
              if (log.level === "SUCCESS") colorClass = "text-emerald-400";
              if (log.level === "WARNING") colorClass = "text-amber-400";
              if (log.level === "ERROR") colorClass = "text-rose-400";

              return (
                <div
                  key={log.id}
                  className="flex gap-2 hover:bg-slate-900/80 p-1 rounded transition-all"
                >
                  <span className="text-slate-500 select-none">[{log.timestamp}]</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-850 ${
                      log.source === "SERVER"
                        ? "text-indigo-400"
                        : log.source === "AI"
                        ? "text-cyan-400"
                        : "text-amber-400"
                    }`}
                  >
                    {log.source}
                  </span>
                  <span className={colorClass}>{log.message}</span>
                </div>
              );
            })
          ) : (
            <div className="text-center py-20 text-slate-500">
              No logs matching current filter parameters found.
            </div>
          )}
        </div>
      </section>

      {/* Right Column: System Architecture Info Specs */}
      <aside className="lg:col-span-4 space-y-6 flex flex-col">
        <div className="card-panel flex flex-col gap-4">
          <div className="card-panel-header">
            <div className="card-panel-title">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span>System Architecture</span>
            </div>
          </div>

          <div className="space-y-4">
            {/* FRONTEND SPEC */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider block">
                Front-End Stack
              </span>
              <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-700/70 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Framework</span>
                  <span className="font-mono text-white text-[11px] font-semibold">
                    React 19 (TypeScript)
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Build Tool / HMR</span>
                  <span className="font-mono text-white text-[11px] font-semibold">
                    Vite 6 (Production Build)
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Styling Core</span>
                  <span className="font-mono text-white text-[11px] font-semibold">
                    Tailwind CSS v4 (Token Driven)
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Component Architecture</span>
                  <span className="font-mono text-white text-[11px] font-semibold">
                    Modular Component Driven
                  </span>
                </div>
              </div>
            </div>

            {/* BACKEND SPEC */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider block">
                Back-end Server
              </span>
              <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-700/70 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Runtime Core</span>
                  <span className="font-mono text-white text-[11px] font-semibold">
                    Node.js + Express.js API
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Database</span>
                  <span className="font-mono text-white text-[11px] font-semibold">
                    SQLite 3 (WAL Mode)
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Real-Time Streams</span>
                  <span className="font-mono text-white text-[11px] font-semibold">
                    WebSocket + HTTP Fallback
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">EA Protocol</span>
                  <span className="font-mono text-white text-[11px] font-semibold">
                    Native MQL5 WebRequest
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};
