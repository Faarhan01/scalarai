import React from "react";
import {
  Home,
  Download,
  Terminal,
  Settings,
  Square,
  Play,
  Wifi,
  WifiOff,
  Sliders,
  Cpu,
} from "lucide-react";
import type { TradeConfig, SystemLog, EAConnectionDetails } from "../../types";

export interface MobileDrawerProps {
  isOpen: boolean;
  config: TradeConfig;
  currentPrice: number;
  activeSymbol: string;
  currentNavTab: string;
  logs: SystemLog[];
  connection: EAConnectionDetails;
  isBridgeConnected: boolean;
  wsConnected: boolean;
  pingLatency: number | null;
  latency: number;
  isInternetOnline: boolean;
  onClose: () => void;
  onSetNavTab: (tab: string) => void;
  onToggleTradingExecution: () => void;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  config,
  currentPrice,
  activeSymbol,
  currentNavTab,
  logs,
  connection,
  isBridgeConnected,
  wsConnected,
  pingLatency,
  latency,
  isInternetOnline,
  onClose,
  onSetNavTab,
  onToggleTradingExecution,
}) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 top-16 bg-slate-950/70 backdrop-blur-xs z-40 md:hidden animate-fade-in"
        onClick={onClose}
      />
      {/* Slide-down Mobile Menu */}
      <div className="fixed top-16 left-0 right-0 max-h-[calc(100vh-4rem)] overflow-y-auto bg-slate-900 border-b border-slate-800 shadow-2xl p-4 sm:p-5 flex flex-col gap-4 z-40 md:hidden animate-fade-in">

        {/* 1. Mobile Start / Pause Action Card */}
        <div className="card-panel flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">Trading Engine</span>
            <span className={`badge ${
              config.isActive ? "badge-success" : "badge-neutral"
            }`}>
              {config.isActive ? "Executing" : "Idle"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              onToggleTradingExecution();
              onClose();
            }}
            className={`w-full py-3 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
              config.isActive
                ? "btn-danger"
                : "btn-success"
            }`}
          >
            {config.isActive ? (
              <>
                <Square className="w-4 h-4 fill-white" />
                <span>Pause Automated Trading</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Start Automated Trading</span>
              </>
            )}
          </button>
        </div>

        {/* 2. Mobile Real-Time Statuses Hub */}
        <div className="card-panel flex flex-col gap-2.5">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">System & Network Status</span>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Live Stream / Polling */}
            <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg flex flex-col gap-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Feed Mode</span>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${wsConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                <span className={`font-mono text-[11px] font-bold ${wsConnected ? "text-emerald-400" : "text-amber-400"}`}>
                  {wsConnected ? `STREAM (${pingLatency ?? 0}ms)` : `POLL (${latency}ms)`}
                </span>
              </div>
            </div>

            {/* Internet */}
            <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg flex flex-col gap-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Internet</span>
              <div className="flex items-center gap-1.5">
                {isInternetOnline ? (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-mono text-[11px] font-bold text-emerald-400">ONLINE</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                    <span className="font-mono text-[11px] font-bold text-rose-400">OFFLINE</span>
                  </>
                )}
              </div>
            </div>

            {/* MT5 EA */}
            <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg flex flex-col gap-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">MT5 EA</span>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${connection.isEaConnected ? "bg-cyan-400 animate-pulse" : "bg-slate-500"}`} />
                <span className={`font-mono text-[11px] font-bold ${connection.isEaConnected ? "text-cyan-300" : "text-slate-400"}`}>
                  {connection.isEaConnected ? `#${connection.accountNumber || "Connected"}` : "OFFLINE"}
                </span>
              </div>
            </div>

            {/* Bridge */}
            <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg flex flex-col gap-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Desktop Bridge</span>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${isBridgeConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
                <span className={`font-mono text-[11px] font-bold ${isBridgeConnected ? "text-emerald-400" : "text-rose-400"}`}>
                  {isBridgeConnected ? "CONNECTED" : "OFFLINE"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Mobile Navigation Menu Links */}
        <div className="card-panel flex flex-col gap-2">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono mb-1">Navigation</span>
          {[
            { id: "home", label: "Live Trading", icon: Home, badge: `$${currentPrice.toFixed(1)}` },
            { id: "risk", label: "Risk & Strategy", icon: Sliders, badge: config.selectedStrategy },
            { id: "bridge", label: "MCP Bridge 2", icon: Cpu, badge: "AI Ready" },
            { id: "downloads", label: "Downloads Center", icon: Download },
            { id: "logs", label: "System Logs", icon: Terminal, badge: `${logs.length}` },
            { id: "settings", label: "Settings", icon: Settings },
          ].map((tab) => {
            const IconComponent = tab.icon;
            const isActive = currentNavTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  onSetNavTab(tab.id);
                  onClose();
                }}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm font-bold"
                    : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <IconComponent className="w-4 h-4" />
                  <span>{tab.label}</span>
                </div>
                {tab.badge && (
                  <span className={`badge ${
                    isActive ? "bg-indigo-700 text-indigo-100 border-indigo-600" : "badge-neutral"
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
