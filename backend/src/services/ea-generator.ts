import { TradeConfig } from "../types";

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

export function generateMql5Code(appUrl?: string, config?: Partial<TradeConfig>): string {
  const clientUrl = validateAppUrl(appUrl) || "http://127.0.0.1:3000";
  const escapedUrl = clientUrl.replace(/\\/g, "\\\\");
  const lotSize = config?.lotSize ?? 0.1;
  const maxTrades = config?.maxTrades ?? 3;
  const takeProfitPoints = config?.takeProfitPoints ?? 300;
  const stopLossPoints = config?.stopLossPoints ?? 150;
  const useTrailingStop = config?.useTrailingStop ?? true;
  const trailingStopPoints = config?.trailingStopPoints ?? 100;
  const selectedStrategy = config?.selectedStrategy ?? "TREND_FOLLOWING";
  const isActive = config?.isActive ?? false;

  return `//+------------------------------------------------------------------+
 //|                                     StepIndex_AI_Scalper_EA.mq5   |
 //|                         Copyright 2026, Step Index MT5 Copilot Ltd. |
 //|                                             https://ai.studio/build |
 //+------------------------------------------------------------------+
 #property copyright "Step Index MT5 Copilot"
 #property link      "${escapedUrl}"
 #property version   "1.50"
 #property description "Step Index Ultimate Scalper & Swing EA with Web Live Sync"
 #property description "Reads and streams real market charts directly to the dashboard."
 #property description "IMPORTANT: Add '${escapedUrl}' to MT5 allowed WebRequest URLs!"

//--- include trade library
#include <Trade\\Trade.mqh>
CTrade trade;

//--- Expert Input Parameters
input group "=== Risk Settings ==="
input double   InpLotSize         = ${lotSize};        // Lot Size to Trade
input int      InpMaxTrades       = ${maxTrades};       // Maximum open positions
input double   InpTakeProfitPts   = ${takeProfitPoints};   // Take Profit (Points)
input double   InpStopLossPts     = ${stopLossPoints};     // Stop Loss (Points)

input group "=== Trailing Settings ==="
input bool     InpUseTrailing     = ${useTrailingStop};    // Enable Trailing Stop
input double   InpTrailingStopPts = ${trailingStopPoints}; // Trailing Stop Distance (Pts)
input double   InpTrailingStepPts = 50;                     // Trailing Step (Pts)

input group "=== Trading Mode & Filters ==="
enum ENUM_TRADING_MODE {
   MODE_SCALPING = 0, // Scalping Mode (Tick/M1 micro structures)
   MODE_SWING    = 1  // Swing Trading (Focus strictly on Confirmed Candle Closes)
};
input ENUM_TRADING_MODE InpTradingMode = MODE_SCALPING; // Trading Mode Selector
input double   InpMinAtrFilter    = 0.05;               // Minimum ATR Volatility Filter (Pt)

input group "=== Web App API Integration ==="
input string   InpWebServerUrl    = "${escapedUrl}";         // Web App Base URL (Telemetry & Command Sync)
input string   InpDashboardUrl    = "${clientUrl}/api/update-market"; // Dashboard Live Price Feed URL
input int      InpSyncIntervalSec = 3;                      // Heartbeat interval in seconds
input bool     InpSendTicksToWeb  = true;                   // Broadcast live candle data to web graph

//--- Indicator Handles
int glEmaFastHandle = INVALID_HANDLE;
int glEmaSlowHandle = INVALID_HANDLE;
int glAdxHandle     = INVALID_HANDLE;
int glBbHandle      = INVALID_HANDLE;
int glStochHandle   = INVALID_HANDLE;
int glAtrHandle     = INVALID_HANDLE;

//--- Global Variables
datetime  glLastSyncTime  = 0;
string    glEAVersion     = "1.50";
int       glMagicNumber   = 20260617;
bool      glTradingActive = ${isActive ? "true" : "false"};
string    glStrategyMode  = "${selectedStrategy}";

//--- Connection Diagnostics
int       glLastWebResCode = 0;            // HTTP response code (e.g. 200, 404, or -1)
int       glLastWebErrCode = 0;            // Terminal system error code (e.g. 4014)
string    glLastDiagMsg    = "WAITING FOR FIRST TICK TO SYNC...";
bool      glInternetOk     = false;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   trade.SetExpertMagicNumber(glMagicNumber);
   Print("Step Index Quantum EA Initiated. Web URL: ", InpWebServerUrl);
   
   // Create indicator handles
   glEmaFastHandle = iMA(_Symbol, _Period, 9, 0, MODE_EMA, PRICE_CLOSE);
   glEmaSlowHandle = iMA(_Symbol, _Period, 21, 0, MODE_EMA, PRICE_CLOSE);
   glAdxHandle     = iADX(_Symbol, _Period, 14);
   glBbHandle      = iBands(_Symbol, _Period, 20, 0, 2, PRICE_CLOSE);
   glStochHandle   = iStochastic(_Symbol, _Period, 5, 3, 3, MODE_SMA, STO_LOWHIGH);
   glAtrHandle     = iATR(_Symbol, _Period, 14);

    if(glEmaFastHandle == INVALID_HANDLE || glEmaSlowHandle == INVALID_HANDLE ||
       glAdxHandle == INVALID_HANDLE || glBbHandle == INVALID_HANDLE ||
       glStochHandle == INVALID_HANDLE || glAtrHandle == INVALID_HANDLE)
      {
       Print("CRITICAL: Failed to create mathematical indicator handles!");
       return(INIT_FAILED);
      }
    
    PushHistoricalCandles(1000);
    
    // Create indicator comments on chart
   Comment("==============================================\\n" +
           "  STEP INDEX QUANTUM EA ONLINE\\n" +
           "  Status: INITIALIZED & INDICATORS LOADED\\n" +
           "  Trading Mode: " + (InpTradingMode == MODE_SCALPING ? "SCALPING" : "SWING TRADING") + "\\n" +
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
   IndicatorRelease(glEmaFastHandle);
   IndicatorRelease(glEmaSlowHandle);
   IndicatorRelease(glAdxHandle);
   IndicatorRelease(glBbHandle);
   IndicatorRelease(glStochHandle);
   IndicatorRelease(glAtrHandle);

   Comment("Step Index Quantum EA Stopped.");
   Print("EA shutdown code: ", reason);
  }

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
  {
   double currentBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double currentAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   
   // 1. Process local trailing stop logic
   if(InpUseTrailing)
     {
      ManageTrailingStop(currentBid, currentAsk);
     }
     
   // 2. Broadcast live market updates to Dashboard (copies MT5 Step Index graph)
   if(InpSendTicksToWeb)
     {
      BroadcastMarketUpdate();
     }

   // 3. Periodic Web Telemetry synchronization & remote command updates
   datetime now = TimeCurrent();
   if(now - glLastSyncTime >= InpSyncIntervalSec)
     {
      SyncWithWebApp();
      glLastSyncTime = now;
     }

   // 4. Execution of advanced mathematical trading rules
   if(glTradingActive)
     {
      ExecuteScalpingLogic(currentBid, currentAsk);
     }
   
   // Update screen metrics
   UpdateChartDisplay(currentBid, currentAsk);
  }

//+------------------------------------------------------------------+
//| Core Advanced Mathematical Strategy Signal Processor            |
//+------------------------------------------------------------------+
void ExecuteScalpingLogic(double bid, double ask)
  {
   static datetime lastBarTime = 0;
   datetime currentBarTime = iTime(_Symbol, _Period, 0);
   if(InpTradingMode == MODE_SWING)
     {
      if(currentBarTime == lastBarTime) return;
     }

   if(PositionsTotal() >= InpMaxTrades) return;

   double emaFast[], emaSlow[];
   ArraySetAsSeries(emaFast, true);
   ArraySetAsSeries(emaSlow, true);
   if(CopyBuffer(glEmaFastHandle, 0, 0, 2, emaFast) < 2) return;
   if(CopyBuffer(glEmaSlowHandle, 0, 0, 2, emaSlow) < 2) return;

   double adxMain[];
   ArraySetAsSeries(adxMain, true);
   if(CopyBuffer(glAdxHandle, 0, 0, 2, adxMain) < 2) return;

   double bbUpper[], bbLower[];
   ArraySetAsSeries(bbUpper, true);
   ArraySetAsSeries(bbLower, true);
   if(CopyBuffer(glBbHandle, 1, 0, 2, bbUpper) < 2) return;
   if(CopyBuffer(glBbHandle, 2, 0, 2, bbLower) < 2) return;

   double stochMain[], stochSig[];
   ArraySetAsSeries(stochMain, true);
   ArraySetAsSeries(stochSig, true);
   if(CopyBuffer(glStochHandle, 0, 0, 2, stochMain) < 2) return;
   if(CopyBuffer(glStochHandle, 1, 0, 2, stochSig) < 2) return;

   double atrVal[];
   ArraySetAsSeries(atrVal, true);
   if(CopyBuffer(glAtrHandle, 0, 0, 2, atrVal) < 2) return;

   if(atrVal[0] < InpMinAtrFilter)
     {
      return;
     }

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, _Period, 0, 2, rates);
   if(copied < 2) return;

   double close0 = rates[0].close;

   int totalBuy = 0, totalSell = 0;
   CountPositions(totalBuy, totalSell);

   bool buyTrigger = false;
   bool sellTrigger = false;

   if(glStrategyMode == "TREND_FOLLOWING")
     {
      bool emaCrossUp = (emaFast[0] > emaSlow[0] && emaFast[1] <= emaSlow[1]);
      if(emaCrossUp && adxMain[0] > 25.0)
        {
         buyTrigger = true;
        }

      bool emaCrossDown = (emaFast[0] < emaSlow[0] && emaFast[1] >= emaSlow[1]);
      if(emaCrossDown && adxMain[0] > 25.0)
        {
         sellTrigger = true;
        }
     }
   else if(glStrategyMode == "MEAN_REVERSION" || glStrategyMode == "AI_ADAPTIVE")
     {
      bool isOverSold = (close0 < bbLower[0]);
      bool stochCrossUp = (stochMain[0] > stochSig[0] && stochMain[1] <= stochSig[1] && stochMain[0] < 30.0);
      if(isOverSold && stochCrossUp)
        {
         buyTrigger = true;
        }

      bool isOverBought = (close0 > bbUpper[0]);
      bool stochCrossDown = (stochMain[0] < stochSig[0] && stochMain[1] >= stochSig[1] && stochMain[0] > 70.0);
      if(isOverBought && stochCrossDown)
        {
         sellTrigger = true;
        }
     }

   if(buyTrigger)
     {
      if(totalSell > 0)
        {
         Print("[ANTI-HEDGING LOCK] Contradiction! Blocked BUY signal because a SELL position is active on ", _Symbol);
         return;
        }
      if(totalBuy == 0)
        {
         double sl = (InpStopLossPts > 0) ? (bid - InpStopLossPts * _Point) : 0;
         double tp = (InpTakeProfitPts > 0) ? (ask + InpTakeProfitPts * _Point) : 0;
         
         ResetLastError();
         if(trade.Buy(InpLotSize, _Symbol, ask, sl, tp, "Quantum Step Index Buy"))
           {
            Print("BUY execution success! Ask: ", ask, " SL: ", sl, " TP: ", tp);
            if(InpTradingMode == MODE_SWING) lastBarTime = currentBarTime;
           }
         else
           {
            Print("BUY execution failed! Error: ", _LastError);
           }
        }
     }
   else if(sellTrigger)
     {
      if(totalBuy > 0)
        {
         Print("[ANTI-HEDGING LOCK] Contradiction! Blocked SELL signal because a BUY position is active on ", _Symbol);
         return;
        }
      if(totalSell == 0)
        {
         double sl = (InpStopLossPts > 0) ? (ask + InpStopLossPts * _Point) : 0;
         double tp = (InpTakeProfitPts > 0) ? (bid - InpTakeProfitPts * _Point) : 0;
         
         ResetLastError();
         if(trade.Sell(InpLotSize, _Symbol, bid, sl, tp, "Quantum Step Index Sell"))
           {
            Print("SELL execution success! Bid: ", bid, " SL: ", sl, " TP: ", tp);
            if(InpTradingMode == MODE_SWING) lastBarTime = currentBarTime;
           }
         else
           {
            Print("SELL execution failed! Error: ", _LastError);
           }
        }
     }
  }

//+------------------------------------------------------------------+
//| Manage trailing stop logic                                        |
//+------------------------------------------------------------------+
void ManageTrailingStop(double bid, double ask)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetSymbol(i) == _Symbol && PositionGetInteger(POSITION_MAGIC) == glMagicNumber)
        {
         ulong ticket = PositionGetInteger(POSITION_TICKET);
         double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
         double currentSL = PositionGetDouble(POSITION_SL);
         
         if(PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY)
           {
            if(bid - openPrice > InpTrailingStopPts * _Point)
              {
               double newSL = NormalizeDouble(bid - InpTrailingStopPts * _Point, _Digits);
               if(currentSL == 0 || newSL > currentSL + InpTrailingStepPts * _Point)
                 {
                  trade.PositionModify(ticket, newSL, PositionGetDouble(POSITION_TP));
                 }
              }
           }
         else if(PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_SELL)
           {
            if(openPrice - ask > InpTrailingStopPts * _Point)
              {
               double newSL = NormalizeDouble(ask + InpTrailingStopPts * _Point, _Digits);
               if(currentSL == 0 || newSL < currentSL - InpTrailingStepPts * _Point)
                 {
                  trade.PositionModify(ticket, newSL, PositionGetDouble(POSITION_TP));
                 }
              }
           }
        }
     }
  }

//+------------------------------------------------------------------+
//| Count active positions                                           |
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
//| Connect / Sync with full stack Web App API                       |
//+------------------------------------------------------------------+
void SyncWithWebApp()
  {
   string url = InpWebServerUrl + "/api/ea/tick";
   string cookie = NULL, headers;
   char post[], result[];
   string resultHeaders;
   int timeout = 5000;
   
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double profit = AccountInfoDouble(ACCOUNT_PROFIT);
   string company = AccountInfoString(ACCOUNT_COMPANY);
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   
   string payload = StringFormat(
      "{\\"account\\":\\"%lld\\",\\"broker\\":\\"%s\\",\\"balance\\":%.2f,\\"profit\\":%.2f,\\"bid\\":%.4f,\\"ask\\":%.4f,\\"strategy\\":\\"%s\\",\\"version\\":\\"%s\\"}",
      login, company, balance, profit, bid, ask, glStrategyMode, glEAVersion
   );
   
   StringToCharArray(payload, post);
   ArrayResize(post, ArraySize(post) - 1);
   
   headers = "Content-Type: application/json\\r\\n";
   
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
         glLastDiagMsg = "ERROR 4014: WebRequest is blocked. Open MT5 -> Options -> Expert Advisors -> Allow WebRequest!";
         Print("IMPORTANT: Allow WebRequest in terminal Options -> Expert Advisors -> add URL: ", InpWebServerUrl);
        }
      else if(err == 5200)
        {
         glLastDiagMsg = "ERROR 5200: URL parsing failure. Check web link inputs!";
        }
      else if(err == 5203)
        {
         glLastDiagMsg = "ERROR 5203: Host unreachable. Verify server internet router!";
        }
      else
        {
         glLastDiagMsg = "CONNECTION FAULT. Error code: " + IntegerToString(err);
        }
     }
   else if(res == 200)
     {
      glInternetOk = true;
      glLastDiagMsg = "SYNC SUCCESSFUL. Communication lines normal.";
      string jsonResponse = CharArrayToString(result);
      
      if(StringFind(jsonResponse, "\\"isActive\\":true") >= 0)
        {
         glTradingActive = true;
        }
      else if(StringFind(jsonResponse, "\\"isActive\\":false") >= 0)
        {
         glTradingActive = false;
         if(PositionsTotal() > 0) {
            CloseAllPositions();
         }
        }
         
       ProcessPendingRemoteCommand(jsonResponse, bid, ask);
        
      if(StringFind(jsonResponse, "\\"selectedStrategy\\":\\"TREND_FOLLOWING\\"") >= 0) glStrategyMode = "TREND_FOLLOWING";
      else if(StringFind(jsonResponse, "\\"selectedStrategy\\":\\"MEAN_REVERSION\\"") >= 0) glStrategyMode = "MEAN_REVERSION";
      else if(StringFind(jsonResponse, "\\"selectedStrategy\\":\\"AI_ADAPTIVE\\"") >= 0) glStrategyMode = "AI_ADAPTIVE";
     }
   else
     {
      glInternetOk = false;
      glLastDiagMsg = "HTTP CONFIG REJECTED. Status: " + IntegerToString(res);
     }
  }

//+------------------------------------------------------------------+
//| Broadcast live tick candle data to Dashboard Graph               |
//+------------------------------------------------------------------+
void BroadcastMarketUpdate()
  {
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, _Period, 0, 1, rates);
   if(copied <= 0) return;

   double o = rates[0].open;
   double h = rates[0].high;
   double l = rates[0].low;
   double c = rates[0].close;
   long v = rates[0].tick_volume;
   datetime ct = TimeCurrent();
   
   string formatted_time = TimeToString(ct, TIME_DATE|TIME_SECONDS);
   string update_url = InpDashboardUrl;

   string payload = StringFormat(
      "{\\"symbol\\":\\"%s\\",\\"open\\":%.4f,\\"high\\":%.4f,\\"low\\":%.4f,\\"close\\":%.4f,\\"volume\\":%lld,\\"current_time\\":\\"%s\\"}",
      _Symbol, o, h, l, c, v, formatted_time
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
//| Push historical candle data to backend on connection             |
//+------------------------------------------------------------------+
void PushHistoricalCandles(int count)
  {
   if(count > 1000) count = 1000;
   if(count <= 0) return;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, _Period, 0, count, rates);
   if(copied <= 0)
     {
      Print("[HISTORY] CopyRates failed. Copied: ", copied, ". Broker history may be unavailable.");
      return;
     }

   string url = InpWebServerUrl + "/api/update-market";
   string headers = "Content-Type: application/json\r\n";
   int timeout = 5000;

   for(int i = copied - 1; i >= 0; i--)
     {
      string direction = rates[i].close > rates[i].open ? "up" :
                         rates[i].close < rates[i].open ? "down" : "flat";

      string payload = StringFormat(
         "{\\"symbol\\":\\"%s\\",\\"time\\":%lld,\\"open\\":%.4f,\\"high\\":%.4f,\\"low\\":%.4f,\\"close\\":%.4f,\\"volume\\":%lld,\\"direction\\":\\"%s\\"}",
         _Symbol,
         (long)rates[i].time,
         rates[i].open,
         rates[i].high,
         rates[i].low,
         rates[i].close,
         (long)rates[i].tick_volume,
         direction
      );

      char post[], result[];
      string resultHeaders;
      StringToCharArray(payload, post);
      ArrayResize(post, ArraySize(post) - 1);

      ResetLastError();
      int res = WebRequest("POST", url, headers, timeout, post, result, resultHeaders);
      if(res == -1)
        {
         int err = _LastError;
         if(err != 4014 && err != 5200 && err != 5203)
           {
            Print("[HISTORY] WebRequest push failed for bar ", i, ". Error: ", err);
           }
        }
     }

   Print("[HISTORY] Pushed ", copied, " historical candles to backend.");
  }

//+------------------------------------------------------------------+
//| Close all positions when Stop is triggered remotely             |
//+------------------------------------------------------------------+
void CloseAllPositions()
  {
   Print("Remote Web Stop Command received. Closing open positions.");
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetSymbol(i) == _Symbol && PositionGetInteger(POSITION_MAGIC) == glMagicNumber)
        {
         trade.PositionClose(PositionGetInteger(POSITION_TICKET));
        }
     }
  }

//+------------------------------------------------------------------+
//| Process Remote Pending Command Sync                              |
//+------------------------------------------------------------------+
void ProcessPendingRemoteCommand(string jsonResponse, double bid, double ask)
  {
   string dq = CharToString(34);
   string actionKey = dq + "pendingAction" + dq + ":" + dq;
   
   int actionPos = StringFind(jsonResponse, actionKey);
   if(actionPos >= 0)
     {
      int start = actionPos + StringLen(actionKey);
      int end = StringFind(jsonResponse, dq, start);
      if(end > start)
        {
         string cmd = StringSubstr(jsonResponse, start, end - start);
         if(cmd != "NONE")
           {
            Print("[REMOTE ORDER] Checked pending command from server: ", cmd);
            
            double pLot = InpLotSize;
            string lotKey = dq + "pendingLot" + dq + ":";
            int lotPos = StringFind(jsonResponse, lotKey);
            if(lotPos >= 0)
              {
               int lotStart = lotPos + StringLen(lotKey);
               int lotEnd = StringFind(jsonResponse, ",", lotStart);
               if(lotEnd < 0) lotEnd = StringFind(jsonResponse, "}", lotStart);
               if(lotEnd > lotStart) {
                  pLot = StringToDouble(StringSubstr(jsonResponse, lotStart, lotEnd - lotStart));
               }
              }
              
            double pSL = InpStopLossPts;
            string slKey = dq + "pendingSL" + dq + ":";
            int slPos = StringFind(jsonResponse, slKey);
            if(slPos >= 0)
              {
               int slStart = slPos + StringLen(slKey);
               int slEnd = StringFind(jsonResponse, ",", slStart);
               if(slEnd < 0) slEnd = StringFind(jsonResponse, "}", slStart);
               if(slEnd > slStart) {
                  pSL = StringToDouble(StringSubstr(jsonResponse, slStart, slEnd - slStart));
               }
              }
              
            double pTP = InpTakeProfitPts;
            string tpKey = dq + "pendingTP" + dq + ":";
            int tpPos = StringFind(jsonResponse, tpKey);
            if(tpPos >= 0)
              {
               int tpStart = tpPos + StringLen(tpKey);
               int tpEnd = StringFind(jsonResponse, ",", tpStart);
               if(tpEnd < 0) tpEnd = StringFind(jsonResponse, "}", tpStart);
               if(tpEnd > tpStart) {
                  pTP = StringToDouble(StringSubstr(jsonResponse, tpStart, tpEnd - tpStart));
               }
              }
              
            if(cmd == "BUY")
              {
               int buyCount = 0, sellCount = 0;
               CountPositions(buyCount, sellCount);
               if(sellCount > 0)
                 {
                  Print("[REMOTE ORDER REJECTED] Cannot BUY because an opposite active SELL position exists on client.");
                 }
               else if(buyCount == 0)
                 {
                  double slPrice = (pSL > 0) ? (bid - pSL * _Point) : 0;
                  double tpPrice = (pTP > 0) ? (ask + pTP * _Point) : 0;
                  ResetLastError();
                  if(trade.Buy(pLot, _Symbol, ask, slPrice, tpPrice, "Quantum Remote Buy"))
                    {
                     Print("[REMOTE ORDER SUCCESS] BUY asset order success! Lot: ", pLot, " SL: ", slPrice, " TP: ", tpPrice);
                    }
                  else
                    {
                     Print("[REMOTE ORDER FAILED] BUY execution failed! Error: ", _LastError);
                    }
                 }
               else
                 {
                  Print("[REMOTE ORDER REJECTED] Active BUY position already exists on chart.");
                 }
              }
            else if(cmd == "SELL")
              {
               int buyCount = 0, sellCount = 0;
               CountPositions(buyCount, sellCount);
               if(buyCount > 0)
                 {
                  Print("[REMOTE ORDER REJECTED] Cannot SELL because an opposite active BUY position exists on client.");
                 }
               else if(sellCount == 0)
                 {
                  double slPrice = (pSL > 0) ? (ask + pSL * _Point) : 0;
                  double tpPrice = (pTP > 0) ? (bid - pTP * _Point) : 0;
                  ResetLastError();
                  if(trade.Sell(pLot, _Symbol, bid, slPrice, tpPrice, "Quantum Remote Sell"))
                    {
                     Print("[REMOTE ORDER SUCCESS] SELL asset order success! Lot: ", pLot, " SL: ", slPrice, " TP: ", tpPrice);
                    }
                  else
                    {
                     Print("[REMOTE ORDER FAILED] SELL execution failed! Error: ", _LastError);
                    }
                 }
               else
                 {
                  Print("[REMOTE ORDER REJECTED] Active SELL position already exists on chart.");
                 }
              }
            else if(cmd == "CLOSE_ALL")
              {
               Print("[REMOTE COMMAND] Received CLOSE_ALL signal. Liquidating active positions.");
               CloseAllPositions();
              }
           }
        }
     }
  }

//+------------------------------------------------------------------+
//| Render telemetry on MetaTrader Chart interface                   |
//+------------------------------------------------------------------+
void UpdateChartDisplay(double bid, double ask)
  {
   string connStatus = (glLastSyncTime > 0) ? "CONNECTED & IN SYNC" : "OFFLINE / DISCONNECTED";
   string tradeStatus = glTradingActive ? "ACTIVE & EXECUTING" : "STOPPED / MONITORING ONLY";
   
   string termAlgoEnabled = TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) ? "YES (Terminal Button is ON)" : "NO (CLICK THE ALGO TRADING BUTTON ON MT5 TOOLBAR!)";
   string eaTradeAllowed = MQLInfoInteger(MQL_TRADE_ALLOWED) ? "YES (EA Trade is ALLOWED)" : "NO (Allow Algorithmic Trading checkbox in EA Common properties is OFF!)";
   
   Comment("==============================================\\n" +
           "    QUANTUM STEP INDEX SCALPING PLATFORM EA   \\n" +
           "==============================================\\n" +
           "  [SYSTEM STATUS CLASSIFICATION]\\n" +
           "  Active Strategy: " + glStrategyMode + "\\n" +
           "  Trading Status : " + tradeStatus + "\\n" +
           "  Trading Mode   : " + (InpTradingMode == MODE_SCALPING ? "SCALPING" : "SWING TRADING") + "\\n" +
           "  Server API Link: " + connStatus + "\\n" +
           "  Last Sync Time : " + TimeToString(glLastSyncTime, TIME_DATE|TIME_SECONDS) + "\\n" +
           "==============================================\\n" +
           "  [LIVE ACTION DIAGNOSTIC CHECKER]\\n" +
           "  1. Toolbar Algo Button Active : " + termAlgoEnabled + "\\n" +
           "  2. Master EA Trade allowed    : " + eaTradeAllowed + "\\n" +
           "  3. Server Response HTTP Code  : " + IntegerToString(glLastWebResCode) + " (Expected: 200)\\n" +
           "  4. Internal MT5 Error Code    : " + IntegerToString(glLastWebErrCode) + " (Expected: 0)\\n" +
           "  5. DIAGNOSIS MESSAGE          : " + glLastDiagMsg + "\\n" +
           "==============================================\\n" +
           "  [LOCAL MT5 METRICS]\\n" +
           "  Bid Price      : " + DoubleToString(bid, 2) + " | Ask: " + DoubleToString(ask, 2) + "\\n" +
           "  Account Login  : " + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\\n" +
           "  Broker Firm    : " + AccountInfoString(ACCOUNT_COMPANY) + "\\n" +
           "  Account Balance: $" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + "\\n" +
           "==============================================");
  }
//+------------------------------------------------------------------+
`;
}
