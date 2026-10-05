import React from "react";
import { Download, Layers, Code2, Terminal, Check, Copy } from "lucide-react";
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
  const downloadUrl = `/api/ea/download?url=${encodeURIComponent(appEndpoint || config.appEndpoint || "http://127.0.0.1:3000")}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fade-in">
      {/* Left side download options (lg:col-span-5) */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        {/* 1. MQ5 Expert Advisor Card */}
        <div className="card-panel flex flex-col space-y-4">
          <div className="card-panel-header">
            <div className="card-panel-title">
              <Download className="w-4 h-4 text-indigo-400" />
              <span>MetaTrader 5 EA</span>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            Download your custom MQ5 Expert Advisor file pre-compiled with this application's API endpoints to stream ticks and execute trades in real-time.
          </p>
          <a
            href={downloadUrl}
            className="btn btn-primary w-full py-3"
          >
            <Download className="w-4 h-4" />
            <span>Download StepIndex_AI_Scalper_EA.mq5</span>
          </a>
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
            Apply our pixel-perfect MT5 workspace chart template directly. This disables grids, configures a solid black background, and sets vibrant bullish/bearish candle colors matching this dashboard.
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
            Permanent standalone TypeScript generator file (<code className="text-cyan-300 font-mono text-[11px] bg-slate-900 px-1 py-0.5 rounded">mql5_generator.ts</code>). Guaranteed preserved and backed up for local setup on any PC.
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
              <span>Free Node.js Bridge</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isBridgeConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}></span>
              <span className={`badge ${isBridgeConnected ? "badge-success" : "badge-danger"}`}>
                {isBridgeConnected ? "Connected" : "Offline"}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            Local standalone client polling the cloud server for pending trades and routing them seamlessly using native command-line executor processes. No cloud tokens or subscriptions are required!
          </p>

          <button
            type="button"
            onClick={onDownloadNodejsBridge}
            className="btn btn-secondary w-full py-3 text-indigo-300 hover:text-white"
          >
            <Download className="w-4 h-4 text-indigo-300" />
            <span>Download Free Node.js Bridge</span>
          </button>

          <div className="text-[10px] text-slate-400 font-mono space-y-1 bg-slate-900/90 p-3 rounded-xl border border-slate-700/60">
            <div className="text-indigo-400 font-bold uppercase mb-1">Bridge Requirements:</div>
            <div>• Node.js &gt;= 18 (LTS)</div>
            <div>• npm install axios</div>
            <div>• No subscriptions or secret keys needed</div>
          </div>
        </div>
      </div>

      {/* Right side setup guides (lg:col-span-7) */}
      <div className="lg:col-span-7">
        <div className="card-panel p-6 space-y-5">
          <div className="card-panel-header">
            <div>
              <h3 className="card-panel-title">
                MetaTrader 5 Setup Instructions
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Configure your MT5 terminal correctly to allow automated websocket signaling.
              </p>
            </div>
          </div>

          <div className="space-y-4 text-xs text-slate-300">
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-[11px] shrink-0 font-mono">
                1
              </span>
              <div>
                <h4 className="font-bold text-white text-xs uppercase tracking-wider font-mono">
                  Place MQ5 file in MT5 directory
                </h4>
                <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                  In your MT5 terminal, select <strong className="text-indigo-300 font-semibold">File &gt; Open Data Folder</strong>. Open the folder <strong className="text-indigo-300 font-semibold">MQL5 &gt; Experts</strong> and upload the downloaded MQ5 file inside this folder.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-[11px] shrink-0 font-mono">
                2
              </span>
              <div>
                <h4 className="font-bold text-white text-xs uppercase tracking-wider font-mono">
                  Allow WebRequest permissions
                </h4>
                <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                  Go to <strong className="text-indigo-300 font-semibold">Tools &gt; Options &gt; Expert Advisors</strong>. Check "Allow WebRequest for listed URL:" and add the WebRequest URL configured below:
                </p>

                <div className="mt-2.5 space-y-2">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      value={appEndpoint || "http://127.0.0.1:3000"}
                      onChange={(e) => onSetEndpoint(e.target.value)}
                      className="input-control flex-1 text-indigo-300"
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
                        onClick={() => onCopyLink(appEndpoint)}
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
                      Detect live web app origin
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-[11px] shrink-0 font-mono">
                3
              </span>
              <div>
                <h4 className="font-bold text-white text-xs uppercase tracking-wider font-mono">
                  Enable Algorithmic Trading
                </h4>
                <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                  Enable algorithmic trading globally via the green button in the top panel of MT5. Finally, drag the expert advisor MQ5 file onto any <span className="text-emerald-400 font-semibold font-mono">{activeSymbol || "Step Index"}</span> chart. Check your MT5 Expert Logs to verify connection registration.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
