import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Globe,
  RefreshCw,
  TrendingUp,
  Sliders,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Layers,
  ArrowRight,
  Info,
  ShieldCheck,
  Activity,
  Zap,
} from "lucide-react";

export interface BrokerSymbolItem {
  name: string;
  description?: string;
  path?: string;
  category?: string;
  digits?: number;
  point?: number;
  spread?: number;
  bid?: number;
  ask?: number;
  trade_mode?: number;
  _trade_mode?: string;
  volume_min?: number;
  volume_max?: number;
  volume_step?: number;
  margin_initial?: number;
  currency_base?: string;
  currency_profit?: string;
  currency_margin?: string;
}

export interface BrokerSymbolsViewProps {
  activeSymbol: string;
  onSwitchSymbol: (symbol: string) => void;
  isBridgeConnected: boolean;
  onNavigateToTrade?: () => void;
}

export const BrokerSymbolsView: React.FC<BrokerSymbolsViewProps> = ({
  activeSymbol,
  onSwitchSymbol,
  isBridgeConnected,
  onNavigateToTrade,
}) => {
  const [symbols, setSymbols] = useState<BrokerSymbolItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedSymbolForSpecs, setSelectedSymbolForSpecs] = useState<BrokerSymbolItem | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchBrokerSymbols = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/gateway/bridge/symbols");
      if (res.ok) {
        const data = await res.json();
        if (data.symbols && Array.isArray(data.symbols)) {
          setSymbols(data.symbols);
        } else if (data.data?.symbols) {
          setSymbols(data.data.symbols);
        }
      } else {
        // Fallback to /api/symbols
        const fallbackRes = await fetch("/api/symbols");
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          if (fallbackData.symbols) {
            setSymbols(
              fallbackData.symbols.map((s: any) => ({
                name: s.name || s.symbol,
                description: s.description || s.symbol,
                path: s.category || s.path || "Broker",
                digits: s.digits ?? 2,
                point: s.point ?? 0.01,
                spread: s.spread ?? 0.5,
                bid: s.bid || 0,
                ask: s.ask || 0,
              }))
            );
          }
        }
      }
    } catch (err: any) {
      console.error("Failed to load broker symbols:", err);
      setErrorMsg(err.message || "Unable to reach bridge symbol catalog");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchBrokerSymbols();
  }, [fetchBrokerSymbols]);

  // Derive categories from symbol paths
  const categories = useMemo(() => {
    const set = new Set<string>();
    symbols.forEach((s) => {
      const p = s.path || s.category || "";
      const top = p.split("/")[0]?.trim() || "Broker";
      if (top) set.add(top);
    });
    return ["ALL", ...Array.from(set).sort()];
  }, [symbols]);

  // Filter symbols by search & category
  const filteredSymbols = useMemo(() => {
    return symbols.filter((sym) => {
      const name = (sym.name || "").toLowerCase();
      const desc = (sym.description || "").toLowerCase();
      const path = (sym.path || sym.category || "").toLowerCase();
      const query = searchQuery.trim().toLowerCase();

      const matchesQuery = !query || name.includes(query) || desc.includes(query) || path.includes(query);

      if (!matchesQuery) return false;

      if (selectedCategory === "ALL") return true;

      const topCat = (sym.path || sym.category || "").split("/")[0]?.trim() || "Broker";
      return topCat.toLowerCase() === selectedCategory.toLowerCase();
    });
  }, [symbols, searchQuery, selectedCategory]);

  const handleSelectSymbol = (symbolName: string) => {
    onSwitchSymbol(symbolName);
    fetch("/api/status/switch-symbol", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: symbolName }),
    }).catch(() => {});
  };

  const handleTradeSymbol = (symbolName: string) => {
    handleSelectSymbol(symbolName);
    if (onNavigateToTrade) {
      onNavigateToTrade();
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="card-panel bg-slate-900/90 border-slate-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
              <Globe className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-white tracking-tight">Broker Symbols Catalog</h1>
            <span className="badge badge-info text-xs font-mono">
              {symbols.length} Available
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Auto-discovered directly from your broker terminal via{" "}
            <code className="text-indigo-300 font-mono font-bold bg-slate-950 px-1 py-0.5 rounded border border-slate-800">
              mt5_pkg_bridge
            </code>
            . No manual list hardcoding: every market, synthetic, currency pair, and index supported by your MetaTrader 5 account is dynamically queried.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => fetchBrokerSymbols(true)}
            disabled={refreshing || loading}
            className="btn btn-secondary text-xs flex items-center gap-1.5"
            title="Re-query broker symbol tree via MT5 Bridge"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
            <span>{refreshing ? "Scanning MT5..." : "Refresh Broker Symbols"}</span>
          </button>
        </div>
      </div>

      {/* 2. Connection State Notification */}
      {!isBridgeConnected && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90">
            <p className="font-bold text-amber-300 mb-0.5">MetaTrader 5 Bridge Idle</p>
            <p>
              Showing cached symbols catalog. Once you launch or connect your MetaTrader 5 terminal through the{" "}
              <strong className="text-amber-200">MT5 Direct Bridge</strong> tab, live real-time bid/ask quotes and full broker symbol specifications will stream automatically.
            </p>
          </div>
        </div>
      )}

      {/* 3. Search and Category Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search broker symbols (e.g. Step Index, EURUSD, BTC, Gold)..."
            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {categories.map((cat) => {
            const isCatActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  isCatActive
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                    : "bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-slate-700/50"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Symbols Grid / Table */}
      {loading ? (
        <div className="card-panel p-12 text-center flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" />
          <p className="text-sm font-semibold text-slate-200 font-sans">
            Reading broker symbol catalogue from MetaTrader 5 bridge...
          </p>
          <p className="text-xs text-slate-500">
            Querying all broker groups, synthetic instruments, and forex pairs.
          </p>
        </div>
      ) : filteredSymbols.length === 0 ? (
        <div className="card-panel p-12 text-center flex flex-col items-center justify-center gap-2">
          <Layers className="w-8 h-8 text-slate-600" />
          <p className="text-sm font-bold text-slate-300">No symbols found matching "{searchQuery}"</p>
          <p className="text-xs text-slate-500">
            Try adjusting your search query or selecting a different category folder above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSymbols.map((sym) => {
            const isCurrentActive =
              sym.name.toLowerCase() === (activeSymbol || "").toLowerCase();
            const spreadPoints = sym.spread !== undefined ? sym.spread : (sym.ask && sym.bid && sym.point ? ((sym.ask - sym.bid) / sym.point).toFixed(1) : "--");

            return (
              <div
                key={sym.name}
                className={`card-panel p-4 flex flex-col justify-between transition-all duration-200 border ${
                  isCurrentActive
                    ? "bg-slate-900 border-indigo-500 shadow-md shadow-indigo-500/10"
                    : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div>
                  {/* Top Row: Symbol Name & Active Tag */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold font-mono text-white tracking-tight">
                          {sym.name}
                        </span>
                        {isCurrentActive && (
                          <span className="badge badge-success text-[10px] py-0 px-1.5 font-mono">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 font-sans">
                        {sym.description || sym.path || "MetaTrader 5 Asset"}
                      </p>
                    </div>

                    <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 rounded shrink-0">
                      {sym.path ? sym.path.split("/")[0] : "Broker"}
                    </span>
                  </div>

                  {/* Pricing & Quotes Row */}
                  <div className="grid grid-cols-3 gap-2 mt-3.5 p-2.5 bg-slate-950/60 rounded-lg border border-slate-800/80">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">Bid</span>
                      <span className="text-xs font-mono font-bold text-slate-200">
                        {sym.bid && sym.bid > 0
                          ? sym.bid.toFixed(sym.digits ?? 2)
                          : isCurrentActive
                          ? "Live"
                          : "--"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">Ask</span>
                      <span className="text-xs font-mono font-bold text-slate-200">
                        {sym.ask && sym.ask > 0
                          ? sym.ask.toFixed(sym.digits ?? 2)
                          : isCurrentActive
                          ? "Live"
                          : "--"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-mono block">Spread</span>
                      <span className="text-xs font-mono font-bold text-amber-300">
                        {spreadPoints} pts
                      </span>
                    </div>
                  </div>

                  {/* Specs Pill List */}
                  <div className="flex items-center gap-2 mt-2.5 text-[10px] text-slate-400 font-mono">
                    <span>Digits: {sym.digits ?? 2}</span>
                    <span>•</span>
                    <span>Min Vol: {sym.volume_min ?? 0.01}</span>
                    <span>•</span>
                    <span>Mode: {sym._trade_mode || "Full"}</span>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => handleSelectSymbol(sym.name)}
                    className={`btn btn-xs flex-1 flex items-center justify-center gap-1 ${
                      isCurrentActive
                        ? "btn-secondary text-indigo-300 border-indigo-500/40"
                        : "btn-secondary"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isCurrentActive ? "Active Symbol" : "Select Symbol"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedSymbolForSpecs(sym)}
                    className="btn btn-xs btn-secondary px-2"
                    title="View full broker contract specification"
                  >
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTradeSymbol(sym.name)}
                    className="btn btn-xs btn-primary flex items-center gap-1"
                    title="Switch to this symbol and open Trading Terminal"
                  >
                    <span>Trade</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Detailed Contract Specifications Modal */}
      {selectedSymbolForSpecs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="card-panel bg-slate-900 border-slate-700 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-indigo-400">
                  Contract Specification
                </span>
                <h3 className="text-xl font-bold font-mono text-white mt-0.5">
                  {selectedSymbolForSpecs.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedSymbolForSpecs.description || "MetaTrader 5 Asset"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSymbolForSpecs(null)}
                className="text-slate-400 hover:text-white transition-colors p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/70 p-4 rounded-xl border border-slate-800 font-sans">
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Folder / Category</span>
                <strong className="text-slate-200 font-mono">{selectedSymbolForSpecs.path || selectedSymbolForSpecs.category || "Broker Root"}</strong>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Digits & Precision</span>
                <strong className="text-slate-200 font-mono">{selectedSymbolForSpecs.digits ?? 2} decimals (Point: {selectedSymbolForSpecs.point ?? 0.01})</strong>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Current Bid</span>
                <strong className="text-emerald-400 font-mono">{selectedSymbolForSpecs.bid || "--"}</strong>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Current Ask</span>
                <strong className="text-rose-400 font-mono">{selectedSymbolForSpecs.ask || "--"}</strong>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Spread</span>
                <strong className="text-amber-300 font-mono">{selectedSymbolForSpecs.spread ?? "--"} pts</strong>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Trading Mode</span>
                <strong className="text-slate-200 font-mono">{selectedSymbolForSpecs._trade_mode || "Full Execution"}</strong>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Min Volume</span>
                <strong className="text-slate-200 font-mono">{selectedSymbolForSpecs.volume_min ?? 0.01} lots</strong>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Max Volume</span>
                <strong className="text-slate-200 font-mono">{selectedSymbolForSpecs.volume_max ?? 100.0} lots</strong>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Volume Step</span>
                <strong className="text-slate-200 font-mono">{selectedSymbolForSpecs.volume_step ?? 0.01}</strong>
              </div>

              <div>
                <span className="text-slate-400 text-[10px] uppercase font-mono block">Initial Margin</span>
                <strong className="text-slate-200 font-mono">{selectedSymbolForSpecs.margin_initial ? `$${selectedSymbolForSpecs.margin_initial}` : "Dynamic"}</strong>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedSymbolForSpecs(null)}
                className="btn btn-secondary text-xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  handleTradeSymbol(selectedSymbolForSpecs.name);
                  setSelectedSymbolForSpecs(null);
                }}
                className="btn btn-primary text-xs flex items-center gap-1.5"
              >
                <span>Select &amp; Trade {selectedSymbolForSpecs.name}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
