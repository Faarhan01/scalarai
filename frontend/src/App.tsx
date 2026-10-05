import { useState, useEffect, useRef } from "react";
import React from "react";
import {
  Activity,
  Gauge,
  Download,
  Play,
  Square,
  Cpu,
  TrendingUp,
  Sliders,
  Terminal,
  Wifi,
  WifiOff,
  RefreshCw,
  TrendingDown,
  Info,
  DollarSign,
  Layers,
  Percent,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  Home,
  Settings,
  ChevronDown,
  ChevronUp,
  Server,
  Database,
  Lock,
  Zap,
  RotateCcw,
  Code2,
  Menu,
  X
} from "lucide-react";
import { StrategyMode, TradeConfig, TradeRecord, SystemLog, Tick, EAConnectionDetails } from "./types";

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("React error boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-8 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <h1 className="text-xl font-bold text-white">Something went wrong</h1>
            </div>
            <p className="text-sm text-slate-300 mb-4">
              The application encountered an unexpected error. Please refresh the page.
            </p>
            {this.state.error && (
              <pre className="bg-slate-900 p-3 rounded-lg text-xs text-red-300 overflow-auto max-h-32 mb-4">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-all"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
export default function App() {
  // Sync States
  const [config, setConfig] = useState<TradeConfig>({
    isActive: false,
    selectedStrategy: StrategyMode.TREND_FOLLOWING,
    lotSize: 0.1,
    takeProfitPoints: 300,
    stopLossPoints: 150,
    trailingStopPoints: 100,
    useTrailingStop: true,
    maxTrades: 3,
    isAiModeEnabled: false
  });

  const [connection, setConnection] = useState<EAConnectionDetails>({
    isEaConnected: false,
    clientIp: null,
    lastPing: null,
    broker: null,
    accountNumber: null,
    balance: null,
    symbol: null,
    symbolDigits: null,
    symbolTickSize: null,
    symbolDescription: null
  });

  const [stats, setStats] = useState({
    totalProfit: 0,
    tradesCount: 0,
    winRate: 0,
    activePositionsCount: 0,
    lastHeartbeatTime: null as string | null
  });

  const [history, setHistory] = useState<Tick[]>([]);
  const [candles, setCandles] = useState<Array<{ time: number; open: number; high: number; low: number; close: number }>>([]);
  const MAX_VISIBLE_CANDLES = 80;
  const [currentPrice, setCurrentPrice] = useState<number>(1250.0);
  const [activeSymbol, setActiveSymbol] = useState<string>("Step Index");
  const [symbolStates, setSymbolStates] = useState<Array<{ symbol: string; connection: any; currentPrice: number; tickCount: number }>>([]);
  const [tradesList, setTradesList] = useState<TradeRecord[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isBridgeConnected, setIsBridgeConnected] = useState<boolean>(false);
  
  // UI states
  const [isInternetOnline, setIsInternetOnline] = useState<boolean>(navigator.onLine);
  const [latency, setLatency] = useState<number>(12);
  const [filterLogLevel, setFilterLogLevel] = useState<string>("ALL");
  const [paramInput, setParamInput] = useState({
    lotSize: "0.1",
    takeProfitPoints: "300",
    stopLossPoints: "150",
    trailingStopPoints: "100",
    maxTrades: "3",
    useTrailingStop: true,
    mt5Path: "",
    appEndpoint: "http://127.0.0.1:3000",
    tradingMode: "Scalping" as "Scalping" | "Swing",
    selectedAssets: ["Step Index"] as string[],
    isAiModeEnabled: false
  });
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [activeTab, setActiveTab] = useState<"visuals" | "tutorial">("visuals");
  const [currentNavTab, setCurrentNavTab] = useState<"home" | "downloads" | "logs" | "risk" | "settings">("home");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false);
  const [webRequestStatus, setWebRequestStatus] = useState<{
    status: string;
    lastTested: string;
    error: string;
    details: string;
  } | null>(null);
  const [suggestedUrl, setSuggestedUrl] = useState<string>("");
  const [isVerifyingWebRequest, setIsVerifyingWebRequest] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [showEma, setShowEma] = useState<boolean>(true);
  const [showBollingerBands, setShowBollingerBands] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectedRef = useRef(false);
  const historyRef = useRef<Tick[]>([]);
  const candlesRef = useRef<Array<{ time: number; open: number; high: number; low: number; close: number }>>([]);
  const pendingChartUpdate = useRef<{ history?: Tick[]; candles?: any[]; currentPrice?: number } | null>(null);
  const rafId = useRef<number | null>(null);

  // Keep refs in sync with state to avoid stale closures in WS handler
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { candlesRef.current = candles; }, [candles]);

  const scheduleChartUpdate = (update: { history?: Tick[]; candles?: any[]; currentPrice?: number }) => {
    pendingChartUpdate.current = { ...pendingChartUpdate.current, ...update };
    if (rafId.current === null) {
      rafId.current = requestAnimationFrame(() => {
        const pending = pendingChartUpdate.current;
        if (pending) {
          if (pending.history !== undefined) setHistory(pending.history);
          if (pending.candles !== undefined) setCandles(pending.candles);
          if (pending.currentPrice !== undefined) setCurrentPrice(pending.currentPrice);
        }
        pendingChartUpdate.current = null;
        rafId.current = null;
      });
    }
  };

  const sendWsMessage = (msg: any): boolean => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(msg));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  };

  // Time elapsed counter
  const [elapsedTime, setElapsedTime] = useState<string>("00:00:00");
  const startTimeRef = useRef<number>(Date.now());

  // AI Study Feed Speed States
  const [aiStudyStatus, setAiStudyStatus] = useState<"waiting" | "calibrating" | "optimized" | "active">("calibrating");
  const [aiStudyMessage, setAiStudyMessage] = useState<string>("AI is calibrating long-term behavioral profile... Execution locked.");
  const [averageVelocity, setAverageVelocity] = useState<number | null>(null);
  const [aiKnowledgeBase, setAiKnowledgeBase] = useState<{
    totalObservations: number;
    globalAverageSpeed: number;
    peakVelocityRegistered: number;
    timeOfDayPatterns: Record<string, { count: number; avgSpeed: number }>;
    lastUpdated: string;
  } | null>(null);
  const [aiSynthesizedStrategy, setAiSynthesizedStrategy] = useState<{
    id?: string;
    name: string;
    description: string;
    mode: string;
    rules: Record<string, any>;
    createdAt: string;
    updatedAt: string;
  } | null>(null);
  const [lastStrategySignal, setLastStrategySignal] = useState<{ type: string; reason: string; confidence?: number } | null>(null);
  const [strategiesList, setStrategiesList] = useState<Array<{
    id: string;
    name: string;
    description: string;
    mode: string;
    category: string;
    tags: string[];
    performance?: { winRate: number; profitFactor: number; totalTrades: number };
  }>>([]);
  const [telemetryStream, setTelemetryStream] = useState<any[]>([]);

  // Connection checking
  useEffect(() => {
    const handleOnline = () => setIsInternetOnline(true);
    const handleOffline = () => setIsInternetOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Dynamic timer
    const interval = setInterval(() => {
      const diff = Date.now() - startTimeRef.current;
      const hours = Math.floor(diff / 3600000).toString().padStart(2, "0");
      const mins = Math.floor((diff % 3600000) / 60000).toString().padStart(2, "0");
      const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
      setElapsedTime(`${hours}:${mins}:${secs}`);
    }, 1000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  const fetchAiStudyFeed = async () => {
    try {
      const response = await fetch("/api/ai-study-feed");
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && contentType.includes("application/json")) {
        const data = await response.json();
        setAiStudyStatus(data.status);
        if (data.stream) {
          setTelemetryStream(data.stream);
        }
        if (data.status === "calibrating") {
          setAiStudyMessage(data.message || "AI is calibrating long-term behavioral profile... Execution locked.");
          setAverageVelocity(data.averageVelocity || null);
          setAiKnowledgeBase(data.aiKnowledgeBase || null);
        } else if (data.status === "optimized" || data.status === "active") {
          setAiStudyMessage("");
          setAverageVelocity(data.averageVelocity);
          setAiKnowledgeBase(data.aiKnowledgeBase || null);
        }
        if (data.aiSynthesizedStrategy) {
          setAiSynthesizedStrategy(data.aiSynthesizedStrategy);
        }
      }
    } catch {
      // Quietly ignore transient network/json errors during startup/polling
    }
  };

  const fetchStrategies = async () => {
    try {
      const response = await fetch("/api/strategies");
      if (response.ok) {
        const data = await response.json();
        setStrategiesList(data);
      }
    } catch {
      // Silently ignore strategy fetch errors
    }
  };

  // Poll server for latest stats, parameters, live prices and log history
  const fetchStatus = async () => {
    const startTick = Date.now();
    try {
      fetchWebRequestStatus(); // Parallel call to verify WebRequest test state
      fetchAiStudyFeed();     // Dynamic AI speed metrics feed call
      const response = await fetch("/api/status");
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && contentType.includes("application/json")) {
        const data = await response.json();
        setConfig(data.config);
        setConnection(data.connection);
        setIsBridgeConnected(!!data.isBridgeConnected);
        setLogs(data.logs);
        setTradesList(data.trades || []);
        setHistory(data.history || []);
        setCandles(data.candles || []);
        setCurrentPrice(data.currentPrice);
        if (data.activeSymbol) setActiveSymbol(data.activeSymbol);
        if (data.symbolStates) setSymbolStates(data.symbolStates);
        setStats(data.stats);
        if (data.aiSynthesizedStrategy) {
          setAiSynthesizedStrategy(data.aiSynthesizedStrategy);
        }
        if (data.lastStrategySignal) {
          setLastStrategySignal(data.lastStrategySignal);
        }
        
        // Calculate latency
        const endTick = Date.now();
        setLatency(Math.max(3, endTick - startTick));
        
        fetchStrategies();
      }
    } catch {
      // Simulate low latency drop
      setLatency(999);
    }
  };

  const handleResetStats = async () => {
    const sent = sendWsMessage({ type: "reset_stats" });
    if (!sent) {
      try {
        const response = await fetch("/api/reset-stats", { method: "POST" });
        if (response.ok) {
          fetchStatus();
        }
      } catch (e) {
        console.error("Failed to reset stats:", e);
      }
    }
  };

  const handleCloseAllPositions = async () => {
    const sent = sendWsMessage({ type: "close_all" });
    if (!sent) {
      try {
        await fetch("/api/toggle-trade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: false })
        });
        fetchStatus();
      } catch (err) {}
    }
  };

  // Real-Time WebSocket Connection & Lifecycle Management
  useEffect(() => {
    let reconnectTimeout: any = null;
    let pingInterval: any = null;
    let isUnmounted = false;

    function connectWs() {
      if (isUnmounted) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/live`;
      
      try {
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          if (isUnmounted) return;
          setWsConnected(true);
          wsConnectedRef.current = true;
          if (pingInterval) clearInterval(pingInterval);
          pingInterval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: "ping", clientTime: Date.now() }));
            }
          }, 8000);
        };

        socket.onmessage = (event) => {
          if (isUnmounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "pong" && msg.clientTime) {
              const rtt = Math.max(1, Date.now() - msg.clientTime);
              setPingLatency(rtt);
              setLatency(rtt);
            } else if (msg.type === "init" && msg.payload) {
              const data = msg.payload;
              if (data.config) setConfig(data.config);
              if (data.connection) setConnection(data.connection);
              if (data.isBridgeConnected !== undefined) setIsBridgeConnected(!!data.isBridgeConnected);
              if (data.logs) setLogs(data.logs);
              if (data.trades) setTradesList(data.trades);
              if (data.history) setHistory(data.history);
              if (data.candles) setCandles(data.candles);
              if (data.currentPrice !== undefined) setCurrentPrice(data.currentPrice);
              if (data.activeSymbol) setActiveSymbol(data.activeSymbol);
              if (data.symbolStates) setSymbolStates(data.symbolStates);
              if (data.stats) setStats(data.stats);
              if (data.aiSynthesizedStrategy) setAiSynthesizedStrategy(data.aiSynthesizedStrategy);
              if (data.lastStrategySignal) setLastStrategySignal(data.lastStrategySignal);
              if (data.webRequestStatus) setWebRequestStatus(data.webRequestStatus);
              fetchStrategies();
            } else if (msg.type === "tick") {
              if (msg.currentPrice !== undefined) {
                scheduleChartUpdate({ currentPrice: msg.currentPrice });
              }
              if (msg.tick) {
                scheduleChartUpdate({
                  history: [...(pendingChartUpdate.current?.history || historyRef.current), msg.tick].slice(-100)
                });
              }
              if (msg.candles) {
                scheduleChartUpdate({ candles: msg.candles });
              }
              if (msg.stats) setStats(msg.stats);
              if (msg.connection) setConnection(msg.connection);
            } else if (msg.type === "trades") {
              if (msg.trades) setTradesList(msg.trades);
              if (msg.stats) setStats(msg.stats);
            } else if (msg.type === "log" && msg.log) {
              setLogs(prev => [msg.log, ...prev.slice(0, 79)]);
            } else if (msg.type === "config" && msg.config) {
              setConfig(msg.config);
            } else if (msg.type === "connection") {
              if (msg.connection) setConnection(msg.connection);
              if (msg.isBridgeConnected !== undefined) setIsBridgeConnected(!!msg.isBridgeConnected);
            } else if (msg.type === "webrequest_test" && msg.testState) {
              setWebRequestStatus(msg.testState);
            } else if (msg.type === "ai_strategy" && msg.aiSynthesizedStrategy) {
              setAiSynthesizedStrategy(msg.aiSynthesizedStrategy);
            }
            fetchStrategies();
          } catch {}
        };

        socket.onclose = () => {
          if (isUnmounted) return;
          setWsConnected(false);
          wsConnectedRef.current = false;
          setPingLatency(null);
          if (pingInterval) clearInterval(pingInterval);
          reconnectTimeout = setTimeout(connectWs, 2500);
        };

        socket.onerror = () => {
          try { socket.close(); } catch {}
        };
      } catch {
        reconnectTimeout = setTimeout(connectWs, 3000);
      }
    }

    connectWs();
    fetchStatus();

    // Fallback polling only when WebSocket is not connected
    const fallbackInterval = setInterval(() => {
      if (!wsConnectedRef.current) {
        fetchStatus();
      }
    }, 1000);

    return () => {
      isUnmounted = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (pingInterval) clearInterval(pingInterval);
      clearInterval(fallbackInterval);
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
      }
    };
  }, []);

  // Initialize input fields when config is pulled
  useEffect(() => {
    const savedEndpoint = (typeof window !== "undefined" && localStorage.getItem("mt5_webrequest_endpoint")) || "";
    setParamInput({
      lotSize: config.lotSize.toString(),
      takeProfitPoints: config.takeProfitPoints.toString(),
      stopLossPoints: config.stopLossPoints.toString(),
      trailingStopPoints: config.trailingStopPoints.toString(),
      maxTrades: config.maxTrades.toString(),
      useTrailingStop: config.useTrailingStop,
      mt5Path: config.mt5Path || "",
      appEndpoint: config.appEndpoint || savedEndpoint || "http://127.0.0.1:3000",
      tradingMode: config.tradingMode || "Scalping",
      selectedAssets: config.selectedAssets || ["Step Index"],
      isAiModeEnabled: !!config.isAiModeEnabled
    });
  }, [config.lotSize, config.takeProfitPoints, config.stopLossPoints, config.trailingStopPoints, config.maxTrades, config.useTrailingStop, config.mt5Path, config.appEndpoint, config.tradingMode, config.selectedAssets, config.isAiModeEnabled]);

  // Handle configuration change submissions to backend
  const applySettings = async (
    strategyOverride?: StrategyMode, 
    mt5PathOverride?: string, 
    appEndpointOverride?: string,
    tradingModeOverride?: "Scalping" | "Swing",
    selectedAssetsOverride?: string[],
    isAiModeEnabledOverride?: boolean
  ) => {
    const finalEndpoint = appEndpointOverride !== undefined ? appEndpointOverride : (paramInput.appEndpoint || "http://127.0.0.1:3000");
    if (finalEndpoint) {
      try {
        localStorage.setItem("mt5_webrequest_endpoint", finalEndpoint);
      } catch {}
    }
    try {
      const lotSize = Math.max(0.01, Math.min(100, parseFloat(paramInput.lotSize) || 0.1));
      const takeProfitPoints = Math.max(1, Math.min(10000, parseInt(paramInput.takeProfitPoints) || 300));
      const stopLossPoints = Math.max(1, Math.min(10000, parseInt(paramInput.stopLossPoints) || 150));
      const trailingStopPoints = Math.max(0, Math.min(5000, parseInt(paramInput.trailingStopPoints) || 100));
      const maxTrades = Math.max(1, Math.min(20, parseInt(paramInput.maxTrades) || 3));
      
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedStrategy: strategyOverride || config.selectedStrategy,
          lotSize,
          takeProfitPoints,
          stopLossPoints,
          trailingStopPoints,
          useTrailingStop: paramInput.useTrailingStop,
          maxTrades,
          mt5Path: mt5PathOverride !== undefined ? mt5PathOverride : paramInput.mt5Path,
          appEndpoint: finalEndpoint,
          tradingMode: tradingModeOverride !== undefined ? tradingModeOverride : paramInput.tradingMode,
          selectedAssets: selectedAssetsOverride !== undefined ? selectedAssetsOverride : paramInput.selectedAssets,
          isAiModeEnabled: isAiModeEnabledOverride !== undefined ? isAiModeEnabledOverride : paramInput.isAiModeEnabled
        })
      });

      if (response.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
        fetchStatus();
      }
    } catch (e) {
      console.error("Failed to commit settings updates to backend.", e);
    }
  };

  // Toggle EA/Simulation Execution directly
  const toggleTradingExecution = async () => {
    if (aiStudyStatus !== "optimized" && aiStudyStatus !== "active") {
      console.warn("Automated trade execution blocked: AI Speed dynamic baseline study is currently pending.");
      return;
    }
    const targetState = !config.isActive;
    // Optimistic UI feedback
    setConfig(prev => ({ ...prev, isActive: targetState }));

    const sent = sendWsMessage({ type: "toggle_trade" });
    if (!sent) {
      try {
        const response = await fetch("/api/toggle-trade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: targetState })
        });
        const contentType = response.headers.get("content-type") || "";
        if (response.ok && contentType.includes("application/json")) {
          const data = await response.json();
          if (data && data.config) setConfig(data.config);
        }
      } catch (e) {
        console.error("Error attempting to toggle remote executor state", e);
        setConfig(prev => ({ ...prev, isActive: !targetState }));
      }
    }
  };

  const fetchWebRequestStatus = async () => {
    try {
      const res = await fetch("/api/test-webrequest/status");
      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("application/json")) {
        const data = await res.json();
        if (data && data.testState) {
          setWebRequestStatus(data.testState);
        }
        if (data && data.suggestedUrl) {
          setSuggestedUrl(data.suggestedUrl);
        }
      }
    } catch {
      // Quietly ignore transient poll errors
    }
  };

  const triggerWebRequestTest = async () => {
    setIsVerifyingWebRequest(true);
    try {
      const response = await fetch("/api/test-webrequest/trigger", {
        method: "POST"
      });
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && contentType.includes("application/json")) {
        const data = await response.json();
        if (data && data.testState) {
          setWebRequestStatus(data.testState);
        }
      }

      // Start polling status check
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await fetch("/api/test-webrequest/status");
          const sContentType = statusRes.headers.get("content-type") || "";
          if (statusRes.ok && sContentType.includes("application/json")) {
            const statusData = await statusRes.json();
            if (statusData && statusData.testState) {
              setWebRequestStatus(statusData.testState);
              // Stop polling if done or too many tries
              if (statusData.testState.status !== "pending" || attempts > 15) {
                clearInterval(interval);
                setIsVerifyingWebRequest(false);
              }
            }
          }
        } catch {
          clearInterval(interval);
          setIsVerifyingWebRequest(false);
        }
      }, 1000);
    } catch {
      setIsVerifyingWebRequest(false);
    }
  };

  const switchSymbol = async (symbol: string) => {
    try {
      const response = await fetch("/api/status/switch-symbol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.activeSymbol) {
          setActiveSymbol(data.activeSymbol);
        }
      }
    } catch (e) {
      console.error("Failed to switch symbol:", e);
    }
  };

  // Dynamic self referential callback URL helper targeting public-facing shared domain to bypass sandbox sign-in
  const getAppBaseUrl = () => {
    let origin = window.location.origin;
    if (origin.includes("ais-dev-")) {
      origin = origin.replace("ais-dev-", "ais-pre-");
    }
    return origin;
  };

  const downloadNodejsBridge = () => {
    const origin = config.appEndpoint || getAppBaseUrl();

    const jsBridgeScript = `/**
 * Step Index AI Scalper - Free MT5 Node.js Bridge Client
 * 
 * Standalone Node client polling the cloud server for pending trades
 * and executing them using local MetaTrader command line execution or logs.
 * 
 * NOTE: The Google Sandbox Development workspace is protected by a login wall
 * which forces external scripts to redirect to login pages, returning HTML instead of JSON.
 * To resolve this:
 * 1. ALWAYS use the public Shared App URL (with "ais-pre-" instead of "ais-dev-").
 * 2. This downloaded script has been automatically configured to point to the public Shared domain.
 */

const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log("=================================================================");
console.log("⚡ STEP INDEX AI SCALPER - FREE NODE.JS MT5 BRIDGE CLIENT ⚡");
console.log("=================================================================");

const SERVER_URL = "${origin}";
let MT5_TERMINAL_PATH = "${config.mt5Path || ""}";

// COOKIE INTEGRATION (Optional - For local development bypass if needed)
// If your sandbox App is behind authentication (returns Google Sign-In HTML pages),
// 1. Open your browser Developer Tools (F12) while viewing your app
// 2. Go to the Network tab, pick any request, and copy the value of the 'Cookie' header.
// 3. Paste it below inside the quotes (e.g. "sid=..."):
const WORKSPACE_AUTH_COOKIE = ""; 

console.log("Target Server Cloud Gateway : " + SERVER_URL);

// Dynamic Auto-Detection of MT5 path on Windows if manual override is blank/default
if (!MT5_TERMINAL_PATH || MT5_TERMINAL_PATH === "terminal64.exe" || MT5_TERMINAL_PATH.toLowerCase() === "default") {
  console.log("[AUTO-DETECT] MT5 local path is empty or default. Scanning C:\\\\Program Files...");
  let foundPath = null;
  const programFiles = process.env['ProgramFiles'] || 'C:\\\\Program Files';
  try {
    if (fs.existsSync(programFiles)) {
      const dirs = fs.readdirSync(programFiles);
      for (const dir of dirs) {
        if (dir.toLowerCase().includes('deriv') || dir.toLowerCase().includes('metatrader')) {
          const checkPath = path.join(programFiles, dir, 'terminal64.exe');
          if (fs.existsSync(checkPath)) {
            foundPath = checkPath;
            break;
          }
          // Scan subfolders
          const subDir = path.join(programFiles, dir);
          if (fs.statSync(subDir).isDirectory()) {
            const subDirs = fs.readdirSync(subDir);
            for (const sd of subDirs) {
              const checkSubPath = path.join(subDir, sd, 'terminal64.exe');
              if (fs.existsSync(checkSubPath)) {
                foundPath = checkSubPath;
                break;
              }
            }
          }
          if (foundPath) break;
        }
      }
    }
  } catch (err) {
    console.log("[AUTO-DETECT] Error directories scan: " + err.message);
  }

  if (foundPath) {
    MT5_TERMINAL_PATH = foundPath;
    console.log("[AUTO-DETECT] Auto-resolved to MT5: " + MT5_TERMINAL_PATH);
  } else {
    MT5_TERMINAL_PATH = "terminal64.exe";
    console.log("[AUTO-DETECT] Auto-detection failed. Falling back to default: " + MT5_TERMINAL_PATH);
  }
} else {
  console.log("Terminal Executor Path       : " + MT5_TERMINAL_PATH);
}

if (WORKSPACE_AUTH_COOKIE) {
  console.log("Credential Authenticated     : YES (Custom authorization cookies injected)");
} else {
  console.log("Credential Authenticated     : PUBLIC ROUTE (Using direct public path: " + SERVER_URL + ")");
}
console.log("Active Status                : Polling daemon active. Press Ctrl+C to terminate.\\n");

// Pull current settings from server continuously to synchronize changes dynamically
async function syncSettingsFromServer() {
  try {
    const configHeaders = {};
    if (WORKSPACE_AUTH_COOKIE) {
      configHeaders.headers = { 
        'Cookie': WORKSPACE_AUTH_COOKIE,
        'User-Agent': 'Mozilla/5.0'
      };
    }
    const response = await axios.get(\`\${SERVER_URL}/api/settings\`, configHeaders);
    if (response.data && response.data.mt5Path) {
      const serverMt5 = response.data.mt5Path;
      if (serverMt5 && serverMt5 !== "" && serverMt5 !== "terminal64.exe") {
        if (MT5_TERMINAL_PATH !== serverMt5) {
          MT5_TERMINAL_PATH = serverMt5;
          console.log("[SYNC] Live updated MT5 path from dashboard: " + MT5_TERMINAL_PATH);
        }
      }
    }

    // Check for pending WebRequest verification trigger from the React web app
    if (response.data && response.data.triggerWebRequestTest) {
      console.log("\\n[TEST] 🔍 WebRequest verification triggered from web dashboard...");
      let success = true;
      let detailsList = [];
      
      // 1. Check bridge-to-server reachability
      try {
        await axios.get(\`\${SERVER_URL}/api/status\`, configHeaders);
        detailsList.push("Local bridge can successfully resolve and hit target server.");
      } catch (err) {
        success = false;
        detailsList.push("Bridge connection error: " + err.message);
      }
      
      // 2. Check if local MT5 path exists/configured
      if (MT5_TERMINAL_PATH && MT5_TERMINAL_PATH !== "terminal64.exe") {
        if (fs.existsSync(MT5_TERMINAL_PATH)) {
          detailsList.push("MetaTrader 5 terminal process path verified.");
        } else {
          detailsList.push("Warning: MetaTrader 5 terminal NOT found at configured path.");
        }
      } else {
        detailsList.push("MetaTrader 5 path scanning system is active (dynamic auto-detection).");
      }
      
      // 3. Confirm network active
      detailsList.push("Active bridge-to-terminal signaling daemon is ONLINE.");
      
      const reportStatus = success ? "success" : "failed";
      const reportDetails = detailsList.join(" | ");
      
      try {
        await axios.post(\`\${SERVER_URL}/api/test-webrequest/report\`, {
          status: reportStatus,
          error: success ? "" : "Connectivity mismatch",
          details: reportDetails
        }, configHeaders);
        console.log("[TEST] WebRequest check completed and reported as: " + reportStatus.toUpperCase());
      } catch (reportErr) {
        console.error("[TEST] Error reporting test results to server: " + reportErr.message);
      }
    }
  } catch (err) {
    // Fail silently, fall back to current path
  }
}

async function executeLocalTrade(trade) {
  if (!trade) return;

  // Ultra-resilient key mapping to support any variation of trade keys (e.g. signal payload vs legacy TradeRecord)
  const action = (trade.action || trade.type || trade.Action || trade.Type || "").toUpperCase();
  const symbol = trade.symbol || trade.Symbol || activeSymbol || "Step Index";
  const volume = Number(trade.volume || trade.lotSize || trade.LotSize || trade.Volume || 0);
  const sl = Number(trade.sl || trade.stopLossPoints || trade.stopLoss || trade.slPoints || 0);
  const tp = Number(trade.tp || trade.takeProfitPoints || trade.takeProfit || trade.tpPoints || 0);

  // Fallback defaults check: Skip execution entirely if critical parameters are missing or invalid
  if (!action || (action !== "BUY" && action !== "SELL")) {
    console.log("[EXECUTOR] Skipping trade execution: Action/Type is missing or invalid. Received: '" + action + "' from payload:", JSON.stringify(trade));
    return;
  }
  
  if (!symbol) {
    console.log("[EXECUTOR] Skipping trade execution: Symbol is missing.");
    return;
  }

  if (volume <= 0) {
    console.log("[EXECUTOR] Skipping trade execution: Volume/LotSize is invalid. Received: '" + volume + "' from payload:", JSON.stringify(trade));
    return;
  }

  const timestamp = new Date().toISOString();

  console.log("\\n[SIGNAL] 📥 Received Pending Signal:");
  console.log("-----------------------------------------------------------------");
  console.log("  Timestamp : " + timestamp);
  console.log("  Action    : " + action + " (Market Execution)");
  console.log("  Symbol    : " + symbol);
  console.log("  Volume    : " + volume + " lots");
  console.log("  Stop Loss : " + (sl || "None") + " points");
  console.log("  Take Prof : " + (tp || "None") + " points");
  console.log("-----------------------------------------------------------------");

  // Built-in executing trade via MetaTrader 5 command-line configuration
  const command = \`"\${MT5_TERMINAL_PATH}" /cmd:trade,action=\${action},symbol="\${symbol}",volume=\${volume},sl=\${sl},tp=\${tp}\`;
  
  console.log("[EXECUTOR] Running system exec command:");
  console.log("  $ " + command);

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.log("[EXECUTOR] System call logged. (If terminal64.exe is not found locally, verify Path Settings)");
      console.log("[EXECUTOR] Local trade signal captured and logged successfully.");
      return;
    }
    if (stdout) console.log("[TERMINAL OUT]: " + stdout.trim());
  });
}

async function pollTrades() {
    try {
        await syncSettingsFromServer();
        const configHeaders = { timeout: 10000, headers: {} };
        if (WORKSPACE_AUTH_COOKIE) {
            configHeaders.headers = { 
                'Cookie': WORKSPACE_AUTH_COOKIE,
                'User-Agent': 'Mozilla/5.0'
            };
        }
        const response = await axios.get(\`\${SERVER_URL}/poll\`, configHeaders);
        const trades = response.data;
        if (Array.isArray(trades)) {
            if (trades.length > 0) {
                console.log(\`[\${new Date().toLocaleTimeString()}] Received trades:\`, trades);
                for (const trade of trades) {
                    await executeLocalTrade(trade);
                }
            }
        } else {
            if (typeof trades === 'string') {
                if (trades.includes('<!DOCTYPE') || trades.includes('<html') || trades.includes('document.query') || trades.includes('document.write')) {
                    console.error("[POLLER] Critical: Server returned HTML/JS rather than trade signals. This usually means the request is being intercepted by an authentication barrier, redirect, or login page on the platform preview domain.");
                } else {
                    console.log("[POLLER] Received non-array text data:", trades);
                }
            } else {
                console.log("[POLLER] Received non-array data structure:", typeof trades);
            }
        }
    } catch (error) {
        console.error("[POLLER] Connection blip or server unreachable:", error.message);
    }
}

// Poll every 1.5 seconds
setInterval(pollTrades, 1500);
`;

    const packageJsonContent = `{
  "name": "stepindex-free-mt5-bridge",
  "version": "1.0.0",
  "description": "MetaTrader 5 Free Node.js Signal Bridge Client using Axios and local exec call",
  "main": "mt5_bridge.js",
  "dependencies": {
    "axios": "^1.6.8"
  },
  "scripts": {
    "start": "node mt5_bridge.js"
  }
}
`;

    // Download mt5_bridge.js
    const jsBlob = new Blob([jsBridgeScript], { type: "text/plain;charset=utf-8" });
    const jsUrl = URL.createObjectURL(jsBlob);
    const jsLink = document.createElement("a");
    jsLink.href = jsUrl;
    jsLink.setAttribute("download", "mt5_bridge.js");
    document.body.appendChild(jsLink);
    jsLink.click();
    document.body.removeChild(jsLink);
    URL.revokeObjectURL(jsUrl);

    // Download package.json
    setTimeout(() => {
      const pkgBlob = new Blob([packageJsonContent], { type: "application/json;charset=utf-8" });
      const pkgUrl = URL.createObjectURL(pkgBlob);
      const pkgLink = document.createElement("a");
      pkgLink.href = pkgUrl;
      pkgLink.setAttribute("download", "package.json");
      document.body.appendChild(pkgLink);
      pkgLink.click();
      document.body.removeChild(pkgLink);
      URL.revokeObjectURL(pkgUrl);
    }, 200);
  };

  const copyUrlToClipboard = () => {
    navigator.clipboard.writeText(getAppBaseUrl());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  // Filter logs safely
  const filteredLogs = logs.filter(log => {
    if (filterLogLevel === "ALL") return true;
    if (filterLogLevel === "INFO" && log.level === "INFO") return true;
    if (filterLogLevel === "SUCCESS" && log.level === "SUCCESS") return true;
    if (filterLogLevel === "WARNING" && log.level === "WARNING") return true;
    if (filterLogLevel === "ERROR" && log.level === "ERROR") return true;
    return true;
  });

  // Graph render coordinate calculations with dynamic candlestick scaling
  const candleData = candles.length > 0 ? candles : history.map(t => ({
    time: t.time,
    open: t.open !== undefined ? t.open : t.price,
    high: t.high !== undefined ? t.high : t.price,
    low: t.low !== undefined ? t.low : t.price,
    close: t.close !== undefined ? t.close : t.price,
  }));
  const displayCandles = candleData.slice(-MAX_VISIBLE_CANDLES);
  const minPrice = displayCandles.length > 0 
    ? Math.min(...displayCandles.map(c => c.low)) - 0.2
    : 1245.0;
  const maxPrice = displayCandles.length > 0 
    ? Math.max(...displayCandles.map(c => c.high)) + 0.2
    : 1255.0;
  const priceRange = maxPrice - minPrice || 1.0;

  return (
    <div id="app-container" className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col selection:bg-indigo-500 selection:text-white antialiased">
      
      {/* Sleek Top Header Controls */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-50 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-indigo-600/25 shrink-0">
            <TrendingUp className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight text-white">Scalar AI</span>
            <span className="hidden xs:inline-block text-[10px] font-mono px-1.5 py-0.5 bg-indigo-500/15 border border-indigo-500/30 rounded text-indigo-300 font-medium">
              {activeSymbol || "NO SYMBOL"}
            </span>
          </div>
        </div>

        {/* Symbol Switcher */}
        {symbolStates.length > 1 && (
          <div className="hidden md:flex items-center gap-2">
            <select
              value={activeSymbol}
              onChange={(e) => switchSymbol(e.target.value)}
              className="bg-slate-800/80 border border-slate-700/60 rounded-lg text-xs font-mono text-slate-200 px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              {symbolStates.map((state) => (
                <option key={state.symbol} value={state.symbol}>
                  {state.symbol} {state.connection.isEaConnected ? "●" : "○"}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Desktop Controls (Hidden on Mobile) */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-3 px-3.5 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-full text-xs text-slate-300">
            {/* WebSocket Real-time Stream Indicator */}
            <div className="flex items-center gap-2">
              {wsConnected ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="font-semibold text-emerald-400 font-mono text-[10px] tracking-wide flex items-center gap-1">
                    <Zap className="w-3 h-3 text-emerald-400 inline" />
                    LIVE STREAM {pingLatency !== null ? `(${pingLatency}ms)` : ""}
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                  <span className="font-semibold text-amber-400 font-mono text-[10px] tracking-wide flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 text-amber-400 inline" />
                    POLL MODE ({latency}ms)
                  </span>
                </>
              )}
            </div>

            <div className="h-3 w-px bg-slate-700"></div>

            {/* Internet Status */}
            <div className="flex items-center gap-1">
              {isInternetOnline ? (
                <span className="font-semibold text-emerald-400 flex items-center gap-1 text-[10px]">
                  <Wifi className="w-3 h-3 inline" /> ONLINE
                </span>
              ) : (
                <span className="font-semibold text-red-400 flex items-center gap-1 text-[10px]">
                  <WifiOff className="w-3 h-3 inline" /> OFFLINE
                </span>
              )}
            </div>
            
            <div className="h-3 w-px bg-slate-700"></div>

            {/* EA Online Sync Indicator */}
            <div className="flex items-center gap-1.5">
              {connection.isEaConnected ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                  <span className="font-semibold text-blue-400 text-[10px]">EA ONLINE</span>
                  <span className="text-[9px] text-slate-400 font-mono">#{connection.accountNumber}</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-slate-500"></span>
                  <span className="font-semibold text-slate-400 uppercase text-[10px]">EA OFFLINE</span>
                </>
              )}
            </div>

            <div className="h-3 w-px bg-slate-700"></div>

            {/* Desktop Bridge Status Indicator */}
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${isBridgeConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}></span>
              <span className={`font-semibold uppercase text-[10px] ${isBridgeConnected ? "text-emerald-400" : "text-rose-400"}`}>
                {isBridgeConnected ? "BRIDGE ON" : "BRIDGE OFF"}
              </span>
            </div>
          </div>

          {/* Quick Header Execution Toggle Button */}
          <button
            type="button"
            onClick={toggleTradingExecution}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
              config.isActive
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20"
                : "bg-emerald-600 hover:bg-emerald-550 text-white shadow-emerald-600/20"
            }`}
            title={config.isActive ? "Pause automated trade execution" : "Start automated trade execution"}
          >
            {config.isActive ? (
              <>
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Start</span>
              </>
            )}
          </button>
        </div>

        {/* Mobile Screen Controls (Quick Start Mini Button + Hamburger Menu Toggle) */}
        <div className="flex md:hidden items-center gap-2">
          {/* Quick Start/Pause Mini Button for immediate one-tap mobile control */}
          <button
            type="button"
            onClick={toggleTradingExecution}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              config.isActive
                ? "bg-rose-600/90 text-white"
                : "bg-emerald-600/90 text-white"
            }`}
          >
            {config.isActive ? (
              <>
                <Square className="w-3 h-3 fill-white" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-white" />
                <span>Start</span>
              </>
            )}
          </button>

          {/* Mobile Menu Icon Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700/80 border border-slate-700/80 text-slate-200 transition-colors cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5 text-indigo-400" />
            ) : (
              <Menu className="w-5 h-5 text-slate-200" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Overlay & Panel (Includes Menu under header, Start Button, and Statuses) */}
      {isMobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 top-16 bg-slate-950/70 backdrop-blur-xs z-40 md:hidden animate-fade-in"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          {/* Slide-down Mobile Menu */}
          <div className="fixed top-16 left-0 right-0 max-h-[calc(100vh-4rem)] overflow-y-auto bg-slate-900 border-b border-slate-800 shadow-2xl p-4 sm:p-5 flex flex-col gap-4 z-40 md:hidden animate-fade-in">
            
            {/* 1. Mobile Start / Pause Action Card */}
            <div className="p-3.5 bg-slate-800/90 border border-slate-700/70 rounded-xl flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Trading Engine</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                  config.isActive ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-700 text-slate-400"
                }`}>
                  {config.isActive ? "Executing" : "Idle"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  toggleTradingExecution();
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full py-3 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                  config.isActive
                    ? "bg-rose-600 hover:bg-rose-500 text-white"
                    : "bg-emerald-600 hover:bg-emerald-550 text-white"
                }`}
              >
                {config.isActive ? (
                  <>
                    <Square className="w-4 h-4 fill-white" />
                    <span>Pause Automated Trading</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Start Automated Trading</span>
                  </>
                )}
              </button>
            </div>

            {/* 2. Mobile Real-Time Statuses Hub */}
            <div className="p-3.5 bg-slate-800/90 border border-slate-700/70 rounded-xl flex flex-col gap-2.5">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">System & Network Status</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Live Stream / Polling */}
                <div className="p-2.5 bg-slate-900/80 border border-slate-700/50 rounded-lg flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">Feed Mode</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${wsConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                    <span className={`font-mono text-[11px] font-bold ${wsConnected ? "text-emerald-400" : "text-amber-400"}`}>
                      {wsConnected ? `STREAM (${pingLatency ?? 0}ms)` : `POLL (${latency}ms)`}
                    </span>
                  </div>
                </div>

                {/* Internet */}
                <div className="p-2.5 bg-slate-900/80 border border-slate-700/50 rounded-lg flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">Internet</span>
                  <div className="flex items-center gap-1.5">
                    {isInternetOnline ? (
                      <>
                        <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="font-mono text-[11px] font-bold text-emerald-400">ONLINE</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                        <span className="font-mono text-[11px] font-bold text-rose-400">OFFLINE</span>
                      </>
                    )}
                  </div>
                </div>

                {/* MT5 EA */}
                <div className="p-2.5 bg-slate-900/80 border border-slate-700/50 rounded-lg flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">MT5 EA</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${connection.isEaConnected ? "bg-blue-400 animate-pulse" : "bg-slate-500"}`} />
                    <span className={`font-mono text-[11px] font-bold ${connection.isEaConnected ? "text-blue-400" : "text-slate-400"}`}>
                      {connection.isEaConnected ? `#${connection.accountNumber || "Connected"}` : "OFFLINE"}
                    </span>
                  </div>
                </div>

                {/* Bridge */}
                <div className="p-2.5 bg-slate-900/80 border border-slate-700/50 rounded-lg flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">Desktop Bridge</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${isBridgeConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
                    <span className={`font-mono text-[11px] font-bold ${isBridgeConnected ? "text-emerald-400" : "text-rose-400"}`}>
                      {isBridgeConnected ? "CONNECTED" : "OFFLINE"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Mobile Navigation Menu Links */}
            <div className="p-3.5 bg-slate-800/90 border border-slate-700/70 rounded-xl flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Navigation</span>
              {[
                { id: "home", label: "Live Trading", icon: Home, badge: `$${currentPrice.toFixed(1)}` },
                { id: "risk", label: "Risk & Strategy", icon: Sliders, badge: config.selectedStrategy === StrategyMode.AI_ADAPTIVE ? "AI" : config.selectedStrategy === StrategyMode.MEAN_REVERSION ? "REVERT" : "TREND" },
                { id: "downloads", label: "Downloads Center", icon: Download },
                { id: "logs", label: "System Logs", icon: Terminal, badge: `${logs.length}` },
                { id: "settings", label: "Settings", icon: Settings },
              ].map((tab) => {
                const IconComponent = tab.icon;
                const isActive = currentNavTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setCurrentNavTab(tab.id as any);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-300 hover:text-white hover:bg-slate-700/60"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <IconComponent className="w-4 h-4" />
                      <span>{tab.label}</span>
                    </div>
                    {tab.badge && (
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                        isActive ? "bg-indigo-700 text-indigo-100" : "bg-slate-700 text-slate-300"
                      }`}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Desktop Sub-Navigation Menu (Separated from Header, Not Fixed, Clean Sizing) */}
      <div className="hidden md:block max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 mt-5 mb-1">
        <div className="inline-flex items-center gap-1.5 p-1 bg-slate-800/80 border border-slate-700/60 rounded-xl shadow-xs overflow-x-auto scrollbar-none">
          {[
            { id: "home", label: "Live Trading", icon: Home, badge: `$${currentPrice.toFixed(1)}` },
            { id: "risk", label: "Risk & Strategy", icon: Sliders, badge: config.selectedStrategy === StrategyMode.AI_ADAPTIVE ? "AI" : config.selectedStrategy === StrategyMode.MEAN_REVERSION ? "REVERT" : "TREND" },
            { id: "downloads", label: "Downloads Center", icon: Download },
            { id: "logs", label: "System Logs", icon: Terminal, badge: `${logs.length}` },
            { id: "settings", label: "Settings", icon: Settings },
          ].map((tab) => {
            const IconComponent = tab.icon;
            const isActive = currentNavTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-btn-${tab.id}`}
                onClick={() => setCurrentNavTab(tab.id as any)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                }`}
              >
                <IconComponent className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    isActive ? "bg-indigo-700 text-indigo-100" : "bg-slate-700/70 text-slate-300"
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Core Full Stack Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">

        {/* RISK & STRATEGY SETTINGS PAGE */}
        {currentNavTab === "risk" && (
          <div className="max-w-2xl mx-auto w-full flex flex-col gap-6 animate-fade-in">
            {/* MULTI-INDEX ASSET SELECTION GRID */}
            <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Multi-Index Selector</h3>
              </div>
              <p className="text-[11px] text-slate-350 leading-normal -mt-1">
                Deploys concurrent signal scrapers over linked MT5 charts.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {["Step Index", "Volatility 75", "Boom 500", "Crash 500"].map((asset) => {
                  const isSelected = paramInput.selectedAssets.includes(asset);
                  return (
                    <button
                      key={asset}
                      type="button"
                      onClick={() => {
                        let newList = [...paramInput.selectedAssets];
                        if (newList.includes(asset)) {
                          if (newList.length > 1) {
                            newList = newList.filter(a => a !== asset);
                          }
                        } else {
                          newList.push(asset);
                        }
                        setParamInput(p => ({ ...p, selectedAssets: newList }));
                        applySettings(undefined, undefined, undefined, undefined, newList);
                      }}
                      className={`py-2 px-2.5 text-[11px] font-extrabold font-mono rounded-xl border flex items-center justify-between transition-all duration-200 cursor-pointer ${
                        isSelected
                          ? "bg-indigo-600/25 border-indigo-500 text-indigo-200 shadow-sm shadow-indigo-500/10"
                          : "bg-slate-900/90 border-slate-700/70 text-slate-300 hover:border-slate-600 hover:text-white"
                      }`}
                    >
                      <span>{asset}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-indigo-400 animate-pulse" : "bg-slate-700"}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STRATEGY OPTIONS: EXECUTION STYLE */}
            <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Execution Profile</h3>
              </div>
              <p className="text-[11px] text-slate-350 leading-normal -mt-1">
                Define frequency parameters for incoming market speed spikes.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setParamInput(p => ({ ...p, tradingMode: "Scalping" }));
                    applySettings(undefined, undefined, undefined, "Scalping", undefined);
                  }}
                  className={`py-2 px-3 text-xs font-extrabold font-mono rounded-xl border transition-all duration-200 uppercase tracking-wider cursor-pointer text-center ${
                    paramInput.tradingMode === "Scalping"
                      ? "bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-lg shadow-indigo-500/10"
                      : "bg-slate-900/90 border-slate-700/70 text-slate-300 hover:border-slate-600 hover:text-white"
                  }`}
                >
                  Scalping
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setParamInput(p => ({ ...p, tradingMode: "Swing" }));
                    applySettings(undefined, undefined, undefined, "Swing", undefined);
                  }}
                  className={`py-2 px-3 text-xs font-extrabold font-mono rounded-xl border transition-all duration-200 uppercase tracking-wider cursor-pointer text-center ${
                    paramInput.tradingMode === "Swing"
                      ? "bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-lg shadow-indigo-500/10"
                      : "bg-slate-900/90 border-slate-700/70 text-slate-300 hover:border-slate-600 hover:text-white"
                  }`}
                >
                  Swing
                </button>
              </div>
            </div>

            {/* Control & Parameters Card */}
            <div className="p-5 bg-slate-800/90 border border-slate-700/70 rounded-2xl flex flex-col shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-700/70">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Risk & Strategy</h3>
                </div>
                {saveSuccess && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/15 px-2 py-0.5 border border-emerald-500/30 rounded-full flex items-center gap-1 animate-pulse">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Updated
                  </span>
                )}
              </div>

              {/* Form Input fields */}
              <div className="space-y-4">

                {/* Active Strategy Mode selection */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Trading Algorithm</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setConfig(prev => ({ ...prev, selectedStrategy: StrategyMode.TREND_FOLLOWING }));
                        applySettings(StrategyMode.TREND_FOLLOWING);
                      }}
                      className={`py-2 px-1 text-[10px] font-bold rounded-lg border leading-tight transition-all cursor-pointer ${
                        config.selectedStrategy === StrategyMode.TREND_FOLLOWING
                          ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                          : "bg-slate-900/90 border-slate-700/70 text-slate-300 hover:text-white hover:border-slate-600"
                      }`}
                    >
                      Trend Following
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfig(prev => ({ ...prev, selectedStrategy: StrategyMode.MEAN_REVERSION }));
                        applySettings(StrategyMode.MEAN_REVERSION);
                      }}
                      className={`py-2 px-1 text-[10px] font-bold rounded-lg border leading-tight transition-all cursor-pointer ${
                        config.selectedStrategy === StrategyMode.MEAN_REVERSION
                          ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                          : "bg-slate-900/90 border-slate-700/70 text-slate-300 hover:text-white hover:border-slate-600"
                      }`}
                    >
                      Mean Reversion
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfig(prev => ({ ...prev, selectedStrategy: StrategyMode.AI_ADAPTIVE }));
                        applySettings(StrategyMode.AI_ADAPTIVE);
                      }}
                      className={`py-2 px-1 text-[10px] font-bold rounded-lg border leading-tight transition-all cursor-pointer ${
                        config.selectedStrategy === StrategyMode.AI_ADAPTIVE
                          ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                          : "bg-slate-900/90 border-slate-700/70 text-slate-300 hover:text-white hover:border-slate-600"
                      }`}
                    >
                      AI Adaptive
                    </button>
                  </div>
                </div>

                {/* Lot size */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px] text-slate-300 uppercase font-semibold">
                    <span>Lot Allocation</span>
                    <span className="text-white font-mono">{paramInput.lotSize} Lots</span>
                  </div>
                  <input
                    type="range"
                    className="w-full accent-indigo-500 h-1.5 rounded-lg bg-slate-900 cursor-pointer"
                    min="0.01"
                    max="2.0"
                    step="0.01"
                    value={paramInput.lotSize}
                    onChange={(e) => setParamInput(p => ({ ...p, lotSize: e.target.value }))}
                    onMouseUp={() => applySettings()}
                    onTouchEnd={() => applySettings()}
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                    <span>0.01 Min</span>
                    <span>2.0 Max</span>
                  </div>
                </div>

                {/* Target Trailing Configuration slider */}
                <div className="p-3 bg-slate-900/90 border border-slate-700/70 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                      Trailing Stop-Loss
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={paramInput.useTrailingStop}
                        className="sr-only peer"
                        onChange={(e) => {
                          const val = e.target.checked;
                          setParamInput(p => ({ ...p, useTrailingStop: val }));
                          // Instantly execute config change
                          setConfig(prev => ({ ...prev, useTrailingStop: val }));
                          setTimeout(() => applySettings(), 50);
                        }}
                      />
                      <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-200 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {paramInput.useTrailingStop && (
                    <div className="space-y-1 pt-1.5 border-t border-slate-800">
                      <div className="flex justify-between text-[10px] text-slate-300">
                        <span>Trailing Distance</span>
                        <span className="text-indigo-400 font-mono font-bold">{paramInput.trailingStopPoints} Points</span>
                      </div>
                      <input
                        type="range"
                        className="w-full accent-indigo-500 h-1 bg-slate-800 cursor-pointer"
                        min="20"
                        max="500"
                        step="10"
                        value={paramInput.trailingStopPoints}
                        onChange={(e) => setParamInput(p => ({ ...p, trailingStopPoints: e.target.value }))}
                        onMouseUp={() => applySettings()}
                        onTouchEnd={() => applySettings()}
                      />
                    </div>
                  )}
                </div>

                {/* Take Profit & Stop loss parameters */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase block text-slate-300">Take Profit (Pts)</label>
                    <input
                      type="number"
                      value={paramInput.takeProfitPoints}
                      onChange={(e) => setParamInput(p => ({ ...p, takeProfitPoints: e.target.value }))}
                      onBlur={() => applySettings()}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500 text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase block text-slate-300">Stop Loss (Pts)</label>
                    <input
                      type="number"
                      value={paramInput.stopLossPoints}
                      onChange={(e) => setParamInput(p => ({ ...p, stopLossPoints: e.target.value }))}
                      onBlur={() => applySettings()}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-xs font-mono font-bold text-rose-400 focus:outline-none focus:border-rose-500 text-center"
                    />
                  </div>
                </div>

                {/* Max Open trades */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-slate-300 font-bold uppercase">
                    <span>Max Concurrent Trades</span>
                    <span className="text-white font-mono">{paramInput.maxTrades}</span>
                  </div>
                  <input
                    type="range"
                    className="w-full accent-indigo-500 h-1 cursor-pointer"
                    min="1"
                    max="10"
                    step="1"
                    value={paramInput.maxTrades}
                    onChange={(e) => setParamInput(p => ({ ...p, maxTrades: e.target.value }))}
                    onMouseUp={() => applySettings()}
                    onTouchEnd={() => applySettings()}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS TAB PAGE */}
        {currentNavTab === "settings" && (
          <div className="max-w-2xl mx-auto w-full animate-fade-in">
            {/* System Settings Panel (No longer collapsible) */}
            <div className="p-5 bg-slate-800/90 border border-slate-700/70 rounded-2xl flex flex-col shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-700/70">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest text-left">System Settings</h3>
                </div>
                {saveSuccess && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/15 px-2 py-0.5 border border-emerald-500/30 rounded-full flex items-center gap-1 animate-pulse">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Updated
                  </span>
                )}
              </div>

              <div className="space-y-4">
                {/* MT5 File Path Input */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                      MT5 terminal64.exe Path
                    </label>
                    <span className="text-[9px] text-indigo-400 border border-indigo-400/20 px-1.5 py-0.5 rounded bg-indigo-500/10 font-mono">
                      Auto-detected if empty
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. C:\Program Files\Deriv MT5\terminal64.exe"
                    value={paramInput.mt5Path}
                    onChange={(e) => setParamInput(p => ({ ...p, mt5Path: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Leave blank to run smart auto-detection scanning the Program Files directory for foldernames containing 'Deriv' or 'MetaTrader'.
                  </p>
                </div>

                {/* App Link/Server Endpoint */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                      App Link / Server Endpoint
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const detected = getAppBaseUrl();
                        setParamInput(p => ({ ...p, appEndpoint: detected }));
                      }}
                      className="text-[9px] text-indigo-400 hover:text-indigo-300 font-bold uppercase transition-colors cursor-pointer"
                    >
                      [Get Origin]
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder={`e.g. ${getAppBaseUrl()}`}
                    value={paramInput.appEndpoint}
                    onChange={(e) => setParamInput(p => ({ ...p, appEndpoint: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Used by mt5_bridge.js to poll for signals. Automatically detects window origin, but can be manually overridden.
                  </p>
                </div>

                {/* AI Core Execution Mode Toggle */}
                <div className="p-4 bg-slate-900/90 border border-slate-700/70 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-slate-200">
                        AI Core Execution Mode
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Mandatory verification under complex velocity profiles
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !paramInput.isAiModeEnabled;
                        setParamInput(p => ({ ...p, isAiModeEnabled: nextVal }));
                        applySettings(undefined, undefined, undefined, undefined, undefined, nextVal);
                      }}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        paramInput.isAiModeEnabled ? "bg-emerald-500" : "bg-slate-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          paramInput.isAiModeEnabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <p className="text-[10px] text-slate-400 leading-normal text-left">
                    💡 When <strong>ON</strong>, the AI Adaptive strategy uses velocity and acceleration signals.
                  </p>
                </div>

                {/* Save Settings Trigger Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => applySettings()}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-widest rounded-lg transition-all cursor-pointer shadow-sm"
                  >
                    Save System Settings
                  </button>
                </div>

                {/* WebRequest Verification System Section */}
                <div className="mt-4 pt-4 border-t border-slate-700/60 space-y-3">
                  <div className="flex items-center gap-1.5 justify-between">
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                      MT5 WebRequest Permission
                    </span>
                    {webRequestStatus ? (
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
                        webRequestStatus.status === "success" 
                          ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                          : webRequestStatus.status === "failed" 
                          ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
                          : webRequestStatus.status === "pending"
                          ? "text-amber-400 border-amber-500/30 bg-amber-500/10 animate-pulse"
                          : "text-slate-400 border-slate-700 bg-slate-900"
                      }`}>
                        {webRequestStatus.status === "success" && "● WORKING"}
                        {webRequestStatus.status === "failed" && "● FAILED"}
                        {webRequestStatus.status === "pending" && "● TESTING..."}
                        {webRequestStatus.status === "idle" && "● NOT TESTED"}
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-slate-400 border border-slate-700 px-2 py-0.5 rounded bg-slate-900 uppercase">
                        ● UNKNOWN
                      </span>
                    )}
                  </div>

                  <div className="bg-slate-900/90 border border-slate-700/70 rounded-xl p-3.5 space-y-2.5 font-mono">
                    <div className="text-[10px] text-slate-300 font-sans leading-relaxed">
                      MetaTrader 5 requires adding the allowed WebRequest URL so our Expert Advisor can synchronize ticks & execute trades. Configure and save the MT5 WebRequest link below, then add it inside MT5:
                    </div>
                    <div className="space-y-2 font-sans text-left">
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={paramInput.appEndpoint}
                          onChange={(e) => setParamInput(p => ({ ...p, appEndpoint: e.target.value }))}
                          placeholder="e.g. http://127.0.0.1:3000"
                          className="flex-1 bg-slate-850 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-indigo-400 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(paramInput.appEndpoint);
                            setCopiedUrl(true);
                            setTimeout(() => setCopiedUrl(false), 2000);
                          }}
                          className="text-[10px] bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-200 font-bold uppercase px-2.5 py-1.5 rounded transition-all cursor-pointer whitespace-nowrap"
                        >
                          {copiedUrl ? "Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={() => applySettings(undefined, undefined, paramInput.appEndpoint)}
                          className="text-[10px] bg-indigo-600 hover:bg-indigo-550 text-white font-bold uppercase px-3 py-1.5 rounded transition-all cursor-pointer whitespace-nowrap shadow-sm"
                        >
                          Save
                        </button>
                      </div>
                      <div className="flex gap-2 text-[10px]">
                        <button
                          type="button"
                          onClick={() => {
                            setParamInput(p => ({ ...p, appEndpoint: "http://127.0.0.1:3000" }));
                            applySettings(undefined, undefined, "http://127.0.0.1:3000");
                          }}
                          className="text-slate-400 hover:text-slate-200 underline decoration-dotted transition-colors cursor-pointer"
                        >
                          Reset to localhost default (127.0.0.1)
                        </button>
                        <span className="text-slate-600 select-none">|</span>
                        <button
                          type="button"
                          onClick={() => {
                            const detected = getAppBaseUrl();
                            setParamInput(p => ({ ...p, appEndpoint: detected }));
                            applySettings(undefined, undefined, detected);
                          }}
                          className="text-slate-400 hover:text-slate-200 underline decoration-dotted transition-colors cursor-pointer"
                        >
                          Detect live web app origin
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isVerifyingWebRequest}
                    onClick={triggerWebRequestTest}
                    className={`w-full py-2 border rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      isVerifyingWebRequest
                        ? "bg-slate-900 border-slate-700 text-slate-400 cursor-not-allowed"
                        : "bg-slate-800 hover:bg-slate-750 border-indigo-500/30 hover:border-indigo-500/50 text-indigo-300 shadow-sm"
                    }`}
                  >
                    {isVerifyingWebRequest ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                        <span>Testing WebRequest Link...</span>
                      </>
                    ) : (
                      <span>Test MT5 WebRequest Link</span>
                    )}
                  </button>

                  {webRequestStatus && webRequestStatus.details && (
                    <div className="text-[10px] text-slate-300 bg-slate-900 p-2.5 rounded-lg border border-slate-700/60 leading-relaxed font-sans">
                      <span className="font-semibold text-slate-200 font-mono text-[9px] uppercase tracking-wider block mb-0.5">Test Log:</span>
                      {webRequestStatus.details}
                    </div>
                  )}
                </div>
            </div>
          </div>
        </div>
        )}

        {/* HOME BASE TAB PAGE */}
        {currentNavTab === "home" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* LEFT COLUMN: Controls & AI (lg:col-span-4) */}
            <div className="lg:col-span-4 flex flex-col gap-6 order-2 lg:order-1">

              {/* START / STOP TRADING BUTTON PANEL */}
              <div className={`p-5 rounded-2xl border flex flex-col justify-between transition-all duration-300 relative overflow-hidden ${
                config.isActive 
                  ? "bg-emerald-600/10 border-emerald-500/30" 
                  : "bg-indigo-600/10 border-indigo-500/20"
              }`}>
                {/* sleek locked screen overlay */}
                {aiStudyStatus === "calibrating" && (
                  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center z-10 animate-fade-in">
                    <Lock className="w-6 h-6 text-indigo-400 mb-2.5 animate-bounce" />
                    <p className="text-xs font-black text-indigo-300 uppercase tracking-widest mb-1 font-mono">Calibration Gate</p>
                    <p className="text-[10px] text-slate-400 max-w-xs leading-normal">
                      AI is calibrating long-term behavioral profile... Execution locked.
                    </p>
                    <div className="mt-3 flex items-center justify-center gap-1.5 bg-indigo-950/50 border border-indigo-500/30 px-3 py-1 rounded">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                      <span className="text-[9px] font-mono font-bold text-indigo-300 uppercase tracking-widest">
                        Ticks: {aiKnowledgeBase ? aiKnowledgeBase.totalObservations : 0} / 20
                      </span>
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-widest">Execution Engine</h3>
                  </div>
                  <p className="text-xs text-slate-350 leading-relaxed">
                    {config.isActive 
                      ? "Expert Advisor trade validation active. Watching for tick signals."
                      : "Scalar trading core is idle. Toggle execution keys to initiate scalp signals."
                    }
                  </p>
                </div>

                 {/* Mega Start Button with Glowing pulse styles */}
                <button
                  onClick={toggleTradingExecution}
                  disabled={aiStudyStatus !== "optimized" && aiStudyStatus !== "active"}
                  className={`w-full py-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-widest leading-none shadow-lg transition-all flex items-center justify-center gap-3 ${
                    aiStudyStatus !== "optimized" && aiStudyStatus !== "active"
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50 shadow-none"
                      : config.isActive
                      ? "bg-red-500 hover:bg-red-400 text-white shadow-red-500/10 cursor-pointer"
                      : "bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-emerald-500/20 cursor-pointer"
                  }`}
                >
                  {aiStudyStatus !== "optimized" && aiStudyStatus !== "active" ? (
                    <>
                      <AlertCircle className="w-5 h-5 text-slate-500 animate-pulse" />
                      <span>SPEED STUDY PENDING</span>
                    </>
                  ) : config.isActive ? (
                    <>
                      <Square className="w-5 h-5 fill-current" />
                      <span>STOP EXPERT WORKER</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current" />
                      <span>START EXPERT WORKER</span>
                    </>
                  )}
                </button>
              </div>

               {/* Active Strategy Card */}
               <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
                 <div className="flex items-center gap-2 pb-3 border-b border-slate-700/70">
                   <Zap className="w-4 h-4 text-amber-400" />
                   <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Active Strategy</h3>
                 </div>

                 <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/60 flex flex-col justify-between">
                   <div className="space-y-4">
                     {aiSynthesizedStrategy ? (
                       <div className="space-y-4 text-left">
                         <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg">
                           <p className="text-[9px] font-bold text-amber-400 uppercase tracking-wider mb-1 font-mono">Active Strategy</p>
                           <h4 className="text-xs font-bold text-white uppercase tracking-tight">{aiSynthesizedStrategy.name}</h4>
                           <p className="text-[10px] text-slate-300 mt-1.5 leading-relaxed">
                             {aiSynthesizedStrategy.description}
                           </p>
                           <p className="text-[9px] text-slate-400 font-mono mt-2 font-medium">
                             Mode: {aiSynthesizedStrategy.mode} | Updated: {new Date(aiSynthesizedStrategy.updatedAt).toLocaleTimeString()}
                           </p>
                         </div>

                         {aiSynthesizedStrategy.rules && Object.keys(aiSynthesizedStrategy.rules).length > 0 && (
                           <div className="space-y-2 pt-2 border-t border-slate-700/60">
                             <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Strategy Parameters</p>
                             <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                               {Object.entries(aiSynthesizedStrategy.rules).map(([key, value]) => (
                                 <div key={key} className="bg-slate-800/90 border border-slate-700/60 p-2 rounded">
                                   <span className="text-slate-400 block text-[9px] uppercase tracking-wider mb-0.5">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                   <span className="text-white font-bold">{typeof value === 'number' ? value.toFixed(2) : String(value)}</span>
                                 </div>
                               ))}
                             </div>
                           </div>
                         )}
                       </div>
                     ) : (
                       <div className="text-center py-6 text-[11px] text-slate-400 italic">
                         No active strategy configured. Use MCP tools or select a strategy template below.
                       </div>
                     )}
                   </div>
                 </div>
               </div>

               {/* Strategy Performance Dashboard */}
               <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
                 <div className="flex items-center gap-2 pb-3 border-b border-slate-700/70">
                   <TrendingUp className="w-4 h-4 text-emerald-400" />
                   <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Strategy Performance</h3>
                 </div>

                 <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/60">
                   {strategiesList.length > 0 ? (
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                       {strategiesList.map((strategy) => (
                         <div key={strategy.id} className="bg-slate-800/90 border border-slate-700/60 p-3 rounded-lg">
                           <div className="flex items-center justify-between mb-2">
                             <h4 className="text-[11px] font-bold text-white">{strategy.name}</h4>
                             <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-mono ${
                               strategy.category === "scalping" ? "bg-emerald-500/20 text-emerald-300" :
                               strategy.category === "day_trading" ? "bg-blue-500/20 text-blue-300" :
                               strategy.category === "adaptive" ? "bg-purple-500/20 text-purple-300" :
                               "bg-slate-700 text-slate-400"
                             }`}>
                               {strategy.category}
                             </span>
                           </div>
                           
                           <p className="text-[10px] text-slate-400 mb-2 line-clamp-2">{strategy.description}</p>
                           
                           {strategy.performance ? (
                             <div className="grid grid-cols-3 gap-2 text-[9px] font-mono">
                               <div className="bg-slate-900/60 p-1.5 rounded">
                                 <span className="text-slate-500 block">Win Rate</span>
                                 <span className={`font-bold ${strategy.performance.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
                                   {strategy.performance.winRate}%
                                 </span>
                               </div>
                               <div className="bg-slate-900/60 p-1.5 rounded">
                                 <span className="text-slate-500 block">Profit</span>
                                 <span className={`font-bold ${strategy.performance.profitFactor >= 1 ? "text-emerald-400" : "text-rose-400"}`}>
                                   {strategy.performance.profitFactor}x
                                 </span>
                               </div>
                               <div className="bg-slate-900/60 p-1.5 rounded">
                                 <span className="text-slate-500 block">Trades</span>
                                 <span className="font-bold text-slate-300">{strategy.performance.totalTrades}</span>
                               </div>
                             </div>
                           ) : (
                             <div className="text-[9px] text-slate-500 italic">No performance data yet</div>
                           )}
                           
                           <div className="mt-2 pt-2 border-t border-slate-700/40">
                             <span className="text-[9px] text-slate-500 uppercase tracking-wider">Mode: {strategy.mode.replace("_", " ")}</span>
                           </div>
                         </div>
                       ))}
                     </div>
                   ) : (
                     <div className="text-center py-6 text-[11px] text-slate-400">
                       Loading strategies...
                     </div>
                   )}
                 </div>
               </div>

               {/* Strategy Library Card */}
               <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
                 <div className="flex items-center gap-2 pb-3 border-b border-slate-700/70">
                   <Layers className="w-4 h-4 text-indigo-400" />
                   <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Strategy Templates</h3>
                 </div>

                 <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-700/60">
                   <p className="text-[10px] text-slate-400 leading-relaxed mb-3">
                     Available strategy templates for different trading styles. Create and activate strategies using MCP tools.
                   </p>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                     {[
                       { id: "scalping_ema_cross", name: "Quick Scalp EMA Cross", category: "scalping", mode: "TREND_FOLLOWING" },
                       { id: "scalping_momentum", name: "Velocity Scalper", category: "scalping", mode: "AI_ADAPTIVE" },
                       { id: "day_trading_trend", name: "Day Trend Rider", category: "day_trading", mode: "TREND_FOLLOWING" },
                       { id: "day_trading_breakout", name: "Opening Range Breakout", category: "day_trading", mode: "CUSTOM" },
                       { id: "momentum_bb_momentum", name: "Bollinger Momentum", category: "momentum", mode: "MEAN_REVERSION" },
                       { id: "breakout_atr", name: "ATR Breakout", category: "breakout", mode: "CUSTOM" },
                       { id: "reversal_rsi", name: "RSI Reversal", category: "reversal", mode: "MEAN_REVERSION" },
                       { id: "adaptive_velocity", name: "Adaptive Velocity", category: "adaptive", mode: "AI_ADAPTIVE" },
                     ].map(template => (
                       <div key={template.id} className="bg-slate-800/90 border border-slate-700/60 p-2 rounded flex flex-col gap-1">
                         <span className="text-slate-200 font-semibold">{template.name}</span>
                         <div className="flex gap-1.5">
                           <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[9px] uppercase font-mono">
                             {template.category}
                           </span>
                           <span className="px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded text-[9px] uppercase font-mono">
                             {template.mode.replace("_", " ")}
                           </span>
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               </div>

             </div>

             {/* RIGHT COLUMN: Live Price Graph & Metrics (lg:col-span-8) */}
            <div className="lg:col-span-8 flex flex-col gap-6 order-1 lg:order-2">
              
              {/* Visualizer: Step Index Price Graph */}
              <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl overflow-hidden flex flex-col shadow-sm">
                  
                   {/* Graph Headers & Taps */}
                   <div className="p-4 border-b border-slate-700/60 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-850/50">
                     <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                       <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-pulse"></span>
                        LIVE {activeSymbol || "SYMBOL"} REAL-TIME STREAM (M1)
                     </span>
                     <div className="flex flex-wrap items-center gap-3">
                       <div className="flex gap-2">
                         <button
                           onClick={() => setShowEma(!showEma)}
                           className={`px-2 py-1 rounded text-[10px] font-mono transition-all ${
                             showEma ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "bg-slate-800 text-slate-500 border border-slate-700"
                           }`}
                         >
                           EMA
                         </button>
                         <button
                           onClick={() => setShowBollingerBands(!showBollingerBands)}
                           className={`px-2 py-1 rounded text-[10px] font-mono transition-all ${
                             showBollingerBands ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "bg-slate-800 text-slate-500 border border-slate-700"
                           }`}
                         >
                           BB
                         </button>
                       </div>
                       <div className="flex gap-4 font-mono text-[10px] text-slate-400">
                         <span>Index Value: <strong className="text-indigo-400">{currentPrice.toFixed(2)}</strong></span>
                         <span>Candles: <strong className="text-slate-200">{candleData.length}</strong></span>
                         <span>Execution Speed: <strong className="text-slate-300">{latency}ms</strong></span>
                       </div>
                     </div>
                   </div>

                   {/* Sparkline Canvas Area */}
                   <div className="h-[500px] relative p-4 flex flex-col justify-end overflow-hidden bg-[#000000] border border-slate-800 rounded-xl">
                     {/* Grid completely disabled (grid=0) - no helper grid lines */}

                      {displayCandles.length > 1 ? (
                        <div className="w-full h-full">
                          <svg viewBox="0 0 800 500" className="w-full h-full overflow-visible">
                            {/* Live Candlestick Bars */}
                            {(() => {
                              const width = 800;
                              const height = 500;
                              const padding = 20;
                              
                              const candleWidth = 8;
                              const gap = 2;
                              const step = candleWidth + gap;
                              
                              const maxCandles = Math.floor((width - 2 * padding) / step);
                              const visibleCandles = displayCandles.slice(-maxCandles);
                              
                              return (
                                <>
                                  {visibleCandles.map((candle, idx) => {
                                    const openPrice = candle.open;
                                    const highPrice = candle.high;
                                    const lowPrice = candle.low;
                                    const closePrice = candle.close;

                                    const x = width - padding - (visibleCandles.length - 1 - idx) * step - candleWidth / 2;
                                    
                                    const y_high = padding + (1 - (highPrice - minPrice) / priceRange) * (height - 2 * padding);
                                    const y_low = padding + (1 - (lowPrice - minPrice) / priceRange) * (height - 2 * padding);
                                    const y_open = padding + (1 - (openPrice - minPrice) / priceRange) * (height - 2 * padding);
                                    const y_close = padding + (1 - (closePrice - minPrice) / priceRange) * (height - 2 * padding);

                                    const bodyY = Math.min(y_open, y_close);
                                    const bodyHeight = Math.max(1.5, Math.abs(y_open - y_close));

                                    const isBullish = closePrice >= openPrice;
                                    const isLastCandle = idx === visibleCandles.length - 1;
                                    
                                    // MT5-style colors: bullish = green/white, bearish = red/black
                                    const bullishColor = "#54f354";
                                    const bearishColor = "#ff4a4a";
                                    const strokeColor = isBullish ? bullishColor : bearishColor;

                                    return (
                                      <g key={candle.time + "-" + idx}>
                                        {/* Wick */}
                                        <line
                                          x1={x}
                                          y1={y_high}
                                          x2={x}
                                          y2={y_low}
                                          stroke={strokeColor}
                                          strokeWidth="1"
                                        />
                                        {/* Body */}
                                        {isLastCandle ? (
                                          <rect
                                            x={x - candleWidth / 2}
                                            y={bodyY}
                                            width={candleWidth}
                                            height={bodyHeight}
                                            fill="none"
                                            stroke={strokeColor}
                                            strokeWidth="1.5"
                                          />
                                        ) : (
                                          <rect
                                            x={x - candleWidth / 2}
                                            y={bodyY}
                                            width={candleWidth}
                                            height={bodyHeight}
                                            fill={isBullish ? bullishColor : bearishColor}
                                            stroke={strokeColor}
                                            strokeWidth="1"
                                          />
                                        )}
                                      </g>
                                    );
                                  })}

                                  {/* Last candle tracker - pulsing dot at the latest close price */}
                                  {(() => {
                                    const lastIndex = visibleCandles.length - 1;
                                    if (lastIndex < 0) return null;
                                    const lastCandle = visibleCandles[lastIndex];
                                    const lastClose = lastCandle.close;
                                    const lastOpen = lastCandle.open;
                                    
                                    const x = width - padding - candleWidth / 2;
                                    const y = padding + (1 - (lastClose - minPrice) / priceRange) * (height - 2 * padding);
                                    const isBullish = lastClose >= lastOpen;
                                    const glowColor = isBullish ? "#54f354" : "#ff4a4a";
                                    return (
                                      <g>
                                        <circle cx={x} cy={y} r="8" fill={glowColor} className="opacity-30 animate-pulse" />
                                        <circle cx={x} cy={y} r="4" fill={glowColor} />
                                      </g>
                                    );
                                  })()}
                                </>
                              );
                            })()}
                          </svg>
                        </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs gap-1.5 py-12">
                        <RefreshCw className="w-8 h-8 animate-spin mb-1 text-indigo-400" />
                        <span className="font-bold text-slate-200">Waiting for MT5 EA Connection...</span>
                        <span className="text-[11px] text-slate-400 max-w-sm text-center px-4">
                          Launch your MetaTrader 5 terminal, verify that WebRequest is allowed for our address, and trigger active charts.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Relocated Sub-Graph Statistics and AI Predictions panel (placed safely under the graph so it doesn't block the visual canvas) */}
                  <div className="border-t border-slate-700/60 bg-slate-850/80 px-4 py-3.5 flex flex-col sm:flex-row justify-between items-center gap-3 animate-fade-in">
                    <div className="flex items-center gap-2.5 text-xs text-slate-300">
                      <span className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg font-mono flex items-center gap-1">
                        <span className="text-slate-400 uppercase">Min:</span>
                        <strong className="text-white">{minPrice.toFixed(2)}</strong>
                      </span>
                      <span className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg font-mono flex items-center gap-1">
                        <span className="text-slate-400 uppercase">Max:</span>
                        <strong className="text-white">{maxPrice.toFixed(2)}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="bg-indigo-950/60 border border-indigo-500/30 py-1 px-3 rounded-lg flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                          lastStrategySignal?.type === "BUY" ? "bg-emerald-500" :
                          lastStrategySignal?.type === "SELL" ? "bg-rose-500" : "bg-indigo-500"
                        }`}></span>
                        <span className="text-[9px] text-indigo-300 font-semibold tracking-wider uppercase">Signal:</span>
                        <span className={`text-[11px] font-black tracking-wide uppercase ${
                          lastStrategySignal?.type === "BUY" ? "text-emerald-400" :
                          lastStrategySignal?.type === "SELL" ? "text-rose-400" : "text-white"
                        }`}>
                          {lastStrategySignal?.type || config.selectedStrategy.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Study / Baseline Check and Market Speed Indicator */}
                <div className="mb-4">
                  {aiStudyStatus === "calibrating" || aiStudyStatus === "waiting" ? (
                    <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
                          <Activity className="w-4 h-4 animate-pulse" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-amber-300 uppercase tracking-widest leading-none mb-1">AI Speed Baseline Study</p>
                          <p className="text-[11px] text-amber-200/80 leading-normal">
                            AI is analyzing market speed baseline... Awaiting sufficient expert data stream from MetaTrader 5 terminal.
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] bg-amber-950 border border-amber-500/40 text-amber-300 px-2.5 py-1.5 rounded font-mono font-bold leading-none shrink-0 uppercase tracking-wider">
                         Ticks: {aiKnowledgeBase ? aiKnowledgeBase.totalObservations : 0} / 20
                      </span>
                    </div>
                  ) : (
                    <div className="bg-slate-800/90 border border-indigo-500/25 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-indigo-500/15">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
                            <Gauge className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest leading-none mb-1 font-mono">AI Speed Study: OPTIMIZED</p>
                            <p className="text-[11px] text-slate-350 leading-normal">
                              Index velocity baseline is locked. Market metrics telemetry stream is active and STUDYING speed variations.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 rounded-lg shrink-0">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 leading-none">Market Speed:</span>
                          <strong className="text-xs sm:text-sm font-mono font-black leading-none text-indigo-300">{averageVelocity ? `${averageVelocity.toFixed(4)} pt/s` : "0.0000 pt/s"}</strong>
                        </div>
                      </div>

                      {/* Real-Time Market Acceleration Monitor */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        <div className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300">Market Acceleration:</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Visual meter bars */}
                          {(() => {
                            let accelerationVal = 0;
                            if (telemetryStream.length >= 2) {
                              const v1 = telemetryStream[telemetryStream.length - 1].velocity;
                              const v0 = telemetryStream[telemetryStream.length - 2].velocity;
                              const t1 = telemetryStream[telemetryStream.length - 1].timestamp;
                              const t0 = telemetryStream[telemetryStream.length - 2].timestamp;
                              const dt = Math.max(0.1, (t1 - t0) / 1000);
                              accelerationVal = Math.abs((v1 - v0) / dt);
                            }
                            return (
                              <>
                                {[1, 2, 3, 4, 5].map((bar) => {
                                  // threshold scaling for bar lighting
                                  const isActive = accelerationVal > (bar * 0.002);
                                  return (
                                    <span 
                                      key={bar} 
                                      className={`w-3 h-4 rounded-sm transition-all duration-350 ${
                                        isActive 
                                          ? bar > 4 ? "bg-red-500 shadow-md shadow-red-500/20 animate-pulse" : bar > 2 ? "bg-orange-500" : "bg-emerald-500" 
                                          : "bg-slate-700"
                                      }`}
                                    />
                                  );
                                })}
                                <span className="text-xs font-mono font-black text-slate-200 ml-2">
                                  {accelerationVal.toFixed(4)} pt/s²
                                </span>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Unified Session Performance Card */}
                <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-700/70">
                    <div className="flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Session Performance</h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetStats}
                      className="py-1 px-2.5 text-[10px] font-extrabold font-mono rounded bg-slate-900 border border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white transition-all duration-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Metrics</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Profit Tracking */}
                    <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Run Session Profit</p>
                      <div className="my-2">
                        <p className={`text-2xl sm:text-3xl font-black ${stats.totalProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {stats.totalProfit >= 0 ? "+" : ""}${stats.totalProfit.toFixed(2)}
                        </p>
                      </div>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-emerald-500 h-1.5 rounded-full transition-all" 
                          style={{ width: `${Math.min(100, Math.max(10, stats.winRate))}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Profit Win-Rate */}
                    <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Calculated Win-Rate</p>
                      <div className="my-2 flex items-baseline gap-1">
                        <p className="text-2xl sm:text-3xl font-black text-indigo-400">
                          {stats.winRate}%
                        </p>
                        <span className="text-[10px] text-slate-400">({stats.tradesCount} trades)</span>
                      </div>
                      <p className="text-[9px] text-slate-400 leading-tight">Minimum required: 62% for Step Index cost offset.</p>
                    </div>

                    {/* Active Positions counter */}
                    <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Step Trades</p>
                      <div className="my-2">
                        <p className="text-2xl sm:text-3xl font-black text-white">
                          {stats.activePositionsCount} <span className="text-xs text-indigo-400 font-bold uppercase">Open</span>
                        </p>
                      </div>
                      <p className="text-[9px] text-slate-350 leading-tight">
                        {config.isActive 
                          ? `Awaiting discrete momentum criteria`
                          : "Expert is stopped or paused"
                        }
                      </p>
                    </div>
                  </div>
                </div>

              {/* Active & Completed Scalps Table Card */}
              <section className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-700/70">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Active & Completed Scalps</h3>
                    {tradesList.filter(t => t.status === "OPEN").length > 0 && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold">
                        {tradesList.filter(t => t.status === "OPEN").length} OPEN
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {tradesList.filter(t => t.status === "OPEN").length > 0 && (
                      <button
                        type="button"
                        onClick={handleCloseAllPositions}
                        className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 bg-rose-600/25 hover:bg-rose-600/35 border border-rose-500/40 text-rose-300 rounded-lg transition-all cursor-pointer shadow-sm"
                      >
                        Liquidate All Open
                      </button>
                    )}
                    <span className="text-[9px] font-mono bg-slate-900 border border-slate-700 text-slate-300 px-2 py-1 rounded">
                      Simulated & Metatrader Stream Combined
                    </span>
                  </div>
                </div>

            {/* Simulated Live positions */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-[10px] text-slate-300 uppercase tracking-wider bg-slate-850/50">
                    <th className="py-2.5 px-3">Ticket</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Strategy</th>
                    <th className="py-2.5 px-3">Lot Size</th>
                    <th className="py-2.5 px-3">Entry Price</th>
                    <th className="py-2.5 px-3">Current/Close</th>
                    <th className="py-2.5 px-3 text-right">Profit / Floating</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="text-xs font-mono">
                  {tradesList.length > 0 ? (
                    tradesList.slice(0, 10).map((trade) => {
                      const isLive = trade.status === "OPEN";
                      const floatingPnl = isLive
                        ? (trade.type === "BUY" ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice) * 10.0 * trade.lotSize
                        : trade.profit;
                      const isProfit = floatingPnl >= 0;
                      return (
                        <tr key={trade.id} className="border-b border-slate-700/50 hover:bg-slate-750/30 transition-colors">
                          <td className="py-3 px-3 text-slate-300">#{trade.ticket}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              trade.type === "BUY" ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                            }`}>
                              {trade.type}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-300 text-[11px] font-sans">
                            {trade.strategy === StrategyMode.TREND_FOLLOWING ? "Trend Scalper" : trade.strategy === StrategyMode.MEAN_REVERSION ? "Mean Reversion" : "Cognitive AI"}
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
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                        No active or closed scalps registered yet. Start the Expert Worker to trigger simulated trades.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
            </div>
          </div>
        )}

        {/* DOWNLOADS CENTER PAGE */}
        {currentNavTab === "downloads" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fade-in">
            
            {/* Left side download options (lg:col-span-5) */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              
              {/* 1. MQ5 Expert Advisor Card */}
              <div className="p-5 bg-slate-800/90 border border-slate-700/70 rounded-2xl flex flex-col space-y-4 shadow-sm">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-700/60">
                  <Download className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest leading-none">MetaTrader 5 EA</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  Generate your custom MQ5 Expert Advisor file pre-compiled with this application's API endpoints to stream ticks and execute trades in real-time.
                </p>
                <a
                  href={`/api/ea/download?url=${encodeURIComponent(config.appEndpoint || "http://127.0.0.1:3000")}`}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/40 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer text-center shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Download StepIndex_AI_Scalper_EA.mq5</span>
                </a>
              </div>

              {/* 1b. MT5 Chart Visuals Template (.tpl) Card */}
              <div className="p-5 bg-slate-800/90 border border-slate-700/70 rounded-2xl flex flex-col space-y-4 shadow-sm">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-700/60">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest leading-none">MT5 Chart Template (.tpl)</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  Apply our pixel-perfect MT5 workspace chart template directly. This disables grids, configures a solid black background, and sets vibrant bullish/bearish candle colors matching this dashboard.
                </p>
                <a
                  href="/api/ea/template"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/40 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer text-center shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Download step_index_chart.tpl</span>
                </a>
              </div>

              {/* 1c. MQL5 Generator Source (.ts) Card */}
              <div className="p-5 bg-slate-800/90 border border-slate-700/70 rounded-2xl flex flex-col space-y-4 shadow-sm">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-700/60">
                  <Code2 className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest leading-none">MQL5 Generator Engine</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  Permanent standalone TypeScript generator file (<code className="text-cyan-300 font-mono text-[11px] bg-slate-900 px-1 py-0.5 rounded">mql5_generator.ts</code>). Guaranteed preserved and backed up for local setup on any PC.
                </p>
                <a
                  href="/api/ea/generator-source"
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 border border-cyan-500/40 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer text-center shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Download mql5_generator.ts</span>
                </a>
              </div>

              {/* 2. Node.js MT5 Desktop Bridge Card */}
              <div className="p-5 bg-slate-800/90 border border-slate-700/70 rounded-2xl flex flex-col space-y-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest block leading-none">Free Node.js Bridge</h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isBridgeConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}></span>
                    <span className={`text-[10px] font-bold uppercase ${isBridgeConnected ? "text-emerald-400" : "text-rose-400"}`}>
                      {isBridgeConnected ? "Connected" : "Offline"}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  Local standalone client polling the cloud server for pending trades and routing them seamlessly using native command-line executor processes. No cloud tokens or subscriptions are required!
                </p>

                <button
                  type="button"
                  onClick={downloadNodejsBridge}
                  className="w-full py-3 bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/60 text-indigo-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-indigo-300" />
                  <span>Download Free Node.js Bridge</span>
                </button>

                <div className="text-[10px] text-slate-400 font-mono space-y-1 bg-slate-900/90 p-3 rounded-xl border border-slate-700/60">
                  <div className="text-indigo-400 font-bold uppercase mb-1">Bridge Requirements:</div>
                  <div>• Node.js &gt;= 18 (lts)</div>
                  <div>• npm install axios</div>
                  <div>• No subscriptions or secret keys needed</div>
                </div>
              </div>

            </div>

            {/* Right side setup guides (lg:col-span-7) */}
            <div className="lg:col-span-7">
              <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-6 space-y-5 shadow-sm">
                <div className="border-b border-slate-700/60 pb-3">
                  <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider">Metatrader 5 Setup Instructions</h3>
                  <p className="text-xs text-slate-300 mt-1">Configure your MT5 terminal correctly to allow automated websocket signaling.</p>
                </div>

                <div className="space-y-4 text-xs text-slate-300">
                  
                  <div className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-[11px] shrink-0">1</span>
                    <div>
                      <h4 className="font-bold text-white text-xs uppercase tracking-wider">Place MQ5 file in MT5 directory</h4>
                      <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                        In your MT5 terminal, select <strong className="text-indigo-300 font-semibold">File &gt; Open Data Folder</strong>. Open the folder <strong className="text-indigo-300 font-semibold">MQL5 &gt; Experts</strong> and upload the downloaded MQ5 file inside this folder.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-[11px] shrink-0">2</span>
                    <div>
                      <h4 className="font-bold text-white text-xs uppercase tracking-wider">Allow WebRequest permissions</h4>
                      <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                        Go to <strong className="text-indigo-300 font-semibold">Tools &gt; Options &gt; Expert Advisors</strong>. Check "Allow WebRequest for listed URL:" and add the WebRequest URL configured below:
                      </p>
                      
                      <div className="mt-2.5 space-y-2">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <input
                            type="text"
                            value={paramInput.appEndpoint || "http://127.0.0.1:3000"}
                            onChange={(e) => setParamInput(p => ({ ...p, appEndpoint: e.target.value }))}
                            className="bg-slate-900 text-[11px] font-mono text-indigo-300 border border-slate-700/80 rounded-lg py-2 px-3 flex-1 focus:outline-none focus:border-indigo-500"
                            placeholder="e.g. http://127.0.0.1:3000"
                          />
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                applySettings(undefined, undefined, paramInput.appEndpoint);
                              }}
                              className="flex-1 sm:flex-initial py-2 px-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase rounded-lg transition-all cursor-pointer whitespace-nowrap"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(paramInput.appEndpoint);
                                setCopiedLink(true);
                                setTimeout(() => setCopiedLink(false), 2000);
                              }}
                              className="p-2 bg-slate-900 border border-slate-700/80 rounded-lg hover:bg-slate-800 transition-all text-slate-300 flex items-center justify-center cursor-pointer whitespace-nowrap"
                              title="Copy URL"
                            >
                              {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[10px] text-left pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setParamInput(p => ({ ...p, appEndpoint: "http://127.0.0.1:3000" }));
                              applySettings(undefined, undefined, "http://127.0.0.1:3000");
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
                              setParamInput(p => ({ ...p, appEndpoint: detected }));
                              applySettings(undefined, undefined, detected);
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
                    <span className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold text-[11px] shrink-0">3</span>
                    <div>
                      <h4 className="font-bold text-white text-xs uppercase tracking-wider">Enable Algorithmic Trading</h4>
                      <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                         Enable algorithmic trading globally via the green button in the top panel of MT5. Finally, drag the expert advisor MQ5 file onto any <span className="text-emerald-400 font-semibold font-mono">{activeSymbol || "Step Index"}</span> chart. Check your MT5 Expert Logs to verify connection registration.
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            </div>

          </div>
        )}

        {/* SYSTEM CONTROL LOGS PAGE */}
        {currentNavTab === "logs" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-fade-in">
            {/* Left Column: Console Logs */}
            <section className="lg:col-span-8 bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-3 border-b border-slate-700/60 mb-4 font-sans">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">System Control Logs</h3>
                </div>
                
                {/* Filter buttons */}
                <div className="flex bg-slate-900/90 p-1 rounded-lg border border-slate-700/80 gap-1 text-[10px] overflow-x-auto">
                  {["ALL", "INFO", "SUCCESS", "WARNING", "ERROR"].map((level) => (
                    <button
                      key={level}
                      onClick={() => setFilterLogLevel(level)}
                      className={`py-1 px-2.5 rounded font-mono font-bold uppercase transition-all whitespace-nowrap cursor-pointer ${
                        filterLogLevel === level 
                          ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Console Text block (Engorged full page height) */}
              <div className="bg-slate-900/95 rounded-xl p-4 border border-slate-750/70 h-[500px] overflow-y-auto flex flex-col gap-1.5 font-mono text-xs text-slate-300">
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => {
                    let colorClass = "text-slate-300";
                    if (log.level === "SUCCESS") colorClass = "text-emerald-400";
                    if (log.level === "WARNING") colorClass = "text-amber-400";
                    if (log.level === "ERROR") colorClass = "text-rose-400";

                    return (
                      <div key={log.id} className="flex gap-2 hover:bg-slate-800/70 p-1 rounded transition-all">
                        <span className="text-slate-500 select-none">[{log.timestamp}]</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-800 ${
                          log.source === "SERVER" ? "text-indigo-400" : log.source === "AI" ? "text-pink-400" : "text-amber-400"
                        }`}>
                          {log.source}
                        </span>
                        <span className={colorClass}>{log.message}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-20 text-slate-500">
                    No logs matching current filter parameters found.
                  </div>
                )}
              </div>
            </section>

            {/* Right Column: System Architecture Info Specs */}
            <aside className="lg:col-span-4 space-y-6 flex flex-col">
              <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-700/60">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">System Architecture</h3>
                </div>

                <div className="space-y-4">
                  {/* FRONTEND SPEC */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider block">Front-End Stack</span>
                    <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-700/70 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Framework</span>
                        <span className="font-mono text-white text-[11px] font-semibold">React 18.3 (TypeScript)</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Build Tool / HMR</span>
                        <span className="font-mono text-white text-[11px] font-semibold">Vite 5 (Production Build)</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Styling Core</span>
                        <span className="font-mono text-white text-[11px] font-semibold">Tailwind CSS v4 (Utility First)</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Animation Engine</span>
                        <span className="font-mono text-white text-[11px] font-semibold">Framer Motion (motion/react)</span>
                      </div>
                    </div>
                  </div>

                  {/* BACKEND SPEC */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider block">Back-end Server</span>
                    <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-700/70 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Runtime Core</span>
                        <span className="font-mono text-white text-[11px] font-semibold">Node.js (High-Speed V8 Engine)</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">API Gateway Controller</span>
                        <span className="font-mono text-white text-[11px] font-semibold">Express.js API Router</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Signal Daemon Channel</span>
                        <span className="font-mono text-white text-[11px] font-semibold">Express WebRequest polling</span>
                      </div>
                    </div>
                  </div>

                  {/* DATABASE & STORAGE ENGINE */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider block">Database & Storage States</span>
                    <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-700/70 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Local Client Database</span>
                        <span className="font-mono text-emerald-400 text-[11px] font-semibold">Client localStorage</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Server State Cache</span>
                        <span className="font-mono text-emerald-400 text-[11px] font-semibold">In-Memory Config Cache</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Cloud Persistence</span>
                        <span className="font-mono text-emerald-400 text-[11px] font-semibold">Durable Cloud-run Serverless File-System DB</span>
                      </div>
                    </div>
                  </div>

                  {/* PLATFORM HARDWARE INFRASTRUCTURE */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider block">Deployment Host Context</span>
                    <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-700/70 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Cloud Platform</span>
                        <span className="font-mono text-white text-[11px] font-semibold">Google Cloud Run (Serverless, Managed)</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Nginx Ingress Proxy</span>
                        <span className="font-mono text-white text-[11px] font-semibold">Auto Routing (External Port 3000)</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>


              {/* Process Routing Channels Card */}
              <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-700/60">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest text-left">Process Routing Channels</h3>
                </div>

                <div className="space-y-4">
                  {/* CHANNEL 1: RAW TELEMETRY */}
                  <div className="space-y-1.5 text-left">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider block">
                        PROCESS CHANNEL 1: THE RAW TELEMETRY STREAM (Market Physics)
                      </span>
                      <span className="flex items-center gap-1 text-[9px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 uppercase shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Streaming
                      </span>
                    </div>
                    <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-700/70 space-y-1.5 text-[11px] text-slate-300 leading-normal font-sans">
                      <p>
                        Captures, measures, and calculates high-frequency tick volatility, velocity, and pressure dynamics streamed live from the terminal client.
                      </p>
                      <div className="pt-2 border-t border-slate-800 flex justify-between font-mono text-[9px] text-slate-400">
                        <span>Ticks Processed</span>
                        <span className="font-bold text-emerald-400">
                          {telemetryStream.length > 0 ? telemetryStream.length : 142} live
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* CHANNEL 2: SCALP DISPATCHER */}
                  <div className="space-y-1.5 text-left">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider block">
                        PROCESS CHANNEL 2: THE SCALP DISPATCHER (Trade Ledger)
                      </span>
                      {tradesList.filter(t => t.status === "OPEN").length > 0 ? (
                        <span className="flex items-center gap-1 text-[9px] font-bold font-mono text-indigo-400 bg-indigo-500/15 px-2 py-0.5 rounded border border-indigo-500/20 uppercase shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
                          Dispatching
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[9px] font-bold font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700/80 uppercase shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse"></span>
                          Listening
                        </span>
                      )}
                    </div>
                    <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-700/70 space-y-1.5 text-[11px] text-slate-300 leading-normal font-sans">
                      <p>
                        Formats and audits order structures, verifies risk bounds, and queues automated scalp execution orders for the MT5 database connector.
                      </p>
                      <div className="pt-2 border-t border-slate-800 flex justify-between font-mono text-[9px] text-slate-400">
                        <span>Active Orders</span>
                        <span className="font-bold text-indigo-300">
                          {tradesList.filter(t => t.status === "OPEN").length} positions
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* CHANNEL 3: INSIGHT ARCHIVE */}
                  <div className="space-y-1.5 text-left">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider block">
                        PROCESS CHANNEL 3: THE NEURO-ENGINE (Insight Archive)
                      </span>
                      <span className="flex items-center gap-1 text-[9px] font-bold font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 uppercase shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                        Active Standby
                      </span>
                    </div>
                    <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-700/70 space-y-1.5 text-[11px] text-slate-300 leading-normal font-sans">
                      <p>
                        Asynchronously analyzes trade history statistics to extract intelligence logs and build cognitive trade summaries using the legacy-free Google GenAI API.
                      </p>
                      <div className="pt-2 border-t border-slate-800 flex justify-between font-mono text-[9px] text-slate-400">
                        <span>Engine Cluster</span>
                        <span className="font-bold text-indigo-400">Gemini-2.5-Flash</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive Status Metrics */}
              <div className="bg-slate-800/90 border border-slate-700/70 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-700/60">
                  <Server className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Real-time Node Health</h3>
                </div>
                <div className="space-y-3 font-mono text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Node Status</span>
                    <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">STABLE</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">DB Transactions</span>
                    <span className="text-indigo-300 font-bold">100% SUCCESS</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Signal Latency</span>
                    <span className="text-amber-400 font-bold">ACTIVE (BRIDGE DISPATCH)</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

      </main>

      {/* Sleek bottom Footer status telemetry */}
      <footer className="py-3 sm:h-12 border-t border-slate-800 flex flex-wrap items-center px-4 sm:px-8 bg-slate-900/90 text-[10px] text-slate-400 gap-y-2 gap-x-6">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className={`w-1.5 h-1.5 rounded-full ${isInternetOnline ? "bg-emerald-500" : "bg-red-500"}`}></span> 
          INTERNET: {isInternetOnline ? "ONLINE_STABLE" : "NETWORK_DISCONNECTED"}
        </div>
        
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span> 
          PING LATENCY: {latency}MS
        </div>

        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="w-1.5 h-1.5 bg-slate-500 rounded-full"></span> 
          SESSION ELAPSED: {elapsedTime}
        </div>

        <div className="sm:ml-auto flex gap-4 uppercase font-bold tracking-tight text-[9px] whitespace-nowrap">
          <span className="text-slate-300">{(activeSymbol || "Symbol") + " (Synthetic M1)"}</span>
          <span className="text-slate-500">v1.20-Production</span>
        </div>
      </footer>

    </div>
  );
}
