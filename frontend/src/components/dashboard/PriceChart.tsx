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
  timeframe?: string;
  isRefreshingRates?: boolean;
  onToggleEma: () => void;
  onToggleBollingerBands: () => void;
  onSelectTimeframe?: (tf: string) => void;
  onRefreshRates?: () => void;
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
  timeframe = "M1",
  isRefreshingRates = false,
  onToggleEma,
  onToggleBollingerBands,
  onSelectTimeframe,
  onRefreshRates,
}) => {
  const { displayCandles, minPrice, maxPrice } = chartData;
  const timeframes = ["M1", "M5", "M15", "H1", "D1"];

  return (
    <div className="card-panel overflow-hidden flex flex-col p-0 border border-slate-700/70">
      {/* Graph Headers & Taps */}
      <div className="p-4 border-b border-slate-700/60 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-850/50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-2 font-mono">
            <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
            LIVE {activeSymbol || "MARKET"} ({timeframe})
          </span>

          {/* Timeframe selector pills */}
          <div className="flex items-center gap-1 ml-2 bg-slate-900/80 p-0.5 rounded-lg border border-slate-800">
            {timeframes.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onSelectTimeframe && onSelectTimeframe(tf)}
                className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer ${
                  timeframe === tf
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {onRefreshRates && (
            <button
              type="button"
              onClick={onRefreshRates}
              disabled={isRefreshingRates}
              className="p-1 text-slate-400 hover:text-indigo-300 transition-colors ml-1 cursor-pointer"
              title="Fetch fresh candlestick rates directly from MetaTrader 5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingRates ? "animate-spin text-indigo-400" : ""}`} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            <button
              onClick={onToggleEma}
              className={`btn btn-sm ${
                showEma ? "btn-primary" : "btn-secondary text-slate-400"
              }`}
            >
              EMA
            </button>
            <button
              onClick={onToggleBollingerBands}
              className={`btn btn-sm ${
                showBollingerBands ? "btn-primary" : "btn-secondary text-slate-400"
              }`}
            >
              BB
            </button>
          </div>
          <div className="flex gap-3 font-mono text-[10px] text-slate-400">
            <span>
              Quote:{" "}
              <strong className="text-indigo-400 font-bold tabular-nums">
                {currentPrice > 0 ? currentPrice.toFixed(2) : "—"}
              </strong>
            </span>
            <span>Candles: <strong className="text-slate-200 font-bold tabular-nums">{candleDataLength}</strong></span>
            <span>Latency: <strong className="text-slate-300 font-bold tabular-nums">{latency}ms</strong></span>
          </div>
        </div>
      </div>

      {/* Sparkline Canvas Area */}
      <div className="h-[500px] relative p-4 flex flex-col justify-end overflow-hidden bg-slate-950 border-b border-slate-800">
        {displayCandles.length > 1 ? (
          <div className="w-full h-full">
            <CandlestickChart chartData={chartData} currentPrice={currentPrice} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs gap-2 py-12">
            <RefreshCw className="w-8 h-8 animate-spin mb-1 text-indigo-400" />
            <span className="font-bold text-slate-200 text-sm">Waiting for MetaTrader 5 Direct Bridge...</span>
            <span className="text-[11px] text-slate-400 max-w-md text-center px-4 leading-relaxed">
              Connected via <code className="text-indigo-300 font-mono font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">mt5_pkg_bridge</code>. Real-time rates, ticks, and candle data flow directly from your MetaTrader 5 terminal process without requiring chart EAs or WebRequests.
            </span>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  fetch("/api/gateway/bridge/sync", { method: "POST" }).catch(() => {});
                  fetch("/api/gateway/bridge/connect", { method: "POST" }).catch(() => {});
                }}
                className="btn btn-primary btn-sm text-xs"
              >
                Sync MT5 Bridge
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Relocated Sub-Graph Statistics and AI Predictions panel */}
      <div className="bg-slate-850/80 px-4 py-3 flex flex-col sm:flex-row justify-between items-center gap-3 animate-fade-in">
        <div className="flex items-center gap-2.5 text-xs text-slate-300 font-mono">
          <span className="px-2.5 py-1 bg-slate-900 border border-slate-700/80 rounded-md flex items-center gap-1.5">
            <span className="text-slate-400 uppercase text-[10px]">Min:</span>
            <strong className="text-white tabular-nums">{minPrice.toFixed(2)}</strong>
          </span>
          <span className="px-2.5 py-1 bg-slate-900 border border-slate-700/80 rounded-md flex items-center gap-1.5">
            <span className="text-slate-400 uppercase text-[10px]">Max:</span>
            <strong className="text-white tabular-nums">{maxPrice.toFixed(2)}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-950/60 border border-indigo-500/30 py-1 px-3 rounded-lg flex items-center gap-2 font-mono">
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
              lastStrategySignal?.type === "BUY" ? "bg-emerald-500" :
              lastStrategySignal?.type === "SELL" ? "bg-rose-500" : "bg-indigo-500"
            }`}></span>
            <span className="text-[9px] text-indigo-300 font-semibold tracking-wider uppercase">Signal:</span>
            <span className={`text-[11px] font-bold tracking-wide uppercase ${
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
