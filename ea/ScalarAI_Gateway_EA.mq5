//+------------------------------------------------------------------+
//|                                        ScalarAI_Gateway_EA.mq5   |
//|                         ScalarAI Multi-Asset Gateway for MT5     |
//|                                  https://scalarai.terminal.app   |
//+------------------------------------------------------------------+
#property copyright   "ScalarAI Automated Trading Engine"
#property link        "https://scalarai.terminal.app"
#property version     "2.50"
#property description "Direct WebRequest Gateway EA connecting MetaTrader 5 to ScalarAI platform."
#property description "Streams real-time ticks, bars, account balances, positions, deals, and executes remote AI signals."
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\OrderInfo.mqh>
#include <Trade\AccountInfo.mqh>
#include <Trade\SymbolInfo.mqh>

//--- Input Parameters
input group "=== Server Gateway Configuration ==="
input string   InpServerUrl         = "http://127.0.0.1:4000"; // Platform Gateway URL
input string   InpApiKey            = "";                      // Optional Security API Key
input int      InpHeartbeatSec      = 2;                       // Heartbeat / Poll Interval (seconds)

input group "=== Trade Execution & Risk Management ==="
input ulong    InpMagicNumber       = 882041;                  // Magic Number for ScalarAI Orders
input double   InpDefaultLotSize    = 0.10;                    // Default Lot Size
input int      InpDefaultSL         = 150;                     // Default Stop Loss in Points (0 = disabled)
input int      InpDefaultTP         = 300;                     // Default Take Profit in Points (0 = disabled)
input int      InpMaxSlippage       = 10;                      // Maximum Slippage in Points
input bool     InpEnableTrailing    = true;                    // Enable Dynamic Trailing Stop
input int      InpTrailingPoints    = 100;                     // Trailing Distance in Points
input int      InpTrailingStep      = 20;                      // Trailing Step in Points

input group "=== Telemetry & Diagnostics ==="
input bool     InpPushTicks         = true;                    // Stream Real-time Market Ticks
input bool     InpSyncHistoryOnStart= true;                    // Sync Closed Deals on Initialization
input bool     InpVerboseLogging    = true;                    // Detailed Journal Logging

//--- Global Objects
CTrade         m_trade;
CPositionInfo  m_position;
COrderInfo     m_order;
CAccountInfo   m_account;
CSymbolInfo    m_symbol;

//--- State Variables
datetime       g_lastHeartbeatTime  = 0;
datetime       g_lastTickTime       = 0;
datetime       g_lastHistorySync    = 0;
string         g_activeSymbol       = "";
bool           g_isGatewayConnected = false;

//--- Forward Declarations for MQL5 Compiler
string CleanUrl(string url);
int    HttpPost(string endpoint, string jsonPayload, string &responseOut);
int    HttpGet(string endpoint, string &responseOut);
string JsonExtractString(string json, string key);
double JsonExtractNumber(string json, string key, double defaultValue = 0.0);
void   SetupSymbolFilling(string sym);
void   SendHeartbeat();
void   PushTick();
void   SyncPositions();
void   SyncHistory();
void   PollAndExecuteCommands();
void   ManageTrailingStop();

//+------------------------------------------------------------------+
//| Helper: Trim trailing slashes from URL                          |
//+------------------------------------------------------------------+
string CleanUrl(string url)
{
   string res = url;
   while(StringLen(res) > 0 && StringSubstr(res, StringLen(res)-1, 1) == "/")
   {
      res = StringSubstr(res, 0, StringLen(res)-1);
   }
   return res;
}

//+------------------------------------------------------------------+
//| Setup Appropriate Filling Mode for Broker/Symbol                 |
//+------------------------------------------------------------------+
void SetupSymbolFilling(string sym)
{
   uint filling = (uint)SymbolInfoInteger(sym, SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_FOK) != 0)
      m_trade.SetTypeFilling(ORDER_FILLING_FOK);
   else if((filling & SYMBOL_FILLING_IOC) != 0)
      m_trade.SetTypeFilling(ORDER_FILLING_IOC);
   else
      m_trade.SetTypeFilling(ORDER_FILLING_RETURN);
}

//+------------------------------------------------------------------+
//| HTTP POST helper using WebRequest                                |
//+------------------------------------------------------------------+
int HttpPost(string endpoint, string jsonPayload, string &responseOut)
{
   string url = CleanUrl(InpServerUrl) + endpoint;
   string headers = "Content-Type: application/json\r\n";
   if(StringLen(InpApiKey) > 0)
   {
      headers += "Authorization: Bearer " + InpApiKey + "\r\n";
   }

   char postData[];
   char result[];
   string resultHeaders = "";
   int dataLen = StringToCharArray(jsonPayload, postData, 0, StringLen(jsonPayload), CP_UTF8);
   if(dataLen > 0 && postData[dataLen-1] == 0) ArrayResize(postData, dataLen - 1);

   ResetLastError();
   int resCode = WebRequest("POST", url, headers, 3000, postData, result, resultHeaders);
   if(resCode > 0)
   {
      responseOut = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      g_isGatewayConnected = true;
   }
   else
   {
      int err = GetLastError();
      responseOut = "";
      if(err == 4014)
      {
         PrintFormat("[ScalarAI Gateway] ERROR 4014: URL not allowed in MT5. Open Tools -> Options -> Expert Advisors, check 'Allow WebRequest for listed URL' and add '%s'", InpServerUrl);
      }
      else
      {
         if(InpVerboseLogging) PrintFormat("[ScalarAI Gateway] WebRequest POST failed: URL=%s Err=%d", url, err);
      }
      g_isGatewayConnected = false;
   }
   return resCode;
}

//+------------------------------------------------------------------+
//| HTTP GET helper using WebRequest                                 |
//+------------------------------------------------------------------+
int HttpGet(string endpoint, string &responseOut)
{
   string url = CleanUrl(InpServerUrl) + endpoint;
   string headers = "Accept: application/json\r\n";
   if(StringLen(InpApiKey) > 0)
   {
      headers += "Authorization: Bearer " + InpApiKey + "\r\n";
   }

   char postData[];
   ArrayResize(postData, 0);
   char result[];
   string resultHeaders = "";

   ResetLastError();
   int resCode = WebRequest("GET", url, headers, 3000, postData, result, resultHeaders);
   if(resCode > 0)
   {
      responseOut = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      g_isGatewayConnected = true;
   }
   else
   {
      int err = GetLastError();
      responseOut = "";
      g_isGatewayConnected = false;
      if(err == 4014)
      {
         PrintFormat("[ScalarAI Gateway] ERROR 4014: Please add '%s' to MT5 WebRequest allowed URLs", InpServerUrl);
      }
   }
   return resCode;
}

//+------------------------------------------------------------------+
//| Simple JSON string value extractor                               |
//+------------------------------------------------------------------+
string JsonExtractString(string json, string key)
{
   string search = "\"" + key + "\":\"";
   int pos = StringFind(json, search);
   if(pos < 0) return "";
   pos += StringLen(search);
   int endPos = StringFind(json, "\"", pos);
   if(endPos < 0) return "";
   return StringSubstr(json, pos, endPos - pos);
}

//+------------------------------------------------------------------+
//| Simple JSON number value extractor                               |
//+------------------------------------------------------------------+
double JsonExtractNumber(string json, string key, double defaultValue = 0.0)
{
   string search = "\"" + key + "\":";
   int pos = StringFind(json, search);
   if(pos < 0) return defaultValue;
   pos += StringLen(search);
   
   // Skip spaces
   while(pos < StringLen(json) && StringSubstr(json, pos, 1) == " ") pos++;
   
   int endPos = pos;
   while(endPos < StringLen(json))
   {
      string ch = StringSubstr(json, endPos, 1);
      if(ch == "," || ch == "}" || ch == "]" || ch == " " || ch == "\r" || ch == "\n") break;
      endPos++;
   }
   string numStr = StringSubstr(json, pos, endPos - pos);
   return StringToDouble(numStr);
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   g_activeSymbol = _Symbol;
   m_symbol.Name(g_activeSymbol);
   m_trade.SetExpertMagicNumber(InpMagicNumber);
   m_trade.SetDeviationInPoints(InpMaxSlippage);
   SetupSymbolFilling(g_activeSymbol);

   PrintFormat("==========================================================");
   PrintFormat("🚀 [ScalarAI Gateway EA v2.50] Initializing on %s", g_activeSymbol);
   PrintFormat("Connecting to Platform Gateway: %s", InpServerUrl);
   PrintFormat("Magic: %I64u | Lot: %.2f | SL: %d pts | TP: %d pts", (ulong)InpMagicNumber, InpDefaultLotSize, InpDefaultSL, InpDefaultTP);
   PrintFormat("==========================================================");

   // Set timer for periodic heartbeats and polling
   EventSetTimer(InpHeartbeatSec > 0 ? InpHeartbeatSec : 2);

   // Perform initial heartbeat
   SendHeartbeat();

   // Push initial open positions
   SyncPositions();

   // Push history deals if enabled
   if(InpSyncHistoryOnStart)
   {
      SyncHistory();
   }

   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   
   // Send disconnect notification to server
   string payload = StringFormat(
      "{\"status\":\"offline\",\"reason\":%d,\"symbol\":\"%s\",\"accountNumber\":%I64u,\"magic\":%I64u}",
      reason, g_activeSymbol, (ulong)m_account.Login(), (ulong)InpMagicNumber
   );
   string response;
   HttpPost("/api/gateway/disconnect", payload, response);
   
   PrintFormat("[ScalarAI Gateway EA] Deinitialized. Reason: %d", reason);
}

//+------------------------------------------------------------------+
//| Send Heartbeat & Account Telemetry to Gateway                     |
//+------------------------------------------------------------------+
void SendHeartbeat()
{
   // No Refresh() here. CAccountInfo has no such method -- it is not part of
   // the class -- and none is needed: every accessor is const and reads live
   // through AccountInfoInteger/Double/String, so there is no cached state to
   // invalidate. Calling it produced "undeclared identifier 'Refresh'".
   string payload = StringFormat(
      "{"
      "\"service\":\"ScalarAI_Gateway_EA\","
      "\"version\":\"2.50\","
      "\"symbol\":\"%s\","
      "\"accountNumber\":%I64u,"
      "\"balance\":%.2f,"
      "\"equity\":%.2f,"
      "\"margin\":%.2f,"
      "\"freeMargin\":%.2f,"
      "\"leverage\":%d,"
      "\"broker\":\"%s\","
      "\"currency\":\"%s\","
      "\"terminalBuild\":%d,"
      "\"isTester\":%s,"
      "\"magic\":%I64u,"
      "\"timestamp\":%I64u"
      "}",
      g_activeSymbol,
      (ulong)m_account.Login(),
      m_account.Balance(),
      m_account.Equity(),
      m_account.Margin(),
      m_account.FreeMargin(),
      (int)m_account.Leverage(),
      m_account.Company(),
      m_account.Currency(),
      (int)TerminalInfoInteger(TERMINAL_BUILD),
      (MQLInfoInteger(MQL_TESTER) != 0 ? "true" : "false"),
      (ulong)InpMagicNumber,
      (ulong)TimeCurrent()
   );

   string response;
   int status = HttpPost("/api/gateway/heartbeat", payload, response);
   g_lastHeartbeatTime = TimeCurrent();
   
   if(status == 200 && InpVerboseLogging)
   {
      // Heartbeat ok
   }
}

//+------------------------------------------------------------------+
//| Stream real-time tick to Gateway                                 |
//+------------------------------------------------------------------+
void PushTick()
{
   if(!InpPushTicks) return;
   
   MqlTick tick;
   ResetLastError();
   if(!SymbolInfoTick(g_activeSymbol, tick)) return;
   
   double spread = (tick.ask - tick.bid);
   string payload = StringFormat(
      "{"
      "\"symbol\":\"%s\","
      "\"bid\":%.5f,"
      "\"ask\":%.5f,"
      "\"last\":%.5f,"
      "\"volume\":%I64u,"
      "\"spread\":%.5f,"
      "\"time\":%I64u"
      "}",
      g_activeSymbol,
      tick.bid,
      tick.ask,
      tick.last,
      (ulong)tick.volume,
      spread,
      (ulong)tick.time
   );

   string resp;
   HttpPost("/api/gateway/ticks", payload, resp);
   g_lastTickTime = TimeCurrent();
}

//+------------------------------------------------------------------+
//| Sync All Open Positions to Gateway                               |
//+------------------------------------------------------------------+
void SyncPositions()
{
   int total = PositionsTotal();
   string posJson = "[";
   int count = 0;

   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      
      if(!m_position.SelectByTicket(ticket)) continue;
      
      string sym = m_position.Symbol();
      long magic = m_position.Magic();
      
      string item = StringFormat(
         "{"
         "\"ticket\":%I64u,"
         "\"symbol\":\"%s\","
         "\"type\":\"%s\","
         "\"volume\":%.2f,"
         "\"openPrice\":%.5f,"
         "\"currentPrice\":%.5f,"
         "\"sl\":%.5f,"
         "\"tp\":%.5f,"
         "\"profit\":%.2f,"
         "\"swap\":%.2f,"
         "\"magic\":%I64u,"
         "\"openTime\":%I64u,"
         "\"comment\":\"%s\""
         "}",
         ticket,
         sym,
         (m_position.PositionType() == POSITION_TYPE_BUY ? "BUY" : "SELL"),
         m_position.Volume(),
         m_position.PriceOpen(),
         m_position.PriceCurrent(),
         m_position.StopLoss(),
         m_position.TakeProfit(),
         m_position.Profit(),
         m_position.Swap(),
         (ulong)magic,
         (ulong)m_position.Time(),
         m_position.Comment()
      );

      if(count > 0) posJson += ",";
      posJson += item;
      count++;
   }
   posJson += "]";

   string payload = StringFormat(
      "{\"accountNumber\":%I64u,\"count\":%d,\"positions\":%s,\"timestamp\":%I64u}",
      (ulong)m_account.Login(), count, posJson, (ulong)TimeCurrent()
   );

   string resp;
   HttpPost("/api/gateway/positions", payload, resp);
}

//+------------------------------------------------------------------+
//| Sync Closed Deals / Trade History to Gateway                     |
//+------------------------------------------------------------------+
void SyncHistory()
{
   datetime fromDate = TimeCurrent() - (7 * 86400); // Past 7 days
   if(!HistorySelect(fromDate, TimeCurrent())) return;

   int dealsTotal = HistoryDealsTotal();
   string dealsJson = "[";
   int count = 0;

   for(int i = 0; i < dealsTotal && count < 100; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      long dealType = HistoryDealGetInteger(ticket, DEAL_TYPE);
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;

      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT) continue; // closed deals

      string sym = HistoryDealGetString(ticket, DEAL_SYMBOL);
      double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      double volume = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double price = HistoryDealGetDouble(ticket, DEAL_PRICE);
      datetime time = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      long magic = HistoryDealGetInteger(ticket, DEAL_MAGIC);
      ulong orderTicket = (ulong)HistoryDealGetInteger(ticket, DEAL_ORDER);

      string item = StringFormat(
         "{"
         "\"dealTicket\":%I64u,"
         "\"orderTicket\":%I64u,"
         "\"symbol\":\"%s\","
         "\"type\":\"%s\","
         "\"volume\":%.2f,"
         "\"closePrice\":%.5f,"
         "\"profit\":%.2f,"
         "\"magic\":%I64u,"
         "\"closeTime\":%I64u"
         "}",
         ticket,
         orderTicket,
         sym,
         (dealType == DEAL_TYPE_BUY ? "BUY" : "SELL"),
         volume,
         price,
         profit,
         (ulong)magic,
         (ulong)time
      );

      if(count > 0) dealsJson += ",";
      dealsJson += item;
      count++;
   }
   dealsJson += "]";

   string payload = StringFormat(
      "{\"accountNumber\":%I64u,\"count\":%d,\"deals\":%s}",
      (ulong)m_account.Login(), count, dealsJson
   );

   string resp;
   HttpPost("/api/gateway/history", payload, resp);
   g_lastHistorySync = TimeCurrent();
}

//+------------------------------------------------------------------+
//| Poll & Execute Pending Orders from Gateway                       |
//+------------------------------------------------------------------+
void PollAndExecuteCommands()
{
   string endpoint = StringFormat("/api/gateway/commands?symbol=%s&magic=%I64u", g_activeSymbol, (ulong)InpMagicNumber);
   string response;
   int status = HttpGet(endpoint, response);
   
   if(status != 200 || StringLen(response) < 10) return;

   // Check if commands array has items
   int cmdPos = StringFind(response, "\"commands\":[");
   if(cmdPos < 0) return;

   int startBracket = cmdPos + 11;
   int endBracket = StringFind(response, "]", startBracket);
   if(endBracket <= startBracket + 2) return; // empty array "[]"

   // Extract individual command elements
   string commandsRaw = StringSubstr(response, startBracket, endBracket - startBracket + 1);
   
   // Handle command actions
   string action = JsonExtractString(commandsRaw, "action");
   string cmdId  = JsonExtractString(commandsRaw, "commandId");
   string sym    = JsonExtractString(commandsRaw, "symbol");
   if(StringLen(sym) == 0) sym = g_activeSymbol;
   
   double volume = JsonExtractNumber(commandsRaw, "volume", InpDefaultLotSize);
   double slPoints = JsonExtractNumber(commandsRaw, "sl", InpDefaultSL);
   double tpPoints = JsonExtractNumber(commandsRaw, "tp", InpDefaultTP);
   string ticketStr = JsonExtractString(commandsRaw, "ticket");
   ulong ticket = (ulong)StringToInteger(ticketStr);

   if(StringLen(action) == 0) return;

   PrintFormat("[ScalarAI Gateway] Received command: %s (ID: %s, Symbol: %s, Vol: %.2f)", action, cmdId, sym, volume);

   bool success = false;
   ulong resTicket = 0;
   double fillPrice = 0.0;
   string errorMsg = "";

   double symPoint = SymbolInfoDouble(sym, SYMBOL_POINT);
   if(symPoint <= 0.0) symPoint = _Point;

   SetupSymbolFilling(sym);

   if(action == "BUY")
   {
      MqlTick tick;
      ResetLastError();
      SymbolInfoTick(sym, tick);
      double ask = tick.ask;
      double sl = (slPoints > 0) ? (ask - slPoints * symPoint) : 0.0;
      double tp = (tpPoints > 0) ? (ask + tpPoints * symPoint) : 0.0;

      if(m_trade.Buy(volume, sym, ask, sl, tp, "ScalarAI Auto Buy"))
      {
         success = true;
         resTicket = m_trade.ResultOrder();
         fillPrice = m_trade.ResultPrice();
         PrintFormat("[ScalarAI Gateway] BUY executed: Ticket #%I64u @ %.5f", resTicket, fillPrice);
      }
      else
      {
         errorMsg = StringFormat("Buy failed: Err=%d, RetCode=%d", GetLastError(), m_trade.ResultRetcode());
         PrintFormat("[ScalarAI Gateway] %s", errorMsg);
      }
   }
   else if(action == "SELL")
   {
      MqlTick tick;
      ResetLastError();
      SymbolInfoTick(sym, tick);
      double bid = tick.bid;
      double sl = (slPoints > 0) ? (bid + slPoints * symPoint) : 0.0;
      double tp = (tpPoints > 0) ? (bid - tpPoints * symPoint) : 0.0;

      if(m_trade.Sell(volume, sym, bid, sl, tp, "ScalarAI Auto Sell"))
      {
         success = true;
         resTicket = m_trade.ResultOrder();
         fillPrice = m_trade.ResultPrice();
         PrintFormat("[ScalarAI Gateway] SELL executed: Ticket #%I64u @ %.5f", resTicket, fillPrice);
      }
      else
      {
         errorMsg = StringFormat("Sell failed: Err=%d, RetCode=%d", GetLastError(), m_trade.ResultRetcode());
         PrintFormat("[ScalarAI Gateway] %s", errorMsg);
      }
   }
   else if(action == "CLOSE")
   {
      if(ticket > 0 && m_trade.PositionClose(ticket))
      {
         success = true;
         resTicket = ticket;
         PrintFormat("[ScalarAI Gateway] Position #%I64u closed successfully", ticket);
      }
      else
      {
         errorMsg = StringFormat("Close failed for ticket #%I64u: Err=%d", ticket, GetLastError());
      }
   }
   else if(action == "CLOSE_ALL")
   {
      int total = PositionsTotal();
      int closedCount = 0;
      for(int i = total - 1; i >= 0; i--)
      {
         ulong t = PositionGetTicket(i);
         if(t > 0 && m_position.SelectByTicket(t))
         {
            if(m_trade.PositionClose(t)) closedCount++;
         }
      }
      success = true;
      PrintFormat("[ScalarAI Gateway] Liquidated %d open positions", closedCount);
   }
   else if(action == "MODIFY")
   {
      if(ticket > 0 && m_position.SelectByTicket(ticket))
      {
         double newSL = (slPoints > 0) ? (m_position.PriceOpen() - slPoints * symPoint) : m_position.StopLoss();
         double newTP = (tpPoints > 0) ? (m_position.PriceOpen() + tpPoints * symPoint) : m_position.TakeProfit();
         if(m_trade.PositionModify(ticket, newSL, newTP))
         {
            success = true;
            resTicket = ticket;
            PrintFormat("[ScalarAI Gateway] Position #%I64u modified: SL=%.5f TP=%.5f", ticket, newSL, newTP);
         }
         else
         {
            errorMsg = "Modify failed";
         }
      }
   }

   // Send execution confirmation back to server
   string confirmPayload = StringFormat(
      "{"
      "\"commandId\":\"%s\","
      "\"action\":\"%s\","
      "\"symbol\":\"%s\","
      "\"success\":%s,"
      "\"ticket\":%I64u,"
      "\"fillPrice\":%.5f,"
      "\"error\":\"%s\","
      "\"timestamp\":%I64u"
      "}",
      cmdId, action, sym, (success ? "true" : "false"), resTicket, fillPrice, errorMsg, (ulong)TimeCurrent()
   );

   string confirmResp;
   HttpPost("/api/gateway/confirm", confirmPayload, confirmResp);
   
   // Refresh open positions immediately
   SyncPositions();
}

//+------------------------------------------------------------------+
//| Dynamic Trailing Stop Manager                                    |
//+------------------------------------------------------------------+
void ManageTrailingStop()
{
   if(!InpEnableTrailing || InpTrailingPoints <= 0) return;

   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !m_position.SelectByTicket(ticket)) continue;

      if(m_position.Magic() != (long)InpMagicNumber && InpMagicNumber > 0) continue;
      if(m_position.Symbol() != g_activeSymbol) continue;

      MqlTick tick;
      if(!SymbolInfoTick(g_activeSymbol, tick)) continue;

      double pt = SymbolInfoDouble(g_activeSymbol, SYMBOL_POINT);
      if(pt <= 0.0) pt = _Point;
      if(pt <= 0.0) continue;

      if(m_position.PositionType() == POSITION_TYPE_BUY)
      {
         double profitPoints = (tick.bid - m_position.PriceOpen()) / pt;
         if(profitPoints > InpTrailingPoints)
         {
            double desiredSL = tick.bid - InpTrailingPoints * pt;
            if(desiredSL > m_position.StopLoss() + InpTrailingStep * pt)
            {
               m_trade.PositionModify(ticket, desiredSL, m_position.TakeProfit());
            }
         }
      }
      else if(m_position.PositionType() == POSITION_TYPE_SELL)
      {
         double profitPoints = (m_position.PriceOpen() - tick.ask) / pt;
         if(profitPoints > InpTrailingPoints)
         {
            double desiredSL = tick.ask + InpTrailingPoints * pt;
            if(m_position.StopLoss() == 0.0 || desiredSL < m_position.StopLoss() - InpTrailingStep * pt)
            {
               m_trade.PositionModify(ticket, desiredSL, m_position.TakeProfit());
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // Push tick telemetry to Gateway
   PushTick();

   // Manage dynamic trailing stop
   ManageTrailingStop();

   // Poll and execute pending order signals
   PollAndExecuteCommands();
}

//+------------------------------------------------------------------+
//| Timer event function for background polling                      |
//+------------------------------------------------------------------+
void OnTimer()
{
   // Keep heartbeat alive
   SendHeartbeat();

   // Check and poll commands periodically even if market ticks are sparse
   PollAndExecuteCommands();

   // Periodic positions sync
   SyncPositions();
}
//+------------------------------------------------------------------+
