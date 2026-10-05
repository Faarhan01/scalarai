import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Home,
  Sliders,
  Download,
  Terminal,
  Settings,
  AlertCircle,
} from "lucide-react";
import {
  StrategyMode,
  TradeConfig,
  TradeRecord,
  SystemLog,
  Tick,
  EAConnectionDetails,
  AiKnowledgeBase,
} from "./types";
import {
  Header,
  MobileDrawer,
  StatusBar,
  StatsCards,
  TradePanel,
  PriceChart,
  TradeList,
  AiStudyFeed,
  StrategyPanel,
  KnowledgeBase,
  SettingsForm,
  AssetSelector,
  DownloadsCenter,
  LogsViewer,
} from "./components";
import { useWebSocket } from "./hooks/useWebSocket";
import { useChartData } from "./hooks/useChartData";
import { useDownloadBridge } from "./hooks/useDownloadBridge";
import { useAiStudyFeed } from "./hooks/useAiStudyFeed";
import { useTradingControls } from "./hooks/useTradingControls";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
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
              className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-all cursor-pointer"
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
  // Config & State
  const [config, setConfig] = useState<TradeConfig>({
    isActive: false,
    selectedStrategy: StrategyMode.TREND_FOLLOWING,
    lotSize: 0.1,
    takeProfitPoints: 300,
    stopLossPoints: 150,
    trailingStopPoints: 100,
    useTrailingStop: true,
    maxTrades: 3,
    isAiModeEnabled: false,
    tradingMode: "Scalping",
    selectedAssets: ["Step Index"],
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
    symbolDescription: null,
  });

  const [stats, setStats] = useState({
    totalProfit: 0,
    tradesCount: 0,
    winRate: 0,
    activePositionsCount: 0,
    lastHeartbeatTime: null as string | null,
  });

  const [history, setHistory] = useState<Tick[]>([]);
  const [candles, setCandles] = useState<
    Array<{ time: number; open: number; high: number; low: number; close: number }>
  >([]);
  const [currentPrice, setCurrentPrice] = useState<number>(1250.0);
  const [activeSymbol, setActiveSymbol] = useState<string>("Step Index");
  const [symbolStates, setSymbolStates] = useState<
    Array<{ symbol: string; connection: any; currentPrice: number; tickCount: number }>
  >([]);
  const [tradesList, setTradesList] = useState<TradeRecord[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isBridgeConnected, setIsBridgeConnected] = useState<boolean>(false);

  // Network & UI
  const [isInternetOnline, setIsInternetOnline] = useState<boolean>(navigator.onLine);
  const [latency, setLatency] = useState<number>(12);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [filterLogLevel, setFilterLogLevel] = useState<string>("ALL");
  const [currentNavTab, setCurrentNavTab] = useState<"home" | "risk" | "downloads" | "logs" | "settings">("home");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showEma, setShowEma] = useState<boolean>(true);
  const [showBollingerBands, setShowBollingerBands] = useState<boolean>(false);

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
    isAiModeEnabled: false,
  });

  const [webRequestStatus, setWebRequestStatus] = useState<{
    status: string;
    lastTested: string;
    error: string;
    details: string;
  } | null>(null);
  const [isVerifyingWebRequest, setIsVerifyingWebRequest] = useState<boolean>(false);

  // AI & Strategies
  const [aiStudyStatus, setAiStudyStatus] = useState<"waiting" | "calibrating" | "optimized" | "active">("calibrating");
  const [aiStudyMessage, setAiStudyMessage] = useState<string>(
    "AI is calibrating long-term behavioral profile... Execution locked."
  );
  const [averageVelocity, setAverageVelocity] = useState<number | null>(null);
  const [aiKnowledgeBase, setAiKnowledgeBase] = useState<AiKnowledgeBase | null>(null);
  const [aiSynthesizedStrategy, setAiSynthesizedStrategy] = useState<any>(null);
  const [lastStrategySignal, setLastStrategySignal] = useState<{ type: string; reason: string; confidence?: number } | null>(null);
  const [strategiesList, setStrategiesList] = useState<any[]>([]);
  const [telemetryStream, setTelemetryStream] = useState<any[]>([]);

  // Session elapsed counter
  const [elapsedTime, setElapsedTime] = useState<string>("00:00:00");
  const startTimeRef = useRef<number>(Date.now());

  // RAF chart throttling
  const pendingChartUpdate = useRef<{ history?: Tick[]; candles?: any[]; currentPrice?: number } | null>(null);
  const rafId = useRef<number | null>(null);
  const historyRef = useRef<Tick[]>([]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const scheduleChartUpdate = useCallback(
    (update: { history?: Tick[]; candles?: any[]; currentPrice?: number }) => {
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
    },
    []
  );

  // Fetch Strategy List
  const fetchStrategies = useCallback(async () => {
    try {
      const res = await fetch("/api/strategies");
      if (res.ok) {
        const data = await res.json();
        setStrategiesList(data);
      }
    } catch {
      // Quietly ignore network failures
    }
  }, []);

  // Fetch Initial Status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
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
      }
    } catch {
      // Fallback
    }
  }, []);

  // Sync WebSocket
  const { sendWsMessage } = useWebSocket({
    onInit: (data) => {
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
    },
    onTick: (msg) => {
      if (msg.currentPrice !== undefined) {
        scheduleChartUpdate({ currentPrice: msg.currentPrice });
      }
      if (msg.tick) {
        scheduleChartUpdate({
          history: [...historyRef.current, msg.tick].slice(-100),
        });
        if (msg.tick.velocity !== undefined) {
          setTelemetryStream((prev) => [
            ...prev,
            { timestamp: msg.tick.time || Date.now(), velocity: msg.tick.velocity },
          ].slice(-50));
        }
      }
      if (msg.candles) {
        scheduleChartUpdate({ candles: msg.candles });
      }
      if (msg.stats) setStats(msg.stats);
      if (msg.connection) setConnection(msg.connection);
    },
    onTrades: (msg) => {
      if (msg.trades) setTradesList(msg.trades);
      if (msg.stats) setStats(msg.stats);
    },
    onLog: (log) => {
      setLogs((prev) => [log as SystemLog, ...prev.slice(0, 79)]);
    },
    onConfig: (newConfig) => {
      setConfig((prev) => ({ ...prev, ...newConfig }));
    },
    onConnection: (msg) => {
      if (msg.connection) setConnection(msg.connection);
    },
    onWebRequestTest: (testState) => {
      setWebRequestStatus(testState as any);
    },
    onAiStrategy: (strategy) => {
      setAiSynthesizedStrategy(strategy);
    },
    onFetchStrategies: fetchStrategies,
    onPong: (ms) => {
      setPingLatency(ms);
      setLatency(ms);
    },
    onStatusChange: (connected) => {
      setWsConnected(connected);
    },
  });

  // Internet online status
  useEffect(() => {
    const handleOnline = () => setIsInternetOnline(true);
    const handleOffline = () => setIsInternetOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
    fetchStrategies();
  }, [fetchStatus, fetchStrategies]);

  // Elapsed time ticker
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const hours = String(Math.floor(diff / 3600)).padStart(2, "0");
      const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
      const secs = String(diff % 60).padStart(2, "0");
      setElapsedTime(`${hours}:${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Poll AI study feed periodically
  const aiStudy = useAiStudyFeed(sendWsMessage);

  useEffect(() => {
    if (aiStudy.status) setAiStudyStatus(aiStudy.status);
    if (aiStudy.message) setAiStudyMessage(aiStudy.message);
    if (aiStudy.knowledgeBase) setAiKnowledgeBase(aiStudy.knowledgeBase);
    if (aiStudy.averageVelocity !== null) setAverageVelocity(aiStudy.averageVelocity);
    if (aiStudy.strategy) setAiSynthesizedStrategy(aiStudy.strategy);
  }, [aiStudy]);

  // Sync inputs with config
  useEffect(() => {
    const savedEndpoint =
      (typeof window !== "undefined" && localStorage.getItem("mt5_webrequest_endpoint")) || "";
    setParamInput({
      lotSize: String(config.lotSize ?? 0.1),
      takeProfitPoints: String(config.takeProfitPoints ?? 300),
      stopLossPoints: String(config.stopLossPoints ?? 150),
      trailingStopPoints: String(config.trailingStopPoints ?? 100),
      maxTrades: String(config.maxTrades ?? 3),
      useTrailingStop: config.useTrailingStop ?? true,
      mt5Path: config.mt5Path || "",
      appEndpoint: config.appEndpoint || savedEndpoint || "http://127.0.0.1:3000",
      tradingMode: config.tradingMode || "Scalping",
      selectedAssets: config.selectedAssets || ["Step Index"],
      isAiModeEnabled: !!config.isAiModeEnabled,
    });
  }, [config]);

  // URL Helper
  const getAppBaseUrl = useCallback(() => {
    let origin = window.location.origin;
    if (origin.includes("ais-dev-")) {
      origin = origin.replace("ais-dev-", "ais-pre-");
    }
    return origin;
  }, []);

  // Apply settings
  const applySettings = async (
    strategyOverride?: StrategyMode,
    mt5PathOverride?: string,
    appEndpointOverride?: string,
    tradingModeOverride?: "Scalping" | "Swing",
    selectedAssetsOverride?: string[],
    isAiModeEnabledOverride?: boolean
  ) => {
    const finalEndpoint =
      appEndpointOverride !== undefined
        ? appEndpointOverride
        : paramInput.appEndpoint || "http://127.0.0.1:3000";

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
          isAiModeEnabled: isAiModeEnabledOverride !== undefined ? isAiModeEnabledOverride : paramInput.isAiModeEnabled,
        }),
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

  const tradingControls = useTradingControls();

  const toggleTradingExecution = async () => {
    if (aiStudyStatus !== "optimized" && aiStudyStatus !== "active") {
      console.warn("Automated trade execution blocked: AI Speed dynamic baseline study is currently pending.");
      return;
    }
    await tradingControls.toggleTradingExecution(sendWsMessage, config, fetchStatus);
  };

  const closeAllPositions = async () => {
    await tradingControls.closeAllPositions(sendWsMessage, fetchStatus);
  };

  const resetStats = async () => {
    await tradingControls.resetStats(sendWsMessage, fetchStatus);
  };

  const switchSymbol = async (symbol: string) => {
    try {
      const response = await fetch("/api/status/switch-symbol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
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

  // Trigger WebRequest Verification Test
  const triggerWebRequestTest = async () => {
    setIsVerifyingWebRequest(true);
    try {
      const response = await fetch("/api/test-webrequest/trigger", { method: "POST" });
      if (response.ok) {
        const data = await response.json();
        if (data && data.testState) {
          setWebRequestStatus(data.testState);
        }
      }

      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await fetch("/api/test-webrequest/status");
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData && statusData.testState) {
              setWebRequestStatus(statusData.testState);
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

  const { downloadNodejsBridge } = useDownloadBridge({
    appEndpoint: config.appEndpoint,
    mt5Path: config.mt5Path,
  });

  // Compute Chart Data via Hook
  const chartData = useChartData(candles, history, 80);

  return (
    <div
      id="app-container"
      className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col selection:bg-indigo-500 selection:text-white antialiased"
    >
      {/* 1. Header with dynamic symbol and status indicators */}
      <Header
        config={config}
        connection={connection}
        isBridgeConnected={isBridgeConnected}
        wsConnected={wsConnected}
        pingLatency={pingLatency}
        latency={latency}
        isInternetOnline={isInternetOnline}
        activeSymbol={activeSymbol}
        currentPrice={currentPrice}
        symbolStates={symbolStates}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleTradingExecution={toggleTradingExecution}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        onSwitchSymbol={switchSymbol}
      />

      {/* 2. Mobile Drawer */}
      <MobileDrawer
        isOpen={isMobileMenuOpen}
        config={config}
        currentPrice={currentPrice}
        activeSymbol={activeSymbol}
        currentNavTab={currentNavTab}
        logs={logs}
        connection={connection}
        isBridgeConnected={isBridgeConnected}
        wsConnected={wsConnected}
        pingLatency={pingLatency}
        latency={latency}
        isInternetOnline={isInternetOnline}
        onClose={() => setIsMobileMenuOpen(false)}
        onSetNavTab={(tab) => setCurrentNavTab(tab as any)}
        onToggleTradingExecution={toggleTradingExecution}
      />

      {/* 3. Main Dashboard Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Navigation Tabs Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <nav className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-1">
            {[
              { id: "home", label: "Live Trading", icon: Home, badge: `$${currentPrice.toFixed(1)}` },
              { id: "risk", label: "Risk & Strategy", icon: Sliders, badge: config.selectedStrategy },
              { id: "downloads", label: "Downloads Center", icon: Download },
              { id: "logs", label: "System Logs", icon: Terminal, badge: `${logs.length}` },
              { id: "settings", label: "Settings", icon: Settings },
            ].map((tab) => {
              const IconComp = tab.icon;
              const isActive = currentNavTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setCurrentNavTab(tab.id as any)}
                  className={`nav-tab-btn ${isActive ? "nav-tab-active" : ""}`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                        isActive ? "bg-indigo-700 text-indigo-100" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab 1: Live Trading Dashboard */}
        {currentNavTab === "home" && (
          <div className="space-y-6 animate-fade-in">
            {/* Speed baseline & study feed banner */}
            <AiStudyFeed
              aiStudyStatus={aiStudyStatus}
              aiStudyMessage={aiStudyMessage}
              averageVelocity={averageVelocity}
              aiKnowledgeBase={aiKnowledgeBase}
              telemetryStream={telemetryStream}
            />

            {/* Main Interactive Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (5 cols): Control Panel, Metrics, Active Strategy */}
              <div className="lg:col-span-5 space-y-6 flex flex-col">
                <TradePanel
                  config={config}
                  aiStudyStatus={aiStudyStatus}
                  aiKnowledgeBase={aiKnowledgeBase}
                  aiSynthesizedStrategy={aiSynthesizedStrategy}
                  strategiesList={strategiesList}
                  onToggleTradingExecution={toggleTradingExecution}
                  onApplySettings={applySettings}
                  selectedStrategy={config.selectedStrategy}
                />

                <StatsCards
                  stats={stats}
                  config={config}
                  onResetStats={resetStats}
                />

                <StrategyPanel
                  aiSynthesizedStrategy={aiSynthesizedStrategy}
                  aiKnowledgeBase={aiKnowledgeBase}
                />
              </div>

              {/* Right Column (7 cols): Interactive Live Candlestick & Telemetry Chart */}
              <div className="lg:col-span-7 flex flex-col gap-6">
                <PriceChart
                  activeSymbol={activeSymbol}
                  currentPrice={currentPrice}
                  candleDataLength={chartData.candleData.length}
                  latency={latency}
                  showEma={showEma}
                  showBollingerBands={showBollingerBands}
                  chartData={chartData}
                  lastStrategySignal={lastStrategySignal}
                  selectedStrategy={config.selectedStrategy}
                  onToggleEma={() => setShowEma(!showEma)}
                  onToggleBollingerBands={() => setShowBollingerBands(!showBollingerBands)}
                />
              </div>
            </div>

            {/* Bottom Row: Trades Table */}
            <TradeList
              tradesList={tradesList}
              currentPrice={currentPrice}
              selectedStrategy={config.selectedStrategy}
              onCloseAllPositions={closeAllPositions}
            />
          </div>
        )}

        {/* Tab 2: Risk & Strategy Configuration */}
        {currentNavTab === "risk" && (
          <div className="space-y-6 animate-fade-in">
            <AssetSelector
              config={{ ...config, saveSuccess }}
              paramInput={paramInput}
              selectedStrategy={config.selectedStrategy}
              onApplySettings={applySettings}
              onSetParamInput={(patch) => setParamInput((prev) => ({ ...prev, ...patch }))}
              onSetConfig={(patch) => setConfig((prev) => ({ ...prev, ...patch }))}
            />

            <div className="max-w-2xl mx-auto w-full">
              <KnowledgeBase strategiesList={strategiesList} />
            </div>
          </div>
        )}

        {/* Tab 3: Downloads Center */}
        {currentNavTab === "downloads" && (
          <DownloadsCenter
            config={config}
            activeSymbol={activeSymbol}
            isBridgeConnected={isBridgeConnected}
            appEndpoint={paramInput.appEndpoint}
            copiedLink={copiedLink}
            onSetEndpoint={(ep) => setParamInput((prev) => ({ ...prev, appEndpoint: ep }))}
            onSaveEndpoint={(ep) => applySettings(undefined, undefined, ep)}
            onCopyLink={(text) => {
              navigator.clipboard.writeText(text);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
            onDownloadNodejsBridge={downloadNodejsBridge}
            getAppBaseUrl={getAppBaseUrl}
          />
        )}

        {/* Tab 4: System Logs */}
        {currentNavTab === "logs" && (
          <LogsViewer
            logs={logs}
            filterLogLevel={filterLogLevel}
            onFilterChange={setFilterLogLevel}
          />
        )}

        {/* Tab 5: Settings */}
        {currentNavTab === "settings" && (
          <SettingsForm
            config={config}
            paramInput={paramInput}
            saveSuccess={saveSuccess}
            webRequestStatus={webRequestStatus}
            isVerifyingWebRequest={isVerifyingWebRequest}
            copiedUrl={copiedUrl}
            getAppBaseUrl={getAppBaseUrl}
            onApplySettings={() => applySettings()}
            onSetParamInput={(patch) => setParamInput((prev) => ({ ...prev, ...patch }))}
            onTriggerWebRequestTest={triggerWebRequestTest}
            onSetCopiedUrl={setCopiedUrl}
          />
        )}
      </main>

      {/* 4. Real-time Status Bar Footer */}
      <StatusBar
        isInternetOnline={isInternetOnline}
        latency={latency}
        elapsedTime={elapsedTime}
        activeSymbol={activeSymbol}
      />
    </div>
  );
}
