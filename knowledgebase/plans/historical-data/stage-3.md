# Historical Data Plan — Stage 3: EA Historical Data Support

## Objective

Enable the EA to respond to historical data requests from the backend.

## Current State

- EA broadcasts live candle via `BroadcastMarketUpdate()`
- EA uses `CopyRates(_Symbol, _Period, 0, 2, rates)` for local logic only
- No endpoint to receive history requests
- No `CopyTicks` or extended `CopyRates` lookback for history

## Proposed Changes

### EA Generator (`backend/src/services/ea-generator.ts`)

Add to generated EA:

1. **History request handler**
```cpp
void HandleHistoryRequest(string &response)
{
   string symbol = JsonGetString(response, "symbol");
   string timeframe = JsonGetString(response, "timeframe");
   int count = JsonGetInt(response, "count");
   string type = JsonGetString(response, "type"); // "candles" or "ticks"
   
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   
   datetime from = 0;
   if(type == "candles")
   {
      int copied = CopyRates(symbol, (ENUM_TIMEFRAMES)StringToTimeframe(timeframe), 0, count, rates);
      if(copied <= 0) return;
      
      // Build JSON response with OHLC + timestamps
      string payload = "[";
      for(int i = copied - 1; i >= 0; i--)
      {
         if(i < copied - 1) payload += ",";
         payload += StringFormat(
            "{\\"time\\":%lld,\\"open\\":%.4f,\\"high\\":%.4f,\\"low\\":%.4f,\\"close\\":%.4f,\\"volume\\":%lld}",
            (long long)rates[i].time, rates[i].open, rates[i].high, rates[i].low, rates[i].close, rates[i].tick_volume
         );
      }
      payload += "]";
      // Send response to backend
   }
}
```

2. **HTTP endpoint in EA**
- EA listens for POST requests on history endpoint
- Parses JSON request for symbol, timeframe, count, type
- Returns JSON array of OHLC candles or ticks

3. **CopyTicks support**
```cpp
MqlTick ticks[];
ArraySetAsSeries(ticks, true);
int copied = CopyTicks(symbol, ticks, COPY_TICKS_ALL, 0, count);
```

## Backend Changes

1. **EA generator update** — add history endpoint code to generated EA
2. **Backend route** — `POST /api/ea/request-history`
3. **WebSocket message** — `request_history` / `history_response`

## Implementation Steps

1. Update `backend/src/services/ea-generator.ts` to generate history endpoint code
2. Update `backend/src/routes/market.ts` to add history request route
3. Update `backend/src/websockets/bridge.ts` to handle history messages
4. Test with EA connected

## Verification

- EA receives history request
- EA responds with historical data
- Backend stores data in `market_candles`
- Frontend can display historical candles
