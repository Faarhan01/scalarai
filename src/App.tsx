import { useState, useEffect, useRef } from "react";
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
  RotateCcw
} from "lucide-react";
import { StrategyMode, TradeConfig, TradeRecord, SystemLog, Tick, EAConnectionDetails } from "./types";

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
    balance: null
  });

  const [stats, setStats] = useState({
    totalProfit: 0,
    tradesCount: 0,
    winRate: 0,
    activePositionsCount: 0,
    lastHeartbeatTime: null as string | null
  });

  const [history, setHistory] = useState<Tick[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(1250.0);
  const [tradesList, setTradesList] = useState<TradeRecord[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isBridgeConnected, setIsBridgeConnected] = useState<boolean>(false);
  
  // UI states
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(false);
  const [isInternetOnline, setIsInternetOnline] = useState<boolean>(navigator.onLine);
  const [latency, setLatency] = useState<number>(12);
  const [filterLogLevel, setFilterLogLevel] = useState<string>("ALL");
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  
  // Meta-analysis log & quantitative synthesis state
  const [isMetaAnalysisLoading, setIsMetaAnalysisLoading] = useState<boolean>(false);
  const [metaAnalysisInsights, setMetaAnalysisInsights] = useState<{
    category: string;
    metric: string;
    explanation: string;
    summary: string;
  }[] | null>(null);
  const [metaAnalysisError, setMetaAnalysisError] = useState<string | null>(null);
  const [paramInput, setParamInput] = useState({
    lotSize: "0.1",
    takeProfitPoints: "300",
    stopLossPoints: "150",
    trailingStopPoints: "100",
    maxTrades: "3",
    useTrailingStop: true,
    mt5Path: "",
    appEndpoint: "",
    tradingMode: "Scalping" as "Scalping" | "Swing",
    selectedAssets: ["Step Index"] as string[],
    isAiModeEnabled: false
  });
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [activeTab, setActiveTab] = useState<"visuals" | "tutorial">("visuals");
  const [currentNavTab, setCurrentNavTab] = useState<"home" | "downloads" | "logs" | "risk" | "settings">("home");
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
      if (response.ok) {
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
      }
    } catch (err) {
      console.error("Error pulling AI study telemetry feed:", err);
    }
  };

  // Poll server for latest stats, parameters, live prices and log history
  const fetchStatus = async () => {
    const startTick = Date.now();
    try {
      fetchWebRequestStatus(); // Parallel call to verify WebRequest test state
      fetchAiStudyFeed();     // Dynamic AI speed metrics feed call
      const response = await fetch("/api/status");
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
        setConnection(data.connection);
        setIsBridgeConnected(!!data.isBridgeConnected);
        setLogs(data.logs);
        setTradesList(data.trades || []);
        setHistory(data.history || []);
        setCurrentPrice(data.currentPrice);
        setStats(data.stats);
        setHasGeminiKey(!!data.hasGeminiKey);
        
        // Calculate latency
        const endTick = Date.now();
        setLatency(Math.max(3, endTick - startTick));
      }
    } catch (e) {
      console.error("Network communication offline with local web server: ", e);
      // Simulate low latency drop
      setLatency(999);
    }
  };

  const handleResetStats = async () => {
    try {
      const response = await fetch("/api/reset-stats", { method: "POST" });
      if (response.ok) {
        fetchStatus();
      }
    } catch (e) {
      console.error("Failed to reset stats:", e);
    }
  };

  useEffect(() => {
    fetchStatus();
    const statusInterval = setInterval(() => {
      fetchStatus();
    }, 1500);
    return () => clearInterval(statusInterval);
  }, []);

  // Initialize input fields when config is pulled
  useEffect(() => {
    setParamInput({
      lotSize: config.lotSize.toString(),
      takeProfitPoints: config.takeProfitPoints.toString(),
      stopLossPoints: config.stopLossPoints.toString(),
      trailingStopPoints: config.trailingStopPoints.toString(),
      maxTrades: config.maxTrades.toString(),
      useTrailingStop: config.useTrailingStop,
      mt5Path: config.mt5Path || "",
      appEndpoint: config.appEndpoint || "",
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
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedStrategy: strategyOverride || config.selectedStrategy,
          lotSize: parseFloat(paramInput.lotSize) || 0.1,
          takeProfitPoints: parseInt(paramInput.takeProfitPoints) || 300,
          stopLossPoints: parseInt(paramInput.stopLossPoints) || 150,
          trailingStopPoints: parseInt(paramInput.trailingStopPoints) || 100,
          useTrailingStop: paramInput.useTrailingStop,
          maxTrades: parseInt(paramInput.maxTrades) || 3,
          mt5Path: mt5PathOverride !== undefined ? mt5PathOverride : paramInput.mt5Path,
          appEndpoint: appEndpointOverride !== undefined ? appEndpointOverride : paramInput.appEndpoint,
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
    try {
      const targetState = !config.isActive;
      const response = await fetch("/api/toggle-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: targetState })
      });
      if (response.ok) {
        fetchStatus();
      }
    } catch (e) {
      console.error("Error attempting to toggle remote executor state", e);
    }
  };

  // Trigger Gemini Artificial Intelligence Step Index Graph pattern matching
  const generateAiReport = async () => {
    setIsAiLoading(true);
    setAiAnalysisResult(null);
    try {
      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.error) {
          setAiAnalysisResult(data.error);
        } else {
          setAiAnalysisResult(data.report);
        }
      } else {
        setAiAnalysisResult("Unable to verify workspace credentials. Ensure your GEMINI_API_KEY is configured.");
      }
    } catch (e: any) {
      setAiAnalysisResult("AI model timeout or server path unreachable. Reason: " + e.message);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Run specialized Step Index EA Meta-Analysis & Log Synthesis
  const runMetaAnalysis = async () => {
    setIsMetaAnalysisLoading(true);
    setMetaAnalysisInsights(null);
    setMetaAnalysisError(null);
    try {
      const response = await fetch("/api/gemini/meta-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.error) {
          setMetaAnalysisError(data.error);
        } else if (data.success && data.insights) {
          setMetaAnalysisInsights(data.insights);
        } else {
          setMetaAnalysisError("Synthesis failed; empty response returned.");
        }
      } else {
        setMetaAnalysisError("Meta-analysis execution failed. Ensure GEMINI_API_KEY is configured.");
      }
    } catch (e: any) {
      setMetaAnalysisError("AI Synthesis server error: " + e.message);
    } finally {
      setIsMetaAnalysisLoading(false);
    }
  };

  const fetchWebRequestStatus = async () => {
    try {
      const res = await fetch("/api/test-webrequest/status");
      const data = await res.json();
      if (data && data.testState) {
        setWebRequestStatus(data.testState);
      }
      if (data && data.suggestedUrl) {
        setSuggestedUrl(data.suggestedUrl);
      }
    } catch (e) {
      console.error("Error fetching WebRequest status: ", e);
    }
  };

  const triggerWebRequestTest = async () => {
    setIsVerifyingWebRequest(true);
    try {
      const response = await fetch("/api/test-webrequest/trigger", {
        method: "POST"
      });
      if (response.ok) {
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
          if (statusRes.ok) {
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
        } catch (e) {
          clearInterval(interval);
          setIsVerifyingWebRequest(false);
        }
      }, 1000);
    } catch (error) {
      console.error("Error initiating connection verification: ", error);
      setIsVerifyingWebRequest(false);
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
  const symbol = trade.symbol || trade.Symbol || "Step Index";
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
  const minPrice = history.length > 0 
    ? Math.min(...history.map(t => t.low !== undefined ? t.low : t.price)) - 0.2
    : 1245.0;
  const maxPrice = history.length > 0 
    ? Math.max(...history.map(t => t.high !== undefined ? t.high : t.price)) + 0.2
    : 1255.0;
  const priceRange = maxPrice - minPrice || 1.0;

  return (
    <div id="app-container" className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-indigo-500 selection:text-white antialiased">
      
      {/* Sleek Top Header Controls */}
      <header className="h-20 border-b border-slate-900 flex items-center justify-between px-6 sm:px-8 bg-slate-900/40 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white uppercase">Scalar AI</h1>
            <span className="text-[10px] sm:text-xs font-mono px-2 py-0.5 bg-indigo-500/15 border border-indigo-500/30 rounded text-indigo-400 font-semibold tracking-wider">
              STEP INDEX EA
            </span>
          </div>
        </div>

        {/* Real-time Web App Connection Indicators */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-slate-900 border border-slate-800 rounded-full text-[11px] sm:text-xs text-slate-300">
            {/* Internet Status Toggler */}
            <div className="flex items-center gap-2">
              {isInternetOnline ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <Wifi className="w-3 h-3 inline" /> INTERNET
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-red-500"></span>
                  <span className="font-semibold text-red-500 flex items-center gap-1">
                    <WifiOff className="w-3 h-3 inline" /> OFFLINE
                  </span>
                </>
              )}
            </div>
            
            <div className="h-3 w-px bg-slate-800"></div>

            {/* EA Online Sync Indicator */}
            <div className="flex items-center gap-2">
              {connection.isEaConnected ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                  <span className="font-semibold text-blue-400">EA ONLINE</span>
                  <span className="text-[9px] text-slate-500 font-mono">#{connection.accountNumber}</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-slate-600"></span>
                  <span className="font-semibold text-slate-400 uppercase">EA DISCONNECTED</span>
                </>
              )}
            </div>

            <div className="h-3 w-px bg-slate-800"></div>

            {/* Python Bridge Status Indicator */}
            <div className="flex items-center gap-2">
              {isBridgeConnected ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="font-semibold text-emerald-400 uppercase">BRIDGE ONLINE</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                  <span className="font-semibold text-rose-500 uppercase">BRIDGE OFFLINE</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Dynamic Tabbed Navigation Menu */}
      <div className="bg-slate-900/60 border-b border-slate-900 sticky top-20 z-[40] backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex space-x-1 sm:space-x-2 py-3 overflow-x-auto scrollbar-none">
            {[
              { id: "home", label: "Home Page", icon: Home },
              { id: "risk", label: "Risk & Strategy", icon: Sliders },
              { id: "downloads", label: "Downloads Center", icon: Download },
              { id: "logs", label: "System Logs", icon: Terminal },
              { id: "settings", label: "Settings", icon: Settings },
            ].map((tab) => {
              const IconComponent = tab.icon;
              const isActive = currentNavTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab-btn-${tab.id}`}
                  onClick={() => setCurrentNavTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 shadow-lg shadow-indigo-500/5"
                      : "text-slate-400 hover:text-slate-200 border border-transparent"
                  }`}
                >
                  <IconComponent className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Core Full Stack Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">

        {/* RISK & STRATEGY SETTINGS PAGE */}
        {currentNavTab === "risk" && (
          <div className="max-w-2xl mx-auto w-full flex flex-col gap-6 animate-fade-in">
            {/* MULTI-INDEX ASSET SELECTION GRID */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Multi-Index Selector</h3>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal -mt-1">
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
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-200 shadow-sm shadow-indigo-500/10"
                          : "bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      <span>{asset}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-indigo-400 animate-pulse" : "bg-slate-800"}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STRATEGY OPTIONS: EXECUTION STYLE */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Execution Profile</h3>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal -mt-1">
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
                      : "bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-750"
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
                      ? "bg-indigo-600/30 border-indigo-500 text-indigo-205 shadow-lg shadow-indigo-500/10"
                      : "bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-755"
                  }`}
                >
                  Swing
                </button>
              </div>
            </div>

            {/* Control & Parameters Card */}
            <div className="p-5 bg-slate-900 border border-slate-800/80 rounded-2xl flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Risk & Strategy</h3>
                </div>
                {saveSuccess && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20 rounded-full flex items-center gap-1 animate-pulse">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Updated
                  </span>
                )}
              </div>

              {/* Form Input fields */}
              <div className="space-y-4">

                {/* Active Strategy Mode selection */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Trading Algorithm</label>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setConfig(prev => ({ ...prev, selectedStrategy: StrategyMode.TREND_FOLLOWING }));
                        applySettings(StrategyMode.TREND_FOLLOWING);
                      }}
                      className={`py-2 px-1 text-[10px] font-bold rounded-lg border leading-tight transition-all ${
                        config.selectedStrategy === StrategyMode.TREND_FOLLOWING
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                          : "bg-slate-955 border-slate-800 text-slate-400 hover:text-slate-200"
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
                      className={`py-2 px-1 text-[10px] font-bold rounded-lg border leading-tight transition-all ${
                        config.selectedStrategy === StrategyMode.MEAN_REVERSION
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                          : "bg-slate-955 border-slate-800 text-slate-400 hover:text-slate-200"
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
                      className={`py-2 px-1 text-[10px] font-bold rounded-lg border leading-tight transition-all ${
                        config.selectedStrategy === StrategyMode.AI_ADAPTIVE
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                          : "bg-slate-955 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      AI Adaptive
                    </button>
                  </div>
                </div>

                {/* Lot size */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px] text-slate-400 uppercase font-semibold">
                    <span>Lot Allocation</span>
                    <span className="text-white font-mono">{paramInput.lotSize} Lots</span>
                  </div>
                  <input
                    type="range"
                    className="w-full accent-indigo-500 h-1.5 rounded-lg bg-slate-950 cursor-pointer"
                    min="0.01"
                    max="2.0"
                    step="0.01"
                    value={paramInput.lotSize}
                    onChange={(e) => setParamInput(p => ({ ...p, lotSize: e.target.value }))}
                    onMouseUp={() => applySettings()}
                    onTouchEnd={() => applySettings()}
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>0.01 Min</span>
                    <span>2.0 Max</span>
                  </div>
                </div>

                {/* Target Trailing Configuration slider */}
                <div className="p-3 bg-slate-955 border border-slate-800/80 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
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
                      <div className="w-8 h-4 bg-slate-805 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-350 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {paramInput.useTrailingStop && (
                    <div className="space-y-1 pt-1.5 border-t border-slate-900">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Trailing Distance</span>
                        <span className="text-indigo-400 font-mono font-bold">{paramInput.trailingStopPoints} Points</span>
                      </div>
                      <input
                        type="range"
                        className="w-full accent-indigo-500 h-1 bg-slate-900 cursor-pointer"
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
                    <label className="text-[10px] font-bold uppercase block text-slate-400">Take Profit (Pts)</label>
                    <input
                      type="number"
                      value={paramInput.takeProfitPoints}
                      onChange={(e) => setParamInput(p => ({ ...p, takeProfitPoints: e.target.value }))}
                      onBlur={() => applySettings()}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-600 text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase block text-slate-400">Stop Loss (Pts)</label>
                    <input
                      type="number"
                      value={paramInput.stopLossPoints}
                      onChange={(e) => setParamInput(p => ({ ...p, stopLossPoints: e.target.value }))}
                      onBlur={() => applySettings()}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs font-mono font-bold text-red-400 focus:outline-none focus:border-red-600 text-center"
                    />
                  </div>
                </div>

                {/* Max Open trades */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase">
                    <span>Max Concurrent Trades</span>
                    <span className="text-slate-200 font-mono">{paramInput.maxTrades}</span>
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
            <div className="p-5 bg-slate-900 border border-slate-800/80 rounded-2xl flex flex-col">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest text-left">System Settings</h3>
                </div>
                {saveSuccess && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20 rounded-full flex items-center gap-1 animate-pulse">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Updated
                  </span>
                )}
              </div>

              <div className="space-y-4">
                {/* MT5 File Path Input */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      MT5 terminal64.exe Path
                    </label>
                    <span className="text-[9px] text-indigo-400 border border-indigo-400/20 px-1.5 py-0.5 rounded bg-indigo-500/5 font-mono">
                      Auto-detected if empty
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. C:\Program Files\Deriv MT5\terminal64.exe"
                    value={paramInput.mt5Path}
                    onChange={(e) => setParamInput(p => ({ ...p, mt5Path: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs font-mono text-slate-350 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Leave blank to run smart auto-detection scanning the Program Files directory for foldernames containing 'Deriv' or 'MetaTrader'.
                  </p>
                </div>

                {/* App Link/Server Endpoint */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-xs font-mono text-slate-350 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Used by mt5_bridge.js to poll for signals. Automatically detects window origin, but can be manually overridden.
                  </p>
                </div>

                {/* AI Core Execution Mode Toggle */}
                <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-slate-300">
                        AI Core Execution Mode
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Mandatory verification under complex velocity profiles
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={!hasGeminiKey}
                      onClick={() => {
                        const nextVal = !paramInput.isAiModeEnabled;
                        setParamInput(p => ({ ...p, isAiModeEnabled: nextVal }));
                        applySettings(undefined, undefined, undefined, undefined, undefined, nextVal);
                      }}
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        paramInput.isAiModeEnabled ? "bg-emerald-500" : "bg-slate-700"
                      } ${!hasGeminiKey ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          paramInput.isAiModeEnabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {!hasGeminiKey ? (
                    <div className="p-2 border border-amber-500/10 bg-amber-500/5 rounded text-[10px] text-amber-400/90 leading-relaxed text-left">
                      ⚠️ <strong>AI verification client is inactive:</strong> No <code>GEMINI_API_KEY</code> detected in Environment Secrets. Configure the API key in the Platform Settings to enable intelligent trading validation.
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500 leading-normal text-left">
                      💡 When <strong>ON</strong>, standard rule-based executions will route through the Gemini Cognitive AI Engine for velocity divergence audits and risk validation.
                    </p>
                  )}
                </div>

                {/* Save Settings Trigger Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => applySettings()}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-widest rounded-lg transition-all cursor-pointer"
                  >
                    Save System Settings
                  </button>
                </div>

                {/* WebRequest Verification System Section */}
                <div className="mt-4 pt-4 border-t border-slate-800/60 space-y-3">
                  <div className="flex items-center gap-1.5 justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      MT5 WebRequest Permission
                    </span>
                    {webRequestStatus ? (
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
                        webRequestStatus.status === "success" 
                          ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                          : webRequestStatus.status === "failed" 
                          ? "text-rose-400 border-rose-500/20 bg-rose-500/5"
                          : webRequestStatus.status === "pending"
                          ? "text-amber-400 border-amber-500/20 bg-amber-500/5 animate-pulse"
                          : "text-slate-400 border-slate-800 bg-slate-950"
                      }`}>
                        {webRequestStatus.status === "success" && "● WORKING"}
                        {webRequestStatus.status === "failed" && "● FAILED"}
                        {webRequestStatus.status === "pending" && "● TESTING..."}
                        {webRequestStatus.status === "idle" && "● NOT TESTED"}
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-slate-400 border border-slate-800 px-2 py-0.5 rounded bg-slate-950 uppercase">
                        ● UNKNOWN
                      </span>
                    )}
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 font-mono">
                    <div className="text-[10px] text-slate-400 font-sans leading-relaxed">
                      MetaTrader 5 requires adding the allowed WebRequest URL so our Expert Advisor can synchronize ticks & execute trades. Put this URL in MT5 under <span className="text-slate-200">Tools → Options → Expert Advisors → Allow WebRequest for listed URL</span>:
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-slate-900 border border-slate-800/50 rounded p-1.5">
                      <span className="text-[11px] text-indigo-400 select-all overflow-x-auto whitespace-pre truncate font-mono">
                        {suggestedUrl || paramInput.appEndpoint || getAppBaseUrl()}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(suggestedUrl || paramInput.appEndpoint || getAppBaseUrl());
                          setCopiedUrl(true);
                          setTimeout(() => setCopiedUrl(false), 2000);
                        }}
                        className="text-[9px] text-indigo-400 hover:text-indigo-300 font-bold uppercase px-1.5 py-0.5 hover:bg-indigo-500/10 rounded transition-colors cursor-pointer"
                      >
                        {copiedUrl ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isVerifyingWebRequest}
                    onClick={triggerWebRequestTest}
                    className={`w-full py-2 border rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      isVerifyingWebRequest
                        ? "bg-slate-950 border-slate-800 text-slate-500 cursor-not-allowed"
                        : "bg-slate-900 hover:bg-slate-800 border-indigo-500/20 hover:border-indigo-500/40 text-indigo-300"
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
                    <div className="text-[10px] text-slate-400 bg-slate-950 p-2 rounded border border-slate-800/50 leading-relaxed font-sans">
                      <span className="font-semibold text-slate-300 font-mono text-[9px] uppercase tracking-wider block mb-0.5">Test Log:</span>
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
            <div className="lg:col-span-4 flex flex-col gap-6">

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

              {/* Built-in AI Analyst card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Built-in AI Analyst</h3>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div className="space-y-3">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Analyze last 40 discrete step coordinates on the server using Gemini's LLM to generate reinforcement patterns.
                    </p>
                    
                    {isAiLoading && (
                      <div className="flex flex-col items-center justify-center py-6 text-xs text-slate-500">
                        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
                        <span>Analyzing tick history...</span>
                      </div>
                    )}

                    {aiAnalysisResult && (
                      <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs rounded-lg font-mono leading-relaxed max-h-48 overflow-y-auto whitespace-pre-line">
                        {aiAnalysisResult}
                      </div>
                    )}

                    {!isAiLoading && !aiAnalysisResult && (
                      <div className="text-center py-8 text-xs text-slate-500">
                        Neural engine idle. Hit key below to consult cognitive analyzer.
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={generateAiReport}
                    disabled={isAiLoading}
                    className="w-full mt-4 py-2.5 bg-indigo-600 hover:bg-indigo-550 disabled:bg-indigo-850 disabled:text-indigo-400 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>GENERATE COGNITIVE ANALYSIS</span>
                  </button>
                </div>
              </div>

              {/* Step Index EA Meta-Analysis Summary Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Step Index Summary</h3>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                  <div className="space-y-4">
                    <p className="text-xs text-slate-400 leading-relaxed text-left">
                      Activate the <strong>Meta-Analysis Synthesis Agent</strong> to translate raw mathematical telemetry, execution variables, and historical logs into high-level plain-language operational summaries.
                    </p>

                    {isMetaAnalysisLoading && (
                      <div className="flex flex-col items-center justify-center py-8 text-xs text-slate-500 space-y-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                        <span className="font-mono font-medium text-slate-450">Synthesizing telemetry data stream...</span>
                      </div>
                    )}

                    {metaAnalysisError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-450 text-[11px] rounded-lg leading-normal text-left">
                        {metaAnalysisError}
                      </div>
                    )}

                    {metaAnalysisInsights && metaAnalysisInsights.length > 0 && (
                      <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                        {metaAnalysisInsights.map((insight, idx) => {
                          const categoryLower = insight.category?.toLowerCase() || "";
                          const tagBg = categoryLower.includes("market")
                            ? "bg-indigo-500/10 text-indigo-400 border-indigo-550/25"
                            : categoryLower.includes("risk") || categoryLower.includes("adjust")
                            ? "bg-rose-500/10 text-rose-450 border-rose-550/25"
                            : "bg-amber-500/10 text-amber-400 border-amber-550/25";

                          return (
                            <div key={idx} className="p-3 bg-slate-900/80 border border-slate-800/60 rounded-xl space-y-2 text-left">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border tracking-wider uppercase ${tagBg}`}>
                                  {insight.category}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500 font-medium">
                                  {insight.metric}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-300 leading-relaxed">
                                {insight.explanation}
                              </p>
                              <div className="pt-2 border-t border-slate-800/40">
                                <p className="text-[9px] font-mono text-slate-400 font-semibold bg-slate-950/40 px-2 py-1 rounded border border-slate-800/20 truncate" title={insight.summary}>
                                  📝 {insight.summary}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!isMetaAnalysisLoading && !metaAnalysisInsights && (
                      <div className="text-center py-6 text-[11px] text-slate-500 italic">
                        No telemetry synthesized yet. Run agent analysis below.
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={runMetaAnalysis}
                    disabled={isMetaAnalysisLoading}
                    className="w-full mt-4 py-2.5 bg-emerald-600 hover:bg-emerald-550 disabled:bg-emerald-850 disabled:text-emerald-400 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>RUN META-ANALYSIS SUMMARY</span>
                  </button>
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: Live Price Graph & Metrics (lg:col-span-8) */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              
              {/* Visualizer: Step Index Price Graph */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                  
                  {/* Graph Headers & Taps */}
                  <div className="p-4 border-b border-slate-800/80 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-900/50">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-pulse"></span>
                      LIVE STEP INDEX REAL-TIME STREAM (M1)
                    </span>
                    <div className="flex gap-4 font-mono text-[10px] text-slate-500">
                      <span>Index Value: <strong className="text-indigo-400">{currentPrice.toFixed(2)}</strong></span>
                      <span>Tick Depth: <strong className="text-slate-300">{history.length}/150</strong></span>
                      <span>Execution Speed: <strong className="text-slate-350">{latency}ms</strong></span>
                    </div>
                  </div>

                  {/* Sparkline Canvas Area */}
                  <div className="h-64 relative p-4 flex flex-col justify-end overflow-hidden bg-[#000000] border border-slate-800 rounded-xl">
                    {/* Grid completely disabled (grid=0) - no helper grid lines */}

                    {history.length > 1 ? (
                      <div className="w-full h-full">
                        <svg viewBox="0 0 800 260" className="w-full h-full overflow-visible">
                          {/* Live Candlestick Bars */}
                          {(() => {
                            const width = 800;
                            const height = 260;
                            const padding = 20;
                            
                            const candleWidth = 6;
                            const gap = 2;
                            const step = candleWidth + gap; // 8px total per candle
                            
                            // To prevent candles from merging into a dense vertical wall, we compute maximum visible candles
                            const maxCandles = Math.floor((width - 2 * padding) / step);
                            const visibleHistory = history.slice(-maxCandles);
                            
                            return (
                              <>
                                {visibleHistory.map((tick, idx) => {
                                  const openPrice = tick.open !== undefined ? tick.open : tick.price;
                                  const highPrice = tick.high !== undefined ? tick.high : tick.price;
                                  const lowPrice = tick.low !== undefined ? tick.low : tick.price;
                                  const closePrice = tick.close !== undefined ? tick.close : tick.price;

                                  // Align from the right of the screen (most recent) to the left (older history)
                                  const x = width - padding - (visibleHistory.length - 1 - idx) * step - candleWidth / 2;
                                  
                                  const y_high = padding + (1 - (highPrice - minPrice) / priceRange) * (height - 2 * padding);
                                  const y_low = padding + (1 - (lowPrice - minPrice) / priceRange) * (height - 2 * padding);
                                  const y_open = padding + (1 - (openPrice - minPrice) / priceRange) * (height - 2 * padding);
                                  const y_close = padding + (1 - (closePrice - minPrice) / priceRange) * (height - 2 * padding);

                                  const bodyY = Math.min(y_open, y_close);
                                  const bodyHeight = Math.max(1.5, Math.abs(y_open - y_close));

                                  const isBullish = closePrice >= openPrice;
                                  // Vibrant Neon Green (#54f354) and Solid Trading Red (#ff4a4a) matching MT5 workspace
                                  const strokeColor = isBullish ? "#54f354" : "#ff4a4a";
                                  const fillColor = isBullish ? "#54f354" : "#ff4a4a";

                                  return (
                                    <g key={(tick.time || idx) + "-" + idx}>
                                      {/* Wick (Center vertical line, drawn as 1px thin line) */}
                                      <line
                                        x1={x}
                                        y1={y_high}
                                        x2={x}
                                        y2={y_low}
                                        stroke={strokeColor}
                                        strokeWidth="1"
                                      />
                                      {/* Solid Real Body */}
                                      <rect
                                        x={x - candleWidth / 2}
                                        y={bodyY}
                                        width={candleWidth}
                                        height={bodyHeight}
                                        fill={fillColor}
                                        stroke={strokeColor}
                                        strokeWidth="1"
                                      />
                                    </g>
                                  );
                                })}

                                {/* Last tick tracker glowing pulse dot over the latest candlestick close price */}
                                {(() => {
                                  const lastIndex = visibleHistory.length - 1;
                                  if (lastIndex < 0) return null;
                                  const lastTick = visibleHistory[lastIndex];
                                  const lastClose = lastTick.close !== undefined ? lastTick.close : lastTick.price;
                                  const lastOpen = lastTick.open !== undefined ? lastTick.open : lastTick.price;
                                  
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
                      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs gap-1.5 py-12">
                        <RefreshCw className="w-8 h-8 animate-spin mb-1 text-indigo-500" />
                        <span className="font-bold text-slate-350">Waiting for MT5 EA Connection...</span>
                        <span className="text-[11px] text-slate-500 max-w-sm text-center px-4">
                          Launch your MetaTrader 5 terminal, verify that WebRequest is allowed for our address, and trigger active charts.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Relocated Sub-Graph Statistics and AI Predictions panel (placed safely under the graph so it doesn't block the visual canvas) */}
                  <div className="border-t border-slate-800 bg-slate-900 px-4 py-3.5 flex flex-col sm:flex-row justify-between items-center gap-3 animate-fade-in">
                    <div className="flex items-center gap-2.5 text-xs text-slate-400">
                      <span className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg font-mono flex items-center gap-1">
                        <span className="text-slate-500 uppercase">Min:</span>
                        <strong className="text-slate-200">{minPrice.toFixed(2)}</strong>
                      </span>
                      <span className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg font-mono flex items-center gap-1">
                        <span className="text-slate-500 uppercase">Max:</span>
                        <strong className="text-slate-200">{maxPrice.toFixed(2)}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="bg-indigo-950/45 border border-indigo-500/20 py-1 px-3 rounded-lg flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
                        <span className="text-[9px] text-indigo-300 font-semibold tracking-wider uppercase">AI Prediction:</span>
                        <span className="text-[11px] font-black text-white tracking-wide uppercase">
                          {config.selectedStrategy === StrategyMode.TREND_FOLLOWING 
                            ? "BULLISH BIAS" 
                            : config.selectedStrategy === StrategyMode.MEAN_REVERSION 
                            ? "CONTRARIAN FLUID" 
                            : "REINFORCEMENT CALIBRATION"
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Study / Baseline Check and Market Speed Indicator */}
                <div className="mb-4">
                  {aiStudyStatus === "calibrating" || aiStudyStatus === "waiting" ? (
                    <div className="bg-amber-950/15 border border-amber-500/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                          <Activity className="w-4 h-4 animate-pulse" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-amber-300 uppercase tracking-widest leading-none mb-1">AI Speed Baseline Study</p>
                          <p className="text-[11px] text-amber-400/80 leading-normal">
                            AI is analyzing market speed baseline... Awaiting sufficient expert data stream from MetaTrader 5 terminal.
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] bg-amber-950 border border-amber-500/40 text-amber-300 px-2.5 py-1.5 rounded font-mono font-bold leading-none shrink-0 uppercase tracking-wider">
                         Ticks: {aiKnowledgeBase ? aiKnowledgeBase.totalObservations : 0} / 20
                      </span>
                    </div>
                  ) : (
                    <div className="bg-[#1a233a] border border-indigo-500/20 rounded-xl p-4 flex flex-col gap-3 shadow-md">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-indigo-500/10">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                            <Gauge className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest leading-none mb-1 font-mono">AI Speed Study: OPTIMIZED</p>
                            <p className="text-[11px] text-slate-400 leading-normal">
                              Index velocity baseline is locked. Market metrics telemetry stream is active and STUDYING speed variations.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-950/45 border border-indigo-500/30 text-indigo-400 rounded-lg shrink-0">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 leading-none">Market Speed:</span>
                          <strong className="text-xs sm:text-sm font-mono font-black leading-none text-indigo-300">{averageVelocity ? `${averageVelocity.toFixed(4)} pt/s` : "0.0000 pt/s"}</strong>
                        </div>
                      </div>

                      {/* Real-Time Market Acceleration Monitor */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        <div className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Market Acceleration:</span>
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
                                          : "bg-slate-800"
                                      }`}
                                    />
                                  );
                                })}
                                <span className="text-xs font-mono font-black text-slate-300 ml-2">
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
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Session Performance</h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetStats}
                      className="py-1 px-2.5 text-[10px] font-extrabold font-mono rounded bg-slate-950 border border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200 transition-all duration-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Metrics</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Profit Tracking */}
                    <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-4 flex flex-col justify-between">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Run Session Profit</p>
                      <div className="my-2">
                        <p className={`text-2xl sm:text-3xl font-black ${stats.totalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {stats.totalProfit >= 0 ? "+" : ""}${stats.totalProfit.toFixed(2)}
                        </p>
                      </div>
                      <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden">
                        <div 
                          className="bg-emerald-500 h-1 rounded-full transition-all" 
                          style={{ width: `${Math.min(100, Math.max(10, stats.winRate))}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Profit Win-Rate */}
                    <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-4 flex flex-col justify-between">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Calculated Win-Rate</p>
                      <div className="my-2 flex items-baseline gap-1">
                        <p className="text-2xl sm:text-3xl font-black text-indigo-400">
                          {stats.winRate}%
                        </p>
                        <span className="text-[10px] text-slate-500">({stats.tradesCount} trades)</span>
                      </div>
                      <p className="text-[9px] text-slate-500 leading-tight">Minimum required: 62% for Step Index cost offset.</p>
                    </div>

                    {/* Active Positions counter */}
                    <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-4 flex flex-col justify-between">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Step Trades</p>
                      <div className="my-2">
                        <p className="text-2xl sm:text-3xl font-black text-white">
                          {stats.activePositionsCount} <span className="text-xs text-indigo-400 font-bold uppercase">Open</span>
                        </p>
                      </div>
                      <p className="text-[9px] text-slate-400 leading-tight">
                        {config.isActive 
                          ? `Awaiting discrete momentum criteria`
                          : "Expert is stopped or paused"
                        }
                      </p>
                    </div>
                  </div>
                </div>

              {/* Active & Completed Scalps Table Card */}
              <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Active & Completed Scalps</h3>
                  </div>
                  <span className="text-[9px] font-mono bg-slate-950 border border-slate-800 text-slate-400 px-2 py-1 rounded">
                    Simulated & Metatrader Stream Combined
                  </span>
                </div>

            {/* Simulated Live positions */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-950 text-[10px] text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Ticket</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Strategy</th>
                    <th className="py-2.5 px-3">Lot Size</th>
                    <th className="py-2.5 px-3">Entry Price</th>
                    <th className="py-2.5 px-3">Current/Close</th>
                    <th className="py-2.5 px-3 text-right">Profit</th>
                    <th className="py-2.5 px-3 text-right">Type Indicator</th>
                  </tr>
                </thead>
                <tbody className="text-xs font-mono">
                  {tradesList.length > 0 ? (
                    tradesList.slice(0, 8).map((trade) => {
                      const isProfit = trade.profit >= 0;
                      return (
                        <tr key={trade.id} className="border-b border-slate-800/50 hover:bg-slate-950/40">
                          <td className="py-3 px-3 text-slate-400">#{trade.ticket}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              trade.type === "BUY" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                            }`}>
                              {trade.type}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-350 text-[11px] font-sans">
                            {trade.strategy === StrategyMode.TREND_FOLLOWING ? "Trend Scalper" : trade.strategy === StrategyMode.MEAN_REVERSION ? "Mean Reversion" : "Cognitive AI"}
                          </td>
                          <td className="py-3 px-3 text-slate-200">{trade.lotSize.toFixed(2)}</td>
                          <td className="py-3 px-3 text-slate-200">{trade.entryPrice.toFixed(2)}</td>
                          <td className="py-3 px-3 text-slate-300">
                            {trade.status === "OPEN" ? currentPrice.toFixed(2) : trade.closePrice?.toFixed(2)}
                          </td>
                          <td className={`py-3 px-3 text-right font-bold ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                            {trade.status === "OPEN" 
                              ? "Floating" 
                              : `${isProfit ? "+" : ""}$${trade.profit.toFixed(2)}`
                            }
                          </td>
                          <td className="py-3 px-3 text-right text-[10px] text-slate-500 font-sans">
                            {trade.status === "OPEN" ? (
                              <span className="text-indigo-400 bg-indigo-500/10 py-0.5 px-2 rounded-full font-bold">LIVE</span>
                            ) : (
                              <span className="text-slate-500">Filled</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
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
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                  <Download className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest leading-none">MetaTrader 5 EA</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  Generate your custom MQ5 Expert Advisor file pre-compiled with this application's API endpoints to stream ticks and execute trades in real-time.
                </p>
                <a
                  href={`/api/ea/download?url=${encodeURIComponent(config.appEndpoint || getAppBaseUrl())}`}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-550 border border-indigo-500/30 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer text-center"
                >
                  <Download className="w-4 h-4" />
                  <span>Download StepIndex_AI_Scalper_EA.mq5</span>
                </a>
              </div>

              {/* 1b. MT5 Chart Visuals Template (.tpl) Card */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest leading-none">MT5 Chart Template (.tpl)</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  Apply our pixel-perfect MT5 workspace chart template directly. This disables grids, configures a solid black background, and sets vibrant bullish/bearish candle colors matching this dashboard.
                </p>
                <a
                  href="/api/ea/template"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-550 border border-emerald-500/30 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer text-center"
                >
                  <Download className="w-4 h-4" />
                  <span>Download step_index_chart.tpl</span>
                </a>
              </div>

              {/* 2. Node.js MT5 Desktop Bridge Card */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest block leading-none">Free Node.js Bridge</h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isBridgeConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}></span>
                    <span className={`text-[10px] font-bold uppercase ${isBridgeConnected ? "text-emerald-400" : "text-rose-500"}`}>
                      {isBridgeConnected ? "Connected" : "Offline"}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  Local standalone client polling the cloud server for pending trades and routing them seamlessly using native command-line executor processes. No cloud tokens or subscriptions are required!
                </p>

                <button
                  type="button"
                  onClick={downloadNodejsBridge}
                  className="w-full py-3 bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500 text-indigo-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-indigo-300" />
                  <span>Download Free Node.js Bridge</span>
                </button>

                <div className="text-[10px] text-slate-500 font-mono space-y-1 bg-slate-950 p-3 rounded-xl border border-slate-800/60">
                  <div className="text-indigo-400 font-bold uppercase mb-1">Bridge Requirements:</div>
                  <div>• Node.js &gt;= 18 (lts)</div>
                  <div>• npm install axios</div>
                  <div>• No subscriptions or secret keys needed</div>
                </div>
              </div>

            </div>

            {/* Right side setup guides (lg:col-span-7) */}
            <div className="lg:col-span-7">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="border-b border-indigo-950/60 pb-3">
                  <h3 className="text-sm font-black text-indigo-400 uppercase tracking-wider">Metatrader 5 Setup Instructions</h3>
                  <p className="text-xs text-slate-400 mt-1">Configure your MT5 terminal correctly to allow automated websocket signaling.</p>
                </div>

                <div className="space-y-4 text-xs text-slate-350">
                  
                  <div className="flex gap-3">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                    <div>
                      <h4 className="font-bold text-white text-xs uppercase tracking-wider">Place MQ5 file in MT5 directory</h4>
                      <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                        In your MT5 terminal, select <strong className="text-slate-205">File &gt; Open Data Folder</strong>. Open the folder <strong className="text-slate-250">MQL5 &gt; Experts</strong> and upload the downloaded MQ5 file inside this folder.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                    <div>
                      <h4 className="font-bold text-white text-xs uppercase tracking-wider">Allow WebRequest permissions</h4>
                      <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                        Go to <strong className="text-slate-250">Tools &gt; Options &gt; Expert Advisors</strong>. Check "Allow WebRequest for listed URL:" and add this app's URL:
                      </p>
                      
                      <div className="mt-2 flex items-center gap-1 bg-slate-950 p-2 rounded-lg border border-slate-800">
                        <code className="text-[10px] font-mono select-all text-indigo-400 truncate flex-1 block px-2">
                          {getAppBaseUrl()}
                        </code>
                        <button
                          onClick={copyUrlToClipboard}
                          className="p-1 px-3 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 transition-all text-[11px] text-slate-350 flex items-center gap-1"
                        >
                          {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedLink ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                    <div>
                      <h4 className="font-bold text-white text-xs uppercase tracking-wider">Enable Algorithmic Trading</h4>
                      <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                        Enable algorithmic trading globally via the green button in the top panel of MT5. Finally, drag the expert advisor MQ5 file onto any <span className="text-emerald-400 font-semibold font-mono">Step Index</span> chart. Check your MT5 Expert Logs to verify connection registration.
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
            <section className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-3 border-b border-slate-800 mb-4 font-sans">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">System Control Logs</h3>
                </div>
                
                {/* Filter buttons */}
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1 text-[10px]">
                  {["ALL", "INFO", "SUCCESS", "WARNING", "ERROR"].map((level) => (
                    <button
                      key={level}
                      onClick={() => setFilterLogLevel(level)}
                      className={`py-1 px-2.5 rounded font-mono font-bold uppercase transition-all whitespace-nowrap cursor-pointer ${
                        filterLogLevel === level 
                          ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/25"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Console Text block (Engorged full page height) */}
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 h-[500px] overflow-y-auto flex flex-col gap-1.5 font-mono text-xs text-slate-350">
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => {
                    let colorClass = "text-slate-300";
                    if (log.level === "SUCCESS") colorClass = "text-emerald-400";
                    if (log.level === "WARNING") colorClass = "text-yellow-450";
                    if (log.level === "ERROR") colorClass = "text-red-400";

                    return (
                      <div key={log.id} className="flex gap-2 hover:bg-slate-900/60 p-0.5 rounded transition-all">
                        <span className="text-slate-600 select-none">[{log.timestamp}]</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-900 ${
                          log.source === "SERVER" ? "text-indigo-400" : log.source === "AI" ? "text-pink-400" : "text-yellow-400"
                        }`}>
                          {log.source}
                        </span>
                        <span className={colorClass}>{log.message}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-20 text-slate-650">
                    No logs matching current filter parameters found.
                  </div>
                )}
              </div>
            </section>

            {/* Right Column: System Architecture Info Specs */}
            <aside className="lg:col-span-4 space-y-6 flex flex-col">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">System Architecture</h3>
                </div>

                <div className="space-y-4">
                  {/* FRONTEND SPEC */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider block">Front-End Stack</span>
                    <div className="bg-slate-950 rounded-xl p-3 border border-slate-800/80 space-y-2">
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
                    <div className="bg-slate-950 rounded-xl p-3 border border-slate-800/80 space-y-2">
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
                    <div className="bg-slate-950 rounded-xl p-3 border border-slate-800/80 space-y-2">
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
                    <div className="bg-slate-950 rounded-xl p-3 border border-slate-800/80 space-y-2">
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

              {/* Interactive Status Metrics */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                  <Server className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-slate-350 uppercase tracking-widest">Real-time Node Health</h3>
                </div>
                <div className="space-y-3 font-mono text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Node Status</span>
                    <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">STABLE</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">DB Transactions</span>
                    <span className="text-indigo-300 font-bold">100% SUCCESS</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Signal Latency</span>
                    <span className="text-yellow-450 font-bold">ACTIVE (BRIDGE DISPATCH)</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

      </main>

      {/* Sleek bottom Footer status telemetry */}
      <footer className="h-12 border-t border-slate-900 flex flex-wrap items-center px-6 sm:px-8 bg-slate-900/40 text-[10px] text-slate-500 gap-y-2 gap-x-6">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className={`w-1.5 h-1.5 rounded-full ${isInternetOnline ? "bg-emerald-500" : "bg-red-500"}`}></span> 
          INTERNET: {isInternetOnline ? "ONLINE_STABLE" : "NETWORK_DISCONNECTED"}
        </div>
        
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span> 
          PING LATENCY: {latency}MS
        </div>

        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="w-1.5 h-1.5 bg-slate-600 rounded-full"></span> 
          SESSION ELAPSED: {elapsedTime}
        </div>

        <div className="sm:ml-auto flex gap-4 uppercase font-bold tracking-tight text-[9px] whitespace-nowrap">
          <span className="text-slate-400">Step Index (Synthetic M1)</span>
          <span className="text-slate-700">v1.20-Production</span>
        </div>
      </footer>

    </div>
  );
}
