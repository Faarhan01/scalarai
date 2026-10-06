import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Home,
  Sliders,
  Download,
  Terminal,
  Settings,
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
  TabBar,
  ErrorBanner,
  Modal,
  ModalFooter,
  Badge,
  Button,
  AppShell,
} from "./components";
import { useWebSocket } from "./hooks/useWebSocket";
import { useChartData } from "./hooks/useChartData";
import { useDownloadBridge } from "./hooks/useDownloadBridge";
import { useAiStudyFeed } from "./hooks/useAiStudyFeed";
import { useTradingControls } from "./hooks/useTradingControls";
import { useSettings, type SettingsState } from "./hooks/useSettings";
import { useErrorHandler } from "./hooks/useErrorHandler";
import { useElapsedTimer } from "./hooks/useElapsedTimer";

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
  const [selectedTradeForModal, setSelectedTradeForModal] = useState<TradeRecord | null>(null);
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
  const [copiedLink, setCopiedLink] = useState(false);
  const [showEma, setShowEma] = useState<boolean>(true);
  const [showBollingerBands, setShowBollingerBands] = useState<boolean>(false);

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
  const { elapsedTime } = useElapsedTimer();

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

  const { errors, showError, clearError } = useErrorHandler();

  const settings = useSettings(config);
  const tradingControls = useTradingControls();

  // Fetch Strategy List
  const fetchStrategies = useCallback(async () => {
    try {
      const res = await fetch("/api/strategies");
      if (res.ok) {
        const data = await res.json();
        setStrategiesList(data);
      }
    } catch (err) {
      showError("Failed to fetch strategies");
    }
  }, [showError]);

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
        if (data.webRequestStatus) settings.setWebRequestStatus(data.webRequestStatus);
      }
    } catch (err) {
      showError("Failed to fetch server status");
    }
  }, [showError, settings.setWebRequestStatus]);

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
      if (data.webRequestStatus) settings.setWebRequestStatus(data.webRequestStatus);
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
      settings.setWebRequestStatus(testState as SettingsState["webRequestStatus"]);
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

  // Poll AI study feed periodically
  const aiStudy = useAiStudyFeed(sendWsMessage);

  useEffect(() => {
    if (aiStudy.status) setAiStudyStatus(aiStudy.status);
    if (aiStudy.message) setAiStudyMessage(aiStudy.message);
    if (aiStudy.knowledgeBase) setAiKnowledgeBase(aiStudy.knowledgeBase);
    if (aiStudy.averageVelocity !== null) setAverageVelocity(aiStudy.averageVelocity);
    if (aiStudy.strategy) setAiSynthesizedStrategy(aiStudy.strategy);
  }, [aiStudy]);

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

  const { downloadNodejsBridge } = useDownloadBridge({
    appEndpoint: config.appEndpoint,
    mt5Path: config.mt5Path,
  });

  // Compute Chart Data via Hook
  const chartData = useChartData(candles, history, 80);

  return (
    <AppShell>
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
        <ErrorBanner errors={errors} onDismiss={clearError} />
        {/* Navigation Tabs Bar */}
        <TabBar
          tabs={[
            { id: "home", label: "Live Trading", icon: Home, badge: `$${currentPrice.toFixed(1)}` },
            { id: "risk", label: "Risk & Strategy", icon: Sliders, badge: config.selectedStrategy },
            { id: "downloads", label: "Downloads Center", icon: Download },
            { id: "logs", label: "System Logs", icon: Terminal, badge: `${logs.length}` },
            { id: "settings", label: "Settings", icon: Settings },
          ]}
          activeTab={currentNavTab}
          onSelect={(tabId) => setCurrentNavTab(tabId as any)}
        />

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
                   onApplySettings={() => settings.applySettings(fetchStatus)}
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
              onTradeClick={(trade) => setSelectedTradeForModal(trade)}
            />

            {/* Trade Detail Modal */}
            <Modal
              open={!!selectedTradeForModal}
              onClose={() => setSelectedTradeForModal(null)}
              title={
                <div className="flex items-center gap-2">
                  <span>Trade Ticket #{selectedTradeForModal?.ticket}</span>
                  {selectedTradeForModal && (
                    <Badge
                      variant={selectedTradeForModal.type === "BUY" ? "success" : "danger"}
                      size="sm"
                      dot
                    >
                      {selectedTradeForModal.type}
                    </Badge>
                  )}
                </div>
              }
              size="md"
            >
              {selectedTradeForModal && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Status</span>
                      <span className="font-bold text-white">{selectedTradeForModal.status}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Lot Size</span>
                      <span className="font-bold text-white tabular-nums">{selectedTradeForModal.lotSize}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Entry Price</span>
                      <span className="font-bold text-indigo-300 tabular-nums">{selectedTradeForModal.entryPrice.toFixed(2)}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">
                        {selectedTradeForModal.status === "OPEN" ? "Current Price" : "Close Price"}
                      </span>
                      <span className="font-bold text-slate-200 tabular-nums">
                        {(selectedTradeForModal.closePrice ?? currentPrice).toFixed(2)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Profit / Floating</span>
                      <span
                        className={`font-bold tabular-nums ${
                          (selectedTradeForModal.status === "OPEN"
                            ? (selectedTradeForModal.type === "BUY" ? currentPrice - selectedTradeForModal.entryPrice : selectedTradeForModal.entryPrice - currentPrice) * 10 * selectedTradeForModal.lotSize
                            : selectedTradeForModal.profit) >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        $
                        {(selectedTradeForModal.status === "OPEN"
                          ? (selectedTradeForModal.type === "BUY" ? currentPrice - selectedTradeForModal.entryPrice : selectedTradeForModal.entryPrice - currentPrice) * 10 * selectedTradeForModal.lotSize
                          : selectedTradeForModal.profit
                        ).toFixed(2)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase">Open Time</span>
                      <span className="font-bold text-slate-300">{selectedTradeForModal.openTime}</span>
                    </div>
                  </div>

                  {selectedTradeForModal.strategy && (
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                      <span className="text-slate-400 block text-[10px] uppercase font-mono mb-1">Strategy & Reason</span>
                      <p className="text-slate-200 font-sans text-xs">
                        <strong className="text-indigo-300 font-mono">{selectedTradeForModal.strategy}:</strong> {selectedTradeForModal.reason}
                      </p>
                    </div>
                  )}

                  <ModalFooter>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedTradeForModal(null)}
                    >
                      Close
                    </Button>
                  </ModalFooter>
                </div>
              )}
            </Modal>
          </div>
        )}

        {/* Tab 2: Risk & Strategy Configuration */}
        {currentNavTab === "risk" && (
          <div className="space-y-6 animate-fade-in">
            <AssetSelector
              config={{ ...config, saveSuccess: settings.saveSuccess }}
              paramInput={settings.paramInput}
              selectedStrategy={config.selectedStrategy}
              onApplySettings={() => settings.applySettings(fetchStatus)}
              onSetParamInput={(patch) => settings.onParamInputChange(patch)}
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
            appEndpoint={settings.paramInput.appEndpoint}
            copiedLink={copiedLink}
            onSetEndpoint={(ep) => settings.onParamInputChange({ appEndpoint: ep })}
            onSaveEndpoint={(ep) => settings.applySettings(fetchStatus, { appEndpointOverride: ep })}
            onCopyLink={(text) => {
              navigator.clipboard.writeText(text);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
            onDownloadNodejsBridge={downloadNodejsBridge}
            getAppBaseUrl={settings.getAppBaseUrl}
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
            paramInput={settings.paramInput}
            saveSuccess={settings.saveSuccess}
            webRequestStatus={settings.webRequestStatus}
            isVerifyingWebRequest={settings.isVerifyingWebRequest}
            copiedUrl={settings.copiedUrl}
            getAppBaseUrl={settings.getAppBaseUrl}
            onApplySettings={() => settings.applySettings(fetchStatus)}
            onSetParamInput={(patch) => settings.onParamInputChange(patch)}
            onTriggerWebRequestTest={settings.triggerWebRequestTest}
            onSetCopiedUrl={settings.setCopiedUrl}
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
    </AppShell>
  );
}
