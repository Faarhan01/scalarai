# Historical Data Plan — Stage 3: EA Historical Data Support

## Status: ❌ NOT DONE — EA changes required

## Objective

Enable the EA to push historical data to the backend on connection, so the backend can populate `market_candles` without waiting for live ticks.

## Current EA Capabilities

**File:** `backend/src/services/ea-generator.ts`

The generated EA currently:
- Broadcasts **current candle** via `BroadcastMarketUpdate()` using `CopyRates(_Symbol, _Period, 0, 1, rates)`
- Syncs with backend every 3 seconds via `SyncWithWebApp()` polling `/api/ea/tick`
- Sends account info, balance, bid/ask, strategy mode
- Receives pending commands from backend

**What the EA CANNOT do:**
- Serve historical candles via `CopyRates` lookback
- Handle history request WebSocket messages
- Poll a history request endpoint
- Send batch historical data

## Proposed Implementation

### Option A: EA Push on Connect (Recommended)

**Why this is better than polling:**
- Simpler — no new polling loop needed
- Faster — data arrives immediately on connection
- More reliable — no request/response timing issues
- Uses existing `SyncWithWebApp()` infrastructure

**Changes to EA generator:**

1. **Add history push to `OnInit()`:**
```mql5
void OnInit() {
   // ... existing init code ...
   
   // Push last 1000 candles to backend
   PushHistoricalCandles(1000);
}
```

2. **Add `PushHistoricalCandles()` function:**
```mql5
void PushHistoricalCandles(int count) {
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, _Period, 0, count, rates);
   if (copied <= 0) return;
   
   for (int i = copied - 1; i >= 0; i--) {
      string payload = StringFormat(
         "{\\"symbol\\":\\"%s\\",\\"time\\":%lld,\\"open\\":%.4f,\\"high\\":%.4f,\\"low\\":%.4f,\\"close\\":%.4f,\\"volume\\":%lld,\\"direction\\":\\"%s\\"}",
         _Symbol, 
         (long)rates[i].time, 
         rates[i].open, 
         rates[i].high, 
         rates[i].low, 
         rates[i].close,
         (long)rates[i].tick_volume,
         rates[i].close > rates[i].open ? "up" : rates[i].close < rates[i].open ? "down" : "flat"
      );
      
      string url = InpWebServerUrl + "/api/update-market";
      // ... send payload via WebRequest ...
   }
}
```

3. **Backend endpoint:** `POST /api/update-market` already exists and accepts candle data. No changes needed.

**Limitation:** MT5 `CopyRates` lookback is limited by broker history server (typically 1-2 years for M1).

### Option B: Backend Pull via WebSocket (Fallback)

If EA push is insufficient, add WebSocket message handler:

**Backend:** `backend/src/websockets/bridge.ts`
```typescript
ws.on('message', (rawMsg) => {
  const message = JSON.parse(rawMsg.toString());
  
  if (message.type === 'request_history') {
    const { symbol, timeframe, count } = message.payload;
    // Queue request for EA
    // EA will respond via next SyncWithWebApp() poll
  }
  
  if (message.type === 'history_response') {
    const { candles } = message.payload;
    // Store candles in market_candles table
  }
});
```

**EA:** Add history request handling to `SyncWithWebApp()`:
```mql5
void SyncWithWebApp() {
   // ... existing sync code ...
   
   // Check for history requests in response
   if (StringFind(jsonResponse, "history_request") >= 0) {
      SendHistoricalCandles();
   }
}
```

## Implementation Steps

1. Update `backend/src/services/ea-generator.ts` to add `PushHistoricalCandles()` function
2. Update generated EA `OnInit()` to call history push
3. Test with EA connected — verify `market_candles` table populates
4. Add WebSocket `history_response` handler as fallback

## Critical Fragility Warnings

### EA GENERATOR CHANGES BREAK THE EA

1. **MQL5 code is generated, not edited directly**: The EA code in `backend/src/services/ea-generator.ts` is a template string. Any change affects ALL generated EA files.

2. **EA must be re-downloaded after generator changes**: Users must re-download the EA via `/api/ea/download` for changes to take effect.

3. **CopyRates limitations**: MT5's `CopyRates()` can only copy from the current chart's timeframe and symbol. Cross-symbol or cross-timeframe history requests require changing the chart context in the EA.

4. **WebRequest rate limiting**: Sending 1000 candles via individual WebRequest calls will be slow. Consider batching or using `CopyTicks` for bulk data.

## Verification

- [ ] EA sends historical candles on connection
- [ ] Backend stores candles in `market_candles` table
- [ ] Candle data is correct (OHLC, timestamps, direction)
- [ ] No performance impact on EA trading logic
