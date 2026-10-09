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
  HelpCircle,
} from "lucide-react";

interface BridgeConsoleProps {
  activeSymbol: string;
  isBridgeConnected: boolean;
  onTradeActionComplete?: () => void;
}

export const BridgeConsole: React.FC<BridgeConsoleProps> = ({
  activeSymbol,
  isBridgeConnected,
  onTradeActionComplete,
}) => {
  const [bridgeStatus, setBridgeStatus] = useState<any>(null);
  const [toolsList, setToolsList] = useState<any[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>("mt5_get_status");
  const [toolParams, setToolParams] = useState<Record<string, any>>({});
  const [toolResponse, setToolResponse] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [copiedType, setCopiedType] = useState<string>("");

  // Natural Language AI Prompt state
  const [aiPrompt, setAiPrompt] = useState<string>("Buy 0.1 lots on Step Index with 150 SL and 300 TP");
  const [aiExecutionResult, setAiExecutionResult] = useState<any>(null);
  const [isAiExecuting, setIsAiExecuting] = useState(false);

  // Setup tab (Claude Desktop, Cursor, REST)
  const [setupTab, setSetupTab] = useState<"claude" | "cursor" | "rest">("claude");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const mcpUrl = `${baseUrl}/api/bridge2/mcp`;

  // Fetch Bridge 2 Status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/bridge2/status");
      if (res.ok) {
        const data = await res.json();
        setBridgeStatus(data);
      }
    } catch {
      // Quiet
    }
  }, []);

  // Fetch Tools List
  const fetchTools = useCallback(async () => {
    try {
      const res = await fetch("/api/bridge2/tools");
      if (res.ok) {
        const data = await res.json();
        if (data.tools) setToolsList(data.tools);
      }
    } catch {
      // Quiet
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchTools();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchTools]);

  // Execute Tool Call via /api/bridge2/call
  const handleExecuteTool = async () => {
    setIsExecuting(true);
    try {
      const res = await fetch("/api/bridge2/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: selectedTool,
          arguments: toolParams,
        }),
      });
      const data = await res.json();
      setToolResponse(data);
      fetchStatus();
      if (onTradeActionComplete) onTradeActionComplete();
    } catch (err: any) {
      setToolResponse({ success: false, error: err.message });
    } finally {
      setIsExecuting(false);
    }
  };

  // Execute Natural Language Prompt via /api/bridge2/ai-execute
  const handleExecuteAiPrompt = async (promptText = aiPrompt) => {
    setIsAiExecuting(true);
    try {
      const res = await fetch("/api/bridge2/ai-execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText }),
      });
      const data = await res.json();
      setAiExecutionResult(data);
      fetchStatus();
      if (onTradeActionComplete) onTradeActionComplete();
    } catch (err: any) {
      setAiExecutionResult({ success: false, error: err.message });
    } finally {
      setIsAiExecuting(false);
    }
  };

  // Copy helper
  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(""), 2000);
  };

  const claudeConfigJson = JSON.stringify(
    {
      mcpServers: {
        "scalarai-mt5": {
          url: mcpUrl,
        },
      },
    },
    null,
    2
  );

  const cursorConfigJson = JSON.stringify(
    {
      mcpServers: {
        "scalarai-mt5": {
          url: mcpUrl,
        },
      },
    },
    null,
    2
  );

  const curlExample = `curl -X POST ${mcpUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"mt5_place_trade","arguments":{"type":"BUY","symbol":"Step Index","volume":0.1}}}'`;

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="card-panel bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border-indigo-500/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-400" />
                Bridge 2 & Remote Model Context Protocol (MCP)
              </h2>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ZERO DOWNLOAD READY
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              Use Bridge 2 instantly in your browser or connect external AI models (Claude Desktop, Cursor, ChatGPT, Windsurf, or custom agents) via the live Remote MCP endpoint. No installation or local file download is required.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => copyToClipboard(mcpUrl, "mcp_url")}
              className="btn btn-secondary text-xs flex items-center gap-1.5"
            >
              {copiedType === "mcp_url" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-indigo-400" />}
              <span>{copiedType === "mcp_url" ? "Copied MCP URL" : "Copy Live MCP URL"}</span>
            </button>
            <button
              onClick={fetchStatus}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800">
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div className="text-[10px] uppercase font-mono text-slate-400">Bridge Status</div>
            <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Ready &amp; Active</span>
            </div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div className="text-[10px] uppercase font-mono text-slate-400">Available MCP Tools</div>
            <div className="text-xs font-bold text-indigo-300 font-mono mt-0.5">
              {bridgeStatus?.toolsCount || toolsList.length || 15} Tools Active
            </div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div className="text-[10px] uppercase font-mono text-slate-400">Active Symbol</div>
            <div className="text-xs font-bold text-white font-mono mt-0.5">
              {bridgeStatus?.activeSymbol || activeSymbol || "Step Index"}
            </div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
            <div className="text-[10px] uppercase font-mono text-slate-400">Account Equity</div>
            <div className="text-xs font-bold text-cyan-300 font-mono mt-0.5">
              ${Number(bridgeStatus?.account?.equity || 10000).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Tool Playground & AI Dispatcher (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive MCP Tool Caller (lg:col-span-7) */}
        <div className="lg:col-span-7 card-panel space-y-4">
          <div className="card-panel-header">
            <div className="card-panel-title">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span>In-Browser MCP Tool Playground</span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Execute without downloading</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Select MCP Tool
              </label>
              <select
                value={selectedTool}
                onChange={(e) => {
                  setSelectedTool(e.target.value);
                  // Setup sample defaults for quick testing
                  if (e.target.value === "mt5_place_trade") {
                    setToolParams({ type: "BUY", symbol: activeSymbol || "Step Index", volume: 0.1, sl: 150, tp: 300 });
                  } else if (e.target.value === "mt5_close_trade" || e.target.value === "mt5_modify_trade") {
                    setToolParams({ ticket: "100001", sl: 120, tp: 400 });
                  } else if (e.target.value === "mt5_get_market_price" || e.target.value === "mt5_get_candles") {
                    setToolParams({ symbol: activeSymbol || "Step Index", limit: 20 });
                  } else {
                    setToolParams({});
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
              >
                {toolsList.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} — {t.description.slice(0, 60)}...
                  </option>
                ))}
              </select>
            </div>

            {/* Quick parameter inputs for common tools */}
            {selectedTool === "mt5_place_trade" && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">Order Type</span>
                  <select
                    value={toolParams.type || "BUY"}
                    onChange={(e) => setToolParams({ ...toolParams, type: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded p-1 font-mono"
                  >
                    <option value="BUY">BUY (Long)</option>
                    <option value="SELL">SELL (Short)</option>
                  </select>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">Volume (Lots)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={toolParams.volume ?? 0.1}
                    onChange={(e) => setToolParams({ ...toolParams, volume: parseFloat(e.target.value) || 0.1 })}
                    className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded p-1 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">Stop Loss (Pts)</span>
                  <input
                    type="number"
                    value={toolParams.sl ?? 150}
                    onChange={(e) => setToolParams({ ...toolParams, sl: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded p-1 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">Take Profit (Pts)</span>
                  <input
                    type="number"
                    value={toolParams.tp ?? 300}
                    onChange={(e) => setToolParams({ ...toolParams, tp: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded p-1 font-mono"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-300 flex justify-between items-center mb-1">
                <span>Arguments (JSON)</span>
                <span className="text-[10px] font-normal text-slate-400">Direct parameter payload</span>
              </label>
              <textarea
                rows={3}
                value={JSON.stringify(toolParams, null, 2)}
                onChange={(e) => {
                  try {
                    setToolParams(JSON.parse(e.target.value));
                  } catch {
                    // editing in progress
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-2.5 text-xs text-indigo-300 font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExecuteTool}
                disabled={isExecuting}
                className="btn btn-primary flex-1 py-2.5 text-xs flex items-center justify-center gap-1.5"
              >
                {isExecuting ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isExecuting ? "Executing MCP Call..." : `Execute ${selectedTool}`}</span>
              </button>
              {selectedTool === "mt5_place_trade" && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTool("mt5_close_all_trades");
                    setToolParams({});
                  }}
                  className="btn btn-danger py-2.5 px-3 text-xs flex items-center gap-1.5"
                  title="Switch to Close All"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Panic Close</span>
                </button>
              )}
            </div>

            {/* Execution Output Console */}
            {toolResponse && (
              <div className="mt-3 space-y-1">
                <span className="text-[10px] uppercase font-mono text-slate-400 font-bold">Execution Result</span>
                <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-48">
                  {JSON.stringify(toolResponse, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Natural Language AI Dispatcher (lg:col-span-5) */}
        <div className="lg:col-span-5 card-panel space-y-4">
          <div className="card-panel-header">
            <div className="card-panel-title">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>External AI Command Dispatcher</span>
            </div>
            <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
              Live NLP
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            Type any natural language prompt an external AI would issue. The bridge translates and executes it against the live engine automatically:
          </p>

          <div className="space-y-2.5">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. Buy 0.1 lots on Step Index with 150 SL"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-amber-400 focus:outline-none"
            />

            <button
              type="button"
              onClick={() => handleExecuteAiPrompt()}
              disabled={isAiExecuting}
              className="btn btn-warning w-full py-2.5 text-xs flex items-center justify-center gap-1.5 text-slate-950 font-bold"
            >
              {isAiExecuting ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              <span>{isAiExecuting ? "Processing..." : "Dispatch Natural Language Command"}</span>
            </button>

            {/* Presets */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] uppercase font-mono text-slate-400 font-bold">1-Click Quick Commands</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const p = "Buy 0.1 lots on Step Index with 150 SL and 300 TP";
                    setAiPrompt(p);
                    handleExecuteAiPrompt(p);
                  }}
                  className="text-[10px] font-mono bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  ⚡ Buy 0.1 Lots
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = "Sell 0.1 lots on Step Index with 150 SL and 300 TP";
                    setAiPrompt(p);
                    handleExecuteAiPrompt(p);
                  }}
                  className="text-[10px] font-mono bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  ⚡ Sell 0.1 Lots
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = "Get my current account balance and equity";
                    setAiPrompt(p);
                    handleExecuteAiPrompt(p);
                  }}
                  className="text-[10px] font-mono bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  💰 Check Balance
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const p = "Close all open positions immediately";
                    setAiPrompt(p);
                    handleExecuteAiPrompt(p);
                  }}
                  className="text-[10px] font-mono bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  🛑 Close All Positions
                </button>
              </div>
            </div>

            {/* AI Dispatch Response */}
            {aiExecutionResult && (
              <div className="mt-3 space-y-1">
                <span className="text-[10px] uppercase font-mono text-slate-400 font-bold">AI Execution Output</span>
                <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-amber-300 overflow-x-auto max-h-40">
                  {JSON.stringify(aiExecutionResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. External AI Setup Guide (No Download Required) */}
      <div className="card-panel space-y-4">
        <div className="card-panel-header">
          <div className="card-panel-title">
            <ExternalLink className="w-4 h-4 text-cyan-400" />
            <span>Connect External AI Models (Claude, Cursor, ChatGPT, Custom Agents)</span>
          </div>
          <span className="text-xs font-mono text-cyan-300">Remote MCP Protocol</span>
        </div>

        <p className="text-xs text-slate-300">
          External AI tools can control this bridge over the network using standard Model Context Protocol. Choose your AI tool below to copy the ready-to-paste configuration:
        </p>

        {/* Tab switcher */}
        <div className="flex gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setSetupTab("claude")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              setupTab === "claude" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:text-white"
            }`}
          >
            Claude Desktop Config
          </button>
          <button
            onClick={() => setSetupTab("cursor")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              setupTab === "cursor" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:text-white"
            }`}
          >
            Cursor / Windsurf Config
          </button>
          <button
            onClick={() => setSetupTab("rest")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              setupTab === "rest" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:text-white"
            }`}
          >
            Direct cURL / HTTP
          </button>
        </div>

        {/* Config content display */}
        <div className="space-y-3">
          {setupTab === "claude" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Add to claude_desktop_config.json (%APPDATA%\Claude\claude_desktop_config.json)</span>
                <button
                  onClick={() => copyToClipboard(claudeConfigJson, "claude")}
                  className="btn btn-secondary btn-sm flex items-center gap-1"
                >
                  {copiedType === "claude" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedType === "claude" ? "Copied" : "Copy Config"}</span>
                </button>
              </div>
              <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-cyan-300 overflow-x-auto">
                {claudeConfigJson}
              </pre>
            </div>
          )}

          {setupTab === "cursor" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Add to .cursor/mcp.json</span>
                <button
                  onClick={() => copyToClipboard(cursorConfigJson, "cursor")}
                  className="btn btn-secondary btn-sm flex items-center gap-1"
                >
                  {copiedType === "cursor" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedType === "cursor" ? "Copied" : "Copy Config"}</span>
                </button>
              </div>
              <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-cyan-300 overflow-x-auto">
                {cursorConfigJson}
              </pre>
            </div>
          )}

          {setupTab === "rest" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Direct JSON-RPC 2.0 curl command</span>
                <button
                  onClick={() => copyToClipboard(curlExample, "curl")}
                  className="btn btn-secondary btn-sm flex items-center gap-1"
                >
                  {copiedType === "curl" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedType === "curl" ? "Copied" : "Copy cURL"}</span>
                </button>
              </div>
              <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-cyan-300 overflow-x-auto">
                {curlExample}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BridgeConsole;
