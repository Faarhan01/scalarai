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
    <section className="card-panel flex flex-col gap-4">
      <div className="card-panel-header">
        <div className="card-panel-title">
          <Layers className="w-4 h-4 text-emerald-400" />
          <span>Active & Completed Scalps</span>
          {openCount > 0 && (
            <span className="badge badge-success">
              {openCount} OPEN
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {openCount > 0 && (
            <button
              type="button"
              onClick={onCloseAllPositions}
              className="btn btn-sm btn-danger"
            >
              Liquidate All Open
            </button>
          )}
          <span className="text-[10px] font-mono text-slate-400">
            MT5 Bridge & Local Combined
          </span>
        </div>
      </div>

      {/* Simulated Live positions */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th className="data-table-th">Ticket</th>
              <th className="data-table-th">Type</th>
              <th className="data-table-th">Strategy</th>
              <th className="data-table-th">Lot Size</th>
              <th className="data-table-th">Entry Price</th>
              <th className="data-table-th">Current/Close</th>
              <th className="data-table-th text-right">Profit / Floating</th>
              <th className="data-table-th text-right">Status</th>
            </tr>
          </thead>
          <tbody>
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
                <td colSpan={8} className="py-8 text-center text-slate-400 text-xs font-sans">
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
