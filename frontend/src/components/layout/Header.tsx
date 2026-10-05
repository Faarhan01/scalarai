import React from "react";
import {
  TrendingUp,
  Zap,
  RefreshCw,
  Wifi,
  WifiOff,
  Square,
  Play,
  Menu,
  X,
} from "lucide-react";
import type { TradeConfig, EAConnectionDetails } from "../../types";
import { SymbolSwitcher } from "./SymbolSwitcher";

export interface HeaderProps {
  config: TradeConfig;
  connection: EAConnectionDetails;
  isBridgeConnected: boolean;
  wsConnected: boolean;
  pingLatency: number | null;
  latency: number;
  isInternetOnline: boolean;
  activeSymbol: string;
  currentPrice: number;
  symbolStates: Array<{ symbol: string; connection: any; currentPrice: number; tickCount: number }>;
  isMobileMenuOpen: boolean;
  onToggleTradingExecution: () => void;
  onToggleMobileMenu: () => void;
  onSwitchSymbol: (symbol: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  connection,
  isBridgeConnected,
  wsConnected,
  pingLatency,
  latency,
  isInternetOnline,
  activeSymbol,
  currentPrice,
  symbolStates,
  isMobileMenuOpen,
  onToggleTradingExecution,
  onToggleMobileMenu,
  onSwitchSymbol,
}) => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-50 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
      {/* Brand / Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-indigo-600/25 shrink-0">
          <TrendingUp className="w-4.5 h-4.5 text-white" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-tight text-white">Scalar AI</span>
          <span className="hidden xs:inline-block text-[10px] font-mono px-1.5 py-0.5 bg-indigo-500/15 border border-indigo-500/30 rounded text-indigo-300 font-medium">
            {activeSymbol || "NO SYMBOL"}
          </span>
        </div>
      </div>

      {/* Desktop Controls (Hidden on Mobile) */}
      <div className="hidden md:flex items-center gap-3">
        <SymbolSwitcher
          symbolStates={symbolStates}
          activeSymbol={activeSymbol}
          onSwitchSymbol={onSwitchSymbol}
        />
        <div className="flex items-center gap-3 px-3.5 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-full text-xs text-slate-300">
          {/* WebSocket Real-time Stream Indicator */}
          <div className="flex items-center gap-2">
            {wsConnected ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-semibold text-emerald-400 font-mono text-[10px] tracking-wide flex items-center gap-1">
                  <Zap className="w-3 h-3 text-emerald-400 inline" />
                  LIVE STREAM {pingLatency !== null ? `(${pingLatency}ms)` : ""}
                </span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                <span className="font-semibold text-amber-400 font-mono text-[10px] tracking-wide flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 text-amber-400 inline" />
                  POLL MODE ({latency}ms)
                </span>
              </>
            )}
          </div>

          <div className="h-3 w-px bg-slate-700"></div>

          {/* Internet Status */}
          <div className="flex items-center gap-1">
            {isInternetOnline ? (
              <span className="font-semibold text-emerald-400 flex items-center gap-1 text-[10px]">
                <Wifi className="w-3 h-3 inline" /> ONLINE
              </span>
            ) : (
              <span className="font-semibold text-red-400 flex items-center gap-1 text-[10px]">
                <WifiOff className="w-3 h-3 inline" /> OFFLINE
              </span>
            )}
          </div>

          <div className="h-3 w-px bg-slate-700"></div>

          {/* EA Online Sync Indicator */}
          <div className="flex items-center gap-1.5">
            {connection.isEaConnected ? (
              <>
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                <span className="font-semibold text-blue-400 text-[10px]">EA ONLINE</span>
                <span className="text-[9px] text-slate-400 font-mono">#{connection.accountNumber}</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-slate-500"></span>
                <span className="font-semibold text-slate-400 uppercase text-[10px]">EA OFFLINE</span>
              </>
            )}
          </div>

          <div className="h-3 w-px bg-slate-700"></div>

          {/* Desktop Bridge Status Indicator */}
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${isBridgeConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}></span>
            <span className={`font-semibold uppercase text-[10px] ${isBridgeConnected ? "text-emerald-400" : "text-rose-400"}`}>
              {isBridgeConnected ? "BRIDGE ON" : "BRIDGE OFF"}
            </span>
          </div>
        </div>

        {/* Quick Header Execution Toggle Button */}
        <button
          type="button"
          onClick={onToggleTradingExecution}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
            config.isActive
              ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20"
              : "bg-emerald-600 hover:bg-emerald-550 text-white shadow-emerald-600/20"
          }`}
          title={config.isActive ? "Pause automated trade execution" : "Start automated trade execution"}
        >
          {config.isActive ? (
            <>
              <Square className="w-3.5 h-3.5 fill-white" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Start</span>
            </>
          )}
        </button>
      </div>

      {/* Mobile Screen Controls (Quick Start Mini Button + Hamburger Menu Toggle) */}
      <div className="flex md:hidden items-center gap-2">
        {/* Quick Start/Pause Mini Button for immediate one-tap mobile control */}
        <button
          type="button"
          onClick={onToggleTradingExecution}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
            config.isActive
              ? "bg-rose-600/90 text-white"
              : "bg-emerald-600/90 text-white"
          }`}
        >
          {config.isActive ? (
            <>
              <Square className="w-3 h-3 fill-white" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-white" />
              <span>Start</span>
            </>
          )}
        </button>

        {/* Mobile Menu Icon Toggle Button */}
        <button
          type="button"
          onClick={onToggleMobileMenu}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700/80 text-slate-200 transition-colors cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          {isMobileMenuOpen ? (
            <X className="w-5 h-5 text-indigo-400" />
          ) : (
            <Menu className="w-5 h-5 text-slate-200" />
          )}
        </button>
      </div>
    </header>
  );
};
