import React from "react";
import { TradeRecord, StrategyMode } from "../../types";

export interface TradeRowProps {
  trade: TradeRecord;
  currentPrice: number;
  selectedStrategy: StrategyMode;
  floatingPnl: number;
  isProfit: boolean;
  isLive: boolean;
  onClick?: () => void;
}

export const TradeRow: React.FC<TradeRowProps> = ({
  trade,
  currentPrice,
  selectedStrategy,
  floatingPnl,
  isProfit,
  isLive,
  onClick,
}) => {
  const strategyLabel =
    trade.strategy === StrategyMode.TREND_FOLLOWING
      ? "Trend Scalper"
      : trade.strategy === StrategyMode.MEAN_REVERSION
      ? "Mean Reversion"
      : "Cognitive AI";

  return (
    <tr
      className="data-table-row cursor-pointer"
      onClick={onClick}
    >
      <td className="data-table-td text-slate-300">#{trade.ticket}</td>
      <td className="data-table-td">
        <span className={`badge ${
          trade.type === "BUY" ? "badge-success" : "badge-danger"
        }`}>
          {trade.type}
        </span>
      </td>
      <td className="data-table-td text-slate-300 text-[11px] font-sans">
        {strategyLabel}
      </td>
      <td className="data-table-td text-slate-200">{trade.lotSize.toFixed(2)}</td>
      <td className="data-table-td text-slate-200">{trade.entryPrice.toFixed(2)}</td>
      <td className="data-table-td text-slate-200">
        {isLive ? currentPrice.toFixed(2) : trade.closePrice?.toFixed(2)}
      </td>
      <td className={`data-table-td text-right font-bold ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
        {isLive
          ? `${isProfit ? "+" : ""}$${floatingPnl.toFixed(2)}`
          : `${isProfit ? "+" : ""}$${trade.profit.toFixed(2)}`
        }
      </td>
      <td className="data-table-td text-right text-[10px] text-slate-400 font-sans">
        {isLive ? (
          <span className="badge badge-success animate-pulse">
            LIVE
          </span>
        ) : (
          <span className="text-slate-400 font-mono text-[10px]">FILLED</span>
        )}
      </td>
    </tr>
  );
};
