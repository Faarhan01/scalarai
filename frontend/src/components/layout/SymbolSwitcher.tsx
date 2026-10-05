import React from "react";
import { ChevronDown } from "lucide-react";

export interface SymbolSwitcherProps {
  symbolStates: Array<{ symbol: string; connection: any; currentPrice: number; tickCount: number }>;
  activeSymbol: string;
  onSwitchSymbol: (symbol: string) => void;
}

export const SymbolSwitcher: React.FC<SymbolSwitcherProps> = ({
  symbolStates,
  activeSymbol,
  onSwitchSymbol,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  if (symbolStates.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 hover:bg-slate-700/80 transition-colors cursor-pointer"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="font-mono">{activeSymbol || "Select Symbol"}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-slate-800 border border-slate-700/70 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="p-2 border-b border-slate-700/60">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Active Symbols</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {symbolStates.map((state) => {
                const isActive = state.symbol === activeSymbol;
                return (
                  <button
                    key={state.symbol}
                    type="button"
                    onClick={() => {
                      onSwitchSymbol(state.symbol);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-700/50 transition-colors cursor-pointer ${
                      isActive ? "bg-indigo-600/15" : ""
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-xs font-bold font-mono ${isActive ? "text-indigo-300" : "text-slate-200"}`}>
                        {state.symbol}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {state.connection.isEaConnected ? (
                          <span className="text-emerald-400">● Connected</span>
                        ) : (
                          <span className="text-slate-500">○ Disconnected</span>
                        )}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono text-slate-300">
                        {state.currentPrice > 0 ? state.currentPrice.toFixed(2) : "—"}
                      </span>
                      <span className="block text-[9px] text-slate-500">
                        {state.tickCount} ticks
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
