import React, { useState, useEffect, useCallback } from "react";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  RotateCw,
  Sliders,
  DollarSign,
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  X,
  Check,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";

interface PortfolioViewProps {
  activeSymbol: string;
  onTradeActionComplete?: () => void;
}

export const PortfolioView: React.FC<PortfolioViewProps> = ({
  activeSymbol,
  onTradeActionComplete,
}) => {
  const [account, setAccount] = useState<any>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Quick Order State
  const [quickVolume, setQuickVolume] = useState<number>(0.1);
  const [quickSl, setQuickSl] = useState<number>(150);
  const [quickTp, setQuickTp] = useState<number>(300);

  // Modify Modal State
  const [modifyingPosition, setModifyingPosition] = useState<any | null>(null);
  const [modSl, setModSl] = useState<number>(0);
  const [modTp, setModTp] = useState<number>(0);

  const fetchPortfolioData = useCallback(async () => {
    try {
      setLoading(true);
      const [accRes, dealsRes] = await Promise.all([
        fetch("/api/account"),
        fetch("/api/history/deals"),
      ]);

      if (accRes.ok) {
        const accData = await accRes.json();
        setAccount(accData);
      }

      if (dealsRes.ok) {
        const dData = await dealsRes.json();
        setDeals(dData.deals || []);
      }

      // Fetch positions
      const posRes = await fetch("/api/positions");
      if (posRes.ok) {
        const pData = await posRes.json();
        setPositions(pData.positions || []);
      }
    } catch (err) {
      console.error("Failed to fetch portfolio data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolioData();
    const interval = setInterval(fetchPortfolioData, 3000);
    return () => clearInterval(interval);
  }, [fetchPortfolioData]);

  const handleQuickBuy = async () => {
    setActionLoading("buy");
    try {
      const res = await fetch("/api/order/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: activeSymbol || "Step Index",
          volume: quickVolume,
          sl: quickSl,
          tp: quickTp,
        }),
      });
      await res.json();
      await fetchPortfolioData();
      if (onTradeActionComplete) onTradeActionComplete();
    } catch (err) {
      console.error("Buy order failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleQuickSell = async () => {
    setActionLoading("sell");
    try {
      const res = await fetch("/api/order/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: activeSymbol || "Step Index",
          volume: quickVolume,
          sl: quickSl,
          tp: quickTp,
        }),
      });
      await res.json();
      await fetchPortfolioData();
      if (onTradeActionComplete) onTradeActionComplete();
    } catch (err) {
      console.error("Sell order failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleClosePosition = async (ticket: string | number) => {
    setActionLoading(`close_${ticket}`);
    try {
      const res = await fetch("/api/order/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket }),
      });
      await res.json();
      await fetchPortfolioData();
      if (onTradeActionComplete) onTradeActionComplete();
    } catch (err) {
      console.error("Close position failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCloseAll = async () => {
    if (!window.confirm("Liquidate ALL open positions immediately?")) return;
    setActionLoading("close_all");
    try {
      const res = await fetch("/api/order/close_all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await res.json();
      await fetchPortfolioData();
      if (onTradeActionComplete) onTradeActionComplete();
    } catch (err) {
      console.error("Close all failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveModify = async () => {
    if (!modifyingPosition) return;
    try {
      await fetch("/api/order/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: modifyingPosition.ticket || modifyingPosition.id,
          sl: modSl,
          tp: modTp,
        }),
      });
      setModifyingPosition(null);
      await fetchPortfolioData();
    } catch (err) {
      console.error("Failed to modify position:", err);
    }
  };

  const totalFloatingProfit = positions.reduce((sum, p) => sum + (p.profit || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Header & Summary Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-indigo-400" />
            <span>Account Portfolio &amp; Deal Management</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time margin utilization, open MT5 positions, floating PnL, and closed deal ledger.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchPortfolioData}
            disabled={loading}
            className="btn btn-secondary text-xs flex items-center gap-1.5"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          {positions.length > 0 && (
            <button
              onClick={handleCloseAll}
              disabled={actionLoading === "close_all"}
              className="btn btn-danger text-xs flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Panic Close All ({positions.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Balance Card */}
        <div className="card-panel p-4 bg-slate-900/90 border-slate-800">
          <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center justify-between">
            <span>Balance</span>
            <span className={account?.login ? "text-indigo-400 font-bold" : "text-slate-400"}>
              {account?.login ? `#${account.login}` : "Unconnected"}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {account?.login
              ? `$${Number(account?.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "--"}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
            <span>Broker:</span>
            <span className="text-indigo-300 font-medium">
              {account?.broker || "Awaiting MT5 Bridge Connection"}
            </span>
          </div>
        </div>

        {/* Equity Card */}
        <div className="card-panel p-4 bg-slate-900/90 border-slate-800">
          <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center justify-between">
            <span>Equity</span>
            <span className="text-cyan-400 font-bold">{account?.login ? (account?.currency || "USD") : "--"}</span>
          </div>
          <div className="text-xl font-bold font-mono text-cyan-300 mt-1">
            {account?.login
              ? `$${Number(account?.equity || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "--"}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
            <span>Floating:</span>
            <span className={`font-mono font-bold ${totalFloatingProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {account?.login ? `${totalFloatingProfit >= 0 ? "+" : ""}$${totalFloatingProfit.toFixed(2)}` : "$0.00"}
            </span>
          </div>
        </div>

        {/* Margin Utilization */}
        <div className="card-panel p-4 bg-slate-900/90 border-slate-800">
          <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center justify-between">
            <span>Margin In Use</span>
            <span className="text-amber-400 font-bold">
              {account?.leverage ? `1:${account.leverage}` : "--"}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-amber-300 mt-1">
            {account?.login
              ? `$${Number(account?.margin || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "--"}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
            <span>Free Margin:</span>
            <span className="text-slate-200 font-mono">
              {account?.login ? `$${Number(account?.freeMargin || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "--"}
            </span>
          </div>
        </div>

        {/* Positions & Deals Counter */}
        <div className="card-panel p-4 bg-slate-900/90 border-slate-800">
          <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center justify-between">
            <span>Open Positions</span>
            <span className="badge badge-primary text-[10px]">{positions.length} Active</span>
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {positions.length} <span className="text-xs font-normal text-slate-400">orders</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
            <span>Closed Deals:</span>
            <span className="text-slate-300 font-mono font-semibold">{deals.length} recorded</span>
          </div>
        </div>
      </div>

      {/* 3. Quick Order Bar */}
      <div className="card-panel bg-slate-950 p-4 border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>Quick Order Terminal</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                {activeSymbol || "Step Index"}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">Direct order dispatch to MT5 gateway or platform engine</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 font-mono">Lot:</span>
            <input
              type="number"
              step="0.01"
              value={quickVolume}
              onChange={(e) => setQuickVolume(parseFloat(e.target.value) || 0.1)}
              className="w-16 bg-transparent text-xs text-white font-mono focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 font-mono">SL:</span>
            <input
              type="number"
              value={quickSl}
              onChange={(e) => setQuickSl(parseInt(e.target.value) || 0)}
              className="w-14 bg-transparent text-xs text-white font-mono focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 font-mono">TP:</span>
            <input
              type="number"
              value={quickTp}
              onChange={(e) => setQuickTp(parseInt(e.target.value) || 0)}
              className="w-14 bg-transparent text-xs text-white font-mono focus:outline-none"
            />
          </div>

          <button
            onClick={handleQuickBuy}
            disabled={actionLoading !== null}
            className="btn btn-success py-2 px-4 text-xs font-bold flex items-center gap-1"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>BUY</span>
          </button>

          <button
            onClick={handleQuickSell}
            disabled={actionLoading !== null}
            className="btn btn-danger py-2 px-4 text-xs font-bold flex items-center gap-1"
          >
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>SELL</span>
          </button>
        </div>
      </div>

      {/* 4. Open Positions Table */}
      <div className="card-panel space-y-4">
        <div className="card-panel-header">
          <div className="card-panel-title flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Live Open Positions ({positions.length})</span>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Real-time MT5 Direct Bridge sync
          </span>
        </div>

        {positions.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs font-mono">
            No active positions open. Place a trade via the Quick Order terminal or automated bot.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                  <th className="py-2.5 px-3">Ticket</th>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Volume</th>
                  <th className="py-2.5 px-3">Open Price</th>
                  <th className="py-2.5 px-3">Current</th>
                  <th className="py-2.5 px-3">SL / TP</th>
                  <th className="py-2.5 px-3">Floating Profit</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {positions.map((pos) => {
                  const isBuy = pos.type === "BUY";
                  const profit = Number(pos.profit || 0);
                  const isProfit = profit >= 0;

                  return (
                    <tr key={pos.ticket || pos.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-300">#{pos.ticket || pos.id}</td>
                      <td className="py-2.5 px-3 text-white font-sans font-semibold">{pos.symbol}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isBuy ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {pos.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-200">{pos.lotSize || pos.volume}</td>
                      <td className="py-2.5 px-3 text-slate-300">{Number(pos.openPrice).toFixed(4)}</td>
                      <td className="py-2.5 px-3 text-slate-200">{Number(pos.currentPrice || pos.openPrice).toFixed(4)}</td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        SL: {pos.sl || "-"} | TP: {pos.tp || "-"}
                      </td>
                      <td className={`py-2.5 px-3 font-bold ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                        {isProfit ? "+" : ""}${profit.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setModifyingPosition(pos);
                            setModSl(pos.sl || 0);
                            setModTp(pos.tp || 0);
                          }}
                          className="btn btn-secondary py-1 px-2 text-[10px]"
                        >
                          Modify
                        </button>
                        <button
                          type="button"
                          onClick={() => handleClosePosition(pos.ticket || pos.id)}
                          disabled={actionLoading === `close_${pos.ticket || pos.id}`}
                          className="btn btn-danger py-1 px-2 text-[10px]"
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Closed Deals History Ledger */}
      <div className="card-panel space-y-4">
        <div className="card-panel-header">
          <div className="card-panel-title flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>Closed Deals &amp; Historical Ledger ({deals.length})</span>
          </div>
          <span className="text-xs font-mono text-slate-400">Permanent Database Records</span>
        </div>

        {deals.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-xs font-mono">
            No closed deals logged yet. Closed deals from MetaTrader 5 or platform appear here automatically.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                  <th className="py-2.5 px-3">Deal #</th>
                  <th className="py-2.5 px-3">Order #</th>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Volume</th>
                  <th className="py-2.5 px-3">Close Price</th>
                  <th className="py-2.5 px-3">Profit / Loss</th>
                  <th className="py-2.5 px-3 text-right">Close Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {deals.slice(0, 50).map((d) => {
                  const isProfit = Number(d.profit) >= 0;
                  return (
                    <tr key={d.dealTicket || d.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 text-indigo-300 font-bold">#{d.dealTicket}</td>
                      <td className="py-2.5 px-3 text-slate-400">#{d.orderTicket || "-"}</td>
                      <td className="py-2.5 px-3 text-white font-sans font-semibold">{d.symbol}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${d.type === "BUY" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                          {d.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{d.volume}</td>
                      <td className="py-2.5 px-3 text-slate-300">{Number(d.price).toFixed(4)}</td>
                      <td className={`py-2.5 px-3 font-bold ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                        {isProfit ? "+" : ""}${Number(d.profit).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400 text-[11px]">
                        {new Date(d.closeTime).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modify Position Modal */}
      {modifyingPosition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-white text-sm">
                  Modify Position #{modifyingPosition.ticket || modifyingPosition.id}
                </span>
              </div>
              <button
                onClick={() => setModifyingPosition(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-mono block mb-1">
                  Stop Loss Points
                </label>
                <input
                  type="number"
                  value={modSl}
                  onChange={(e) => setModSl(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-mono block mb-1">
                  Take Profit Points
                </label>
                <input
                  type="number"
                  value={modTp}
                  onChange={(e) => setModTp(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModifyingPosition(null)}
                className="btn btn-secondary flex-1 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModify}
                className="btn btn-primary flex-1 py-2 text-xs"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortfolioView;
