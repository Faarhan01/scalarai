import React, { useState, useEffect } from "react";
import {
  Download,
  Copy,
  Check,
  Eye,
  X,
  FlaskConical,
  Sparkles,
  BarChart3,
  Sliders,
  CheckCircle2,
  FileText,
  Upload,
  ArrowRight,
  ShieldCheck,
  Zap,
  Activity,
  Layers,
  Terminal,
} from "lucide-react";
import { TradeConfig } from "../../types";

export interface DownloadsCenterProps {
  config: TradeConfig;
  activeSymbol: string;
  isBridgeConnected: boolean;
  appEndpoint: string;
  copiedLink: boolean;
  onSetEndpoint?: (endpoint: string) => void;
  onSaveEndpoint?: (endpoint: string) => void;
  onCopyLink?: (text: string) => void;
  onDownloadNodejsBridge?: () => void;
  getAppBaseUrl: () => string;
  onNavigateToResearch?: () => void;
}

export const DownloadsCenter: React.FC<DownloadsCenterProps> = ({
  activeSymbol,
  appEndpoint,
  onNavigateToResearch,
}) => {
  const effectiveUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : appEndpoint || "http://127.0.0.1:4000";

  const downloadSfUrl = "/api/strategyforge/download";

  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [sfCode, setSfCode] = useState<string>("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // StrategyForge CSV import state
  const [csvInput, setCsvInput] = useState<string>("");
  const [isParsingCsv, setIsParsingCsv] = useState<boolean>(false);
  const [csvParseSuccess, setCsvParseSuccess] = useState<string>("");
  const [strategyForgeRuns, setStrategyForgeRuns] = useState<any[]>([]);

  // Fetch existing runs from backend
  const fetchRuns = async () => {
    try {
      const res = await fetch("/api/research/strategyforge-results");
      if (res.ok) {
        const data = await res.json();
        if (data.results) {
          setStrategyForgeRuns(data.results);
        }
      }
    } catch (e) {
      console.error("Failed to fetch StrategyForge results:", e);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(effectiveUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 3000);
    } catch (err) {
      console.error("Failed to copy URL:", err);
    }
  };

  const handleCopyCode = async () => {
    try {
      let codeToCopy = sfCode;
      if (!codeToCopy) {
        const res = await fetch("/api/strategyforge/source");
        codeToCopy = await res.text();
        setSfCode(codeToCopy);
      }
      await navigator.clipboard.writeText(codeToCopy);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 3000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  const handleOpenCodeModal = async () => {
    setIsCodeModalOpen(true);
    if (!sfCode) {
      setCodeLoading(true);
      try {
        const res = await fetch("/api/strategyforge/source");
        const text = await res.text();
        setSfCode(text);
      } catch (err) {
        setSfCode("// Failed to fetch StrategyForge.mq5 source from server");
      } finally {
        setCodeLoading(false);
      }
    }
  };

  const handleParseCsv = async () => {
    if (!csvInput.trim()) return;
    setIsParsingCsv(true);
    setCsvParseSuccess("");
    try {
      const res = await fetch("/api/research/strategyforge-parse-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent: csvInput }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        setCsvParseSuccess(`Successfully imported pass "${data.result.tag}" (${data.result.modeName})!`);
        setCsvInput("");
        await fetchRuns();
      } else {
        setCsvParseSuccess(`Error: ${data.error || "Failed to parse CSV"}`);
      }
    } catch (err: any) {
      setCsvParseSuccess(`Import error: ${err.message}`);
    } finally {
      setIsParsingCsv(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setCsvInput(content);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Header Banner */}
      <div className="card-panel bg-gradient-to-r from-indigo-950/70 via-slate-900 to-purple-950/40 border-indigo-500/30">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
                <FlaskConical className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>StrategyForge Studio &amp; EA Download</span>
                  <span className="badge badge-success text-[10px] font-mono font-bold">
                    v2.00 MQ5
                  </span>
                </h2>
                <p className="text-xs text-slate-300">
                  Autonomous Multi-Strategy Quantitative EA built for MetaTrader 5's native Strategy Tester &amp; Live Forward Testing.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-mono text-slate-300">
              <span className="bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/80 text-indigo-300">
                8 Integrated Strategies
              </span>
              <span className="bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/80 text-emerald-300">
                Custom Sharpe &amp; Calmar Criteria
              </span>
              <span className="bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/80 text-cyan-300">
                Auto CSV &amp; WebRequest Sync
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            <a
              href={downloadSfUrl}
              download="StrategyForge.mq5"
              className="btn btn-primary py-3 px-5 shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span className="font-bold">Download StrategyForge.mq5</span>
            </a>
            <button
              type="button"
              onClick={handleCopyCode}
              className="btn btn-secondary py-3 px-4 text-xs text-indigo-300 hover:text-white flex items-center justify-center gap-1.5"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copiedCode ? "Copied MQ5!" : "Copy Source"}</span>
            </button>
            <button
              type="button"
              onClick={handleOpenCodeModal}
              className="btn btn-secondary py-3 px-4 text-xs text-slate-300 hover:text-white flex items-center justify-center gap-1.5"
            >
              <Eye className="w-4 h-4" />
              <span>View Code</span>
            </button>
            {onNavigateToResearch && (
              <button
                type="button"
                onClick={onNavigateToResearch}
                className="btn btn-secondary py-3 px-4 text-xs text-emerald-300 hover:text-white flex items-center justify-center gap-1.5 border-emerald-500/30"
              >
                <FlaskConical className="w-4 h-4 text-emerald-400" />
                <span>Open Lab</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main Grid: Left Side Features & Strategies, Right Side MT5 Instructions & CSV Importer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): Built-in Strategies & Parameters */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Strategy Engines Breakdown */}
          <div className="card-panel space-y-4">
            <div className="card-panel-header">
              <div className="card-panel-title flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>Strategy Engines Built Into StrategyForge</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">InpMode (0-7)</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Test all strategy families inside MT5's native Strategy Tester without writing or recompiling any code. Simply adjust the <code className="text-indigo-300 font-mono text-[11px] bg-slate-950 px-1 py-0.5 rounded border border-indigo-500/30">InpMode</code> parameter.
            </p>

            <div className="space-y-2.5">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-start gap-2.5 text-xs">
                <span className="font-mono text-indigo-400 font-bold shrink-0 text-sm">0</span>
                <div>
                  <div className="font-bold text-white">Fast/Slow EMA Crossover</div>
                  <div className="text-[11px] text-slate-400">Trend following. Fast moving average crosses slow moving average with bar confirmation.</div>
                </div>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-start gap-2.5 text-xs">
                <span className="font-mono text-emerald-400 font-bold shrink-0 text-sm">1</span>
                <div>
                  <div className="font-bold text-white">RSI Dynamic Mean Reversion</div>
                  <div className="text-[11px] text-slate-400">Oscillator strategy. Buys when RSI drops below oversold threshold and recovers; sells at overbought extremes.</div>
                </div>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-start gap-2.5 text-xs">
                <span className="font-mono text-cyan-400 font-bold shrink-0 text-sm">2</span>
                <div>
                  <div className="font-bold text-white">Donchian Range Breakout</div>
                  <div className="text-[11px] text-slate-400">Channel breakout. Enters when close price exceeds the N-bar highest high or lowest low.</div>
                </div>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-start gap-2.5 text-xs">
                <span className="font-mono text-amber-400 font-bold shrink-0 text-sm">3</span>
                <div>
                  <div className="font-bold text-white">Bollinger Bands Mean Reversion</div>
                  <div className="text-[11px] text-slate-400">Volatility bands. Reversion trades triggered upon touches of the upper or lower 2-sigma bands.</div>
                </div>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-start gap-2.5 text-xs">
                <span className="font-mono text-purple-400 font-bold shrink-0 text-sm">4</span>
                <div>
                  <div className="font-bold text-white">MACD Line vs Signal Crossover</div>
                  <div className="text-[11px] text-slate-400">Momentum convergence/divergence. Signals on directional MACD main vs signal line crosses.</div>
                </div>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-start gap-2.5 text-xs">
                <span className="font-mono text-rose-400 font-bold shrink-0 text-sm">5</span>
                <div>
                  <div className="font-bold text-white">Candlestick Pattern Recognition</div>
                  <div className="text-[11px] text-slate-400">Autonomous price action logic: detects Bullish/Bearish Engulfing, Hammer, Shooting Star, and Pin bars.</div>
                </div>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-start gap-2.5 text-xs">
                <span className="font-mono text-sky-400 font-bold shrink-0 text-sm">6</span>
                <div>
                  <div className="font-bold text-white">Indicator Inspector Composite</div>
                  <div className="text-[11px] text-slate-400">Multi-indicator confluence: combines EMA trend filter + RSI momentum + Bollinger middle band position.</div>
                </div>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-start gap-2.5 text-xs">
                <span className="font-mono text-yellow-400 font-bold shrink-0 text-sm">7</span>
                <div>
                  <div className="font-bold text-white">AI Adaptive Momentum Velocity</div>
                  <div className="text-[11px] text-slate-400">Dynamic velocity score measuring rate of price expansion per pip per bar with adaptive thresholds.</div>
                </div>
              </div>
            </div>
          </div>

          {/* MT5 WebRequest Allowlist URL Card */}
          <div className="card-panel space-y-3">
            <div className="card-panel-header">
              <div className="card-panel-title flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>Live WebRequest Reporting Endpoint</span>
              </div>
            </div>
            <p className="text-xs text-slate-300">
              When running StrategyForge in live charts or forward test modes, add this URL to MT5's WebRequest allowlist so backtest scores and session metrics post directly into ScalarAI:
            </p>
            <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <code className="text-cyan-300 font-mono text-xs truncate flex-1">{effectiveUrl}</code>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="btn btn-secondary btn-sm text-xs px-2.5 py-1"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <div className="text-[11px] text-slate-400">
              Endpoint path: <code className="text-indigo-300 font-mono">/api/research/strategyforge-result</code>
            </div>
          </div>
        </div>

        {/* Right Column (7 cols): Native MT5 Instructions & CSV Importer */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* MT5 Step-by-Step Native Tester Guide */}
          <div className="card-panel space-y-5">
            <div className="card-panel-header">
              <div className="card-panel-title flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                <span>How to Run StrategyForge in MetaTrader 5 Strategy Tester</span>
              </div>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              <div className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0 font-mono">
                  1
                </span>
                <div className="space-y-1 flex-1">
                  <h4 className="font-bold text-white text-xs">Save to MT5 Experts Directory</h4>
                  <p className="text-slate-300 text-xs">
                    Download <strong className="text-indigo-300 font-mono">StrategyForge.mq5</strong> and save it inside your MT5 <strong className="text-white font-mono">MQL5/Experts/</strong> folder (accessible via <strong className="text-slate-200">File &gt; Open Data Folder</strong> in MT5). Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono text-[10px]">F7</kbd> in MetaEditor to compile.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0 font-mono">
                  2
                </span>
                <div className="space-y-1 flex-1">
                  <h4 className="font-bold text-white text-xs">Open Strategy Tester (Ctrl + R)</h4>
                  <p className="text-slate-300 text-xs">
                    In MetaTrader 5, press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono text-[10px]">Ctrl+R</kbd> or click <strong className="text-slate-200">View &gt; Strategy Tester</strong>. Under Expert, select <strong className="text-emerald-300 font-mono">StrategyForge.mq5</strong>.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0 font-mono">
                  3
                </span>
                <div className="space-y-1 flex-1">
                  <h4 className="font-bold text-white text-xs">Select Optimization &amp; Custom Criterion</h4>
                  <p className="text-slate-300 text-xs">
                    Set Optimization to <strong className="text-white">"Fast genetic based algorithm"</strong> or <strong className="text-white">"Slow complete algorithm"</strong>. Set Criterion to <strong className="text-cyan-300 font-mono">"Custom (OnTester max)"</strong> — this will maximize the risk-adjusted Sharpe Ratio or Calmar Ratio calculated by StrategyForge!
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0 font-mono">
                  4
                </span>
                <div className="space-y-1 flex-1">
                  <h4 className="font-bold text-white text-xs">View Machine-Readable CSV Report</h4>
                  <p className="text-slate-300 text-xs">
                    StrategyForge writes clean, tagged CSV metrics to your common data folder (<code className="text-indigo-300 font-mono text-[11px] bg-slate-950 px-1 py-0.5 rounded border border-slate-800">StrategyForge_&lt;tag&gt;.csv</code>). You can upload or paste that CSV below to instantly review the test results on this platform!
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* StrategyForge CSV Importer */}
          <div className="card-panel space-y-4">
            <div className="card-panel-header">
              <div className="card-panel-title flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Import MT5 StrategyForge CSV Report</span>
              </div>
              <label className="btn btn-secondary btn-sm text-[11px] flex items-center gap-1 cursor-pointer">
                <FileText className="w-3 h-3" />
                <span>Choose File</span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <p className="text-xs text-slate-300">
              Paste the contents of your MT5 <code className="text-emerald-300 font-mono text-[11px]">StrategyForge_*.csv</code> file here to instantly view backtest metrics and store the run:
            </p>

            <textarea
              value={csvInput}
              onChange={(e) => setCsvInput(e.target.value)}
              placeholder="tag,symbol,mode,timeframe,fast,slow,period,threshold,lots,stop_pips,take_pips,criterion,score,trades,wins,losses,profit,net_pips,profit_factor,..."
              rows={4}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
            />

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleParseCsv}
                disabled={isParsingCsv || !csvInput.trim()}
                className="btn btn-primary btn-sm flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isParsingCsv ? "Importing..." : "Import CSV Report"}</span>
              </button>

              {csvParseSuccess && (
                <span className="text-xs font-mono text-emerald-400">
                  {csvParseSuccess}
                </span>
              )}
            </div>
          </div>

          {/* Recent StrategyForge Runs & Test Sessions */}
          <div className="card-panel space-y-4">
            <div className="card-panel-header">
              <div className="card-panel-title flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                <span>StrategyForge Backtest Passes &amp; Sessions</span>
              </div>
              <span className="badge badge-primary text-[10px] font-mono">
                {strategyForgeRuns.length} Runs
              </span>
            </div>

            {strategyForgeRuns.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 font-mono">
                No StrategyForge runs recorded yet. Run a backtest in MT5 with InpPostUrl configured or import a CSV report above.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[10px] font-mono uppercase">
                      <th className="py-2 px-3">Session / Tag</th>
                      <th className="py-2 px-3">Instrument</th>
                      <th className="py-2 px-3">Engine Mode</th>
                      <th className="py-2 px-3">Trades</th>
                      <th className="py-2 px-3">Win Rate</th>
                      <th className="py-2 px-3">Profit Factor</th>
                      <th className="py-2 px-3">Net Profit</th>
                      <th className="py-2 px-3">Sharpe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {strategyForgeRuns.map((run) => (
                      <tr key={run.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-white">
                          {run.tag}
                        </td>
                        <td className="py-2.5 px-3 text-indigo-300 font-bold">
                          {run.symbol}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-200">
                            {run.modeName}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          {run.trades}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          {run.winRate.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 font-bold text-cyan-300">
                          {run.profitFactor.toFixed(2)}
                        </td>
                        <td className={`py-2.5 px-3 font-bold ${run.profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          ${run.profit.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          {run.sharpe.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Code Modal */}
      {isCodeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-white text-sm">StrategyForge.mq5 (MQL5 Source Code)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyCode}
                  className="btn btn-secondary btn-sm text-xs flex items-center gap-1"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? "Copied" : "Copy Source"}</span>
                </button>
                <button
                  onClick={() => setIsCodeModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-950">
              {codeLoading ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-xs font-mono">
                  Loading StrategyForge source code...
                </div>
              ) : (
                <pre className="text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre">
                  {sfCode}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DownloadsCenter;
