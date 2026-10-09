import React, { useState } from "react";
import { Download, Layers, Code2, Terminal, Check, Copy, FileCode, PlayCircle, Eye, X, ShieldCheck } from "lucide-react";
import { TradeConfig } from "../../types";

export interface DownloadsCenterProps {
  config: TradeConfig;
  activeSymbol: string;
  isBridgeConnected: boolean;
  appEndpoint: string;
  copiedLink: boolean;
  onSetEndpoint: (endpoint: string) => void;
  onSaveEndpoint: (endpoint: string) => void;
  onCopyLink: (text: string) => void;
  onDownloadNodejsBridge: () => void;
  getAppBaseUrl: () => string;
}

export const DownloadsCenter: React.FC<DownloadsCenterProps> = ({
  config,
  activeSymbol,
  isBridgeConnected,
  appEndpoint,
  copiedLink,
  onSetEndpoint,
  onSaveEndpoint,
  onCopyLink,
  onDownloadNodejsBridge,
  getAppBaseUrl,
}) => {
  const effectiveUrl = appEndpoint || config.appEndpoint || "http://127.0.0.1:3000";
  const downloadUrl = `/api/ea/download?url=${encodeURIComponent(effectiveUrl)}`;
  const installScriptUrl = `/api/ea/install-script?url=${encodeURIComponent(effectiveUrl)}`;
  const installPsUrl = `/api/ea/install-powershell?url=${encodeURIComponent(effectiveUrl)}`;

  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [eaCode, setEaCode] = useState<string>("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(effectiveUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 3000);
    } catch (err) {
      console.error("Failed to copy URL:", err);
    }
  };

  const handleResetMasterEa = async () => {
    try {
      setResetting(true);
      const res = await fetch("/api/ea/reset", { method: "POST" });
      if (res.ok) {
        setResetSuccess(true);
        setEaCode("");
        setTimeout(() => setResetSuccess(false), 4000);
      }
    } catch (err) {
      console.error("Failed to reset EA template:", err);
    } finally {
      setResetting(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      let codeToCopy = eaCode;
      if (!codeToCopy) {
        const res = await fetch(`/api/ea/code?url=${encodeURIComponent(effectiveUrl)}`);
        codeToCopy = await res.text();
        setEaCode(codeToCopy);
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
    if (!eaCode) {
      setCodeLoading(true);
      try {
        const res = await fetch(`/api/ea/code?url=${encodeURIComponent(effectiveUrl)}`);
        const text = await res.text();
        setEaCode(text);
      } catch (err) {
        setEaCode("// Failed to fetch EA code from server");
      } finally {
        setCodeLoading(false);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fade-in">
      {/* Left side download options (lg:col-span-5) */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        {/* 1. MQ5 Expert Advisor Card */}
        <div className="card-panel flex flex-col space-y-4 border-indigo-500/30 shadow-indigo-950/20">
          <div className="card-panel-header">
            <div className="card-panel-title flex items-center gap-2">
              <Download className="w-4 h-4 text-indigo-400" />
              <span>MetaTrader 5 Expert Advisor</span>
            </div>
            <span className="badge badge-success text-[10px] uppercase font-mono">v3.05 Master</span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            Production-grade MQL5 Expert Advisor with server-authoritative trade execution, automated broker filling mode detection, real-time position reporting, dynamic SL/TP modification, and trailing stop control.
          </p>

          <div className="flex flex-col gap-2.5">
            {/* Primary Download Button */}
            <a
              href={downloadUrl}
              className="btn btn-primary w-full py-3 shadow-md"
            >
              <Download className="w-4 h-4" />
              <span className="font-semibold">Download ScalarAI_MultiAsset_EA.mq5</span>
            </a>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyCode}
                className="btn btn-secondary w-full py-2.5 text-xs text-indigo-300 hover:text-white"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied Code!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenCodeModal}
                className="btn btn-secondary w-full py-2.5 text-xs text-slate-300 hover:text-white"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View Source</span>
              </button>
            </div>

            {/* WebRequest URL Helper Button */}
            <button
              type="button"
              onClick={handleCopyUrl}
              className="btn btn-secondary w-full py-2.5 text-xs text-cyan-300 hover:text-cyan-100 border-cyan-500/30 hover:border-cyan-400/50 flex items-center justify-center gap-1.5"
            >
              {copiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Copied MT5 WebRequest URL!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Copy WebRequest URL for MT5 Options</span>
                </>
              )}
            </button>

            {/* Installers Grid */}
            <div className="grid grid-cols-2 gap-2">
              <a
                href={installScriptUrl}
                className="btn btn-secondary w-full py-2.5 text-xs text-amber-300 hover:text-amber-200 border-amber-500/30 hover:border-amber-400/50"
              >
                <FileCode className="w-3.5 h-3.5 text-amber-400" />
                <span>Windows .BAT</span>
              </a>

              <a
                href={installPsUrl}
                className="btn btn-secondary w-full py-2.5 text-xs text-sky-300 hover:text-sky-200 border-sky-500/30 hover:border-sky-400/50"
              >
                <FileCode className="w-3.5 h-3.5 text-sky-400" />
                <span>PowerShell .PS1</span>
              </a>
            </div>

            {/* Restore Master EA Button */}
            <button
              type="button"
              onClick={handleResetMasterEa}
              disabled={resetting}
              className="btn btn-secondary w-full py-2 text-[11px] text-slate-400 hover:text-rose-300 border-slate-700/60 hover:border-rose-500/30 flex items-center justify-center gap-1.5"
            >
              {resetSuccess ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Master EA Restored to Production Standard!</span>
                </>
              ) : resetting ? (
                <span>Resetting EA Template...</span>
              ) : (
                <span>Reset EA to Official Master Code</span>
              )}
            </button>
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1">
            <div className="flex items-center gap-1.5 text-indigo-400 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Safe MT5 Architecture:</span>
            </div>
            <div>• Zero chart freezes: Non-blocking throttled telemetry (1/sec max)</div>
            <div>• Auto-detected broker filling mode (IOC / Return / FOK)</div>
            <div>• Bidirectional MT5 position sync & server-authoritative SL/TP control</div>
          </div>
        </div>

        {/* MT5 Chart Visuals Template (.tpl) Card */}
        <div className="card-panel flex flex-col space-y-4">
          <div className="card-panel-header">
            <div className="card-panel-title">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>MT5 Chart Template (.tpl)</span>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            Apply our dark-theme chart template directly. Disables grid clutter, sets solid dark background, and configures bright bullish & bearish candles matching this platform.
          </p>
          <a
            href="/api/ea/template"
            className="btn btn-success w-full py-3"
          >
            <Download className="w-4 h-4" />
            <span>Download step_index_chart.tpl</span>
          </a>
        </div>

        {/* MQL5 Generator Source (.ts) Card */}
        <div className="card-panel flex flex-col space-y-4">
          <div className="card-panel-header">
            <div className="card-panel-title">
              <Code2 className="w-4 h-4 text-cyan-400" />
              <span>MQL5 Generator Engine</span>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            Permanent standalone TypeScript generator file (<code className="text-cyan-300 font-mono text-[11px] bg-slate-900 px-1 py-0.5 rounded">mql5_generator.ts</code>). Preserved and backed up for local setup on any workstation.
          </p>
          <a
            href="/api/ea/generator-source"
            className="btn btn-secondary w-full py-3 text-cyan-300 hover:text-white"
          >
            <Download className="w-4 h-4" />
            <span>Download mql5_generator.ts</span>
          </a>
        </div>

        {/* 2. Node.js MT5 Desktop Bridge Card */}
        <div className="card-panel flex flex-col space-y-4">
          <div className="card-panel-header">
            <div className="card-panel-title">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span>Node.js Bridge 2 (MCP Enabled)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isBridgeConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}></span>
              <span className={`badge ${isBridgeConnected ? "badge-success" : "badge-danger"}`}>
                {isBridgeConnected ? "Connected" : "Offline"}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            Production Node.js Bridge 2 with native <strong>Model Context Protocol (MCP)</strong> support. Allows any external AI outside this website (Claude Desktop, Cursor, Windsurf, or custom LLM bots) to monitor positions, place trades, and control MT5 directly.
          </p>

          <button
            type="button"
            onClick={onDownloadNodejsBridge}
            className="btn btn-secondary w-full py-3 text-indigo-300 hover:text-white"
          >
            <Download className="w-4 h-4 text-indigo-300" />
            <span>Download Node.js Bridge 2 + MCP Config</span>
          </button>

          <div className="text-[10px] text-slate-400 font-mono space-y-1 bg-slate-900/90 p-3 rounded-xl border border-slate-700/60">
            <div className="text-indigo-400 font-bold uppercase mb-1">Bridge 2 Features:</div>
            <div>• Model Context Protocol (MCP 2024-11-05)</div>
            <div>• Claude Desktop & Cursor auto-config included</div>
            <div>• 15 tools: place, close, modify, quote, candles</div>
            <div>• Zero external dependencies required (Node &gt;= 18)</div>
          </div>
        </div>
      </div>

      {/* Right side setup guides (lg:col-span-7) */}
      <div className="lg:col-span-7">
        <div className="card-panel p-6 space-y-6">
          <div className="card-panel-header">
            <div>
              <h3 className="card-panel-title text-base">
                MetaTrader 5 Installation & Quick Start
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Follow these 3 simple steps to attach the EA and stream live market data.
              </p>
            </div>
          </div>

          <div className="space-y-5 text-xs text-slate-300">
            {/* Step 1 */}
            <div className="flex gap-3 items-start">
              <span className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0 font-mono">
                1
              </span>
              <div className="space-y-1.5 flex-1">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider font-mono">
                  Place MQ5 File in MetaTrader 5
                </h4>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Choose your preferred installation method:
                </p>
                <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-2 text-[11px]">
                  <div>
                    <strong className="text-indigo-300">Method A (1-Click):</strong> Download and run the <strong className="text-amber-300">Windows 1-Click Installer (.bat)</strong>. It places the EA directly into your MT5 directory.
                  </div>
                  <div>
                    <strong className="text-indigo-300">Method B (MetaEditor):</strong> Click <strong className="text-indigo-300">Copy Code</strong>, open MetaEditor (press <kbd className="px-1 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">F4</kbd> in MT5), click <strong className="text-white">New &gt; Expert Advisor</strong>, paste the code, and press <kbd className="px-1 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">F7</kbd> to compile!
                  </div>
                  <div>
                    <strong className="text-indigo-300">Method C (Manual):</strong> In MT5 select <strong className="text-white">File &gt; Open Data Folder</strong>. Place the downloaded <strong className="text-white font-mono">ScalarAI_MultiAsset_EA.mq5</strong> in <strong className="text-indigo-300 font-mono">MQL5/Experts/</strong>.
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-3 items-start">
              <span className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0 font-mono">
                2
              </span>
              <div className="space-y-2 flex-1">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider font-mono">
                  Allow WebRequest Permissions
                </h4>
                <p className="text-slate-300 text-xs leading-relaxed">
                  In MT5, navigate to <strong className="text-white">Tools &gt; Options &gt; Expert Advisors</strong>. Check <strong className="text-indigo-300 font-semibold">"Allow WebRequest for listed URL"</strong> and add this exact URL:
                </p>

                <div className="bg-slate-900/90 p-3 rounded-xl border border-indigo-500/30 space-y-2">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                    Required Allowed WebRequest URL:
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      value={appEndpoint || "http://127.0.0.1:3000"}
                      onChange={(e) => onSetEndpoint(e.target.value)}
                      className="input-control flex-1 text-indigo-300 font-mono text-xs"
                      placeholder="e.g. http://127.0.0.1:3000"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSaveEndpoint(appEndpoint)}
                        className="btn btn-primary btn-sm"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => onCopyLink(appEndpoint || effectiveUrl)}
                        className="btn btn-secondary btn-sm p-2"
                        title="Copy URL"
                      >
                        {copiedLink ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] text-left pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onSetEndpoint("http://127.0.0.1:3000");
                        onSaveEndpoint("http://127.0.0.1:3000");
                      }}
                      className="text-slate-400 hover:text-indigo-300 underline decoration-dotted transition-colors cursor-pointer"
                    >
                      Reset to localhost default
                    </button>
                    <span className="text-slate-600 select-none">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        const detected = getAppBaseUrl();
                        onSetEndpoint(detected);
                        onSaveEndpoint(detected);
                      }}
                      className="text-slate-400 hover:text-indigo-300 underline decoration-dotted transition-colors cursor-pointer"
                    >
                      Detect live web app origin ({getAppBaseUrl()})
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-3 items-start">
              <span className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0 font-mono">
                3
              </span>
              <div className="space-y-1.5 flex-1">
                <h4 className="font-bold text-white text-xs uppercase tracking-wider font-mono">
                  Attach EA and Enable Algorithmic Trading
                </h4>
                <p className="text-slate-300 text-xs leading-relaxed">
                  In MT5:
                </p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300 pl-1">
                  <li>Click the <strong className="text-emerald-400">"Algo Trading"</strong> button on the MT5 top toolbar so it shows a green play icon.</li>
                  <li>In the Navigator panel under <strong className="text-white">Expert Advisors</strong>, drag <strong className="text-indigo-300 font-mono">ScalarAI_MultiAsset_EA</strong> onto any <strong className="text-emerald-400 font-semibold">{activeSymbol || "Step Index"}</strong> chart.</li>
                  <li>In the EA settings popup, verify <strong className="text-white">"Allow Algorithmic Trading"</strong> is checked. Click OK!</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Code Viewer Modal */}
      {isCodeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white font-mono">
                  ScalarAI_MultiAsset_EA.mq5 Source Code
                </h3>
                <span className="badge badge-success text-[10px]">v3.02</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs text-indigo-300 hover:text-white"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy All</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCodeModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-[11px] text-slate-300 leading-relaxed select-text">
              {codeLoading ? (
                <div className="flex items-center justify-center h-48 text-slate-400">
                  <span>Generating MQL5 code...</span>
                </div>
              ) : (
                <pre className="whitespace-pre overflow-x-auto">{eaCode}</pre>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950/70 text-xs text-slate-400">
              <span>Ready for MetaEditor 5 (press F4 in MT5 &gt; New &gt; Paste &gt; F7 Compile)</span>
              <button
                type="button"
                onClick={() => setIsCodeModalOpen(false)}
                className="btn btn-secondary btn-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
