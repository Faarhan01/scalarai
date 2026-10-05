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
      className="border-b border-slate-700/50 hover:bg-slate-750/30 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <td className="py-3 px-3 text-slate-300">#{trade.ticket}</td>
      <td className="py-3 px-3">
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
          trade.type === "BUY" ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
        }`}>
          {trade.type}
        </span>
      </td>
      <td className="py-3 px-3 text-slate-300 text-[11px] font-sans">
        {strategyLabel}
      </td>
      <td className="py-3 px-3 text-slate-200">{trade.lotSize.toFixed(2)}</td>
      <td className="py-3 px-3 text-slate-200">{trade.entryPrice.toFixed(2)}</td>
      <td className="py-3 px-3 text-slate-200">
        {isLive ? currentPrice.toFixed(2) : trade.closePrice?.toFixed(2)}
      </td>
      <td className={`py-3 px-3 text-right font-bold ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
        {isLive
          ? `${isProfit ? "+" : ""}$${floatingPnl.toFixed(2)}`
          : `${isProfit ? "+" : ""}$${trade.profit.toFixed(2)}`
        }
      </td>
      <td className="py-3 px-3 text-right text-[10px] text-slate-400 font-sans">
        {isLive ? (
          <span className="text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 py-0.5 px-2 rounded-full font-bold animate-pulse">
            LIVE
          </span>
        ) : (
          <span className="text-slate-400">Filled</span>
        )}
      </td>
    </tr>
  );
};
