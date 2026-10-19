import React, { useState, useEffect, useCallback } from "react";
import {
  Cpu,
  Terminal,
  CheckCircle2,
  Copy,
  Check,
  Play,
  RotateCw,
  Zap,
  ShieldAlert,
  Sliders,
  DollarSign,
  Activity,
  Layers,
  ArrowRight,
  ExternalLink,
  Download,
  AlertCircle,
  Radio,
  Eye,
  X,
  Server,
  RefreshCw,
  Link2,
} from "lucide-react";

interface GatewayConsoleProps {
  activeSymbol: string;
  isBridgeConnected: boolean;
  onTradeActionComplete?: () => void;
}

export const GatewayConsole: React.FC<GatewayConsoleProps> = ({
  activeSymbol,
  isBridgeConnected,
  onTradeActionComplete,
}) => {
  const [gatewayStatus, setGatewayStatus] = useState<any>(null);
  const [bridgeStatus, setBridgeStatus] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [selectedAction, setSelectedAction] = useState<string>("BUY");
  const [orderVolume, setOrderVolume] = useState<number>(0.1);
  const [orderSl, setOrderSl] = useState<number>(150);
  const [orderTp, setOrderTp] = useState<number>(300);
  const [orderTicket, setOrderTicket] = useState<string>("");
  const [dispatchResult, setDispatchResult] = useState<any>(null);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<"terminal" | "account" | "positions" | "deals" | "functions" | "calculator">("terminal");
  const [bridgePositions, setBridgePositions] = useState<any[]>([]);
  const [bridgeDeals, setBridgeDeals] = useState<any[]>([]);
  const [bridgeFunctions, setBridgeFunctions] = useState<string[]>([]);
  const [engineMethods, setEngineMethods] = useState<string[]>([]);
  const [selectedFunction, setSelectedFunction] = useState<string>("account_info");
  const [functionArgs, setFunctionArgs] = useState<string>("{}");
  const [functionResult, setFunctionResult] = useState<any>(null);
  const [isExecutingFunction, setIsExecutingFunction] = useState<boolean>(false);

  // Calculator states
  const [calcAction, setCalcAction] = useState<string>("BUY");
  const [calcSymbol, setCalcSymbol] = useState<string>(activeSymbol || "Step Index");
  const [calcVolume, setCalcVolume] = useState<number>(0.1);
  const [calcOpenPrice, setCalcOpenPrice] = useState<number>(1000);
  const [calcClosePrice, setCalcClosePrice] = useState<number>(1010);
  const [calcResult, setCalcResult] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const [resGw, resBr] = await Promise.all([
        fetch("/api/gateway/status"),
        fetch("/api/gateway/bridge/status"),
      ]);
      if (resGw.ok) {
        const data = await resGw.json();
        setGatewayStatus(data);
      }
      if (resBr.ok) {
        const brData = await resBr.json();
        setBridgeStatus(brData);
      }
    } catch (err) {
      console.error("Failed to fetch gateway/bridge status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBridgeData = useCallback(async () => {
    try {
      const [posRes, dealRes, funcRes] = await Promise.all([
        fetch("/api/gateway/bridge/positions"),
        fetch("/api/gateway/bridge/deals"),
        fetch("/api/gateway/bridge/functions"),
      ]);
      if (posRes.ok) {
        const p = await posRes.json();
        if (p.success && Array.isArray(p.positions)) setBridgePositions(p.positions);
      }
      if (dealRes.ok) {
        const d = await dealRes.json();
        if (d.success && Array.isArray(d.deals)) setBridgeDeals(d.deals);
      }
      if (funcRes.ok) {
        const f = await funcRes.json();
        if (f.success) {
          if (Array.isArray(f.discovered_mt5_functions)) setBridgeFunctions(f.discovered_mt5_functions);
          if (Array.isArray(f.engine_methods)) setEngineMethods(f.engine_methods);
        }
      }
    } catch (err) {
      // quiet poll
    }
  }, []);

  const handleExecuteDynamicFunction = async () => {
    if (!selectedFunction) return;
    setIsExecutingFunction(true);
    setFunctionResult(null);
    try {
      let parsed = {};
      try {
        parsed = JSON.parse(functionArgs || "{}");
      } catch {
        parsed = { raw: functionArgs };
      }
      const res = await fetch("/api/gateway/bridge/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          function: selectedFunction,
          kwargs: parsed,
        }),
      });
      const data = await res.json();
      setFunctionResult(data);
    } catch (err: any) {
      setFunctionResult({ success: false, error: err.message });
    } finally {
      setIsExecutingFunction(false);
    }
  };

  const handleRunMarginCalc = async () => {
    setIsCalculating(true);
    try {
      const res = await fetch("/api/calculate/margin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: calcAction,
          symbol: calcSymbol || activeSymbol || "Step Index",
          volume: calcVolume,
          price: calcOpenPrice,
        }),
      });
      const data = await res.json();
      setCalcResult({ type: "MARGIN", data });
    } catch (err: any) {
      setCalcResult({ type: "MARGIN", error: err.message });
    } finally {
      setIsCalculating(false);
    }
  };

  const handleRunProfitCalc = async () => {
    setIsCalculating(true);
    try {
      const res = await fetch("/api/calculate/profit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: calcAction,
          symbol: calcSymbol || activeSymbol || "Step Index",
          volume: calcVolume,
          openPrice: calcOpenPrice,
          closePrice: calcClosePrice,
        }),
      });
      const data = await res.json();
      setCalcResult({ type: "PROFIT", data });
    } catch (err: any) {
      setCalcResult({ type: "PROFIT", error: err.message });
    } finally {
      setIsCalculating(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchBridgeData();
    const interval = setInterval(() => {
      fetchStatus();
      fetchBridgeData();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchBridgeData]);

  const handleConnectBridge = async () => {
    setIsConnecting(true);
    try {
      const res = await fetch("/api/gateway/bridge/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setDispatchResult({ success: data.success, message: data.success ? "Bridge connection initiated successfully" : data.error });
      await fetchStatus();
      await fetchBridgeData();
    } catch (err: any) {
      setDispatchResult({ success: false, error: err.message });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectBridge = async () => {
    try {
      await fetch("/api/gateway/bridge/disconnect", { method: "POST" });
      await fetchStatus();
    } catch (err) {
      console.error("Failed to disconnect bridge:", err);
    }
  };

  const handleSyncBridge = async () => {
    try {
      await fetch("/api/gateway/bridge/sync", { method: "POST" });
      await fetchStatus();
      await fetchBridgeData();
    } catch (err) {
      console.error("Sync error:", err);
    }
  };

  const handleDispatchCommand = async () => {
    setIsDispatching(true);
    try {
      const res = await fetch("/api/gateway/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: selectedAction,
          symbol: activeSymbol || "Step Index",
          volume: orderVolume,
          sl: orderSl,
          tp: orderTp,
          ticket: orderTicket || undefined,
          reason: "MetaTrader 5 Bridge Command",
        }),
      });
      const data = await res.json();
      setDispatchResult(data);
      await fetchStatus();
      await fetchBridgeData();
      if (onTradeActionComplete) onTradeActionComplete();
    } catch (err: any) {
      setDispatchResult({ success: false, error: err.message });
    } finally {
      setIsDispatching(false);
    }
  };

  const isConnected = isBridgeConnected || !!gatewayStatus?.isBridgeConnected || !!bridgeStatus?.is_connected;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Header Banner */}
      <div className="card-panel bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border-indigo-500/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`}></span>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-400" />
                <span>MetaTrader 5 Direct Bridge (`mt5_pkg_bridge`)</span>
              </h2>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                isConnected
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                  : "bg-amber-500/20 text-amber-300 border-amber-500/30"
              }`}>
                {isConnected ? "DIRECT MT5 BRIDGE ACTIVE" : "BRIDGE LOADED — READY FOR MT5"}
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              Native MetaTrader 5 Python bridge via <span className="font-mono text-indigo-300 font-bold">mt5_pkg_bridge</span>. Connects directly to the MetaTrader 5 terminal process to gather live account metrics, inspect terminal state, stream quotes, and execute trades without requiring chart WebRequest EAs.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleConnectBridge}
              disabled={isConnecting}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>{isConnecting ? "Connecting..." : "Connect MT5"}</span>
            </button>
            <button
              onClick={handleSyncBridge}
              className="btn btn-secondary text-xs flex items-center gap-1.5"
              title="Sync latest MT5 data"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
              <span>Sync</span>
            </button>
            <a
              href="/api/strategyforge/download"
              download="StrategyForge.mq5"
              className="btn btn-secondary text-xs flex items-center gap-1.5"
              title="Download StrategyForge EA for native Strategy Tester optimization"
            >
              <Download className="w-3.5 h-3.5" />
              <span>StrategyForge EA</span>
            </a>
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="btn btn-secondary text-xs p-2"
              title="Refresh status"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800">
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div className="text-[10px] uppercase font-mono text-slate-400">Bridge Package</div>
            <div className="text-xs font-bold flex items-center gap-1.5 mt-0.5 text-indigo-300 font-mono">
              <Server className="w-3.5 h-3.5 text-indigo-400" />
              <span>mt5_pkg_bridge v1.2.0</span>
            </div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div className="text-[10px] uppercase font-mono text-slate-400">Terminal Connection</div>
            <div className={`text-xs font-bold flex items-center gap-1.5 mt-0.5 ${isConnected ? "text-emerald-400" : "text-amber-400"}`}>
              {isConnected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Radio className="w-3.5 h-3.5 animate-pulse" />}
              <span>{isConnected ? "Connected to MT5" : "Ready / Standby"}</span>
            </div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div className="text-[10px] uppercase font-mono text-slate-400">Active Symbol</div>
            <div className="text-xs font-bold text-white font-mono mt-0.5">
              {gatewayStatus?.activeSymbol || activeSymbol || "Step Index"}
            </div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div className="text-[10px] uppercase font-mono text-slate-400">Account Equity</div>
            <div className="text-xs font-bold text-cyan-300 font-mono mt-0.5">
              {gatewayStatus?.account?.equity !== undefined && gatewayStatus?.account?.equity !== null
                ? `$${Number(gatewayStatus.account.equity).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                : "$10,000.00"}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Command Dispatcher & Telemetry (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Command Dispatcher (lg:col-span-7) */}
        <div className="lg:col-span-7 card-panel space-y-4">
          <div className="card-panel-header">
            <div className="card-panel-title flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span>Direct MetaTrader 5 Trade Dispatcher</span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">mt5_pkg_bridge Engine</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Select Order Action
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {["BUY", "SELL", "CLOSE", "CLOSE_ALL", "MODIFY"].map((act) => (
                  <button
                    key={act}
                    type="button"
                    onClick={() => setSelectedAction(act)}
                    className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                      selectedAction === act
                        ? act === "BUY"
                          ? "bg-emerald-600 border-emerald-500 text-white"
                          : act === "SELL"
                          ? "bg-rose-600 border-rose-500 text-white"
                          : "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    {act}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Volume (Lots)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="10.0"
                  value={orderVolume}
                  onChange={(e) => setOrderVolume(Number(e.target.value))}
                  className="input text-xs font-mono w-full"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Stop Loss (Points)
                </label>
                <input
                  type="number"
                  step="10"
                  min="0"
                  value={orderSl}
                  onChange={(e) => setOrderSl(Number(e.target.value))}
                  className="input text-xs font-mono w-full"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Take Profit (Points)
                </label>
                <input
                  type="number"
                  step="10"
                  min="0"
                  value={orderTp}
                  onChange={(e) => setOrderTp(Number(e.target.value))}
                  className="input text-xs font-mono w-full"
                />
              </div>
            </div>

            {(selectedAction === "CLOSE" || selectedAction === "MODIFY") && (
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Target Ticket #
                </label>
                <input
                  type="text"
                  placeholder="e.g. 837201"
                  value={orderTicket}
                  onChange={(e) => setOrderTicket(e.target.value)}
                  className="input text-xs font-mono w-full"
                />
              </div>
            )}

            <button
              onClick={handleDispatchCommand}
              disabled={isDispatching}
              className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-all shadow-lg ${
                selectedAction === "BUY"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-950/50 hover:brightness-110"
                  : selectedAction === "SELL"
                  ? "bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-rose-950/50 hover:brightness-110"
                  : "bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-indigo-950/50 hover:brightness-110"
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>
                {isDispatching
                  ? "Dispatching..."
                  : `Dispatch ${selectedAction} (${activeSymbol || "Step Index"} @ ${orderVolume} Lots)`}
              </span>
            </button>

            {dispatchResult && (
              <div
                className={`p-3 rounded-xl border text-xs font-mono flex items-start gap-2 ${
                  dispatchResult.success !== false
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                    : "bg-rose-950/40 border-rose-500/40 text-rose-300"
                }`}
              >
                {dispatchResult.success !== false ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                )}
                <div className="flex-1 overflow-x-auto">
                  <div className="font-bold">
                    {dispatchResult.success !== false ? "Execution Dispatched" : "Execution Error"}
                  </div>
                  <pre className="text-[10px] mt-1 text-slate-300">
                    {JSON.stringify(dispatchResult, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Bridge Information & How It Works (lg:col-span-5) */}
        <div className="lg:col-span-5 card-panel space-y-4">
          <div className="card-panel-header">
            <div className="card-panel-title flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Bridge Architecture</span>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 font-bold">Native Python / MT5</span>
          </div>

          <div className="space-y-3 text-xs text-slate-300">
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-2">
              <div className="font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Zero EA Chart Dependency</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                The platform now talks directly to MetaTrader 5 via the Python bridge package (`mt5_pkg_bridge`). It auto-discovers and exposes all MetaTrader 5 operations without relying on WebRequest or chart EAs.
              </p>
            </div>

            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-2">
              <div className="font-bold text-white flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>StrategyForge Strategy Lab</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                For quantitative research and multi-parameter optimization, the native <span className="font-mono text-indigo-300 font-bold">StrategyForge.mq5</span> EA runs in MetaTrader 5's Strategy Tester and outputs custom Sharpe, Calmar, and profit factor reports directly.
              </p>
              <div className="pt-1">
                <a
                  href="/api/strategyforge/download"
                  download="StrategyForge.mq5"
                  className="btn btn-secondary text-xs w-full flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download StrategyForge.mq5</span>
                </a>
              </div>
            </div>

            {/* Connection configuration hint */}
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/80">
              <div className="text-[11px] font-mono text-slate-400 font-bold mb-1">Bridge Environment Setup</div>
              <div className="text-[10px] font-mono text-slate-400 space-y-1">
                <div>• Location: <span className="text-slate-200">backend/src/gateway/mt5</span></div>
                <div>• Package: <span className="text-slate-200">mt5_pkg_bridge</span> (Python 3)</div>
                <div>• Path: <span className="text-slate-200">CONY_MT5_PACKAGE</span> (optional override)</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bridge Data Viewer Tabs (Terminal, Account, Positions, Deals) */}
      <div className="card-panel space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            {[
              { id: "terminal", label: "Terminal State" },
              { id: "account", label: "Account Info" },
              { id: "positions", label: `Open Positions (${bridgePositions.length})` },
              { id: "deals", label: `Closed Deals (${bridgeDeals.length})` },
              { id: "functions", label: `Bridge Functions (${bridgeFunctions.length || 0})` },
              { id: "calculator", label: "Margin & Profit Calculator" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeSubTab === tab.id
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchBridgeData}
            className="btn btn-secondary text-xs py-1 px-2.5 flex items-center gap-1"
          >
            <RotateCw className="w-3 h-3" />
            <span>Refresh</span>
          </button>
        </div>

        {activeSubTab === "terminal" && (
          <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 font-mono text-xs">
            <pre className="text-slate-300 overflow-x-auto">
              {JSON.stringify(bridgeStatus?.terminal || gatewayStatus?.account || { status: "Ready", bridge: "mt5_pkg_bridge", mode: "direct" }, null, 2)}
            </pre>
          </div>
        )}

        {activeSubTab === "account" && (
          <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 font-mono text-xs">
            <pre className="text-slate-300 overflow-x-auto">
              {JSON.stringify(bridgeStatus?.account || gatewayStatus?.account || { status: "Ready" }, null, 2)}
            </pre>
          </div>
        )}

        {activeSubTab === "positions" && (
          <div className="overflow-x-auto">
            {bridgePositions.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No open positions currently reported by MetaTrader 5.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2">Ticket</th>
                    <th>Symbol</th>
                    <th>Type</th>
                    <th>Volume</th>
                    <th>Open Price</th>
                    <th>Current Price</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {bridgePositions.map((pos) => (
                    <tr key={pos.ticket} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="py-2 text-indigo-300">#{pos.ticket}</td>
                      <td className="text-white font-bold">{pos.symbol}</td>
                      <td className={pos.type === 0 ? "text-emerald-400" : "text-rose-400"}>
                        {pos.type === 0 ? "BUY" : "SELL"}
                      </td>
                      <td>{pos.volume}</td>
                      <td>{pos.price_open}</td>
                      <td>{pos.price_current}</td>
                      <td className={pos.profit >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        ${pos.profit?.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeSubTab === "deals" && (
          <div className="overflow-x-auto">
            {bridgeDeals.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No recent closed deals found in MT5 history.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2">Deal</th>
                    <th>Order</th>
                    <th>Symbol</th>
                    <th>Volume</th>
                    <th>Price</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {bridgeDeals.map((deal) => (
                    <tr key={deal.dealTicket || deal.id} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="py-2 text-indigo-300">#{deal.dealTicket || deal.id}</td>
                      <td>#{deal.orderTicket || "--"}</td>
                      <td className="text-white font-bold">{deal.symbol}</td>
                      <td>{deal.volume}</td>
                      <td>{deal.price}</td>
                      <td className={deal.profit >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        ${deal.profit?.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeSubTab === "functions" && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">Auto-Discovered MetaTrader 5 Functions ({bridgeFunctions.length})</span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/30">
                  Dynamic API Discovery Active
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Any public MetaTrader 5 function or MT5Engine method discovered by <code className="text-slate-200">api_manager</code> can be invoked dynamically with keyword parameters.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Target Function
                </label>
                <input
                  type="text"
                  list="mt5-func-list"
                  value={selectedFunction}
                  onChange={(e) => setSelectedFunction(e.target.value)}
                  placeholder="e.g. account_info, copy_ticks_from"
                  className="input text-xs font-mono w-full"
                />
                <datalist id="mt5-func-list">
                  {bridgeFunctions.map((fn) => (
                    <option key={fn} value={fn} />
                  ))}
                  {engineMethods.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              <div className="md:col-span-2">
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  Arguments (JSON format)
                </label>
                <input
                  type="text"
                  value={functionArgs}
                  onChange={(e) => setFunctionArgs(e.target.value)}
                  placeholder='e.g. {"symbol": "Step Index"}'
                  className="input text-xs font-mono w-full"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleExecuteDynamicFunction}
                disabled={isExecutingFunction}
                className="btn btn-primary text-xs py-2 px-4 flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isExecutingFunction ? "Executing..." : `Invoke ${selectedFunction}()`}</span>
              </button>
            </div>

            {functionResult && (
              <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 font-mono text-xs space-y-2">
                <div className="text-[10px] uppercase font-bold text-indigo-400">Execution Result:</div>
                <pre className="text-slate-200 overflow-x-auto text-[11px]">
                  {JSON.stringify(functionResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeSubTab === "calculator" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">Action</label>
                <select
                  value={calcAction}
                  onChange={(e) => setCalcAction(e.target.value)}
                  className="input text-xs font-mono w-full"
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">Symbol</label>
                <input
                  type="text"
                  value={calcSymbol}
                  onChange={(e) => setCalcSymbol(e.target.value)}
                  className="input text-xs font-mono w-full"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">Volume (Lots)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={calcVolume}
                  onChange={(e) => setCalcVolume(Number(e.target.value))}
                  className="input text-xs font-mono w-full"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">Open Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={calcOpenPrice}
                  onChange={(e) => setCalcOpenPrice(Number(e.target.value))}
                  className="input text-xs font-mono w-full"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">Target Close Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={calcClosePrice}
                  onChange={(e) => setCalcClosePrice(Number(e.target.value))}
                  className="input text-xs font-mono w-full"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRunMarginCalc}
                disabled={isCalculating}
                className="btn btn-secondary text-xs flex items-center gap-1.5"
              >
                <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
                <span>Calculate Required Margin</span>
              </button>

              <button
                onClick={handleRunProfitCalc}
                disabled={isCalculating}
                className="btn btn-secondary text-xs flex items-center gap-1.5"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>Calculate Projected Profit</span>
              </button>
            </div>

            {calcResult && (
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 font-mono text-xs">
                <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">
                  Calculation Output ({calcResult.type}):
                </div>
                <pre className="text-slate-200 overflow-x-auto text-[11px]">
                  {JSON.stringify(calcResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
