import React, { useState, useEffect, useCallback } from "react";
import {
  FlaskConical,
  Play,
  RotateCw,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Search,
  Sliders,
  CheckCircle2,
  Activity,
  Layers,
  Sparkles,
  Award,
  Zap,
  Download,
  Upload,
  FileText,
  ShieldCheck,
  Check,
  Copy,
  Clock,
  ArrowRight,
} from "lucide-react";

interface ResearchLabProps {
  activeSymbol: string;
}

export const ResearchLab: React.FC<ResearchLabProps> = ({ activeSymbol }) => {
  const [activeTab, setActiveTab] = useState<"backtest" | "patterns" | "indicators" | "strategyforge">("backtest");

  // Backtest state
  const [strategy, setStrategy] = useState<string>("ma_cross");
  const [candleCount, setCandleCount] = useState<number>(300);
  const [fastPeriod, setFastPeriod] = useState<number>(12);
  const [slowPeriod, setSlowPeriod] = useState<number>(26);
  const [rsiPeriod, setRsiPeriod] = useState<number>(14);
  const [lotSize, setLotSize] = useState<number>(0.1);
  const [slPoints, setSlPoints] = useState<number>(150);
  const [tpPoints, setTpPoints] = useState<number>(300);
  const [trailingStop, setTrailingStop] = useState<boolean>(true);
  const [trailingPoints, setTrailingPoints] = useState<number>(100);

  const [isRunningBacktest, setIsRunningBacktest] = useState<boolean>(false);
  const [backtestResult, setBacktestResult] = useState<any>(null);

  // Pattern Scan state
  const [isScanningPatterns, setIsScanningPatterns] = useState<boolean>(false);
  const [patterns, setPatterns] = useState<any[]>([]);

  // Indicator Inspector state
  const [selectedIndicator, setSelectedIndicator] = useState<string>("rsi");
  const [indicatorPeriod, setIndicatorPeriod] = useState<number>(14);
  const [indicatorData, setIndicatorData] = useState<any>(null);

  // StrategyForge Integration state
  const [sfRuns, setSfRuns] = useState<any[]>([]);
  const [loadingSfRuns, setLoadingSfRuns] = useState<boolean>(false);
  const [csvUploadText, setCsvUploadText] = useState<string>("");
  const [isUploadingCsv, setIsUploadingCsv] = useState<boolean>(false);
  const [csvUploadStatus, setCsvUploadStatus] = useState<string>("");
  const [copiedInputs, setCopiedInputs] = useState<boolean>(false);

  // Fetch StrategyForge runs from backend
  const fetchStrategyForgeRuns = useCallback(async () => {
    try {
      setLoadingSfRuns(true);
      const res = await fetch("/api/research/strategyforge-results");
      if (res.ok) {
        const data = await res.json();
        if (data.results) {
          setSfRuns(data.results);
        }
      }
    } catch (err) {
      console.error("Failed to load StrategyForge runs:", err);
    } finally {
      setLoadingSfRuns(false);
    }
  }, []);

  // Run backtest
  const handleRunBacktest = useCallback(async () => {
    setIsRunningBacktest(true);
    try {
      const res = await fetch("/api/research/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: activeSymbol || "Step Index",
          strategy,
          candleCount,
          fastPeriod,
          slowPeriod,
          rsiPeriod,
          lotSize,
          slPoints,
          tpPoints,
          trailingStop,
          trailingPoints,
          initialBalance: 10000,
        }),
      });
      const data = await res.json();
      const resultObj = data.results || (data.data && data.data.results) || data.result;
      if (resultObj) {
        setBacktestResult(resultObj);
      }
    } catch (err) {
      console.error("Backtest failed:", err);
    } finally {
      setIsRunningBacktest(false);
    }
  }, [activeSymbol, strategy, candleCount, fastPeriod, slowPeriod, rsiPeriod, lotSize, slPoints, tpPoints, trailingStop, trailingPoints]);

  // Run pattern scan
  const handleScanPatterns = useCallback(async () => {
    setIsScanningPatterns(true);
    try {
      const res = await fetch("/api/research/pattern-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: activeSymbol || "Step Index",
          count: 100,
        }),
      });
      const data = await res.json();
      const detected = data.patterns || data.detectedPatterns || (data.data && data.data.patterns);
      if (detected) {
        setPatterns(detected);
      }
    } catch (err) {
      console.error("Pattern scan failed:", err);
    } finally {
      setIsScanningPatterns(false);
    }
  }, [activeSymbol]);

  // Run indicator calculation
  const handleFetchIndicator = useCallback(async (ind = selectedIndicator, period = indicatorPeriod) => {
    try {
      const res = await fetch("/api/research/indicator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: activeSymbol || "Step Index",
          indicator: ind,
          period: Number(period) || 14,
          count: 100,
        }),
      });
      const data = await res.json();
      setIndicatorData(data.series ? data : data.data);
    } catch (err) {
      console.error("Indicator fetch failed:", err);
    }
  }, [activeSymbol, selectedIndicator, indicatorPeriod]);

  useEffect(() => {
    handleRunBacktest();
    handleScanPatterns();
    handleFetchIndicator(selectedIndicator, indicatorPeriod);
    fetchStrategyForgeRuns();
  }, [activeSymbol]);

  // Handle CSV upload
  const handleCsvSubmit = async () => {
    if (!csvUploadText.trim()) return;
    setIsUploadingCsv(true);
    setCsvUploadStatus("");
    try {
      const res = await fetch("/api/research/strategyforge-parse-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent: csvUploadText }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        setCsvUploadStatus(`Imported run "${data.result.tag}" (${data.result.modeName})!`);
        setCsvUploadText("");
        await fetchStrategyForgeRuns();
      } else {
        setCsvUploadStatus(`Import failed: ${data.error || "Invalid CSV format"}`);
      }
    } catch (err: any) {
      setCsvUploadStatus(`Error: ${err.message}`);
    } finally {
      setIsUploadingCsv(false);
    }
  };

  const handleCopyStrategyForgeInputs = () => {
    const modeIdx =
      strategy === "ma_cross" ? 0 :
      strategy === "rsi_reversion" ? 1 :
      strategy === "breakout" ? 2 :
      strategy === "bollinger" ? 3 :
      strategy === "macd" ? 4 :
      strategy === "pattern_scan" ? 5 :
      strategy === "indicator_inspect" ? 6 : 7;

    const snippet = `// StrategyForge.mq5 Inputs for ${activeSymbol || "Step Index"}
InpMode=${modeIdx}; // ${strategy}
InpFast=${fastPeriod};
InpSlow=${slowPeriod};
InpPeriod=${rsiPeriod};
InpLots=${lotSize};
InpStopPips=${(slPoints / 10).toFixed(1)};
InpTakePips=${(tpPoints / 10).toFixed(1)};
InpTrailPoints=${trailingStop ? trailingPoints : 0};`;

    navigator.clipboard.writeText(snippet);
    setCopiedInputs(true);
    setTimeout(() => setCopiedInputs(false), 2500);
  };

  // SVG Equity curve renderer
  const renderEquityCurve = (curve: any[]) => {
    if (!curve || curve.length < 2) return null;
    const values = curve.map((c) => c.equity);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const width = 600;
    const height = 150;
    const padding = 15;

    const points = values
      .map((val, idx) => {
        const x = padding + (idx / (values.length - 1)) * (width - 2 * padding);
        const y = height - padding - ((val - minVal) / range) * (height - 2 * padding);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    const isProfitable = values[values.length - 1] >= values[0];
    const strokeColor = isProfitable ? "#10b981" : "#f43f5e";

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 overflow-visible">
        <defs>
          <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <polygon
          points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`}
          fill="url(#curveGradient)"
        />
        <polyline fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" points={points} />
      </svg>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-indigo-400" />
            <span>Research &amp; Strategy Backtesting Lab</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Quantitative research suite powering StrategyForge: native backtests, candlestick patterns, and technical indicator analytics.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab("backtest")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "backtest" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:text-white"
            }`}
          >
            Strategy Backtester
          </button>
          <button
            onClick={() => setActiveTab("patterns")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "patterns" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:text-white"
            }`}
          >
            Pattern Recognition
          </button>
          <button
            onClick={() => setActiveTab("indicators")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "indicators" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:text-white"
            }`}
          >
            Indicator Inspector
          </button>
          <button
            onClick={() => {
              setActiveTab("strategyforge");
              fetchStrategyForgeRuns();
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "strategyforge" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:text-white"
            }`}
          >
            <span>StrategyForge MT5 Runs</span>
            <span className="text-[10px] bg-slate-950 px-1.5 py-0.2 rounded-full text-indigo-300 font-mono">
              {sfRuns.length}
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: STRATEGY BACKTESTER */}
      {activeTab === "backtest" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Backtest Controls (lg:col-span-4) */}
          <div className="lg:col-span-4 card-panel space-y-4">
            <div className="card-panel-header">
              <div className="card-panel-title flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>StrategyForge Backtest Parameters</span>
              </div>
              <span className="text-xs font-mono text-indigo-300">{activeSymbol || "Step Index"}</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Strategy Engine Family
                </label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                >
                  <option value="ma_cross">Mode 0: Fast/Slow EMA Crossover</option>
                  <option value="rsi_reversion">Mode 1: RSI Dynamic Mean Reversion</option>
                  <option value="breakout">Mode 2: Donchian Range Breakout</option>
                  <option value="bollinger">Mode 3: Bollinger Bands Reversion</option>
                  <option value="macd">Mode 4: MACD Line vs Signal</option>
                  <option value="pattern_scan">Mode 5: Candlestick Pattern Recognition</option>
                  <option value="indicator_inspect">Mode 6: Indicator Inspector Composite</option>
                  <option value="ai_adaptive">Mode 7: AI Adaptive Momentum Velocity</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">Candle Count</span>
                  <input
                    type="number"
                    value={candleCount}
                    onChange={(e) => setCandleCount(parseInt(e.target.value) || 200)}
                    className="w-full bg-slate-950 border border-slate-700 text-xs text-white rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">Volume (Lots)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={lotSize}
                    onChange={(e) => setLotSize(parseFloat(e.target.value) || 0.1)}
                    className="w-full bg-slate-950 border border-slate-700 text-xs text-white rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              {(strategy === "ma_cross" || strategy === "indicator_inspect" || strategy === "macd") && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono block">Fast EMA</span>
                    <input
                      type="number"
                      value={fastPeriod}
                      onChange={(e) => setFastPeriod(parseInt(e.target.value) || 12)}
                      className="w-full bg-slate-950 border border-slate-700 text-xs text-white rounded-lg p-2 font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono block">Slow EMA</span>
                    <input
                      type="number"
                      value={slowPeriod}
                      onChange={(e) => setSlowPeriod(parseInt(e.target.value) || 26)}
                      className="w-full bg-slate-950 border border-slate-700 text-xs text-white rounded-lg p-2 font-mono"
                    />
                  </div>
                </div>
              )}

              {(strategy === "rsi_reversion" || strategy === "indicator_inspect") && (
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">RSI Period</span>
                  <input
                    type="number"
                    value={rsiPeriod}
                    onChange={(e) => setRsiPeriod(parseInt(e.target.value) || 14)}
                    className="w-full bg-slate-950 border border-slate-700 text-xs text-white rounded-lg p-2 font-mono"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">Stop Loss (Points)</span>
                  <input
                    type="number"
                    value={slPoints}
                    onChange={(e) => setSlPoints(parseInt(e.target.value) || 100)}
                    className="w-full bg-slate-950 border border-slate-700 text-xs text-white rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">Take Profit (Points)</span>
                  <input
                    type="number"
                    value={tpPoints}
                    onChange={(e) => setTpPoints(parseInt(e.target.value) || 200)}
                    className="w-full bg-slate-950 border border-slate-700 text-xs text-white rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs text-slate-300">Trailing Stop (Points)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={trailingStop}
                    onChange={(e) => setTrailingStop(e.target.checked)}
                    className="accent-indigo-600 rounded"
                  />
                  <input
                    type="number"
                    value={trailingPoints}
                    disabled={!trailingStop}
                    onChange={(e) => setTrailingPoints(parseInt(e.target.value) || 50)}
                    className="w-20 bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-1 text-center font-mono disabled:opacity-40"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleRunBacktest}
                disabled={isRunningBacktest}
                className="btn btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-xs font-bold"
              >
                {isRunningBacktest ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>Running Backtest...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Run Quantitative Backtest</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyStrategyForgeInputs}
                className="btn btn-secondary w-full py-2 text-xs flex items-center justify-center gap-1.5 text-indigo-300"
              >
                {copiedInputs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedInputs ? "Copied StrategyForge Inputs!" : "Copy StrategyForge MT5 Inputs"}</span>
              </button>
            </div>
          </div>

          {/* Backtest Results & Visual Curve (lg:col-span-8) */}
          <div className="lg:col-span-8 space-y-6">
            {backtestResult ? (
              <>
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="card-panel p-3 bg-slate-950 border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">Net Profit</span>
                    <span className={`text-base font-bold font-mono ${backtestResult.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      ${backtestResult.netProfit?.toFixed(2)}
                      <span className="text-[11px] font-normal ml-1">({backtestResult.returnPct?.toFixed(1)}%)</span>
                    </span>
                  </div>

                  <div className="card-panel p-3 bg-slate-950 border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">Profit Factor</span>
                    <span className="text-base font-bold font-mono text-cyan-300">
                      {backtestResult.profitFactor?.toFixed(2)}
                    </span>
                  </div>

                  <div className="card-panel p-3 bg-slate-950 border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">Sharpe Ratio</span>
                    <span className="text-base font-bold font-mono text-indigo-300">
                      {backtestResult.sharpeRatio?.toFixed(2)}
                    </span>
                  </div>

                  <div className="card-panel p-3 bg-slate-950 border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">Win Rate</span>
                    <span className="text-base font-bold font-mono text-white">
                      {backtestResult.winRate?.toFixed(1)}%
                      <span className="text-[10px] text-slate-400 ml-1">({backtestResult.winTrades}/{backtestResult.totalTrades})</span>
                    </span>
                  </div>
                </div>

                {/* Equity Curve SVG */}
                <div className="card-panel space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-emerald-400" />
                      <span>Equity Growth Curve</span>
                    </span>
                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      <span className="text-slate-400">
                        Max DD: <strong className="text-rose-400">{backtestResult.maxDrawdownPct?.toFixed(1)}%</strong> (${backtestResult.maxDrawdown?.toFixed(0)})
                      </span>
                      <span className="text-slate-400">
                        Avg Trade: <strong className="text-slate-200">${backtestResult.avgTrade?.toFixed(2)}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                    {renderEquityCurve(backtestResult.equityCurve)}
                  </div>
                </div>

                {/* Backtest Trades Table */}
                <div className="card-panel space-y-3">
                  <div className="card-panel-header">
                    <div className="card-panel-title flex items-center gap-2">
                      <Activity className="w-4 h-4 text-indigo-400" />
                      <span>Quantitative Order History</span>
                    </div>
                    <span className="text-xs font-mono text-slate-400">
                      {backtestResult.trades?.length || 0} Deals
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-60 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-mono">
                        <tr>
                          <th className="py-2 px-3">Ticket</th>
                          <th className="py-2 px-3">Type</th>
                          <th className="py-2 px-3">Entry</th>
                          <th className="py-2 px-3">Exit</th>
                          <th className="py-2 px-3">Reason</th>
                          <th className="py-2 px-3">PnL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {backtestResult.trades?.map((t: any) => (
                          <tr key={t.ticket} className="hover:bg-slate-800/30">
                            <td className="py-1.5 px-3 text-slate-400">#{t.ticket}</td>
                            <td className="py-1.5 px-3">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.type === "BUY" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                                {t.type}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 text-white">{t.entryPrice?.toFixed(2)}</td>
                            <td className="py-1.5 px-3 text-slate-300">{t.exitPrice?.toFixed(2)}</td>
                            <td className="py-1.5 px-3 text-slate-400 text-[11px]">{t.exitReason}</td>
                            <td className={`py-1.5 px-3 font-bold ${t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              ${t.pnl?.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="card-panel py-16 text-center text-slate-400 font-mono text-xs">
                Run backtest to inspect quantitative metrics and equity curve.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PATTERN RECOGNITION */}
      {activeTab === "patterns" && (
        <div className="space-y-6">
          <div className="card-panel space-y-4">
            <div className="card-panel-header">
              <div>
                <h3 className="card-panel-title flex items-center gap-2">
                  <Search className="w-4 h-4 text-emerald-400" />
                  <span>Real-Time Candlestick Pattern Detector</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Automated scan on {activeSymbol || "Step Index"} candles. Maps directly to StrategyForge's <code className="text-indigo-300 font-mono text-[11px]">InpMode = 5 (MODE_PATTERN_SCAN)</code>.
                </p>
              </div>
              <button
                type="button"
                onClick={handleScanPatterns}
                disabled={isScanningPatterns}
                className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isScanningPatterns ? "animate-spin" : ""}`} />
                <span>Re-scan</span>
              </button>
            </div>

            {patterns.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-400 font-mono">
                No high-confidence candlestick patterns detected in the recent candle buffer.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {patterns.map((p, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs">{p.pattern || p.name}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                        (p.direction || p.sentiment) === "BULLISH"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : (p.direction || p.sentiment) === "BEARISH"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      }`}>
                        {p.direction || p.sentiment}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {p.description || "Identified on price action candle formation."}
                    </p>
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/80">
                      <span>Confidence: {p.confidence ? `${p.confidence}%` : "High"}</span>
                      <span>Index: #{p.index !== undefined ? p.index : idx}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: INDICATOR INSPECTOR */}
      {activeTab === "indicators" && (
        <div className="space-y-6">
          <div className="card-panel space-y-4">
            <div className="card-panel-header">
              <div>
                <h3 className="card-panel-title flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span>Technical Indicator Inspector &amp; Composite Analytics</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Direct calculation on live chart closes. Powers StrategyForge's <code className="text-cyan-300 font-mono text-[11px]">InpMode = 6 (MODE_INDICATOR_INSP)</code>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedIndicator}
                  onChange={(e) => {
                    setSelectedIndicator(e.target.value);
                    handleFetchIndicator(e.target.value, indicatorPeriod);
                  }}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                >
                  <option value="rsi">RSI (Relative Strength)</option>
                  <option value="ema">EMA (Exponential MA)</option>
                  <option value="sma">SMA (Simple MA)</option>
                  <option value="bollinger">Bollinger Bands (2σ)</option>
                  <option value="macd">MACD (12/26/9)</option>
                </select>
                <input
                  type="number"
                  value={indicatorPeriod}
                  onChange={(e) => {
                    const p = parseInt(e.target.value) || 14;
                    setIndicatorPeriod(p);
                    handleFetchIndicator(selectedIndicator, p);
                  }}
                  className="w-16 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-white font-mono text-center"
                  title="Period"
                />
              </div>
            </div>

            {indicatorData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-mono uppercase block">Indicator</span>
                    <span className="text-sm font-bold text-white font-mono uppercase">{selectedIndicator}</span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-mono uppercase block">Period</span>
                    <span className="text-sm font-bold text-indigo-300 font-mono">{indicatorPeriod}</span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-mono uppercase block">Instrument</span>
                    <span className="text-sm font-bold text-emerald-400 font-mono">{activeSymbol || "Step Index"}</span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-mono uppercase block">Data Points</span>
                    <span className="text-sm font-bold text-cyan-300 font-mono">
                      {indicatorData.dataPoints || (Array.isArray(indicatorData.series) ? indicatorData.series.length : 100)}
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs">
                  <span className="text-slate-400 block mb-2 text-[11px]">Latest Calculated Values (Most Recent Bars):</span>
                  <div className="overflow-x-auto">
                    <pre className="text-slate-300 text-[11px] leading-relaxed">
                      {JSON.stringify(
                        Array.isArray(indicatorData.series)
                          ? indicatorData.series.slice(-15).map((v: any) => (typeof v === "number" ? v.toFixed(3) : v))
                          : indicatorData.series,
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-xs text-slate-400 font-mono">
                Calculating indicator series...
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: STRATEGYFORGE MT5 RUNS */}
      {activeTab === "strategyforge" && (
        <div className="space-y-6">
          {/* Quick Info & CSV Upload */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 card-panel space-y-4">
              <div className="card-panel-header">
                <div className="card-panel-title flex items-center gap-2">
                  <Upload className="w-4 h-4 text-indigo-400" />
                  <span>Import StrategyForge MT5 CSV Report</span>
                </div>
              </div>
              <p className="text-xs text-slate-300">
                StrategyForge automatically generates tagged CSV reports in <code className="text-emerald-300 font-mono text-[11px]">MQL5/Files/Common/StrategyForge_&lt;tag&gt;.csv</code>. Paste the CSV contents or upload the file here:
              </p>
              <textarea
                value={csvUploadText}
                onChange={(e) => setCsvUploadText(e.target.value)}
                placeholder="tag,symbol,mode,timeframe,fast,slow,period,threshold,lots,stop_pips,take_pips,criterion,score,trades,wins,losses,profit,..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleCsvSubmit}
                  disabled={isUploadingCsv || !csvUploadText.trim()}
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploadingCsv ? "Importing..." : "Parse & Log Run"}</span>
                </button>
                {csvUploadStatus && (
                  <span className="text-xs font-mono text-emerald-400">{csvUploadStatus}</span>
                )}
              </div>
            </div>

            <div className="lg:col-span-6 card-panel space-y-4">
              <div className="card-panel-header">
                <div className="card-panel-title flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>StrategyForge Autonomous Integration</span>
                </div>
                <a
                  href="/api/strategyforge/download"
                  download="StrategyForge.mq5"
                  className="btn btn-secondary btn-sm text-xs flex items-center gap-1 text-emerald-300"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download EA</span>
                </a>
              </div>
              <div className="space-y-2 text-xs text-slate-300">
                <div>• <strong className="text-white">Self-Contained Execution:</strong> All 8 strategy decision engines run autonomously inside MT5 Strategy Tester without external signal dependencies.</div>
                <div>• <strong className="text-white">Custom Optimisation:</strong> Optimises custom risk-adjusted ratios (Sharpe, Calmar, Profit Factor) using <code className="text-indigo-300 font-mono text-[11px]">OnTester()</code>.</div>
                <div>• <strong className="text-white">Direct WebSync:</strong> Live and forward testing runs POST directly to <code className="text-cyan-300 font-mono text-[11px]">/api/research/strategyforge-result</code>.</div>
              </div>
            </div>
          </div>

          {/* Runs Table */}
          <div className="card-panel space-y-4">
            <div className="card-panel-header">
              <div className="card-panel-title flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                <span>StrategyForge Backtest &amp; Forward Run Records</span>
              </div>
              <button
                type="button"
                onClick={fetchStrategyForgeRuns}
                className="btn btn-secondary btn-sm flex items-center gap-1 text-xs"
              >
                <RotateCw className={`w-3 h-3 ${loadingSfRuns ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>

            {sfRuns.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-400 font-mono">
                No StrategyForge runs recorded yet. Run a session in MT5 or import a CSV report.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-mono uppercase text-slate-400">
                      <th className="py-2.5 px-3">Tag / Session</th>
                      <th className="py-2.5 px-3">Symbol</th>
                      <th className="py-2.5 px-3">Mode</th>
                      <th className="py-2.5 px-3">Trades</th>
                      <th className="py-2.5 px-3">Win Rate</th>
                      <th className="py-2.5 px-3">Profit Factor</th>
                      <th className="py-2.5 px-3">Net Profit</th>
                      <th className="py-2.5 px-3">Sharpe</th>
                      <th className="py-2.5 px-3">Max DD</th>
                      <th className="py-2.5 px-3">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {sfRuns.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-semibold text-white">{r.tag}</td>
                        <td className="py-2 px-3 text-indigo-300 font-bold">{r.symbol}</td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-200">
                            {r.modeName}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-300">{r.trades}</td>
                        <td className="py-2 px-3 text-slate-300">{r.winRate?.toFixed(1)}%</td>
                        <td className="py-2 px-3 font-bold text-cyan-300">{r.profitFactor?.toFixed(2)}</td>
                        <td className={`py-2 px-3 font-bold ${r.profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          ${r.profit?.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-slate-300">{r.sharpe?.toFixed(2)}</td>
                        <td className="py-2 px-3 text-rose-300">{r.drawdownPct?.toFixed(1)}%</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            r.source === "LIVE_EA" ? "bg-emerald-500/20 text-emerald-300" :
                            r.source === "CSV_IMPORT" ? "bg-indigo-500/20 text-indigo-300" :
                            "bg-slate-800 text-slate-400"
                          }`}>
                            {r.source}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResearchLab;
