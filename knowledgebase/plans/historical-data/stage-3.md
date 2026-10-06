# Historical Data Plan — Stage 3: EA Historical Data Support

## Status: ❌ NOT DONE

## Objective

Enable the EA to respond to historical data requests from the backend.

## Current State

- EA broadcasts live candle via `BroadcastMarketUpdate()`
- EA uses `CopyRates(_Symbol, _Period, 0, 2, rates)` for local logic only
- No endpoint to receive history requests
- No `CopyTicks` or extended `CopyRates` lookback for history

## Critical Fragility Warnings

### EA GENERATOR CHANGES BREAK THE EA

1. **MQL5 code is generated, not edited directly**: The EA code in `backend/src/services/ea-generator.ts` and `frontend/src/lib/mql5_generator.ts` is a template string that generates `.mq5` code. Any change to the generator template affects ALL generated EA files.

2. **EA must be re-downloaded after generator changes**: If you modify `ea-generator.ts` or `mql5_generator.ts`, users must re-download the EA via `/api/ea/download` for changes to take effect.

3. **History endpoint requires EA-side HTTP server**: The proposed changes require the EA to listen for HTTP POST requests. MT5's `WebRequest` can only make outbound requests, not listen for inbound ones. The EA would need to poll for history requests instead.

4. **CopyRates limitations**: MT5's `CopyRates()` can only copy from the current chart's timeframe and symbol. Cross-symbol or cross-timeframe history requests require changing the chart context in the EA.

## Proposed Changes

### EA Generator (`backend/src/services/ea-generator.ts`)

Add to generated EA:

1. **History request handler via polling**: EA polls `/api/ea/history-request` every few seconds for pending history requests.
2. **CopyRates support for history**: Use `CopyRates(symbol, timeframe, start, count, rates)` to fetch historical bars.
3. **CopyTicks support**: Use `CopyTicks(symbol, ticks, COPY_TICKS_ALL, 0, count)` for tick-level history.

### Backend Changes

1. **EA generator update** — add history endpoint code to generated EA
2. **Backend route** — `POST /api/ea/request-history` (or similar)
3. **WebSocket message** — `request_history` / `history_response`
4. **Database storage** — store historical candles in `market_candles` table (requires stage-2)

## Implementation Steps

1. Update `backend/src/services/ea-generator.ts` to generate history polling code
2. Update `backend/src/routes/market.ts` to add history request route
3. Update `backend/src/websockets/bridge.ts` to handle history messages
4. Test with EA connected

## Verification

- EA receives history request
- EA responds with historical data
- Backend stores data in `market_candles` table
- Frontend can display historical candles
