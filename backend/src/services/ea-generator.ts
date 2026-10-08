import { TradeConfig } from "../types";
import fs from "fs";
import path from "path";
import { saveCustomEaTemplate, getCustomEaTemplate } from "./ea-remote-update";

function validateAppUrl(appUrl: string | undefined): string {
  const raw = (appUrl || "").trim().replace(/\/$/, "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname.startsWith("192.168.") ||
      parsed.hostname.startsWith("10.") ||
      parsed.hostname.startsWith("172.")
    ) {
      if (process.env.NODE_ENV === "production") {
        return "";
      }
    }
    return raw;
  } catch {
    return "";
  }
}

function getCustomEaTemplatePath(): string {
  return path.join(process.cwd(), "backend", "generated-ea", "ScalarAI_MultiAsset_EA.mq5");
}

export function generateMql5Code(appUrl?: string, config?: Partial<TradeConfig>): string {
  const customTemplate = getCustomEaTemplate();
  if (customTemplate) {
    return customTemplate;
  }
  const clientUrl = validateAppUrl(appUrl) || "http://127.0.0.1:3000";
  const escapedUrl = clientUrl.replace(/\\/g, "\\\\");
  const lotSize = config?.lotSize ?? 0.1;
  const selectedStrategy = config?.selectedStrategy ?? "TREND_FOLLOWING";
  const isActive = config?.isActive ?? false;

  return `//+------------------------------------------------------------------+
//|                                     ScalarAI_MultiAsset_EA.mq5    |
//|                         Copyright 2026, Scalar AI Technologies    |
//|                                             https://ai.studio/build|
//+------------------------------------------------------------------+
#property copyright "Scalar AI Technologies"
#property link      "${escapedUrl}"
#property version   "3.01"
#property description "Scalar AI Multi-Asset Remote Execution EA"
#property description "Executes trades from web app only. No local strategy."
#property description "IMPORTANT: Add '${escapedUrl}' to MT5 allowed WebRequest URLs!"

//--- Include standard trade library
#include <Trade\\Trade.mqh>
CTrade trade;

//--- Expert Input Parameters
input group "=== Risk Settings ==="
input double   InpLotSize         = ${lotSize};        // Lot Size to Trade
input string   InpStrategyMode    = "${selectedStrategy}"; // Strategy mode label

input group "=== Web App API Integration ==="
input string   InpWebServerUrl    = "${escapedUrl}";         // Web App Base URL
input string   InpDashboardUrl    = "${escapedUrl}/api/update-market"; // Dashboard Live Feed URL
input int      InpSyncIntervalSec = 2;                      // Sync interval in seconds
input bool     InpSendTicksToWeb  = true;                   // Broadcast live ticks to web
input bool     InpSendPositions   = true;                   // Send positions on each sync

//--- Forward function declarations (required by MQL5 compiler)
void PushHistoricalCandles(int count);
void BroadcastMarketUpdate();
void SyncWithWebApp();
void ProcessPendingRemoteCommands(string jsonResponse, double bid, double ask);
void ReportExecutionResult(string action, int ticket, bool success, string error);
void SyncPositions();
void UpdateChartDisplay(double bid, double ask);
void CheckForEaUpdate();
void ApplyRuntimeConfigUpdate(const string &jsonConfig);
string FetchEaCodeFromServer();
bool SaveUpdateFile(string code);
void EaLogPush(string level, string message);
string EscapeJsonString(string str);
void ShipEaLogsToServer();

//--- Global Variables
datetime  glLastSyncTime  = 0;
string    glEAVersion     = "3.01";
int       glMagicNumber   = 20260617;
bool      glTradingActive = ${isActive ? "true" : "false"};
string    glStrategyMode  = "${selectedStrategy}";
string    glServerVersion = "";
bool      glUpdateAvailable = false;
string    glUpdateFilePath = "MQL5/Files/ScalarAI_Update.mq5";

//--- Runtime Config Overrides (from server)
double    glRuntimeLotSize = 0;
double    glRuntimeSL = 0;
double    glRuntimeTP = 0;
double    glRuntimeTrailingStop = 0;
double    glRuntimeTrailingStep = 0;
int       glRuntimeMaxTrades = 0;
bool      glRuntimeConfigLoaded = false;

//--- EA Log Buffer for remote diagnostics
string    glEaLogBuffer[];
int       glEaLogCount = 0;
const int GL_EA_LOG_MAX = 50;

//--- Connection Diagnostics
int       glLastWebResCode = 0;
int       glLastWebErrCode = 0;
string    glLastDiagMsg    = "WAITING FOR FIRST TICK TO SYNC...";
bool      glInternetOk     = false;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   trade.SetExpertMagicNumber(glMagicNumber);
    Print("Scalar AI EA v3 Initialized on ", _Symbol, ". Web URL: ", InpWebServerUrl);
    // UNIQUE_MARKER_XYZ123: ArrayResize before EaLogPush
    ArrayResize(glEaLogBuffer, GL_EA_LOG_MAX);
    glEaLogCount = 0;
    
    EaLogPush("INFO", "EA initialized on " + _Symbol + " v" + glEAVersion);
   
   // Push recent historical candles to the web backend in a single fast batch
   PushHistoricalCandles(150);
   
   Comment("==============================================\\n" +
           "  SCALAR AI MULTI-ASSET EA v3\\n" +
           "  Symbol: " + _Symbol + "\\n" +
           "  Status: INITIALIZED\\n" +
           "  Mode: REMOTE EXECUTION ONLY\\n" +
           "  Web Feed URL: " + InpDashboardUrl + "\\n" +
           "  Lot Size: " + DoubleToString(InpLotSize, 2) + "\\n" +
           "  Allow WebRequests in Options for updates!\\n" +
           "==============================================");
           
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   Comment("Scalar AI EA Stopped on " + _Symbol + ".");
   Print("EA shutdown code: ", reason);
  }

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
  {
   double currentBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double currentAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(currentBid <= 0 || currentAsk <= 0) return;
   
   // 1. Broadcast live market updates to Dashboard & MCP
   if(InpSendTicksToWeb)
     {
      BroadcastMarketUpdate();
     }

   // 2. Periodic Web Telemetry synchronization & remote command updates
   datetime now = TimeCurrent();
   if(now - glLastSyncTime >= InpSyncIntervalSec)
     {
      SyncWithWebApp();
      glLastSyncTime = now;
     }
   
   // 3. Update chart telemetry metrics
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
      Print("[HISTORY] CopyRates failed. Copied: ", copied, ". Broker history may be loading.");
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
      string item = StringFormat(
         "{\\"time\\":%I64d,\\"open\\":%.5f,\\"high\\":%.5f,\\"low\\":%.5f,\\"close\\":%.5f,\\"volume\\":%I64d,\\"direction\\":\\"%s\\"}",
         (long)rates[i].time,
         rates[i].open,
         rates[i].high,
         rates[i].low,
         rates[i].close,
         (long)rates[i].tick_volume,
         direction
      );
      jsonCandles = jsonCandles + item;
      if(i > 0) jsonCandles = jsonCandles + ",";
     }
   jsonCandles = jsonCandles + "]";

   string payload = StringFormat(
      "{\\"symbol\\":\\"%s\\",\\"digits\\":%d,\\"tickSize\\":%.6f,\\"candles\\":%s}",
      _Symbol, (int)_Digits, _Point, jsonCandles
   );

   char post[], result[];
   string resultHeaders;
   StringToCharArray(payload, post);
   ArrayResize(post, ArraySize(post) - 1);

   ResetLastError();
   int res = WebRequest("POST", url, headers, timeout, post, result, resultHeaders);
   if(res == 200)
     {
      Print("[HISTORY] Successfully uploaded ", copied, " historical candles for ", _Symbol);
     }
   else
     {
      Print("[HISTORY] Push historical candles returned status ", res, ", error: ", _LastError);
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

   string payload = StringFormat(
      "{\\"symbol\\":\\"%s\\",\\"open\\":%.5f,\\"high\\":%.5f,\\"low\\":%.5f,\\"close\\":%.5f,\\"price\\":%.5f,\\"bid\\":%.5f,\\"ask\\":%.5f,\\"digits\\":%d,\\"tickSize\\":%.6f,\\"volume\\":%I64d,\\"current_time\\":\\"%s\\"}",
      _Symbol, o, h, l, c, c, currentBid, currentAsk, (int)_Digits, _Point, (long)v, formatted_time
   );

   char post[], result[];
   string resultHeaders;
   StringToCharArray(payload, post);
   ArrayResize(post, ArraySize(post) - 1);

   string headers = "Content-Type: application/json\\r\\n";
   ResetLastError();
   int res = WebRequest("POST", update_url, headers, 3000, post, result, resultHeaders);
   if(res == -1)
     {
      if(MathRand() % 100 == 0) {
         Print("[BROADCAST ERROR] WebRequest update-market failed. Error: ", _LastError);
         Print("Ensure URL is allowed in Options: ", InpDashboardUrl);
      }
     }
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
   int timeout = 30000;
   
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double profit = AccountInfoDouble(ACCOUNT_PROFIT);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin = AccountInfoDouble(ACCOUNT_MARGIN);
   string company = AccountInfoString(ACCOUNT_COMPANY);
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(bid <= 0) bid = SymbolInfoDouble(_Symbol, SYMBOL_LAST);
   if(ask <= 0) ask = bid;
   
   string payload = StringFormat(
      "{\\"account\\":\\"%I64d\\",\\"broker\\":\\"%s\\",\\"balance\\":%.2f,\\"profit\\":%.2f,\\"equity\\":%.2f,\\"margin\\":%.2f,\\"symbol\\":\\"%s\\",\\"bid\\":%.5f,\\"ask\\":%.5f,\\"price\\":%.5f,\\"digits\\":%d,\\"tickSize\\":%.6f,\\"strategy\\":\\"%s\\",\\"version\\":\\"%s\\"}",
      login, company, balance, profit, equity, margin, _Symbol, bid, ask, bid, (int)_Digits, _Point, glStrategyMode, glEAVersion
   );
   
   StringToCharArray(payload, post);
   ArrayResize(post, ArraySize(post) - 1);
   
   ResetLastError();
   int res = WebRequest("POST", url, headers, timeout, post, result, resultHeaders);
   glLastWebResCode = res;
   glLastWebErrCode = _LastError;
   
   if(res == -1)
     {
      glInternetOk = false;
      int err = glLastWebErrCode;
      Print("Web Application connection error code: ", err);
      if(err == 4014)
        {
         glLastDiagMsg = "ERROR 4014: WebRequest is blocked. Open MT5 -> Tools -> Options -> Expert Advisors -> Allow WebRequest for: " + InpWebServerUrl;
         Print("IMPORTANT: Allow WebRequest in terminal Options -> Expert Advisors -> add URL: ", InpWebServerUrl);
         EaLogPush("ERROR", "WebRequest blocked (4014). Allow URL in MT5 options.");
        }
      else if(err == 5200)
        {
         glLastDiagMsg = "ERROR 5200: URL parsing failure. Check web link inputs!";
         EaLogPush("ERROR", "URL parsing failure (5200). Check web link inputs.");
        }
      else if(err == 5203)
        {
         glLastDiagMsg = "ERROR 5203: Host unreachable. Verify server connection!";
         EaLogPush("ERROR", "Host unreachable (5203). Verify server connection.");
        }
      else
        {
         glLastDiagMsg = "CONNECTION FAULT. Error code: " + IntegerToString(err);
         EaLogPush("ERROR", "Connection fault. Error code: " + IntegerToString(err));
        }
     }
    else if(res == 200)
      {
       glInternetOk = true;
       glLastDiagMsg = "SYNC SUCCESSFUL. Communication lines normal.";
       EaLogPush("INFO", "SYNC SUCCESSFUL. Response received from server.");
       string jsonResponse = CharArrayToString(result);
       
       if(StringFind(jsonResponse, "\\"isActive\\":true") >= 0)
         {
          glTradingActive = true;
          EaLogPush("INFO", "Trading activated by server.");
         }
       else if(StringFind(jsonResponse, "\\"isActive\\":false") >= 0)
         {
          glTradingActive = false;
          EaLogPush("WARN", "Trading deactivated by server. Closing all positions.");
          if(PositionsTotal() > 0) {
             CloseAllPositions();
          }
         }
          
       ProcessPendingRemoteCommands(jsonResponse, bid, ask);
      
      if(StringFind(jsonResponse, "\\"selectedStrategy\\":\\"TREND_FOLLOWING\\"") >= 0) glStrategyMode = "TREND_FOLLOWING";
      else if(StringFind(jsonResponse, "\\"selectedStrategy\\":\\"MEAN_REVERSION\\"") >= 0) glStrategyMode = "MEAN_REVERSION";
      else if(StringFind(jsonResponse, "\\"selectedStrategy\\":\\"AI_ADAPTIVE\\"") >= 0) glStrategyMode = "AI_ADAPTIVE";
      
       // Send positions back to web app if enabled
       if(InpSendPositions) {
          SyncPositions();
       }
       
       // Check for EA code updates (non-blocking)
       CheckForEaUpdate();
       
       // Ship buffered logs to server
       ShipEaLogsToServer();
      }
    else
      {
       glInternetOk = false;
       glLastDiagMsg = "HTTP REJECTED. Status: " + IntegerToString(res);
       EaLogPush("ERROR", "HTTP REJECTED. Status: " + IntegerToString(res));
      }
  }

//+------------------------------------------------------------------+
//| Process batch of remote commands from web app                    |
//+------------------------------------------------------------------+
void ProcessPendingRemoteCommands(string jsonResponse, double bid, double ask)
  {
   string dq = CharToString(34);
   string commandsKey = dq + "pendingCommands" + dq + ":";
   
    int commandsPos = StringFind(jsonResponse, commandsKey);
    if(commandsPos < 0) {
       Print("[COMMANDS] pendingCommands key not found in response");
       EaLogPush("WARN", "pendingCommands key not found in response");
       return;
    }
    Print("[COMMANDS] Found pendingCommands key at position: ", commandsPos);
    EaLogPush("INFO", "Found pendingCommands key in response");
    
    // Find the array start [
    int arrayStart = StringFind(jsonResponse, "[", commandsPos);
    if(arrayStart < 0) {
       Print("[COMMANDS] Array start '[' not found");
       EaLogPush("WARN", "Commands array start '[' not found");
       return;
    }
    Print("[COMMANDS] Found array start at position: ", arrayStart);
    
    // Find matching closing bracket ]
    int arrayEnd = StringFind(jsonResponse, "]", arrayStart);
    if(arrayEnd < 0) {
       Print("[COMMANDS] Array end ']' not found");
       EaLogPush("WARN", "Commands array end ']' not found");
       return;
    }
    Print("[COMMANDS] Found array end at position: ", arrayEnd);
    
    string commandsArray = StringSubstr(jsonResponse, arrayStart, arrayEnd - arrayStart + 1);
    Print("[COMMANDS] Commands array: ", commandsArray);
    EaLogPush("INFO", "Commands array: " + commandsArray);
   
   // Parse each command object in the array
   int pos = 0;
   int processedCount = 0;
   
   while(true)
     {
      int cmdStart = StringFind(commandsArray, "{", pos);
      if(cmdStart < 0) break;
      
      int cmdEnd = StringFind(commandsArray, "}", cmdStart);
      if(cmdEnd < 0) break;
      
      string cmdObj = StringSubstr(commandsArray, cmdStart, cmdEnd - cmdStart + 1);
      pos = cmdEnd + 1;
      processedCount++;
      
      Print("[COMMANDS] Processing command #", processedCount, ": ", cmdObj);
      
      // Extract action
      string actionKey = dq + "action" + dq + ":";
      int actionPos = StringFind(cmdObj, actionKey);
      if(actionPos < 0) {
         Print("[COMMANDS] action key not found in command");
         continue;
      }
      int actionStart = actionPos + StringLen(actionKey);
      int actionEnd = StringFind(cmdObj, dq, actionStart);
      if(actionEnd < actionStart) {
         Print("[COMMANDS] action value not found");
         continue;
      }
      string action = StringSubstr(cmdObj, actionStart, actionEnd - actionStart);
      Print("[COMMANDS] Parsed action: ", action);
      
      // Extract lot
      double pLot = InpLotSize;
      string lotKey = dq + "lot" + dq + ":";
      int lotPos = StringFind(cmdObj, lotKey);
      if(lotPos >= 0) {
         int lotStart = lotPos + StringLen(lotKey);
         int lotEnd = StringFind(cmdObj, ",", lotStart);
         if(lotEnd < 0) lotEnd = StringFind(cmdObj, "}", lotStart);
         if(lotEnd > lotStart) {
            pLot = StringToDouble(StringSubstr(cmdObj, lotStart, lotEnd - lotStart));
         }
      }
      
      // Extract SL
      double pSL = 0;
      string slKey = dq + "sl" + dq + ":";
      int slPos = StringFind(cmdObj, slKey);
      if(slPos >= 0) {
         int slStart = slPos + StringLen(slKey);
         int slEnd = StringFind(cmdObj, ",", slStart);
         if(slEnd < 0) slEnd = StringFind(cmdObj, "}", slStart);
         if(slEnd > slStart) {
            pSL = StringToDouble(StringSubstr(cmdObj, slStart, slEnd - slStart));
         }
      }
      
      // Extract TP
      double pTP = 0;
      string tpKey = dq + "tp" + dq + ":";
      int tpPos = StringFind(cmdObj, tpKey);
      if(tpPos >= 0) {
         int tpStart = tpPos + StringLen(tpKey);
         int tpEnd = StringFind(cmdObj, ",", tpStart);
         if(tpEnd < 0) tpEnd = StringFind(cmdObj, "}", tpStart);
         if(tpEnd > tpStart) {
            pTP = StringToDouble(StringSubstr(cmdObj, tpStart, tpEnd - tpStart));
         }
      }
      
      // Extract trailing stop
      double pTrailingStop = 0;
      string trailingStopKey = dq + "trailingStop" + dq + ":";
      int trailingStopPos = StringFind(cmdObj, trailingStopKey);
      if(trailingStopPos >= 0) {
         int tsStart = trailingStopPos + StringLen(trailingStopKey);
         int tsEnd = StringFind(cmdObj, ",", tsStart);
         if(tsEnd < 0) tsEnd = StringFind(cmdObj, "}", tsStart);
         if(tsEnd > tsStart) {
            pTrailingStop = StringToDouble(StringSubstr(cmdObj, tsStart, tsEnd - tsStart));
         }
      }
      
      // Extract trailing step
      double pTrailingStep = 0;
      string trailingStepKey = dq + "trailingStep" + dq + ":";
      int trailingStepPos = StringFind(cmdObj, trailingStepKey);
      if(trailingStepPos >= 0) {
         int tstepStart = trailingStepPos + StringLen(trailingStepKey);
         int tstepEnd = StringFind(cmdObj, ",", tstepStart);
         if(tstepEnd < 0) tstepEnd = StringFind(cmdObj, "}", tstepStart);
         if(tstepEnd > tstepStart) {
            pTrailingStep = StringToDouble(StringSubstr(cmdObj, tstepStart, tstepEnd - tstepStart));
         }
      }
      
      // Extract ticket
      int pTicket = 0;
      string ticketKey = dq + "ticket" + dq + ":";
      int ticketPos = StringFind(cmdObj, ticketKey);
      if(ticketPos >= 0) {
         int ticketStart = ticketPos + StringLen(ticketKey);
         int ticketEnd = StringFind(cmdObj, ",", ticketStart);
         if(ticketEnd < 0) ticketEnd = StringFind(cmdObj, "}", ticketStart);
         if(ticketEnd > ticketStart) {
            pTicket = (int)StringToInteger(StringSubstr(cmdObj, ticketStart, ticketEnd - ticketStart));
         }
      }
      
      // Extract symbol
      string pSymbol = _Symbol;
      string symbolKey = dq + "symbol" + dq + ":";
      int symbolPos = StringFind(cmdObj, symbolKey);
      if(symbolPos >= 0) {
         int symStart = symbolPos + StringLen(symbolKey);
         int symEnd = StringFind(cmdObj, dq, symStart);
         if(symEnd > symStart) {
            pSymbol = StringSubstr(cmdObj, symStart, symEnd - symStart);
         }
      }
      
       // Execute command
       if(action == "BUY")
         {
          int buyCount = 0, sellCount = 0;
          CountPositions(buyCount, sellCount);
          if(sellCount > 0)
            {
             Print("[REMOTE ORDER REJECTED] Cannot BUY because opposite SELL exists on ", _Symbol);
             EaLogPush("WARN", "BUY rejected: opposite SELL active");
             ReportExecutionResult("BUY", pTicket, false, "Opposite SELL position active");
            }
          else if(buyCount == 0)
            {
             double slPrice = (pSL > 0) ? NormalizeDouble(ask - pSL * _Point, _Digits) : 0;
             double tpPrice = (pTP > 0) ? NormalizeDouble(ask + pTP * _Point, _Digits) : 0;
             ResetLastError();
             if(trade.Buy(pLot, pSymbol, ask, slPrice, tpPrice, "Scalar AI Remote Buy"))
               {
                Print("[REMOTE ORDER SUCCESS] BUY executed on ", _Symbol, " Lot: ", pLot, " SL: ", slPrice, " TP: ", tpPrice);
                EaLogPush("SUCCESS", "BUY executed. Lot: " + DoubleToString(pLot, 2) + " SL: " + DoubleToString(slPrice, _Digits) + " TP: " + DoubleToString(tpPrice, _Digits));
                ReportExecutionResult("BUY", pTicket, true, "");
               }
             else
               {
                Print("[REMOTE ORDER FAILED] BUY failed. Error: ", _LastError);
                EaLogPush("ERROR", "BUY failed. Error: " + IntegerToString(_LastError));
                ReportExecutionResult("BUY", pTicket, false, "Error: " + IntegerToString(_LastError));
               }
            }
          else
            {
             Print("[REMOTE ORDER REJECTED] Active BUY already exists on ", _Symbol);
             EaLogPush("WARN", "BUY rejected: already active");
             ReportExecutionResult("BUY", pTicket, false, "BUY already active");
            }
         }
       else if(action == "SELL")
         {
          int buyCount = 0, sellCount = 0;
          CountPositions(buyCount, sellCount);
          if(buyCount > 0)
            {
             Print("[REMOTE ORDER REJECTED] Cannot SELL because opposite BUY exists on ", _Symbol);
             EaLogPush("WARN", "SELL rejected: opposite BUY active");
             ReportExecutionResult("SELL", pTicket, false, "Opposite BUY position active");
            }
          else if(sellCount == 0)
            {
             double slPrice = (pSL > 0) ? NormalizeDouble(ask + pSL * _Point, _Digits) : 0;
             double tpPrice = (pTP > 0) ? NormalizeDouble(bid - pTP * _Point, _Digits) : 0;
             ResetLastError();
             if(trade.Sell(pLot, pSymbol, bid, slPrice, tpPrice, "Scalar AI Remote Sell"))
               {
                Print("[REMOTE ORDER SUCCESS] SELL executed on ", _Symbol, " Lot: ", pLot, " SL: ", slPrice, " TP: ", tpPrice);
                EaLogPush("SUCCESS", "SELL executed. Lot: " + DoubleToString(pLot, 2) + " SL: " + DoubleToString(slPrice, _Digits) + " TP: " + DoubleToString(tpPrice, _Digits));
                ReportExecutionResult("SELL", pTicket, true, "");
               }
             else
               {
                Print("[REMOTE ORDER FAILED] SELL failed. Error: ", _LastError);
                EaLogPush("ERROR", "SELL failed. Error: " + IntegerToString(_LastError));
                ReportExecutionResult("SELL", pTicket, false, "Error: " + IntegerToString(_LastError));
               }
            }
          else
            {
             Print("[REMOTE ORDER REJECTED] Active SELL already exists on ", _Symbol);
             EaLogPush("WARN", "SELL rejected: already active");
             ReportExecutionResult("SELL", pTicket, false, "SELL already active");
            }
         }
       else if(action == "CLOSE_ALL")
         {
          Print("[REMOTE COMMAND] Received CLOSE_ALL signal for ", _Symbol, ". Liquidating open positions.");
          EaLogPush("INFO", "CLOSE_ALL received for " + _Symbol);
          CloseAllPositions();
          ReportExecutionResult("CLOSE_ALL", pTicket, true, "");
         }
       else if(action == "CLOSE_BY_TICKET")
         {
          Print("[REMOTE COMMAND] Received CLOSE_BY_TICKET for ticket ", pTicket);
          EaLogPush("INFO", "CLOSE_BY_TICKET received for ticket " + IntegerToString(pTicket));
          ClosePositionByTicket(pTicket);
          ReportExecutionResult("CLOSE_BY_TICKET", pTicket, true, "");
         }
       else if(action == "CONFIG_UPDATE")
         {
          string configKey = dq + "configUpdate" + dq + ":";
          int configPos = StringFind(cmdObj, configKey);
          if(configPos >= 0) {
             int configStart = configPos + StringLen(configKey);
             int configEnd = StringFind(cmdObj, "}", configStart);
             if(configEnd > configStart) {
                string configJson = StringSubstr(cmdObj, configStart, configEnd - configStart + 1);
                ApplyRuntimeConfigUpdate(configJson);
                ReportExecutionResult("CONFIG_UPDATE", pTicket, true, "");
             }
          }
          else {
             Print("[COMMANDS] CONFIG_UPDATE key not found");
             EaLogPush("WARN", "CONFIG_UPDATE key not found");
          }
         }
       else {
          Print("[COMMANDS] Unknown action: ", action);
          EaLogPush("WARN", "Unknown action: " + action);
       }
      }
      
      Print("[COMMANDS] Processed ", processedCount, " commands");
      EaLogPush("INFO", "Processed " + IntegerToString(processedCount) + " commands");
   }

//+------------------------------------------------------------------+
//| Close all positions with our magic number                        |
//+------------------------------------------------------------------+
void CloseAllPositions()
  {
   int closedCount = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetSymbol(i) == _Symbol && PositionGetInteger(POSITION_MAGIC) == glMagicNumber)
        {
         trade.PositionClose((ulong)PositionGetInteger(POSITION_TICKET));
         closedCount++;
        }
     }
   EaLogPush("INFO", "CloseAllPositions completed. Closed " + IntegerToString(closedCount) + " positions.");
  }

//+------------------------------------------------------------------+
//| Close specific position by ticket                                |
//+------------------------------------------------------------------+
void ClosePositionByTicket(int ticket)
  {
   bool closed = false;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetSymbol(i) == _Symbol && PositionGetInteger(POSITION_MAGIC) == glMagicNumber)
        {
         if((int)PositionGetInteger(POSITION_TICKET) == ticket)
           {
            trade.PositionClose((ulong)ticket);
            closed = true;
           }
        }
     }
   EaLogPush("INFO", "ClosePositionByTicket completed for ticket " + IntegerToString(ticket) + ". Closed: " + (closed ? "true" : "false"));
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
      if(PositionGetSymbol(i) == _Symbol && PositionGetInteger(POSITION_MAGIC) == glMagicNumber)
        {
         if(PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) buyCount++;
         else if(PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_SELL) sellCount++;
        }
     }
  }

//+------------------------------------------------------------------+
//| Helper: fetch EA code from web app                               |
//+------------------------------------------------------------------+
string FetchEaCodeFromServer()
  {
    string url = InpWebServerUrl + "/api/ea/code";
    string headers = "Content-Type: application/json\\r\\n";
    char result[];
    string resultHeaders;
    int timeout = 30000;
   
   ResetLastError();
   char post[];
   ArrayResize(post, 0);
   int res = WebRequest("GET", url, headers, timeout, post, result, resultHeaders);
   if(res == 200)
     {
      return CharArrayToString(result);
     }
   else
     {
      Print("[UPDATE] Failed to fetch EA code. Status: ", res, " Error: ", _LastError);
      return "";
     }
  }

//+------------------------------------------------------------------+
//| Helper: write EA code to MQL5/Files for user recompile          |
//+------------------------------------------------------------------+
bool SaveUpdateFile(string code)
  {
   string filePath = "MQL5/Files/ScalarAI_Update.mq5";
   int handle = FileOpen(filePath, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(handle == INVALID_HANDLE)
     {
      Print("[UPDATE] Failed to open update file. Error: ", GetLastError());
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
    char result[];
    string resultHeaders;
    int timeout = 10000;
   
   ResetLastError();
   char post[];
   ArrayResize(post, 0);
   int res = WebRequest("GET", url, headers, timeout, post, result, resultHeaders);
   if(res != 200) return;
   
   string jsonResponse = CharArrayToString(result);
    string versionKey = "\\\"version\\\":\\\"";
    int versionPos = StringFind(jsonResponse, versionKey);
    if(versionPos < 0) return;
    
    int versionStart = versionPos + StringLen(versionKey);
    int versionEnd = StringFind(jsonResponse, "\\\"", versionStart);
    if(versionEnd < versionStart) return;
   
   string serverVersion = StringSubstr(jsonResponse, versionStart, versionEnd - versionStart);
   if(serverVersion != "" && serverVersion != glEAVersion)
     {
      glServerVersion = serverVersion;
      glUpdateAvailable = true;
      
      Print("[UPDATE] New EA version available: ", serverVersion, " (current: ", glEAVersion, ")");
      Print("[UPDATE] Fetching updated code...");
      
      string newCode = FetchEaCodeFromServer();
      if(newCode != "")
        {
         if(SaveUpdateFile(newCode))
           {
            Print("[UPDATE] SUCCESS! Updated EA code saved to: MQL5/Files/ScalarAI_Update.mq5");
            Print("[UPDATE] Please open MetaEditor, compile this file, and restart the EA.");
            glLastDiagMsg = "UPDATE AVAILABLE v" + serverVersion + " - Check MQL5/Files/ScalarAI_Update.mq5";
           }
         else
           {
            Print("[UPDATE] FAILED to save update file. Check MQL5/Files permissions.");
            glLastDiagMsg = "UPDATE FAILED - Check MQL5/Files permissions";
           }
        }
      else
        {
         Print("[UPDATE] FAILED to fetch updated code from server.");
         glLastDiagMsg = "UPDATE FAILED - Could not fetch code";
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
   if(lotPos >= 0) {
      int start = lotPos + StringLen(lotKey);
      int end = StringFind(jsonConfig, ",", start);
      if(end < 0) end = StringFind(jsonConfig, "}", start);
      if(end > start) {
         glRuntimeLotSize = StringToDouble(StringSubstr(jsonConfig, start, end - start));
         Print("[CONFIG] Lot size updated to: ", glRuntimeLotSize);
      }
   }
   
   // Parse stopLossPoints
   string slKey = dq + "stopLossPoints" + dq + ":";
   int slPos = StringFind(jsonConfig, slKey);
   if(slPos >= 0) {
      int start = slPos + StringLen(slKey);
      int end = StringFind(jsonConfig, ",", start);
      if(end < 0) end = StringFind(jsonConfig, "}", start);
      if(end > start) {
         glRuntimeSL = StringToDouble(StringSubstr(jsonConfig, start, end - start));
         Print("[CONFIG] Stop Loss updated to: ", glRuntimeSL, " points");
      }
   }
   
   // Parse takeProfitPoints
   string tpKey = dq + "takeProfitPoints" + dq + ":";
   int tpPos = StringFind(jsonConfig, tpKey);
   if(tpPos >= 0) {
      int start = tpPos + StringLen(tpKey);
      int end = StringFind(jsonConfig, ",", start);
      if(end < 0) end = StringFind(jsonConfig, "}", start);
      if(end > start) {
         glRuntimeTP = StringToDouble(StringSubstr(jsonConfig, start, end - start));
         Print("[CONFIG] Take Profit updated to: ", glRuntimeTP, " points");
      }
   }
   
   // Parse trailingStopPoints
   string tsKey = dq + "trailingStopPoints" + dq + ":";
   int tsPos = StringFind(jsonConfig, tsKey);
   if(tsPos >= 0) {
      int start = tsPos + StringLen(tsKey);
      int end = StringFind(jsonConfig, ",", start);
      if(end < 0) end = StringFind(jsonConfig, "}", start);
      if(end > start) {
         glRuntimeTrailingStop = StringToDouble(StringSubstr(jsonConfig, start, end - start));
         Print("[CONFIG] Trailing Stop updated to: ", glRuntimeTrailingStop, " points");
      }
   }
   
   // Parse trailingStepPoints
   string tstepKey = dq + "trailingStepPoints" + dq + ":";
   int tstepPos = StringFind(jsonConfig, tstepKey);
   if(tstepPos >= 0) {
      int start = tstepPos + StringLen(tstepKey);
      int end = StringFind(jsonConfig, ",", start);
      if(end < 0) end = StringFind(jsonConfig, "}", start);
      if(end > start) {
         glRuntimeTrailingStep = StringToDouble(StringSubstr(jsonConfig, start, end - start));
         Print("[CONFIG] Trailing Step updated to: ", glRuntimeTrailingStep, " points");
      }
   }
   
   // Parse maxTrades
   string maxKey = dq + "maxTrades" + dq + ":";
   int maxPos = StringFind(jsonConfig, maxKey);
   if(maxPos >= 0) {
      int start = maxPos + StringLen(maxKey);
      int end = StringFind(jsonConfig, ",", start);
      if(end < 0) end = StringFind(jsonConfig, "}", start);
      if(end > start) {
         glRuntimeMaxTrades = (int)StringToInteger(StringSubstr(jsonConfig, start, end - start));
         Print("[CONFIG] Max Trades updated to: ", glRuntimeMaxTrades);
      }
   }
   
   glRuntimeConfigLoaded = true;
   Print("[CONFIG] Runtime configuration updated successfully.");
  }

//+------------------------------------------------------------------+
//| Helper: get effective lot size with runtime override             |
//+------------------------------------------------------------------+
double GetEffectiveLotSize()
  {
   if(glRuntimeConfigLoaded && glRuntimeLotSize > 0) return glRuntimeLotSize;
   return InpLotSize;
  }

//+------------------------------------------------------------------+
//| Helper: get effective SL with runtime override                   |
//+------------------------------------------------------------------+
double GetEffectiveSL()
  {
   if(glRuntimeConfigLoaded && glRuntimeSL > 0) return glRuntimeSL;
   return 0;
  }

//+------------------------------------------------------------------+
//| Helper: get effective TP with runtime override                   |
//+------------------------------------------------------------------+
double GetEffectiveTP()
  {
   if(glRuntimeConfigLoaded && glRuntimeTP > 0) return glRuntimeTP;
   return 0;
  }

//+------------------------------------------------------------------+
//| Helper: get effective trailing stop with runtime override        |
//+------------------------------------------------------------------+
double GetEffectiveTrailingStop()
  {
   if(glRuntimeConfigLoaded && glRuntimeTrailingStop > 0) return glRuntimeTrailingStop;
   return 0;
  }

//+------------------------------------------------------------------+
//| Helper: get effective trailing step with runtime override        |
//+------------------------------------------------------------------+
double GetEffectiveTrailingStep()
  {
   if(glRuntimeConfigLoaded && glRuntimeTrailingStep > 0) return glRuntimeTrailingStep;
   return 0;
  }

//+------------------------------------------------------------------+
//| Helper: get effective max trades with runtime override           |
//+------------------------------------------------------------------+
int GetEffectiveMaxTrades()
  {
   if(glRuntimeConfigLoaded && glRuntimeMaxTrades > 0) return glRuntimeMaxTrades;
   return 10;
  }

//+------------------------------------------------------------------+
//| EA Log Buffer helpers                                             |
//+------------------------------------------------------------------+
void EaLogPush(string level, string message)
  {
   string entry = TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + " [" + level + "] " + message;
   if(glEaLogCount >= GL_EA_LOG_MAX)
     {
      for(int i = 1; i < GL_EA_LOG_MAX; i++)
        {
         glEaLogBuffer[i-1] = glEaLogBuffer[i];
        }
      glEaLogBuffer[GL_EA_LOG_MAX-1] = entry;
     }
   else
     {
      glEaLogBuffer[glEaLogCount] = entry;
      glEaLogCount++;
     }
  }

string EscapeJsonString(string str)
   {
    string result = "";
    int len = StringLen(str);
    for(int i = 0; i < len; i++)
      {
       string ch = StringSubstr(str, i, 1);
       if(ch == "\\\"")
         {
          result = result + "\\\"";
         }
       else if(ch == "\\\\")
         {
          result = result + "\\\\";
         }
       else
         {
          result = result + ch;
         }
      }
    return result;
   }

void ShipEaLogsToServer()
   {
   if(glEaLogCount <= 0) return;
   
    string url = InpWebServerUrl + "/api/ea/logs";
    string headers = "Content-Type: application/json";
    int timeout = 5000;
   
   string logsArray = "[";
   for(int i = 0; i < glEaLogCount; i++)
     {
      if(i > 0) logsArray = logsArray + ",";
       string safeMsg = EscapeJsonString(glEaLogBuffer[i]);
      logsArray = logsArray + StringFormat("{\\\"level\\\":\\\"INFO\\\",\\\"message\\\":\\\"%s\\\",\\\"timestamp\\\":\\\"%s\\\"}", safeMsg, TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS));
     }
   logsArray = logsArray + "]";
   
    string payload = StringFormat("{\\\"logs\\\":%s}", logsArray);
   
   char post[];
   ArrayResize(post, 0);
   char result[];
   string resultHeaders;
   StringToCharArray(payload, post);
   ArrayResize(post, ArraySize(post) - 1);
   
   ResetLastError();
   int res = WebRequest("POST", url, headers, timeout, post, result, resultHeaders);
   if(res == 200)
     {
      Print("[LOGS] Successfully shipped ", glEaLogCount, " log entries to server");
     }
   else
     {
      Print("[LOGS] Failed to ship logs. Status: ", res, " Error: ", _LastError);
     }
   
   glEaLogCount = 0;
   ArrayFree(glEaLogBuffer);
  }

//+------------------------------------------------------------------+
//| Report execution result back to web app                          |
//+------------------------------------------------------------------+
void ReportExecutionResult(string action, int ticket, bool success, string error)
  {
    string url = InpWebServerUrl + "/api/ea/confirm";
    string headers = "Content-Type: application/json\\r\\n";
    int timeout = 5000;
    string payload = StringFormat(
      "{\\\"action\\\":\\\"%s\\\",\\\"ticket\\\":%d,\\\"success\\\":%s,\\\"error\\\":\\\"%s\\\",\\\"symbol\\\":\\\"%s\\\",\\\"magic\\\":%d}",
      action, ticket, success ? "true" : "false", error, _Symbol, glMagicNumber
    );
   char post[], result[];
   string resultHeaders;
   StringToCharArray(payload, post);
   ArrayResize(post, ArraySize(post) - 1);
   
   ResetLastError();
   int res = WebRequest("POST", url, headers, timeout, post, result, resultHeaders);
   if(res != 200)
     {
      Print("[CONFIRM] Failed to report execution result. Status: ", res, " Error: ", _LastError);
     }
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
      if(PositionGetSymbol(i) == _Symbol && PositionGetInteger(POSITION_MAGIC) == glMagicNumber)
        {
         if(posCount > 0) positionsArray = positionsArray + ",";
         
         ulong ticket = (ulong)PositionGetInteger(POSITION_TICKET);
         double volume = PositionGetDouble(POSITION_VOLUME);
         double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
         double sl = PositionGetDouble(POSITION_SL);
         double tp = PositionGetDouble(POSITION_TP);
         double profit = PositionGetDouble(POSITION_PROFIT);
         int type = (int)PositionGetInteger(POSITION_TYPE);
         string typeStr = (type == POSITION_TYPE_BUY) ? "BUY" : "SELL";
         string openTime = TimeToString((datetime)PositionGetInteger(POSITION_TIME), TIME_DATE|TIME_SECONDS);
         
         string posObj = StringFormat(
            "{\\"ticket\\":%I64d,\\"type\\":\\"%s\\",\\"volume\\":%.2f,\\"openPrice\\":%.5f,\\"sl\\":%.5f,\\"tp\\":%.5f,\\"profit\\":%.2f,\\"openTime\\":\\"%s\\"}",
            ticket, typeStr, volume, openPrice, sl, tp, profit, openTime
         );
         
         positionsArray = positionsArray + posObj;
         posCount++;
        }
     }
   positionsArray = positionsArray + "]";
   
   string payload = StringFormat(
      "{\\"symbol\\":\\"%s\\",\\"magic\\":%d,\\"positions\\":%s}",
      _Symbol, glMagicNumber, positionsArray
   );
   
   char post[], result[];
   string resultHeaders;
   StringToCharArray(payload, post);
   ArrayResize(post, ArraySize(post) - 1);
   
    ResetLastError();
    int res = WebRequest("POST", url, headers, timeout, post, result, resultHeaders);
    if(res == 200)
      {
       EaLogPush("INFO", "Position sync successful. Reported " + IntegerToString(posCount) + " positions.");
      }
    else
      {
       Print("[POSITIONS] Failed to sync positions. Status: ", res, " Error: ", _LastError);
       EaLogPush("ERROR", "Failed to sync positions. Status: " + IntegerToString(res) + " Error: " + IntegerToString(_LastError));
      }
   }

//+------------------------------------------------------------------+
//| Render telemetry on MetaTrader Chart interface                   |
//+------------------------------------------------------------------+
void UpdateChartDisplay(double bid, double ask)
  {
   string connStatus = (glLastSyncTime > 0) ? "CONNECTED & IN SYNC" : "OFFLINE / DISCONNECTED";
   string tradeStatus = glTradingActive ? "ACTIVE & EXECUTING" : "STOPPED / MONITORING ONLY";
   
   string termAlgoEnabled = TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) ? "YES (Terminal Button is ON)" : "NO (CLICK ALGO TRADING BUTTON ON MT5 TOOLBAR!)";
   string eaTradeAllowed = MQLInfoInteger(MQL_TRADE_ALLOWED) ? "YES (EA Trade is ALLOWED)" : "NO (Allow Algorithmic Trading checkbox in EA Properties is OFF!)";
   
   Comment("==============================================\\n" +
           "       SCALAR AI MULTI-ASSET TRADING PLATFORM \\n" +
           "==============================================\\n" +
           "  Active Symbol  : " + _Symbol + " (" + IntegerToString(_Digits) + " Digits)\\n" +
           "  Strategy Mode  : " + glStrategyMode + "\\n" +
           "  Trading Status : " + tradeStatus + "\\n" +
           "  Server API Link: " + connStatus + "\\n" +
           "  Last Sync Time : " + TimeToString(glLastSyncTime, TIME_DATE|TIME_SECONDS) + "\\n" +
           "==============================================\\n" +
           "  [LIVE DIAGNOSTIC STATUS]\\n" +
           "  1. Toolbar Algo Button Active : " + termAlgoEnabled + "\\n" +
           "  2. Master EA Trade Allowed    : " + eaTradeAllowed + "\\n" +
           "  3. Server Response HTTP Code  : " + IntegerToString(glLastWebResCode) + " (Expected: 200)\\n" +
           "  4. Internal MT5 Error Code    : " + IntegerToString(glLastWebErrCode) + " (Expected: 0)\\n" +
           "  5. DIAGNOSIS MESSAGE          : " + glLastDiagMsg + "\\n" +
           "==============================================\\n" +
           "  [ACCOUNT METRICS]\\n" +
           "  Bid: " + DoubleToString(bid, _Digits) + " | Ask: " + DoubleToString(ask, _Digits) + "\\n" +
           "  Login: " + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + " | " + AccountInfoString(ACCOUNT_COMPANY) + "\\n" +
           "  Balance: $" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + " | Equity: $" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) + "\\n" +
           "==============================================");
  }
//+------------------------------------------------------------------+
 `;
}



