import { TradeConfig } from "../types";

function validateAppUrl(appUrl: string | undefined): string {
  const raw = (appUrl || "").trim().replace(/\/$/, "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }
    return raw;
  } catch {
    return "";
  }
}

export function generateMql5Code(appUrl?: string, config?: Partial<TradeConfig>): string {
  const clientUrl = validateAppUrl(appUrl) || "http://127.0.0.1:3000";
  const escapedUrl = clientUrl.replace(/\\/g, "\\\\");

  const lotSize = config?.lotSize ?? 0.1;
  const selectedStrategy = config?.selectedStrategy ?? "TREND_FOLLOWING";
  const isActive = config?.isActive ?? false;
  const takeProfitPoints = config?.takeProfitPoints ?? 300;
  const stopLossPoints = config?.stopLossPoints ?? 150;
  const trailingStopPoints = config?.trailingStopPoints ?? 100;
  const useTrailingStop = config?.useTrailingStop ?? true;
  const maxTrades = config?.maxTrades ?? 3;

  return `//+------------------------------------------------------------------+
//|                                     ScalarAI_MultiAsset_EA.mq5    |
//|                         Copyright 2026, Scalar AI Technologies    |
//|                                             https://ai.studio/build|
//+------------------------------------------------------------------+
#property copyright "Scalar AI Technologies"
#property link      "${escapedUrl}"
#property version   "3.05"
#property description "Scalar AI Multi-Asset Remote Execution & Telemetry EA"
#property description "Streams real-time ticks, candles, positions and executes web/MCP strategy signals."
#property description "IMPORTANT: Add '${escapedUrl}' to MT5 Tools -> Options -> Expert Advisors -> Allow WebRequest!"

//--- Include standard trade library
#include <Trade\\Trade.mqh>
CTrade trade;

//--- Expert Input Parameters
input group "=== Risk & Trade Execution Settings ==="
input double   InpLotSize         = ${lotSize};        // Lot Size to Trade
input string   InpStrategyMode    = "${selectedStrategy}"; // Strategy Mode Label
input int      InpMaxTrades       = ${maxTrades};       // Maximum Concurrent Trades

input group "=== Web App & API Integration ==="
input string   InpWebServerUrl    = "${escapedUrl}";         // Web App Base URL
input string   InpDashboardUrl    = "${escapedUrl}/api/update-market"; // Dashboard Live Feed URL
input int      InpSyncIntervalSec = 2;                      // Telemetry Sync Interval (Seconds)
input bool     InpSendTicksToWeb  = true;                   // Stream Real-Time Ticks to Web
input bool     InpSendPositions   = true;                   // Report Open Positions Each Sync

//--- Forward function declarations (required by MQL5 compiler)
void PushHistoricalCandles(int count);
void BroadcastMarketUpdate();
void SyncWithWebApp();
void ProcessPendingRemoteCommands(string jsonResponse, double bid, double ask);
void ReportExecutionResult(string action, ulong siteTicket, ulong mt5Ticket, bool success, string error);
void SyncPositions();
void UpdateChartDisplay(double bid, double ask);
void CheckForEaUpdate();
void ApplyRuntimeConfigUpdate(const string &jsonConfig);
string FetchEaCodeFromServer();
bool SaveUpdateFile(string code);
void EaLogPush(string level, string message);
string EscapeJsonString(string str);
void ShipEaLogsToServer();
void CloseAllPositions();
void ClosePositionByTicket(ulong ticket);
void ModifyPosition(ulong ticket, double slPoints, double tpPoints);
void CountPositions(int &buyCount, int &sellCount);
void ManageTrailingStop(double bid, double ask);
double NormalizeVolume(double volume);
double GetEffectiveLotSize();
double GetEffectiveSL();
double GetEffectiveTP();
double GetEffectiveTrailingStop();
double GetEffectiveTrailingStep();
int GetEffectiveMaxTrades();

//--- Global Variables
datetime  glLastSyncTime        = 0;
string    glEAVersion           = "3.05";
int       glMagicNumber         = 20260617;
bool      glTradingActive       = ${isActive ? "true" : "false"};
string    glStrategyMode        = "${selectedStrategy}";
string    glServerVersion       = "";
bool      glUpdateAvailable     = false;
bool      glNeedsHistoryPush    = true;

//--- Runtime Config Overrides (updated from server dynamically)
double    glRuntimeLotSize      = ${lotSize};
double    glRuntimeSL           = ${stopLossPoints};
double    glRuntimeTP           = ${takeProfitPoints};
double    glRuntimeTrailingStop = ${useTrailingStop ? trailingStopPoints : 0};
double    glRuntimeTrailingStep = 10;
int       glRuntimeMaxTrades    = ${maxTrades};
bool      glRuntimeConfigLoaded = false;

//--- Diagnostic State
int       glLastWebResCode      = 0;
int       glLastWebErrCode      = 0;
string    glLastDiagMsg         = "INITIALIZING...";
bool      glInternetOk          = false;

//--- EA Log Buffer (safe fixed-capacity ring buffer)
#define GL_EA_LOG_MAX 50
string    glEaLogBuffer[GL_EA_LOG_MAX];
int       glEaLogCount          = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   trade.SetExpertMagicNumber(glMagicNumber);
   trade.SetDeviationInPoints(50);

   // Auto-detect broker filling mode for Deriv & Forex brokers
   uint filling = (uint)SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_IOC) != 0)
      trade.SetTypeFilling(ORDER_FILLING_IOC);
   else if((filling & SYMBOL_FILLING_FOK) != 0)
      trade.SetTypeFilling(ORDER_FILLING_FOK);
   else
      trade.SetTypeFilling(ORDER_FILLING_RETURN);

   // Initialize 1-second timer for real-time display and telemetry
   EventSetTimer(1);

   // Initialize log buffer safely
   glEaLogCount = 0;
   for(int i = 0; i < GL_EA_LOG_MAX; i++) glEaLogBuffer[i] = "";

   glNeedsHistoryPush = true;
   glLastDiagMsg = "INITIALIZED. Awaiting first tick...";

   Print("Scalar AI EA v", glEAVersion, " initialized on ", _Symbol, ". Target Server: ", InpWebServerUrl);
   EaLogPush("INFO", "Scalar AI EA v" + glEAVersion + " initialized on " + _Symbol);

   Comment("==============================================\\n" +
           "  SCALAR AI MULTI-ASSET EA v" + glEAVersion + "\\n" +
           "  Symbol: " + _Symbol + " (" + IntegerToString(_Digits) + " Digits)\\n" +
           "  Status: INITIALIZED - Awaiting live ticks\\n" +
           "  Target Server: " + InpWebServerUrl + "\\n" +
           "  Allow WebRequest in MT5 Tools -> Options!\\n" +
           "==============================================");

   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
   Print("Scalar AI EA stopped on ", _Symbol, ". Reason code: ", reason);
  }

//+------------------------------------------------------------------+
//| Expert timer function (keeps chart display live every second)    |
//+------------------------------------------------------------------+
void OnTimer()
  {
   double currentBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double currentAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(currentBid > 0 && currentAsk > 0)
     {
      UpdateChartDisplay(currentBid, currentAsk);
     }
  }

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
  {
   double currentBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double currentAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(currentBid <= 0 || currentAsk <= 0) return;

   // 1. One-time candle history upload on initial tick
   if(glNeedsHistoryPush)
     {
      glNeedsHistoryPush = false;
      PushHistoricalCandles(150);
     }

   // 2. Stream real-time market tick to Web & MCP (throttled to max 1 per second to prevent chart freeze)
   datetime now = TimeCurrent();
   static datetime lastBroadcastTime = 0;
   if(InpSendTicksToWeb && (now - lastBroadcastTime >= 1))
     {
      BroadcastMarketUpdate();
      lastBroadcastTime = now;
     }

   // 3. Periodic synchronization & remote command processor
   if(now - glLastSyncTime >= InpSyncIntervalSec)
     {
      SyncWithWebApp();
      glLastSyncTime = now;
     }

   // 4. Trailing stop management for open positions
   if(glTradingActive)
     {
      ManageTrailingStop(currentBid, currentAsk);
     }

   // 5. Update chart telemetry display
   UpdateChartDisplay(currentBid, currentAsk);
  }

//+------------------------------------------------------------------+
//| Push historical candle data to backend in a single JSON batch    |
//+------------------------------------------------------------------+
void PushHistoricalCandles(int count)
  {
   if(count > 200) count = 200;
   if(count <= 0) return;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, _Period, 0, count, rates);
   if(copied <= 0)
     {
      Print("[HISTORY] CopyRates returned ", copied, ". Broker history still loading.");
      return;
     }

   string url = InpWebServerUrl + "/api/market/bulk-candles";
   string headers = "Content-Type: application/json\\r\\n";
   int timeout = 5000;

   string jsonCandles = "[";
   for(int i = copied - 1; i >= 0; i--)
     {
      string direction = (rates[i].close > rates[i].open) ? "up" :
                         ((rates[i].close < rates[i].open) ? "down" : "flat");
      string item = "{\\"time\\":" + IntegerToString((long)rates[i].time) +
                    ",\\"open\\":" + DoubleToString(rates[i].open, _Digits) +
                    ",\\"high\\":" + DoubleToString(rates[i].high, _Digits) +
                    ",\\"low\\":" + DoubleToString(rates[i].low, _Digits) +
                    ",\\"close\\":" + DoubleToString(rates[i].close, _Digits) +
                    ",\\"volume\\":" + IntegerToString((long)rates[i].tick_volume) +
                    ",\\"direction\\":\\"" + direction + "\\"}";
      StringAdd(jsonCandles, item);
      if(i > 0) StringAdd(jsonCandles, ",");
     }
   StringAdd(jsonCandles, "]");

   string payload = "{\\"symbol\\":\\"" + _Symbol + "\\",\\"digits\\":" + IntegerToString(_Digits) + ",\\"tickSize\\":" + DoubleToString(_Point, _Digits) + ",\\"candles\\":" + jsonCandles + "}";

   char post[], result[];
   string resultHeaders;
   int postLen = StringLen(payload);
   StringToCharArray(payload, post, 0, postLen, CP_UTF8);

   ResetLastError();
   int res = WebRequest("POST", url, headers, timeout, post, result, resultHeaders);
   if(res == 200)
     {
      Print("[HISTORY] Successfully uploaded ", copied, " historical candles for ", _Symbol);
     }
   else
     {
      Print("[HISTORY] Candle upload returned status ", res, ", error: ", _LastError);
     }
  }

//+------------------------------------------------------------------+
//| Broadcast live tick candle data to Dashboard Graph & MCP         |
//+------------------------------------------------------------------+
void BroadcastMarketUpdate()
  {
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, _Period, 0, 1, rates);
   if(copied <= 0) return;

   double currentBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double currentAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(currentBid <= 0 || currentAsk <= 0) return;

   double o = rates[0].open;
   double h = rates[0].high;
   double l = rates[0].low;
   double c = rates[0].close;
   long v = rates[0].tick_volume;
   datetime ct = TimeCurrent();

   string formatted_time = TimeToString(ct, TIME_DATE|TIME_SECONDS);
   string update_url = InpDashboardUrl;

   string payload = "{\\"symbol\\":\\"" + _Symbol + "\\"" +
                    ",\\"open\\":" + DoubleToString(o, _Digits) +
                    ",\\"high\\":" + DoubleToString(h, _Digits) +
                    ",\\"low\\":" + DoubleToString(l, _Digits) +
                    ",\\"close\\":" + DoubleToString(c, _Digits) +
                    ",\\"price\\":" + DoubleToString(c, _Digits) +
                    ",\\"bid\\":" + DoubleToString(currentBid, _Digits) +
                    ",\\"ask\\":" + DoubleToString(currentAsk, _Digits) +
                    ",\\"digits\\":" + IntegerToString(_Digits) +
                    ",\\"tickSize\\":" + DoubleToString(_Point, _Digits) +
                    ",\\"volume\\":" + IntegerToString(v) +
                    ",\\"current_time\\":\\"" + formatted_time + "\\"}";

   char post[], result[];
   string resultHeaders;
   int postLen = StringLen(payload);
   StringToCharArray(payload, post, 0, postLen, CP_UTF8);

   string headers = "Content-Type: application/json\\r\\n";
   ResetLastError();
   WebRequest("POST", update_url, headers, 3000, post, result, resultHeaders);
  }

//+------------------------------------------------------------------+
//| Connect / Sync with full stack Web App API                       |
//+------------------------------------------------------------------+
void SyncWithWebApp()
  {
   string url = InpWebServerUrl + "/api/ea/tick";
   string headers = "Content-Type: application/json\\r\\n";
   char post[], result[];
   string resultHeaders;
   int timeout = 5000;

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double profit  = AccountInfoDouble(ACCOUNT_PROFIT);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin  = AccountInfoDouble(ACCOUNT_MARGIN);
   string company = EscapeJsonString(AccountInfoString(ACCOUNT_COMPANY));
   long   login   = AccountInfoInteger(ACCOUNT_LOGIN);

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(bid <= 0) bid = SymbolInfoDouble(_Symbol, SYMBOL_LAST);
   if(ask <= 0) ask = bid;

   string payload = "{\\"account\\":\\"" + IntegerToString(login) + "\\"" +
                    ",\\"broker\\":\\"" + company + "\\"" +
                    ",\\"balance\\":" + DoubleToString(balance, 2) +
                    ",\\"profit\\":" + DoubleToString(profit, 2) +
                    ",\\"equity\\":" + DoubleToString(equity, 2) +
                    ",\\"margin\\":" + DoubleToString(margin, 2) +
                    ",\\"symbol\\":\\"" + _Symbol + "\\"" +
                    ",\\"bid\\":" + DoubleToString(bid, _Digits) +
                    ",\\"ask\\":" + DoubleToString(ask, _Digits) +
                    ",\\"price\\":" + DoubleToString(bid, _Digits) +
                    ",\\"digits\\":" + IntegerToString(_Digits) +
                    ",\\"tickSize\\":" + DoubleToString(_Point, _Digits) +
                    ",\\"strategy\\":\\"" + glStrategyMode + "\\"" +
                    ",\\"version\\":\\"" + glEAVersion + "\\"}";

   int postLen = StringLen(payload);
   StringToCharArray(payload, post, 0, postLen, CP_UTF8);

   ResetLastError();
   int res = WebRequest("POST", url, headers, timeout, post, result, resultHeaders);
   glLastWebResCode = res;
   glLastWebErrCode = _LastError;

   if(res == -1)
     {
      glInternetOk = false;
      int err = glLastWebErrCode;
      if(err == 4014)
        {
         glLastDiagMsg = "ERROR 4014: WebRequest blocked. Allow '" + InpWebServerUrl + "' in MT5 Tools -> Options -> Expert Advisors!";
         EaLogPush("ERROR", "WebRequest blocked (4014). Allow URL in MT5 Options.");
        }
      else if(err == 5200)
        {
         glLastDiagMsg = "ERROR 5200: URL parsing failure. Check web link inputs!";
         EaLogPush("ERROR", "URL parsing failure (5200).");
        }
      else if(err == 5203)
        {
         glLastDiagMsg = "ERROR 5203: Host unreachable. Verify server is online!";
         EaLogPush("ERROR", "Host unreachable (5203).");
        }
      else
        {
         glLastDiagMsg = "CONNECTION FAULT. Error code: " + IntegerToString(err);
         EaLogPush("ERROR", "Connection fault: " + IntegerToString(err));
        }
     }
   else if(res == 200)
     {
      glInternetOk = true;
      glLastDiagMsg = "SYNC NORMAL. Communication line operational.";
      string jsonResponse = CharArrayToString(result);

      if(StringFind(jsonResponse, "\\"isActive\\":true") >= 0)
        {
         glTradingActive = true;
        }
      else if(StringFind(jsonResponse, "\\"isActive\\":false") >= 0)
        {
         if(glTradingActive)
           {
            glTradingActive = false;
            EaLogPush("WARN", "Trading deactivated by server. Closing open positions.");
            CloseAllPositions();
           }
         glTradingActive = false;
        }

      // Sync active strategy mode
      if(StringFind(jsonResponse, "\\"selectedStrategy\\":\\"TREND_FOLLOWING\\"") >= 0) glStrategyMode = "TREND_FOLLOWING";
      else if(StringFind(jsonResponse, "\\"selectedStrategy\\":\\"MEAN_REVERSION\\"") >= 0) glStrategyMode = "MEAN_REVERSION";
      else if(StringFind(jsonResponse, "\\"selectedStrategy\\":\\"AI_ADAPTIVE\\"") >= 0) glStrategyMode = "AI_ADAPTIVE";

      // Execute remote trading commands
      ProcessPendingRemoteCommands(jsonResponse, bid, ask);

      // Report current positions back to web app
      if(InpSendPositions)
        {
         SyncPositions();
        }

      // Check for remote EA version updates
      CheckForEaUpdate();

      // Ship buffered diagnostic logs to server
      ShipEaLogsToServer();
     }
   else
     {
      glInternetOk = false;
      glLastDiagMsg = "HTTP REJECTED. Status: " + IntegerToString(res);
     }
  }

//+------------------------------------------------------------------+
//| Volume normalization helper                                      |
//+------------------------------------------------------------------+
double NormalizeVolume(double volume)
  {
   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double stepLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(minLot <= 0) minLot = 0.01;
   if(stepLot <= 0) stepLot = 0.01;
   if(volume < minLot) volume = minLot;
   if(maxLot > 0 && volume > maxLot) volume = maxLot;
   volume = MathFloor(volume / stepLot + 0.00001) * stepLot;
   return NormalizeDouble(volume, 2);
  }

//+------------------------------------------------------------------+
//| Process batch of remote commands from web app                    |
//+------------------------------------------------------------------+
void ProcessPendingRemoteCommands(string jsonResponse, double bid, double ask)
  {
   string dq = CharToString(34);
   string commandsKey = dq + "pendingCommands" + dq + ":";

   int commandsPos = StringFind(jsonResponse, commandsKey);

   // Fallback to legacy single-command format if pendingCommands array is not found
   if(commandsPos < 0)
     {
      string legacyActionKey = dq + "pendingAction" + dq + ":" + dq;
      int legPos = StringFind(jsonResponse, legacyActionKey);
      if(legPos >= 0)
        {
         int legStart = legPos + StringLen(legacyActionKey);
         int legEnd = StringFind(jsonResponse, dq, legStart);
         if(legEnd > legStart)
           {
            string legAction = StringSubstr(jsonResponse, legStart, legEnd - legStart);
            if(legAction != "NONE" && legAction != "")
              {
               double legLot = InpLotSize;
               string lotKey = dq + "pendingLot" + dq + ":";
               int lPos = StringFind(jsonResponse, lotKey);
               if(lPos >= 0)
                 {
                  int lStart = lPos + StringLen(lotKey);
                  int lEnd = StringFind(jsonResponse, ",", lStart);
                  if(lEnd < 0) lEnd = StringFind(jsonResponse, "}", lStart);
                  if(lEnd > lStart) legLot = StringToDouble(StringSubstr(jsonResponse, lStart, lEnd - lStart));
                 }
               double legSL = 0, legTP = 0;
               string slKey = dq + "pendingSL" + dq + ":";
               int slP = StringFind(jsonResponse, slKey);
               if(slP >= 0)
                 {
                  int sStart = slP + StringLen(slKey);
                  int sEnd = StringFind(jsonResponse, ",", sStart);
                  if(sEnd < 0) sEnd = StringFind(jsonResponse, "}", sStart);
                  if(sEnd > sStart) legSL = StringToDouble(StringSubstr(jsonResponse, sStart, sEnd - sStart));
                 }
               string tpKey = dq + "pendingTP" + dq + ":";
               int tpP = StringFind(jsonResponse, tpKey);
               if(tpP >= 0)
                 {
                  int tStart = tpP + StringLen(tpKey);
                  int tEnd = StringFind(jsonResponse, ",", tStart);
                  if(tEnd < 0) tEnd = StringFind(jsonResponse, "}", tStart);
                  if(tEnd > tStart) legTP = StringToDouble(StringSubstr(jsonResponse, tStart, tEnd - tStart));
                 }

               int stopsLevel = (int)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
               double minStopDist = stopsLevel * _Point;
               legLot = NormalizeVolume(legLot);

               if(legAction == "BUY")
                 {
                  int bCnt = 0, sCnt = 0;
                  CountPositions(bCnt, sCnt);
                  if(sCnt == 0 && bCnt == 0)
                    {
                     double slPr = (legSL > 0) ? NormalizeDouble(ask - MathMax(legSL * _Point, minStopDist), _Digits) : 0;
                     double tpPr = (legTP > 0) ? NormalizeDouble(ask + MathMax(legTP * _Point, minStopDist), _Digits) : 0;
                     ResetLastError();
                     if(trade.Buy(legLot, _Symbol, ask, slPr, tpPr, "Scalar AI Buy"))
                       {
                        Print("[ORDER] Legacy BUY executed on ", _Symbol, " Lot: ", legLot);
                        ReportExecutionResult("BUY", 0, (ulong)trade.ResultOrder(), true, "");
                       }
                     else
                       {
                        Print("[ORDER] Legacy BUY failed: ", trade.ResultRetcode());
                        ReportExecutionResult("BUY", 0, 0, false, "Code: " + IntegerToString(trade.ResultRetcode()));
                       }
                    }
                 }
               else if(legAction == "SELL")
                 {
                  int bCnt = 0, sCnt = 0;
                  CountPositions(bCnt, sCnt);
                  if(bCnt == 0 && sCnt == 0)
                    {
                     double slPr = (legSL > 0) ? NormalizeDouble(bid + MathMax(legSL * _Point, minStopDist), _Digits) : 0;
                     double tpPr = (legTP > 0) ? NormalizeDouble(bid - MathMax(legTP * _Point, minStopDist), _Digits) : 0;
                     ResetLastError();
                     if(trade.Sell(legLot, _Symbol, bid, slPr, tpPr, "Scalar AI Sell"))
                       {
                        Print("[ORDER] Legacy SELL executed on ", _Symbol, " Lot: ", legLot);
                        ReportExecutionResult("SELL", 0, (ulong)trade.ResultOrder(), true, "");
                       }
                     else
                       {
                        Print("[ORDER] Legacy SELL failed: ", trade.ResultRetcode());
                        ReportExecutionResult("SELL", 0, 0, false, "Code: " + IntegerToString(trade.ResultRetcode()));
                       }
                    }
                 }
               else if(legAction == "CLOSE_ALL")
                 {
                  CloseAllPositions();
                  ReportExecutionResult("CLOSE_ALL", 0, 0, true, "");
                 }
              }
           }
        }
      return;
     }

   int arrayStart = StringFind(jsonResponse, "[", commandsPos);
   if(arrayStart < 0) return;
   int arrayEnd = StringFind(jsonResponse, "]", arrayStart);
   if(arrayEnd < 0) return;

   string commandsArray = StringSubstr(jsonResponse, arrayStart, arrayEnd - arrayStart + 1);
   if(commandsArray == "[]") return;

   int pos = 0;
   int processedCount = 0;

   int stopsLevel = (int)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minStopDist = stopsLevel * _Point;

   while(true)
     {
      int cmdStart = StringFind(commandsArray, "{", pos);
      if(cmdStart < 0) break;
      int cmdEnd = StringFind(commandsArray, "}", cmdStart);
      if(cmdEnd < 0) break;

      string cmdObj = StringSubstr(commandsArray, cmdStart, cmdEnd - cmdStart + 1);
      pos = cmdEnd + 1;
      processedCount++;

      // Extract action
      string actionKey = dq + "action" + dq + ":";
      int actionPos = StringFind(cmdObj, actionKey);
      if(actionPos < 0) continue;
      int actionStart = actionPos + StringLen(actionKey);
      int aQuote1 = StringFind(cmdObj, dq, actionStart);
      if(aQuote1 < 0) continue;
      int aQuote2 = StringFind(cmdObj, dq, aQuote1 + 1);
      if(aQuote2 <= aQuote1) continue;
      string action = StringSubstr(cmdObj, aQuote1 + 1, aQuote2 - aQuote1 - 1);

      // Extract lot
      double pLot = InpLotSize;
      string lotKey = dq + "lot" + dq + ":";
      int lotPos = StringFind(cmdObj, lotKey);
      if(lotPos >= 0)
        {
         int lStart = lotPos + StringLen(lotKey);
         int lEnd = StringFind(cmdObj, ",", lStart);
         if(lEnd < 0) lEnd = StringFind(cmdObj, "}", lStart);
         if(lEnd > lStart) pLot = StringToDouble(StringSubstr(cmdObj, lStart, lEnd - lStart));
        }
      pLot = NormalizeVolume(pLot);

      // Extract SL
      double pSL = 0;
      string slKey = dq + "sl" + dq + ":";
      int slPos = StringFind(cmdObj, slKey);
      if(slPos >= 0)
        {
         int sStart = slPos + StringLen(slKey);
         int sEnd = StringFind(cmdObj, ",", sStart);
         if(sEnd < 0) sEnd = StringFind(cmdObj, "}", sStart);
         if(sEnd > sStart) pSL = StringToDouble(StringSubstr(cmdObj, sStart, sEnd - sStart));
        }

      // Extract TP
      double pTP = 0;
      string tpKey = dq + "tp" + dq + ":";
      int tpPos = StringFind(cmdObj, tpKey);
      if(tpPos >= 0)
        {
         int tStart = tpPos + StringLen(tpKey);
         int tEnd = StringFind(cmdObj, ",", tStart);
         if(tEnd < 0) tEnd = StringFind(cmdObj, "}", tStart);
         if(tEnd > tStart) pTP = StringToDouble(StringSubstr(cmdObj, tStart, tEnd - tStart));
        }

      // Extract ticket (as ulong)
      ulong pTicket = 0;
      string ticketKey = dq + "ticket" + dq + ":";
      int ticketPos = StringFind(cmdObj, ticketKey);
      if(ticketPos >= 0)
        {
         int tkStart = ticketPos + StringLen(ticketKey);
         int tkEnd = StringFind(cmdObj, ",", tkStart);
         if(tkEnd < 0) tkEnd = StringFind(cmdObj, "}", tkStart);
         if(tkEnd > tkStart) pTicket = (ulong)StringToInteger(StringSubstr(cmdObj, tkStart, tkEnd - tkStart));
        }

      // Extract symbol
      string pSymbol = _Symbol;
      string symbolKey = dq + "symbol" + dq + ":";
      int symPos = StringFind(cmdObj, symbolKey);
      if(symPos >= 0)
        {
         int smQuote1 = StringFind(cmdObj, dq, symPos + StringLen(symbolKey));
         if(smQuote1 >= 0)
           {
            int smQuote2 = StringFind(cmdObj, dq, smQuote1 + 1);
            if(smQuote2 > smQuote1) pSymbol = StringSubstr(cmdObj, smQuote1 + 1, smQuote2 - smQuote1 - 1);
           }
        }

      // Execute action
      if(action == "BUY")
        {
         int buyCount = 0, sellCount = 0;
         CountPositions(buyCount, sellCount);

         if(sellCount > 0)
           {
            Print("[SIGNAL] Anti-hedging lock: BUY blocked by active SELL on ", pSymbol);
            EaLogPush("WARN", "BUY blocked: opposite SELL active");
            ReportExecutionResult("BUY", pTicket, 0, false, "Opposite SELL position active");
           }
         else if(buyCount < GetEffectiveMaxTrades())
           {
            double slPrice = (pSL > 0) ? NormalizeDouble(ask - MathMax(pSL * _Point, minStopDist), _Digits) : 0;
            double tpPrice = (pTP > 0) ? NormalizeDouble(ask + MathMax(pTP * _Point, minStopDist), _Digits) : 0;
            ResetLastError();
            if(trade.Buy(pLot, pSymbol, ask, slPrice, tpPrice, "Scalar AI Buy"))
              {
               ulong orderTicket = (ulong)trade.ResultOrder();
               Print("[TRADE] BUY SUCCESS on ", pSymbol, "! Ticket: ", orderTicket, " Lot: ", pLot, " Ask: ", ask, " SL: ", slPrice, " TP: ", tpPrice);
               EaLogPush("SUCCESS", "BUY executed on " + pSymbol + " Lot: " + DoubleToString(pLot, 2));
               ReportExecutionResult("BUY", pTicket, orderTicket, true, "");
              }
            else
              {
               Print("[TRADE] BUY FAILED on ", pSymbol, ". RetCode: ", trade.ResultRetcode());
               EaLogPush("ERROR", "BUY failed. RetCode: " + IntegerToString(trade.ResultRetcode()));
               ReportExecutionResult("BUY", pTicket, 0, false, "RetCode: " + IntegerToString(trade.ResultRetcode()));
              }
           }
         else
           {
            ReportExecutionResult("BUY", pTicket, 0, false, "Max concurrent trades reached");
           }
        }
      else if(action == "SELL")
        {
         int buyCount = 0, sellCount = 0;
         CountPositions(buyCount, sellCount);

         if(buyCount > 0)
           {
            Print("[SIGNAL] Anti-hedging lock: SELL blocked by active BUY on ", pSymbol);
            EaLogPush("WARN", "SELL blocked: opposite BUY active");
            ReportExecutionResult("SELL", pTicket, 0, false, "Opposite BUY position active");
           }
         else if(sellCount < GetEffectiveMaxTrades())
           {
            double slPrice = (pSL > 0) ? NormalizeDouble(bid + MathMax(pSL * _Point, minStopDist), _Digits) : 0;
            double tpPrice = (pTP > 0) ? NormalizeDouble(bid - MathMax(pTP * _Point, minStopDist), _Digits) : 0;
            ResetLastError();
            if(trade.Sell(pLot, pSymbol, bid, slPrice, tpPrice, "Scalar AI Sell"))
              {
               ulong orderTicket = (ulong)trade.ResultOrder();
               Print("[TRADE] SELL SUCCESS on ", pSymbol, "! Ticket: ", orderTicket, " Lot: ", pLot, " Bid: ", bid, " SL: ", slPrice, " TP: ", tpPrice);
               EaLogPush("SUCCESS", "SELL executed on " + pSymbol + " Lot: " + DoubleToString(pLot, 2));
               ReportExecutionResult("SELL", pTicket, orderTicket, true, "");
              }
            else
              {
               Print("[TRADE] SELL FAILED on ", pSymbol, ". RetCode: ", trade.ResultRetcode());
               EaLogPush("ERROR", "SELL failed. RetCode: " + IntegerToString(trade.ResultRetcode()));
               ReportExecutionResult("SELL", pTicket, 0, false, "RetCode: " + IntegerToString(trade.ResultRetcode()));
              }
           }
         else
           {
            ReportExecutionResult("SELL", pTicket, 0, false, "Max concurrent trades reached");
           }
        }
      else if(action == "CLOSE_ALL")
        {
         Print("[COMMAND] CLOSE_ALL received. Liquidating positions on ", _Symbol);
         CloseAllPositions();
         ReportExecutionResult("CLOSE_ALL", pTicket, 0, true, "");
        }
      else if(action == "CLOSE_BY_TICKET")
        {
         Print("[COMMAND] Closing position ticket #", pTicket);
         ClosePositionByTicket(pTicket);
         ReportExecutionResult("CLOSE_BY_TICKET", pTicket, pTicket, true, "");
        }
      else if(action == "MODIFY_POSITION" || action == "UPDATE_SL_TP")
        {
         Print("[COMMAND] Modifying SL/TP for position ticket #", pTicket, " SL pts: ", pSL, " TP pts: ", pTP);
         ModifyPosition(pTicket, pSL, pTP);
        }
      else if(action == "CONFIG_UPDATE")
        {
         ApplyRuntimeConfigUpdate(cmdObj);
         ReportExecutionResult("CONFIG_UPDATE", pTicket, 0, true, "");
        }
     }

   if(processedCount > 0)
     {
      Print("[COMMANDS] Processed ", processedCount, " remote trade command(s).");
     }
  }

//+------------------------------------------------------------------+
//| Modify position Stop Loss and Take Profit                        |
//+------------------------------------------------------------------+
void ModifyPosition(ulong ticket, double slPoints, double tpPoints)
  {
   if(PositionsTotal() <= 0) return;

   int stopsLevel = (int)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minStopDist = stopsLevel * _Point;

   ulong targetTicket = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong posTicket = PositionGetTicket(i);
      if(posTicket <= 0) continue;
      if(posTicket == ticket && PositionGetString(POSITION_SYMBOL) == _Symbol)
        {
         targetTicket = posTicket;
         break;
        }
     }

   if(targetTicket == 0)
     {
      // Fallback: match open position for this EA on this symbol
      for(int i = PositionsTotal() - 1; i >= 0; i--)
        {
         ulong posTicket = PositionGetTicket(i);
         if(posTicket <= 0) continue;
         if(PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == glMagicNumber)
           {
            targetTicket = posTicket;
            break;
           }
        }
     }

   if(targetTicket == 0) return;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong posTicket = PositionGetTicket(i);
      if(posTicket == targetTicket)
        {
         double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
         long posType = PositionGetInteger(POSITION_TYPE);
         double currentSL = PositionGetDouble(POSITION_SL);
         double currentTP = PositionGetDouble(POSITION_TP);

         double newSL = currentSL;
         double newTP = currentTP;

         if(posType == POSITION_TYPE_BUY)
           {
            if(slPoints > 0) newSL = NormalizeDouble(openPrice - MathMax(slPoints * _Point, minStopDist), _Digits);
            if(tpPoints > 0) newTP = NormalizeDouble(openPrice + MathMax(tpPoints * _Point, minStopDist), _Digits);
           }
         else if(posType == POSITION_TYPE_SELL)
           {
            if(slPoints > 0) newSL = NormalizeDouble(openPrice - MathMax(slPoints * _Point, minStopDist), _Digits);
            if(tpPoints > 0) newTP = NormalizeDouble(openPrice - MathMax(tpPoints * _Point, minStopDist), _Digits);
           }

         ResetLastError();
         if(trade.PositionModify(posTicket, newSL, newTP))
           {
            Print("[MODIFY] Successfully updated position #", posTicket, " SL: ", newSL, " TP: ", newTP);
            EaLogPush("SUCCESS", "Position #" + IntegerToString((long)posTicket) + " SL/TP modified");
            ReportExecutionResult("MODIFY_POSITION", ticket, posTicket, true, "");
           }
         else
           {
            Print("[MODIFY] Failed to modify position #", posTicket, ". RetCode: ", trade.ResultRetcode());
            ReportExecutionResult("MODIFY_POSITION", ticket, posTicket, false, "RetCode: " + IntegerToString(trade.ResultRetcode()));
           }
         return;
        }
     }
  }

//+------------------------------------------------------------------+
//| Close all positions belonging to this EA                         |
//+------------------------------------------------------------------+
void CloseAllPositions()
  {
   int closedCount = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == glMagicNumber)
        {
         if(trade.PositionClose(ticket))
           {
            closedCount++;
           }
        }
     }
   if(closedCount > 0)
     {
      Print("[CLOSE] Closed ", closedCount, " position(s) on ", _Symbol);
      EaLogPush("INFO", "Liquidated " + IntegerToString(closedCount) + " position(s)");
     }
  }

//+------------------------------------------------------------------+
//| Close specific position by ticket                                |
//+------------------------------------------------------------------+
void ClosePositionByTicket(ulong ticket)
  {
   if(PositionsTotal() <= 0) return;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong posTicket = PositionGetTicket(i);
      if(posTicket <= 0) continue;
      if(posTicket == ticket)
        {
         trade.PositionClose(posTicket);
         Print("[CLOSE] Closed position ticket #", ticket);
         EaLogPush("INFO", "Closed position #" + IntegerToString((long)ticket));
         return;
        }
     }

   // Fallback: match by symbol and magic number if only 1 position
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong posTicket = PositionGetTicket(i);
      if(posTicket <= 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == glMagicNumber)
        {
         trade.PositionClose(posTicket);
         Print("[CLOSE] Closed position ticket #", posTicket, " (requested site ticket: #", ticket, ")");
         EaLogPush("INFO", "Closed position #" + IntegerToString((long)posTicket));
         return;
        }
     }
  }

//+------------------------------------------------------------------+
//| Count active positions with our magic number                     |
//+------------------------------------------------------------------+
void CountPositions(int &buyCount, int &sellCount)
  {
   buyCount = 0;
   sellCount = 0;
   for(int i = 0; i < PositionsTotal(); i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == glMagicNumber)
        {
         long posType = PositionGetInteger(POSITION_TYPE);
         if(posType == POSITION_TYPE_BUY) buyCount++;
         else if(posType == POSITION_TYPE_SELL) sellCount++;
        }
     }
  }

//+------------------------------------------------------------------+
//| Manage trailing stop logic                                        |
//+------------------------------------------------------------------+
void ManageTrailingStop(double bid, double ask)
  {
   double trailPts = GetEffectiveTrailingStop();
   if(trailPts <= 0) return;

   double stepPts = GetEffectiveTrailingStep();
   int stopsLevel = (int)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minStopDist = stopsLevel * _Point;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != glMagicNumber) continue;

      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double currentSL = PositionGetDouble(POSITION_SL);
      double currentTP = PositionGetDouble(POSITION_TP);
      long posType = PositionGetInteger(POSITION_TYPE);

      if(posType == POSITION_TYPE_BUY)
        {
         if((bid - openPrice) > (trailPts * _Point))
           {
            double newSL = NormalizeDouble(bid - trailPts * _Point, _Digits);
            if((currentSL == 0 || (newSL - currentSL) >= (stepPts * _Point)) && (bid - newSL) >= minStopDist)
              {
               if(trade.PositionModify(ticket, newSL, currentTP))
                 {
                  Print("[TRAILING STOP] BUY #", ticket, " SL updated to ", newSL);
                  EaLogPush("INFO", "Trailing SL updated for BUY #" + IntegerToString((long)ticket));
                 }
              }
           }
        }
      else if(posType == POSITION_TYPE_SELL)
        {
         if((openPrice - ask) > (trailPts * _Point))
           {
            double newSL = NormalizeDouble(ask + trailPts * _Point, _Digits);
            if((currentSL == 0 || (currentSL - newSL) >= (stepPts * _Point)) && (newSL - ask) >= minStopDist)
              {
               if(trade.PositionModify(ticket, newSL, currentTP))
                 {
                  Print("[TRAILING STOP] SELL #", ticket, " SL updated to ", newSL);
                  EaLogPush("INFO", "Trailing SL updated for SELL #" + IntegerToString((long)ticket));
                 }
              }
           }
        }
     }
  }

//+------------------------------------------------------------------+
//| Report execution result back to web app                          |
//+------------------------------------------------------------------+
void ReportExecutionResult(string action, ulong siteTicket, ulong mt5Ticket, bool success, string error)
  {
   string url = InpWebServerUrl + "/api/ea/confirm";
   string headers = "Content-Type: application/json\\r\\n";
   int timeout = 5000;
   string payload = "{\\"action\\":\\"" + action + "\\"" +
                    ",\\"ticket\\":" + IntegerToString((long)siteTicket) +
                    ",\\"mt5Ticket\\":" + IntegerToString((long)mt5Ticket) +
                    ",\\"success\\":" + (success ? "true" : "false") +
                    ",\\"error\\":\\"" + EscapeJsonString(error) + "\\"" +
                    ",\\"symbol\\":\\"" + _Symbol + "\\"" +
                    ",\\"magic\\":" + IntegerToString(glMagicNumber) + "}";

   char post[], result[];
   string resultHeaders;
   int postLen = StringLen(payload);
   StringToCharArray(payload, post, 0, postLen, CP_UTF8);

   ResetLastError();
   WebRequest("POST", url, headers, timeout, post, result, resultHeaders);
  }

//+------------------------------------------------------------------+
//| Sync positions with web app                                      |
//+------------------------------------------------------------------+
void SyncPositions()
  {
   string url = InpWebServerUrl + "/api/ea/positions";
   string headers = "Content-Type: application/json\\r\\n";
   int timeout = 5000;

   string positionsArray = "[";
   int posCount = 0;

   for(int i = 0; i < PositionsTotal(); i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != glMagicNumber) continue;

      if(posCount > 0) StringAdd(positionsArray, ",");

      double volume = PositionGetDouble(POSITION_VOLUME);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double tp = PositionGetDouble(POSITION_TP);
      double profit = PositionGetDouble(POSITION_PROFIT);
      long type = PositionGetInteger(POSITION_TYPE);
      string typeStr = (type == POSITION_TYPE_BUY) ? "BUY" : "SELL";
      string openTime = TimeToString((datetime)PositionGetInteger(POSITION_TIME), TIME_DATE|TIME_SECONDS);

      string posObj = "{\\"ticket\\":" + IntegerToString((long)ticket) +
                      ",\\"type\\":\\"" + typeStr + "\\"" +
                      ",\\"volume\\":" + DoubleToString(volume, 2) +
                      ",\\"openPrice\\":" + DoubleToString(openPrice, _Digits) +
                      ",\\"sl\\":" + DoubleToString(sl, _Digits) +
                      ",\\"tp\\":" + DoubleToString(tp, _Digits) +
                      ",\\"profit\\":" + DoubleToString(profit, 2) +
                      ",\\"openTime\\":\\"" + openTime + "\\"}";

      StringAdd(positionsArray, posObj);
      posCount++;
     }
   StringAdd(positionsArray, "]");

   string payload = "{\\"symbol\\":\\"" + _Symbol + "\\",\\"magic\\":" + IntegerToString(glMagicNumber) + ",\\"positions\\":" + positionsArray + "}";

   char post[], result[];
   string resultHeaders;
   int postLen = StringLen(payload);
   StringToCharArray(payload, post, 0, postLen, CP_UTF8);

   ResetLastError();
   WebRequest("POST", url, headers, timeout, post, result, resultHeaders);
  }

//+------------------------------------------------------------------+
//| Helper: fetch updated EA code from server                        |
//+------------------------------------------------------------------+
string FetchEaCodeFromServer()
  {
   string url = InpWebServerUrl + "/api/ea/code";
   string headers = "Content-Type: application/json\\r\\n";
   char post[], result[];
   string resultHeaders;
   int timeout = 10000;

   ResetLastError();
   ArrayResize(post, 0);
   int res = WebRequest("GET", url, headers, timeout, post, result, resultHeaders);
   if(res == 200)
     {
      return CharArrayToString(result);
     }
   return "";
  }

//+------------------------------------------------------------------+
//| Helper: write EA code to MQL5/Files for easy recompile           |
//+------------------------------------------------------------------+
bool SaveUpdateFile(string code)
  {
   string filePath = "ScalarAI_Update.mq5";
   int handle = FileOpen(filePath, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(handle == INVALID_HANDLE)
     {
      return false;
     }
   FileWriteString(handle, code);
   FileClose(handle);
   return true;
  }

//+------------------------------------------------------------------+
//| Check for EA code updates from server                            |
//+------------------------------------------------------------------+
void CheckForEaUpdate()
  {
   if(glUpdateAvailable) return;

   string url = InpWebServerUrl + "/api/ea/version";
   string headers = "Content-Type: application/json\\r\\n";
   char post[], result[];
   string resultHeaders;
   int timeout = 5000;

   ResetLastError();
   ArrayResize(post, 0);
   int res = WebRequest("GET", url, headers, timeout, post, result, resultHeaders);
   if(res != 200) return;

   string jsonResponse = CharArrayToString(result);
   string versionKey = "\\"version\\":\\"";
   int versionPos = StringFind(jsonResponse, versionKey);
   if(versionPos < 0) return;

   int versionStart = versionPos + StringLen(versionKey);
   int versionEnd = StringFind(jsonResponse, "\\"", versionStart);
   if(versionEnd < versionStart) return;

   string serverVersion = StringSubstr(jsonResponse, versionStart, versionEnd - versionStart);
   if(serverVersion != "" && serverVersion != glEAVersion)
     {
      glServerVersion = serverVersion;
      glUpdateAvailable = true;
      Print("[UPDATE] New EA version available on server: ", serverVersion, " (Current: ", glEAVersion, ")");

      string newCode = FetchEaCodeFromServer();
      if(newCode != "")
        {
         if(SaveUpdateFile(newCode))
           {
            Print("[UPDATE] Updated code saved to MQL5/Files/ScalarAI_Update.mq5");
            glLastDiagMsg = "UPDATE v" + serverVersion + " READY in MQL5/Files/ScalarAI_Update.mq5";
           }
        }
     }
  }

//+------------------------------------------------------------------+
//| Apply runtime config update from server                          |
//+------------------------------------------------------------------+
void ApplyRuntimeConfigUpdate(const string &jsonConfig)
  {
   string dq = CharToString(34);

   // Parse lotSize
   string lotKey = dq + "lotSize" + dq + ":";
   int lotPos = StringFind(jsonConfig, lotKey);
   if(lotPos >= 0)
     {
      int start = lotPos + StringLen(lotKey);
      int end = StringFind(jsonConfig, ",", start);
      if(end < 0) end = StringFind(jsonConfig, "}", start);
      if(end > start) glRuntimeLotSize = StringToDouble(StringSubstr(jsonConfig, start, end - start));
     }

   // Parse stopLossPoints
   string slKey = dq + "stopLossPoints" + dq + ":";
   int slPos = StringFind(jsonConfig, slKey);
   if(slPos >= 0)
     {
      int start = slPos + StringLen(slKey);
      int end = StringFind(jsonConfig, ",", start);
      if(end < 0) end = StringFind(jsonConfig, "}", start);
      if(end > start) glRuntimeSL = StringToDouble(StringSubstr(jsonConfig, start, end - start));
     }

   // Parse takeProfitPoints
   string tpKey = dq + "takeProfitPoints" + dq + ":";
   int tpPos = StringFind(jsonConfig, tpKey);
   if(tpPos >= 0)
     {
      int start = tpPos + StringLen(tpKey);
      int end = StringFind(jsonConfig, ",", start);
      if(end < 0) end = StringFind(jsonConfig, "}", start);
      if(end > start) glRuntimeTP = StringToDouble(StringSubstr(jsonConfig, start, end - start));
     }

   // Parse trailingStopPoints
   string tsKey = dq + "trailingStopPoints" + dq + ":";
   int tsPos = StringFind(jsonConfig, tsKey);
   if(tsPos >= 0)
     {
      int start = tsPos + StringLen(tsKey);
      int end = StringFind(jsonConfig, ",", start);
      if(end < 0) end = StringFind(jsonConfig, "}", start);
      if(end > start) glRuntimeTrailingStop = StringToDouble(StringSubstr(jsonConfig, start, end - start));
     }

   // Parse maxTrades
   string maxKey = dq + "maxTrades" + dq + ":";
   int maxPos = StringFind(jsonConfig, maxKey);
   if(maxPos >= 0)
     {
      int start = maxPos + StringLen(maxKey);
      int end = StringFind(jsonConfig, ",", start);
      if(end < 0) end = StringFind(jsonConfig, "}", start);
      if(end > start) glRuntimeMaxTrades = (int)StringToInteger(StringSubstr(jsonConfig, start, end - start));
     }

   glRuntimeConfigLoaded = true;
   Print("[CONFIG] Runtime configuration updated: Lot=", glRuntimeLotSize, " SL=", glRuntimeSL, " TP=", glRuntimeTP, " Trail=", glRuntimeTrailingStop);
  }

//+------------------------------------------------------------------+
//| Effective parameter getters with runtime overrides                |
//+------------------------------------------------------------------+
double GetEffectiveLotSize()
  {
   if(glRuntimeConfigLoaded && glRuntimeLotSize > 0) return glRuntimeLotSize;
   return InpLotSize;
  }

double GetEffectiveSL()
  {
   if(glRuntimeConfigLoaded && glRuntimeSL > 0) return glRuntimeSL;
   return ${stopLossPoints};
  }

double GetEffectiveTP()
  {
   if(glRuntimeConfigLoaded && glRuntimeTP > 0) return glRuntimeTP;
   return ${takeProfitPoints};
  }

double GetEffectiveTrailingStop()
  {
   if(glRuntimeConfigLoaded && glRuntimeTrailingStop > 0) return glRuntimeTrailingStop;
   return ${useTrailingStop ? trailingStopPoints : 0};
  }

double GetEffectiveTrailingStep()
  {
   if(glRuntimeConfigLoaded && glRuntimeTrailingStep > 0) return glRuntimeTrailingStep;
   return 10;
  }

int GetEffectiveMaxTrades()
  {
   if(glRuntimeConfigLoaded && glRuntimeMaxTrades > 0) return glRuntimeMaxTrades;
   return InpMaxTrades;
  }

//+------------------------------------------------------------------+
//| EA Log Buffer helpers                                             |
//+------------------------------------------------------------------+
void EaLogPush(string level, string message)
  {
   string entry = TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + " [" + level + "] " + message;
   if(glEaLogCount < GL_EA_LOG_MAX)
     {
      glEaLogBuffer[glEaLogCount] = entry;
      glEaLogCount++;
     }
   else
     {
      for(int i = 1; i < GL_EA_LOG_MAX; i++)
        {
         glEaLogBuffer[i - 1] = glEaLogBuffer[i];
        }
      glEaLogBuffer[GL_EA_LOG_MAX - 1] = entry;
     }
  }

string EscapeJsonString(string str)
  {
   StringReplace(str, "\\\\", "\\\\\\\\");
   StringReplace(str, "\\"", "\\\\\\"");
   StringReplace(str, "\\r", " ");
   StringReplace(str, "\\n", " ");
   return str;
  }

void ShipEaLogsToServer()
  {
   if(glEaLogCount <= 0) return;

   string url = InpWebServerUrl + "/api/ea/logs";
   string headers = "Content-Type: application/json\\r\\n";
   int timeout = 3000;

   string logsArray = "[";
   for(int i = 0; i < glEaLogCount; i++)
     {
      if(i > 0) StringAdd(logsArray, ",");
      string safeMsg = EscapeJsonString(glEaLogBuffer[i]);
      string logObj = "{\\"level\\":\\"INFO\\",\\"message\\":\\"" + safeMsg + "\\",\\"timestamp\\":\\"" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\\"}";
      StringAdd(logsArray, logObj);
     }
   StringAdd(logsArray, "]");

   string payload = "{\\"logs\\":" + logsArray + "}";

   char post[], result[];
   string resultHeaders;
   int postLen = StringLen(payload);
   StringToCharArray(payload, post, 0, postLen, CP_UTF8);

   ResetLastError();
   WebRequest("POST", url, headers, timeout, post, result, resultHeaders);
   glEaLogCount = 0;
  }

//+------------------------------------------------------------------+
//| Render telemetry on MetaTrader Chart interface                   |
//+------------------------------------------------------------------+
void UpdateChartDisplay(double bid, double ask)
  {
   string connStatus = (glLastSyncTime > 0) ? "CONNECTED & IN SYNC" : "OFFLINE / DISCONNECTED";
   string tradeStatus = glTradingActive ? "ACTIVE & EXECUTING (SERVER AUTHORITATIVE)" : "STOPPED / MONITORING ONLY";

   string termAlgoEnabled = TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) ? "YES (ALGO TRADING IS ON)" : "NO (CLICK ALGO TRADING BUTTON ON MT5 TOOLBAR!)";
   string eaTradeAllowed  = MQLInfoInteger(MQL_TRADE_ALLOWED) ? "YES (ALLOWED)" : "NO (CHECK 'Allow Algo Trading' IN EA PROPERTIES!)";

   Comment("==============================================\\n" +
           "       SCALAR AI MULTI-ASSET TRADING PLATFORM \\n" +
           "==============================================\\n" +
           "  Active Symbol   : " + _Symbol + " (" + IntegerToString(_Digits) + " Digits)\\n" +
           "  Strategy Mode   : " + glStrategyMode + "\\n" +
           "  Trading Status  : " + tradeStatus + "\\n" +
           "  Server API Link : " + connStatus + "\\n" +
           "  Last Sync Time  : " + TimeToString(glLastSyncTime, TIME_DATE|TIME_SECONDS) + "\\n" +
           "==============================================\\n" +
           "  [MT5 TERMINAL PERMISSIONS]\\n" +
           "  1. Toolbar Algo Button Active : " + termAlgoEnabled + "\\n" +
           "  2. EA Trading Allowed In Props: " + eaTradeAllowed + "\\n" +
           "  3. Server Response HTTP Code  : " + IntegerToString(glLastWebResCode) + " (Expected: 200)\\n" +
           "  4. Status Message             : " + glLastDiagMsg + "\\n" +
           "==============================================\\n" +
           "  [ACCOUNT TELEMETRY]\\n" +
           "  Bid: " + DoubleToString(bid, _Digits) + " | Ask: " + DoubleToString(ask, _Digits) + "\\n" +
           "  Broker: " + AccountInfoString(ACCOUNT_COMPANY) + " | Login: " + IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN)) + "\\n" +
           "  Balance: $" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + " | Equity: $" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + "\\n" +
           "==============================================");
  }
//+------------------------------------------------------------------+
`;
}
