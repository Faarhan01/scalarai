import React from "react";
import { RefreshCw } from "lucide-react";
import type { StrategyMode } from "../../types";
import type { CandleData, ChartData } from "../../hooks/useChartData";
import { CandlestickChart } from "../charts/CandlestickChart";

export interface PriceChartProps {
  activeSymbol: string;
  currentPrice: number;
  candleDataLength: number;
  latency: number;
  showEma: boolean;
  showBollingerBands: boolean;
  chartData: ChartData;
  lastStrategySignal: any;
  selectedStrategy: StrategyMode;
  onToggleEma: () => void;
  onToggleBollingerBands: () => void;
}

export const PriceChart: React.FC<PriceChartProps> = ({
  activeSymbol,
  currentPrice,
  candleDataLength,
  latency,
  showEma,
  showBollingerBands,
  chartData,
  lastStrategySignal,
  selectedStrategy,
  onToggleEma,
  onToggleBollingerBands,
}) => {
  const { displayCandles, minPrice, maxPrice } = chartData;

  return (
    <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl overflow-hidden flex flex-col shadow-sm">
      {/* Graph Headers & Taps */}
      <div className="p-4 border-b border-slate-700/60 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-850/50">
        <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-pulse"></span>
          LIVE {activeSymbol || "SYMBOL"} REAL-TIME STREAM (M1)
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-2">
            <button
              onClick={onToggleEma}
              className={`px-2 py-1 rounded text-[10px] font-mono transition-all ${
                showEma ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "bg-slate-800 text-slate-500 border border-slate-700"
              }`}
            >
              EMA
            </button>
            <button
              onClick={onToggleBollingerBands}
              className={`px-2 py-1 rounded text-[10px] font-mono transition-all ${
                showBollingerBands ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "bg-slate-800 text-slate-500 border border-slate-700"
              }`}
            >
              BB
            </button>
          </div>
          <div className="flex gap-4 font-mono text-[10px] text-slate-400">
            <span>Index Value: <strong className="text-indigo-400">{currentPrice.toFixed(2)}</strong></span>
            <span>Candles: <strong className="text-slate-200">{candleDataLength}</strong></span>
            <span>Execution Speed: <strong className="text-slate-300">{latency}ms</strong></span>
          </div>
        </div>
      </div>

      {/* Sparkline Canvas Area */}
      <div className="h-[500px] relative p-4 flex flex-col justify-end overflow-hidden bg-[#000000] border border-slate-800 rounded-xl">
        {displayCandles.length > 1 ? (
          <div className="w-full h-full">
            <CandlestickChart chartData={chartData} currentPrice={currentPrice} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs gap-1.5 py-12">
            <RefreshCw className="w-8 h-8 animate-spin mb-1 text-indigo-400" />
            <span className="font-bold text-slate-200">Waiting for MT5 EA Connection...</span>
            <span className="text-[11px] text-slate-400 max-w-sm text-center px-4">
              Launch your MetaTrader 5 terminal, verify that WebRequest is allowed for our address, and trigger active charts.
            </span>
          </div>
        )}
      </div>

      {/* Relocated Sub-Graph Statistics and AI Predictions panel */}
      <div className="border-t border-slate-700/60 bg-slate-850/80 px-4 py-3.5 flex flex-col sm:flex-row justify-between items-center gap-3 animate-fade-in">
        <div className="flex items-center gap-2.5 text-xs text-slate-300">
          <span className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg font-mono flex items-center gap-1">
            <span className="text-slate-400 uppercase">Min:</span>
            <strong className="text-white">{minPrice.toFixed(2)}</strong>
          </span>
          <span className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg font-mono flex items-center gap-1">
            <span className="text-slate-400 uppercase">Max:</span>
            <strong className="text-white">{maxPrice.toFixed(2)}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-950/60 border border-indigo-500/30 py-1 px-3 rounded-lg flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
              lastStrategySignal?.type === "BUY" ? "bg-emerald-500" :
              lastStrategySignal?.type === "SELL" ? "bg-rose-500" : "bg-indigo-500"
            }`}></span>
            <span className="text-[9px] text-indigo-300 font-semibold tracking-wider uppercase">Signal:</span>
            <span className={`text-[11px] font-black tracking-wide uppercase ${
              lastStrategySignal?.type === "BUY" ? "text-emerald-400" :
              lastStrategySignal?.type === "SELL" ? "text-rose-400" : "text-white"
            }`}>
              {lastStrategySignal?.type || selectedStrategy.replace("_", " ")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
