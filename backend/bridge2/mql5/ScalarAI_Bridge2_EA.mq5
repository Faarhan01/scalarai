//+------------------------------------------------------------------+
//|                                       ScalarAI_Bridge2_EA.mq5    |
//|                    Scalar AI Multi-Asset MetaTrader 5 Bridge EA |
//|                                  https://github.com/scalar-ai    |
//+------------------------------------------------------------------+
#property copyright "Scalar AI 2026"
#property link      "https://github.com/scalar-ai"
#property version   "2.00"
#property description "Connects MetaTrader 5 terminal with Scalar AI platform and MCP AI Agents."

#include <Trade\Trade.mqh>
CTrade trade;

//--- Input Parameters
input group "=== Server & Bridge Configuration ==="
input string   InpServerUrl       = "http://127.0.0.1:3000"; // ScalarAI Platform URL
input string   InpBridgeHttpUrl   = "http://127.0.0.1:5100"; // Local Bridge2 HTTP URL
input string   InpApiKey          = "";                     // Optional API Key
input int      InpHeartbeatSec    = 2;                      // Heartbeat frequency (sec)

input group "=== Risk & Order Management ==="
input ulong    InpMagicNumber     = 20261009;               // Unique EA Magic Number
input double   InpDefaultLots     = 0.10;                   // Default lot size
input int      InpDefaultSL       = 150;                    // Stop Loss (Points)
input int      InpDefaultTP       = 300;                    // Take Profit (Points)
input ulong    InpSlippage        = 10;                     // Max Slippage (Points)

datetime g_lastHeartbeat = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(InpSlippage);
   trade.SetTypeFilling(ORDER_FILLING_FOK);
   
   Print("🚀 [ScalarAI Bridge2] Expert Advisor initialized on ", _Symbol, " | Magic: ", InpMagicNumber);
   SendStatusUpdate("INIT", "EA initialized successfully on " + _Symbol);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("🛑 [ScalarAI Bridge2] Expert Advisor removed. Reason: ", reason);
   SendStatusUpdate("DEINIT", "EA deactivated");
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   datetime now = TimeCurrent();
   if(now - g_lastHeartbeat >= InpHeartbeatSec)
   {
      g_lastHeartbeat = now;
      SendTickTelemetry();
      PollRemoteOrders();
   }
}

//+------------------------------------------------------------------+
//| Send live tick & account telemetry to ScalarAI                   |
//+------------------------------------------------------------------+
void SendTickTelemetry()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick)) return;
   
   string payload = StringFormat(
      "{\"symbol\":\"%s\",\"bid\":%f,\"ask\":%f,\"balance\":%f,\"equity\":%f,\"accountNumber\":\"%d\",\"broker\":\"%s\"}",
      _Symbol, tick.bid, tick.ask, AccountInfoDouble(ACCOUNT_BALANCE), AccountInfoDouble(ACCOUNT_EQUITY),
      (long)AccountInfoInteger(ACCOUNT_LOGIN), AccountInfoString(ACCOUNT_COMPANY)
   );
   
   char postData[];
   char resultData[];
   string resultHeaders;
   StringToCharArray(payload, postData);
   
   string headers = "Content-Type: application/json\r\n";
   if(StringLen(InpApiKey) > 0) headers += "Authorization: Bearer " + InpApiKey + "\r\n";
   
   WebRequest("POST", InpServerUrl + "/api/ea/tick", headers, 1500, postData, resultData, resultHeaders);
}

//+------------------------------------------------------------------+
//| Poll for pending AI orders or commands                           |
//+------------------------------------------------------------------+
void PollRemoteOrders()
{
   char postData[];
   char resultData[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n";
   if(StringLen(InpApiKey) > 0) headers += "Authorization: Bearer " + InpApiKey + "\r\n";
   
   int res = WebRequest("GET", InpServerUrl + "/api/ea/pending-orders", headers, 1500, postData, resultData, resultHeaders);
   if(res == 200 && ArraySize(resultData) > 0)
   {
      string responseStr = CharArrayToString(resultData);
      // Process orders if present
   }
}

//+------------------------------------------------------------------+
//| Status update helper                                             |
//+------------------------------------------------------------------+
void SendStatusUpdate(string action, string message)
{
   string payload = StringFormat("{\"level\":\"INFO\",\"message\":\"%s\",\"source\":\"EA\"}", message);
   char postData[];
   char resultData[];
   string resultHeaders;
   StringToCharArray(payload, postData);
   string headers = "Content-Type: application/json\r\n";
   WebRequest("POST", InpServerUrl + "/api/ea/logs", headers, 1500, postData, resultData, resultHeaders);
}
