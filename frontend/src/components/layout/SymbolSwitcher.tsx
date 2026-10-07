import React from "react";
import { ChevronDown, Layers } from "lucide-react";

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

  const hasSymbols = symbolStates && symbolStates.length > 0;
  const currentSymbolDisplay = hasSymbols
    ? (activeSymbol || symbolStates[0].symbol)
    : "none";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 hover:bg-slate-700/80 transition-colors cursor-pointer"
        title={hasSymbols ? `Current symbol: ${currentSymbolDisplay}` : "No symbols connected"}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            hasSymbols ? "bg-emerald-500 animate-pulse" : "bg-slate-500"
          }`}
        />
        <span className={`font-mono ${hasSymbols ? "text-slate-100 font-bold" : "text-slate-400 lowercase"}`}>
          {currentSymbolDisplay}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-72 bg-slate-800 border border-slate-700/70 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="p-2.5 border-b border-slate-700/60 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-indigo-400" />
                Connected Symbols ({symbolStates ? symbolStates.length : 0})
              </span>
              <span className="text-[9px] font-mono text-slate-400">
                {hasSymbols ? "Click to switch active" : "Waiting for EA"}
              </span>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {!hasSymbols ? (
                <div className="p-4 text-center">
                  <p className="text-xs font-bold text-slate-300 lowercase font-mono">none</p>
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                    No MT5 chart symbols connected yet. Drag the downloadable EA onto any MT5 chart to attach it.
                  </p>
                </div>
              ) : (
                symbolStates.map((state) => {
                  const isActive = state.symbol === activeSymbol || (!activeSymbol && state === symbolStates[0]);
                  return (
                    <button
                      key={state.symbol}
                      type="button"
                      onClick={() => {
                        onSwitchSymbol(state.symbol);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-700/50 transition-colors cursor-pointer ${
                        isActive ? "bg-indigo-600/20 border-l-2 border-indigo-500" : ""
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold font-mono ${isActive ? "text-indigo-300" : "text-slate-200"}`}>
                            {state.symbol}
                          </span>
                          {isActive && (
                            <span className="text-[9px] px-1 py-0.2 bg-indigo-500/20 text-indigo-300 rounded font-mono">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {state.connection?.isEaConnected ? (
                            <span className="text-emerald-400">● Connected</span>
                          ) : (
                            <span className="text-slate-500">○ Disconnected</span>
                          )}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-semibold text-slate-200">
                          {state.currentPrice > 0 ? state.currentPrice.toFixed(2) : "—"}
                        </span>
                        <span className="block text-[9px] text-slate-500">
                          {state.tickCount} ticks
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
