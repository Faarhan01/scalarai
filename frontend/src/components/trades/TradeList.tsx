import React from "react";
import { Layers, RotateCcw } from "lucide-react";
import { TradeRecord, StrategyMode } from "../../types";
import { TradeRow } from "./TradeRow";

export interface TradeListProps {
  tradesList: TradeRecord[];
  currentPrice: number;
  selectedStrategy: StrategyMode;
  onCloseAllPositions: () => void;
  onTradeClick?: (trade: TradeRecord) => void;
}

export const TradeList: React.FC<TradeListProps> = ({
  tradesList,
  currentPrice,
  selectedStrategy,
  onCloseAllPositions,
  onTradeClick,
}) => {
  const openCount = tradesList.filter(t => t.status === "OPEN").length;

  return (
    <section className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-slate-700/70">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Active & Completed Scalps</h3>
          {openCount > 0 && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold">
              {openCount} OPEN
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {openCount > 0 && (
            <button
              type="button"
              onClick={onCloseAllPositions}
              className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 bg-rose-600/25 hover:bg-rose-600/35 border border-rose-500/40 text-rose-300 rounded-lg transition-all cursor-pointer shadow-sm"
            >
              Liquidate All Open
            </button>
          )}
          <span className="text-[9px] font-mono bg-slate-900 border border-slate-700 text-slate-300 px-2 py-1 rounded">
            Simulated & Metatrader Stream Combined
          </span>
        </div>
      </div>

      {/* Simulated Live positions */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-700 text-[10px] text-slate-300 uppercase tracking-wider bg-slate-850/50">
              <th className="py-2.5 px-3">Ticket</th>
              <th className="py-2.5 px-3">Type</th>
              <th className="py-2.5 px-3">Strategy</th>
              <th className="py-2.5 px-3">Lot Size</th>
              <th className="py-2.5 px-3">Entry Price</th>
              <th className="py-2.5 px-3">Current/Close</th>
              <th className="py-2.5 px-3 text-right">Profit / Floating</th>
              <th className="py-2.5 px-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="text-xs font-mono">
            {tradesList.length > 0 ? (
              tradesList.slice(0, 10).map((trade) => {
                const isLive = trade.status === "OPEN";
                const floatingPnl = isLive
                  ? (trade.type === "BUY" ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice) * 10.0 * trade.lotSize
                  : trade.profit;
                const isProfit = floatingPnl >= 0;
                return (
                  <TradeRow
                    key={trade.id}
                    trade={trade}
                    currentPrice={currentPrice}
                    selectedStrategy={selectedStrategy}
                    floatingPnl={floatingPnl}
                    isProfit={isProfit}
                    isLive={isLive}
                    onClick={() => onTradeClick?.(trade)}
                  />
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                  No active or closed scalps registered yet. Start the Expert Worker to trigger simulated trades.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
