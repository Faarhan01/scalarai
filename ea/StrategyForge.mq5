//+------------------------------------------------------------------+
//|                                             StrategyForge.mq5   |
//|            AI-driven strategy lab for MT5's native tester       |
//|                    ScalarAI / StrategyForge Studio              |
//+------------------------------------------------------------------+
//| Purpose                                                          |
//|   One compiled Expert that lets an AI author and evaluate many  |
//|   strategies without recompiling. The strategy is chosen with   |
//|   four independent dropdowns, not one flat mode number:          |
//|                                                                 |
//|     InpClass        scalp / day / swing  -- how long it lives   |
//|     InpFamily       the entry idea        -- MA, RSI, breakout...|
//|     InpIndicator    the confirmation gate -- NONE, EMA, RSI...   |
//|     InpPattern      the candlestick gate  -- engulfing, pinbar...|
//|     InpTimeframeFit which chart lengths are eligible             |
//|                                                                 |
//|   MT5's optimiser then sweeps the numeric inputs of whichever    |
//|   combination is selected, natively.                            |
//|                                                                 |
//| InpMode / ENUM_STRATEGY_MODE is the pre-taxonomy flat list. It   |
//| no longer selects anything: InpFamily does. It is kept only so  |
//| older .set files still load, and OnInit prints a warning when it |
//| is set to anything that disagrees with InpFamily.               |
//+------------------------------------------------------------------+
#property copyright "ScalarAI - StrategyForge Lab"
#property version   "2.00"
#property description "Multi-strategy backtesting & research EA for MetaTrader 5 Strategy Tester."
#property strict

#include <Trade\Trade.mqh>

//=== Strategy family =====================================================
enum ENUM_STRATEGY_MODE
  {
   MODE_MA_CROSS          = 0,  // Fast/Slow EMA cross
   MODE_RSI_REVERT        = 1,  // RSI mean reversion from extremes
   MODE_BREAKOUT          = 2,  // Donchian channel breakout
   MODE_BOLLINGER         = 3,  // Bollinger Band touch reversion
   MODE_MACD              = 4,  // MACD line vs signal crossover
   MODE_PATTERN_SCAN      = 5,  // Candlestick Pattern Recognition (Hammer, Engulfing, Pin bar)
   MODE_INDICATOR_INSP    = 6,  // Indicator Inspector (EMA + RSI + Bollinger Confluence)
   MODE_AI_ADAPTIVE       = 7,  // AI Adaptive Momentum Velocity
   MODE_RUN_FADE          = 8,  // Exhaust an N-bar run (staircase strength)
   MODE_VOL_EXPANSION     = 9,  // Only trade when |move| exceeds baseline x k
   MODE_RANGE_REVERSION   = 10, // Fade moves to the edge of a rolling range
   MODE_TREND_PULLBACK    = 11, // Trend continuation on a pullback to the EMA
   MODE_SEQUENTIAL        = 12  // Alternate fade/follow; state machine
  };

//=== Trading class ======================================================
// How long a trade is meant to live. This selects sensible defaults for the
// stop, target and the eligible timeframes, so a swing configuration is not
// silently run with a 1.2-pip scalp stop.
enum ENUM_STRAT_CLASS
  {
   CLASS_SCALP  = 0,  // Minutes. Many small trades, tight stop, spread-critical
   CLASS_DAY    = 1,  // Hours. Held within the session
   CLASS_SWING  = 2   // Days. Wider stop, tolerant of noise
  };

//=== Strategy family ====================================================
// The entry idea. Indicator and pattern choices are separate inputs, so a
// family is not welded to one indicator.
enum ENUM_STRAT_FAMILY
  {
   FAM_MA_CROSS      = 0,  // Fast/slow EMA cross
   FAM_RSI_REVERT    = 1,  // RSI extreme -> fade back to the mean
   FAM_BREAKOUT      = 2,  // Close outside a Donchian channel
   FAM_BOLLINGER     = 3,  // Band touch -> reversion
   FAM_MACD          = 4,  // MACD main vs signal
   FAM_PATTERN       = 5,  // Candlestick shape only, no indicator
   FAM_MOMENTUM      = 6,  // Velocity over a lookback
   FAM_RUN_FADE      = 7,  // Exhaust an N-bar staircase
   FAM_VOL_EXPANSION = 8,  // Trade only when the bar is unusually large
   FAM_RANGE_REVERT  = 9,  // Fade the edge of a rolling range
   FAM_TREND_PULLBACK= 10, // Continuation on a pullback to the fast EMA
   FAM_SEQUENTIAL    = 11  // Alternate fade / follow
  };

//=== Indicator confirmation =============================================
// Applied as a gate AFTER the family produces a direction. NONE disables it.
enum ENUM_INDICATOR_SET
  {
   GATE_NONE      = 0,
   GATE_EMA_TREND = 1,  // Fast EMA must agree with the side
   GATE_RSI       = 2,  // RSI must not be against the side (no chasing extremes)
   GATE_BANDS     = 3,  // Must not already be extended past the band
   GATE_ATR       = 4,  // Volatility must be above its own median
   GATE_ADX       = 5,  // Trend strength must be above a floor
   GATE_EMA_RSI   = 6,  // Both trend and momentum
   GATE_MACD      = 7
  };

//=== Candlestick pattern filter =========================================
// Shape requirement on the signal bar. NONE disables it.
enum ENUM_PATTERN_FILTER
  {
   PAT_NONE      = 0,
   PAT_ENGULFING = 1,  // Engulfing in the trade direction
   PAT_PINBAR    = 2,  // Rejection wick at the far end
   PAT_RUN       = 3,  // Bar extends the current run
   PAT_INSIDE    = 4,  // Inside bar (compression)
   PAT_DOJI      = 5,  // Indecision bar
   PAT_LONG_BODY = 6   // Body larger than the recent median
  };

//=== Timeframe filter ===================================================
enum ENUM_TIMEFRAME_FILTER
  {
   TFF_ANY       = 0,
   TFF_SCALP     = 1,  // M1, M2, M3, M5
   TFF_DAY       = 2,  // M15, M30, H1
   TFF_SWING     = 3   // H4, D1 and above
  };

//=== What OnTester() should optimise ===================================
enum ENUM_CRITERION
  {
   CRIT_BALANCE      = 0,  // Final balance (MT5 default)
   CRIT_SHARPE       = 1,  // Risk-adjusted return (Sharpe Ratio)
   CRIT_PROFIT_FACT  = 2,  // Gross win / gross loss
   CRIT_CALMAR       = 3,  // Profit / max drawdown %
   CRIT_PENALISED    = 4,  // Profit minus a drawdown penalty
   CRIT_TRADE_COUNT  = 5   // Trade count (sanity check)
  };

//--- Strategy selection
input group                 "=== Strategy Selection ==="
input ENUM_STRATEGY_MODE    InpMode          = MODE_MA_CROSS; // Strategy Engine Mode
input ENUM_TIMEFRAMES       InpTimeframe     = PERIOD_CURRENT;// Signal Timeframe
input int                   InpFast          = 12;            // Fast period (EMA / Breakout)
input int                   InpSlow          = 26;            // Slow period (EMA / MACD)
input int                   InpPeriod        = 14;            // Generic period (RSI / Bands / Lookback)
input double                InpThreshold     = 2.0;           // Band multiplier or RSI offset
input int                   InpConfirmBars   = 0;             // Persistence filter (bars)

//--- Risk Management
input group                 "=== Risk & Execution ==="
input double                InpLots          = 0.10;          // Fixed lot size
input double                InpRiskPercent   = 0.0;           // % of equity at risk (>0 overrides InpLots)
input double                InpStopPips      = 20.0;          // Stop loss in pips (0 = none)
input double                InpTakePips      = 30.0;          // Take profit in pips (0 = none)
input int                   InpMaxHoldBars   = 0;             // Time stop (max bars held, 0 = off)
input int                   InpMagic         = 20260117;      // Magic Number

//--- Strategy selection: four independent dimensions, four dropdowns
input group                 "=== Strategy ==="
input ENUM_STRAT_CLASS       InpClass        = CLASS_SCALP;  // Trading class
input ENUM_STRAT_FAMILY      InpFamily       = FAM_MA_CROSS; // Entry idea
input ENUM_INDICATOR_SET     InpIndicator    = GATE_NONE;     // Confirmation filter
input ENUM_PATTERN_FILTER    InpPattern      = PAT_NONE;     // Candlestick filter
input ENUM_TIMEFRAME_FILTER  InpTimeframeFit = TFF_ANY;      // Timeframe filter

//--- Pattern search & statistical guard
input group                 "=== Pattern Search & Guard ==="
input int                   InpRunLen        = 3;      // bars in the run to fade (mode 8)
input double                InpStrengthMin   = 0.4;    // staircase strength floor, 0..1
input int                   InpRangeLen      = 30;     // rolling range lookback (mode 10)
input double                InpVolMult       = 1.5;    // x baseline |move| to qualify (mode 9)
input int                   InpSpreadMaxTicks = 0;     // 0=off; refuse entries above this spread
input int                   InpMinEdgeTicks  = 0;      // 0=off; require (TP - spread) >= N ticks
input int                   InpMinTrades     = 30;     // below this, the verdict says INCONCLUSIVE

//--- Extras & Protections
input group                 "=== Extras & Protections ==="
input int                   InpTrailPoints   = 0;             // Trailing stop distance in points
input int                   InpTrailStep     = 10;            // Trailing step in points
input int                   InpBreakevenPips = 0;             // Move stop to breakeven after N pips
input int                   InpMaxSpreadPts  = 50;            // Refuse entry above this spread
input int                   InpMaxPositions  = 1;             // Maximum concurrent positions

//--- Machine reporting & Platform Connection
input group                 "=== Platform Integration & Reporting ==="
input string                InpPostUrl       = "http://127.0.0.1:4000"; // ScalarAI Platform URL
input string                InpPostPath      = "/api/research/strategyforge-result"; // Endpoint Path
input ENUM_CRITERION        InpCriterion     = CRIT_SHARPE;   // Optimisation Objective
input double                InpDrawdownPenalty = 50.0;        // Penalty weight for CRIT_PENALISED
input string                InpTag           = "default";     // Report tag / session label
input bool                  InpWriteReport   = true;          // Write CSV report file
input bool                  InpVerboseLog    = true;          // Log decision reasons to journal

//=== Globals ============================================================
CTrade         g_trade;
int            g_hFast     = INVALID_HANDLE;
int            g_hSlow     = INVALID_HANDLE;
int            g_hRSI      = INVALID_HANDLE;
int            g_hBands    = INVALID_HANDLE;
int            g_hMACD     = INVALID_HANDLE;
double         g_tickSize  = 0.0;
int            g_digits    = 5;
datetime       g_lastBar   = 0;
int            g_barsHeld  = 0;
int            g_trades    = 0;
int            g_skipped   = 0;
int            g_blocks    = 0;
int            g_clamped   = 0;   // SL/TP widened to the broker minimum
double         g_minStopDist = 0.0; // broker min stop, in price units

// --- Deal scan, filled by ScanDeals(). Measured, never assumed. ---------
int            g_dealCount   = 0;
int            g_dealWins    = 0;
int            g_dealLosses  = 0;
double         g_dealGrossWin  = 0.0;
double         g_dealGrossLoss = 0.0;
double         g_dealSum     = 0.0;
double         g_dealSum2    = 0.0;
double         g_winTicks    = 0.0;  // sum of winning distances, ticks
double         g_lossTicks   = 0.0;  // sum of losing distances, ticks
datetime       g_firstDeal   = 0;    // earliest DEAL_TIME among our own deals
datetime       g_lastDeal    = 0;    // latest   DEAL_TIME among our own deals
datetime       g_testFrom    = 0;    // span the trades occupy; set in OnTester
datetime       g_testTo      = 0;    // from the deal history, not from Bars()
double         g_volume    = 0.0;
double         g_pip      = 0.0;    // pip size in price units, set in OnInit
bool           g_wrote     = false;
string         g_lastReason = "";

//--- Forward Declarations
double NormPrice(const double p);
double NormLots(const double requested);
bool   Val(const int handle, const int buffer, const int shift, double &out);
double DonchianHigh(const int n, const int shift);
double DonchianLow(const int n, const int shift);
int    CountPositions();
bool   HasOurPosition();
void   Say(const string reason);
int    SignalFor(const int shift);
void   TryEnter(const int signal);
void   ManagePosition();

//+------------------------------------------------------------------+
//| Round-trip cost as a percentage of the take profit.               |
//|                                                                  |
//| A rule paying 40% of its target in spread needs a 62.5% win rate  |
//| just to break even. Surfacing this in the report makes an         |
//| untradeable configuration obvious rather than merely disappointing|
//+------------------------------------------------------------------+
double costShare()
  {
   // The share of the take profit that goes to the spread.
   //
   // One spread, not two. A round trip lifts the ask on entry and hits the bid
   // on exit, and the difference between those two prints IS the spread -- it is
   // paid once per round trip. Charging 2x overstated the cost of every run by
   // exactly 100%.
   //
   // Deliberately the exact figure rather than one derived from AvgWinTicks():
   // the measured legs carry a small uniform scale offset on this symbol
   // (~2%, most likely the money-to-ticks conversion crossing into the account
   // currency), and subtracting a mis-scaled leg from the target produced a
   // nonsensical NEGATIVE cost share. BreakevenWinRate() reads the same two
   // legs but as a RATIO, so the scale cancels and it stays trustworthy.
   double tp = InpTakePips * g_pip / g_tickSize;   // target in ticks
   if(tp <= 0.0) return(0.0);
   return(100.0 * SpreadInTicks() / tp);
  }

//+------------------------------------------------------------------+
//| Staircase strength of the last n bars, 0..1.                       |
//|                                                                  |
//| Net span divided by the sum of same-direction bodies. A clean     |
//| staircase approaches 1; a noisy drift with alternating bodies      |
//| scores near 0 even though the bars are all the same colour.       |
//+------------------------------------------------------------------+
double StairStrength(const int n, const int shift)
  {
   if(Bars(_Symbol, InpTimeframe) < n + 1) return(0.0);
   double first = iOpen(_Symbol, InpTimeframe, shift + n - 1);
   double last  = iClose(_Symbol, InpTimeframe, shift);
   double span  = MathAbs(last - first);
   if(span <= 0.0) return(0.0);

   double bodies = 0.0;
   for(int i = 0; i < n; i++)
     {
      double o = iOpen(_Symbol, InpTimeframe, shift + i);
      double c = iClose(_Symbol, InpTimeframe, shift + i);
      double b = MathAbs(c - o);
      if(b <= 0.0) continue;
      // Only same-direction bodies count; opposing colour penalises the score.
      if((last > first && c > o) || (last < first && c < o)) bodies += b;
     }
   if(bodies <= 0.0) return(0.0);
   double s = span / bodies;
   return(s > 1.0 ? 1.0 : s);
  }

//+------------------------------------------------------------------+
//| Median absolute bar move over n bars: the volatility baseline.    |
//|                                                                  |
//| Median rather than standard deviation, and a plain recent window  |
//| rather than an expanding average, because this instrument has no  |
//| volatility clustering to exploit (|move| autocorrelation |z| < 1.4)|
//| -- an adaptive filter would only re-state recent volatility.      |
//+------------------------------------------------------------------+
double MeanAbsMove(const int n)
  {
   int cnt = MathMin(n, Bars(_Symbol, InpTimeframe) - 1);
   if(cnt < 5) return(0.0);
   double buf[];
   ArrayResize(buf, cnt);
   ArraySetAsSeries(buf, false);
   // Start at shift 2, not 1: signals are read at shift 1, so starting at
   // 1 would fold the signal bar's own move into the baseline it is being
   // measured against, inflating the bar and suppressing the very trades
   // VOL_EXPANSION, GATE_ATR and PAT_LONG_BODY exist to take.
   if(CopyClose(_Symbol, InpTimeframe, 2, cnt, buf) != cnt)
      return(0.0);
   for(int i = 0; i < cnt; i++)
     {
      double prev = (i + 1 < cnt) ? buf[i + 1] : buf[i];
      buf[i] = MathAbs(buf[i] - prev);
     }
   ArraySort(buf);
   return(buf[cnt / 2]);
  }

//+------------------------------------------------------------------+
//| Current spread expressed in ticks. 0 when unavailable.           |
//+------------------------------------------------------------------+
double SpreadInTicks()
  {
   double pt = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(pt <= 0.0) return(0.0);
   long sp = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(sp < 0) return(0.0);
   return((double)sp * pt / g_tickSize);
  }

//+------------------------------------------------------------------+
//| t-statistic of realised trade profit.                             |
//|                                                                  |
//| Read from the tester's own deal history rather than accumulated   |
//| in the EA, so the reported figure is what MT5 booked. |t| < 2     |
//| means the result is consistent with chance however good it looks. |
//+------------------------------------------------------------------+
void ScanDeals()
  {
   g_dealCount = g_dealWins = g_dealLosses = 0;
   g_dealGrossWin = g_dealGrossLoss = 0.0;
   g_dealSum = g_dealSum2 = 0.0;
   g_winTicks = g_lossTicks = 0.0;
   g_firstDeal = 0;
   g_lastDeal = 0;

   if(!HistorySelect(0, TimeCurrent())) return;

   const double tickVal = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   const double tickSz  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);

   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;
      if(HistoryDealGetInteger(ticket, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
      if((long)HistoryDealGetInteger(ticket, DEAL_MAGIC) != (long)InpMagic) continue;

      double p = HistoryDealGetDouble(ticket, DEAL_PROFIT)
               + HistoryDealGetDouble(ticket, DEAL_COMMISSION)
               + HistoryDealGetDouble(ticket, DEAL_SWAP);

      // The span these trades actually occupy. Taken from the deals rather
      // than from Bars()/SERIES_FIRSTDATE in OnInit, because in the tester
      // those report whatever history is loaded -- not the simulated window
      // -- which produced a from_date of 2025.01.01 for a September 2026 run.
      datetime when = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      if(when > 0)
        {
         if(g_firstDeal == 0 || when < g_firstDeal) g_firstDeal = when;
         if(g_lastDeal  == 0 || when > g_lastDeal)  g_lastDeal  = when;
        }

      g_dealCount++;
      g_dealSum  += p;
      g_dealSum2 += p * p;

      // Convert the money result into ticks actually travelled, so the
      // report can state the realised legs instead of the requested ones.
      //
      //   ticks = money / (volume * tickValue)
      //
      // tickValue is already money per tick of price movement, so tickSize
      // must NOT appear here. Including it returns PRICE UNITS, not ticks --
      // which made a 12-tick target compare against a 1.2-unit leg and
      // produced a nonsensical 89.77% cost share.
      //
      // 0 means "unavailable" (no tick value, or zero volume), and every
      // caller treats 0 as missing rather than as a real measurement.
      double vol = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double ticks = 0.0;
      if(tickVal > 0.0 && vol > 0.0)
         ticks = p / (vol * tickVal);

      if(p > 0.0) { g_dealWins++; g_dealGrossWin += p;  g_winTicks  += ticks; }
      else       { g_dealLosses++; g_dealGrossLoss += -p; g_lossTicks += -ticks; }
     }
  }

double TradeTStat()
  {
   ScanDeals();
   int cnt = g_dealCount;
   if(cnt < 3) return(0.0);
   double mean = g_dealSum / cnt;
   double var = (g_dealSum2 - cnt * mean * mean) / (cnt - 1);
   if(var <= 0.0) return(0.0);
   return(mean / MathSqrt(var / cnt));
  }

//+------------------------------------------------------------------+
//| Win rate, measured from the deal history.                        |
//|                                                                  |
//| This is the number that says whether a rule has any directional  |
//| skill at all. Profit factor alone cannot: a 50% win rate and a  |
//| 30% one can both print PF=0.8 at different leg ratios, and the  |
//| report used to force the reader to back-solve it from profit and |
//| an assumed cost model.                                           |
//+------------------------------------------------------------------+
double TradeWinRate()
  {
   ScanDeals();
   if(g_dealCount < 1) return(0.0);
   return(100.0 * g_dealWins / g_dealCount);
  }

//+------------------------------------------------------------------+
//| Realised average win and loss, in ticks.                         |
//|                                                                  |
//| Trust the RATIO of these two, not their absolute values. The    |
//| money-to-ticks conversion picks up an account-currency factor on |
//| this symbol (measured legs come out ~2% above the requested 12  |
//| ticks), which scales both legs identically. BreakevenWinRate()    |
//| divides by their sum and so cancels it; these two do not.        |
//+------------------------------------------------------------------+
double AvgWinTicks()
  {
   ScanDeals();
   if(g_dealWins < 1) return(0.0);
   return(g_winTicks / g_dealWins);
  }

double AvgLossTicks()
  {
   ScanDeals();
   if(g_dealLosses < 1) return(0.0);
   return(g_lossTicks / g_dealLosses);
  }

//+------------------------------------------------------------------+
//| Win rate required to break even at the realised legs.           |
//+------------------------------------------------------------------+
double BreakevenWinRate()
  {
   double w = AvgWinTicks();
   double l = AvgLossTicks();
   if(w <= 0.0 || l <= 0.0) return(0.0);
   return(100.0 * l / (w + l));
  }

//+------------------------------------------------------------------+
//| Profit factor from the same history.                              |
//+------------------------------------------------------------------+
double TradeProfitFactor()
  {
   ScanDeals();
   if(g_dealGrossLoss <= 0.0)
      return(g_dealGrossWin > 0.0 ? 99.0 : 0.0);
   return(g_dealGrossWin / g_dealGrossLoss);
  }

//+------------------------------------------------------------------+
//| Plain-language verdict.                                           |
//|                                                                  |
//| An EA that only prints profit will report a curve-fitted patch as a|
//| result, so the report states whether the evidence is sufficient.   |
//+------------------------------------------------------------------+
string Verdict()
  {
   // Semicolons, never commas. This string is written unquoted into a
   // comma-delimited CSV, and a single comma here silently shifts every
   // field after it -- which is exactly how a run gets filed as though it
   // measured something it did not.
   int n = (int)TesterStatistics(STAT_TRADES);
   if(n <= 0)                return "NO TRADES";
   if(n < InpMinTrades)      return StringFormat("INCONCLUSIVE (%d trades < %d)", n, InpMinTrades);

   // A significant LOSS is a different finding from an absence of one, and
   // reporting it as "NO EDGE" flatters the strategy.
   double t = TradeTStat();
   if(t < -2.0)              return StringFormat("NEGATIVE EDGE (t=%.2f; win %.1f%% vs %.1f%% needed)", t, TradeWinRate(), BreakevenWinRate());
   if(MathAbs(t) < 2.0)      return StringFormat("NO EDGE (|t|=%.2f; win %.1f%% vs %.1f%% needed)", MathAbs(t), TradeWinRate(), BreakevenWinRate());

   double pf = TradeProfitFactor();
   if(pf <= 1.0)             return StringFormat("NO EDGE (|t|=%.2f; PF=%.2f; win %.1f%%)", MathAbs(t), pf, TradeWinRate());
   return StringFormat("CANDIDATE (t=%.2f; PF=%.2f; win %.1f%% vs %.1f%% needed; n=%d)",
                       t, pf, TradeWinRate(), BreakevenWinRate(), n);
  }
double Score();
double CSVNetPips();
double StairStrength(const int n, const int shift);
int    BaseSignal(ENUM_STRAT_FAMILY fam, const int shift);
int    IndicatorGate(const int dir, const int shift);
int    PatternGate(const int dir, const int shift);
bool   TimeframeAllowed();
string ClassName(ENUM_STRAT_CLASS c);
string ConfigSummary();
double MinStopDistance();
void   CreateHandles();
string FamilyName(ENUM_STRAT_FAMILY f);
string IndicatorName(ENUM_INDICATOR_SET i);
string PatternName(ENUM_PATTERN_FILTER p);
double MeanAbsMove(const int n);
void   ScanDeals();
double TradeTStat();
double TradeProfitFactor();
double TradeWinRate();
double AvgWinTicks();
double AvgLossTicks();
double BreakevenWinRate();
double SpreadInTicks();
string Verdict();
double costShare();
uint   FnHash(const string s);
void   WriteReport(const double score, const bool hashed = false);
void   PostResult(const double score);
int    HttpPost(const string url, const string jsonPayload, string &responseOut);
string GetModeName(ENUM_STRATEGY_MODE mode);

//+------------------------------------------------------------------+
//| Mode String Helper                                               |
//+------------------------------------------------------------------+
string GetModeName(ENUM_STRATEGY_MODE mode)
{
   switch(mode)
   {
      case MODE_MA_CROSS:       return "MA_CROSS";
      case MODE_RSI_REVERT:     return "RSI_REVERSION";
      case MODE_BREAKOUT:       return "DONCHIAN_BREAKOUT";
      case MODE_BOLLINGER:      return "BOLLINGER_BANDS";
      case MODE_MACD:           return "MACD_CROSS";
      case MODE_PATTERN_SCAN:   return "PATTERN_RECOGNITION";
      case MODE_INDICATOR_INSP: return "INDICATOR_INSPECTOR";
      case MODE_AI_ADAPTIVE:    return "AI_ADAPTIVE";
      case MODE_RUN_FADE:       return "RUN_FADE";
      case MODE_VOL_EXPANSION:  return "VOL_EXPANSION";
      case MODE_RANGE_REVERSION: return "RANGE_REVERSION";
      case MODE_TREND_PULLBACK: return "TREND_PULLBACK";
      case MODE_SEQUENTIAL:     return "SEQUENTIAL";
   }
   return "UNKNOWN";
}

//+------------------------------------------------------------------+
//| Normalize Price to tick size                                     |
//+------------------------------------------------------------------+
double NormPrice(const double p)
{
   if(g_tickSize <= 0.0) return(p);
   return(NormalizeDouble(MathRound(p / g_tickSize) * g_tickSize, g_digits));
}

//+------------------------------------------------------------------+
//| Make a string safe for the comma-delimited CSV.                   |
//|                                                                  |
//| One comma inside any string field silently shifts every field     |
//| after it, so the row still parses and still looks plausible --    |
//| it just means something other than what it says. Verdict() shipped|
//| exactly that bug once. Strip separators rather than quote, so the |
//| output stays trivially readable and still one line per run.       |
//+------------------------------------------------------------------+
string CsvField(const string s)
  {
   string out = s;
   StringReplace(out, ",", ";");
   StringReplace(out, "\n", " ");
   StringReplace(out, "\r", " ");
   return out;
  }

//+------------------------------------------------------------------+
//| Clamp a requested lot to broker limits                           |
//+------------------------------------------------------------------+
double NormLots(const double requested)
{
   double vMin  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vMax  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double vStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(vStep <= 0.0) return(0.0);

   double v = requested;
   if(v < vMin) v = vMin;
   if(vMax > 0.0 && v > vMax) v = vMax;

   v = MathFloor(v / vStep + 0.5) * vStep;
   if(v < vMin) v = vMin;
   if(vMax > 0.0 && v > vMax) v = vMax;
   return(v);
}

//+------------------------------------------------------------------+
//| Read one indicator value buffer                                  |
//+------------------------------------------------------------------+
bool Val(const int handle, const int buffer, const int shift, double &out)
{
   double buf[1];
   if(handle == INVALID_HANDLE) return(false);
   if(CopyBuffer(handle, buffer, shift, 1, buf) != 1) return(false);
   if(buf[0] == EMPTY_VALUE) return(false);
   out = buf[0];
   return(true);
}

//+------------------------------------------------------------------+
//| Donchian High / Low                                              |
//+------------------------------------------------------------------+
double DonchianHigh(const int n, const int shift)
{
   double hi = 0.0;
   for(int k = shift + 1; k <= shift + n; k++)
   {
      double v = iHigh(_Symbol, InpTimeframe, k);
      if(v <= 0.0) return(0.0);
      if(v > hi) hi = v;
   }
   return(hi);
}

double DonchianLow(const int n, const int shift)
{
   double lo = 0.0;
   for(int k = shift + 1; k <= shift + n; k++)
   {
      double v = iLow(_Symbol, InpTimeframe, k);
      if(v <= 0.0) return(0.0);
      if(lo == 0.0 || v < lo) lo = v;
   }
   return(lo);
}

int CountPositions()
{
   int total = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(PositionGetTicket(i) > 0)
      {
         if(PositionGetInteger(POSITION_MAGIC) == InpMagic) total++;
      }
   }
   return(total);
}

bool HasOurPosition()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(PositionGetTicket(i) > 0 &&
         PositionGetInteger(POSITION_MAGIC) == InpMagic &&
         PositionGetString(POSITION_SYMBOL) == _Symbol)
         return(true);
   }
   return(false);
}

void Say(const string reason)
{
   g_lastReason = reason;
   if(InpVerboseLog) Print("[SF] ", reason);
}

//+------------------------------------------------------------------+
//| Strategy Logic, in four layers. Each may only VETO the layer      |
//| before it -- none can invent a direction of its own.              |
//|                                                                  |
//|   Layer 1  BaseSignal      family -> +1 / -1 / 0                  |
//|   Layer 2  IndicatorGate   confirmation, veto only                |
//|   Layer 3  PatternGate     candlestick shape, veto only            |
//|   Layer 4  TimeframeAllowed  which chart lengths are eligible     |
//|                                                                  |
//|   SignalFor  composes all four into one decision.                 |
//|                                                                  |
//| Veto-only is deliberate. On an instrument that measures as a      |
//| random walk, stacking conditions onto a 45%-hit-rate base cannot  |
//| manufacture edge -- it can only shrink the sample. The report's  |
//| t_stat is what says whether the smaller sample is still worth    |
//| anything.                                                         |
//+------------------------------------------------------------------+
//+------------------------------------------------------------------+
//| Human-readable names, and a one-line summary of the live config.   |
//+------------------------------------------------------------------+
string ClassName(ENUM_STRAT_CLASS c)
  {
   switch(c)
     { case CLASS_SCALP: return "SCALP"; case CLASS_DAY: return "DAY";
       case CLASS_SWING: return "SWING"; }
   return "UNKNOWN";
  }

string FamilyName(ENUM_STRAT_FAMILY f)
  {
   switch(f)
     {
      case FAM_MA_CROSS:       return "MA_CROSS";
      case FAM_RSI_REVERT:     return "RSI_REVERT";
      case FAM_BREAKOUT:       return "BREAKOUT";
      case FAM_BOLLINGER:      return "BOLLINGER";
      case FAM_MACD:           return "MACD";
      case FAM_PATTERN:        return "PATTERN";
      case FAM_MOMENTUM:       return "MOMENTUM";
      case FAM_RUN_FADE:       return "RUN_FADE";
      case FAM_VOL_EXPANSION:  return "VOL_EXPANSION";
      case FAM_RANGE_REVERT:   return "RANGE_REVERT";
      case FAM_TREND_PULLBACK: return "TREND_PULLBACK";
      case FAM_SEQUENTIAL:     return "SEQUENTIAL";
     }
   return "UNKNOWN";
  }

string IndicatorName(ENUM_INDICATOR_SET i)
  {
   switch(i)
     {
      case GATE_NONE:      return "NONE";
      case GATE_EMA_TREND: return "EMA_TREND";
      case GATE_RSI:       return "RSI";
      case GATE_BANDS:     return "BANDS";
      case GATE_ATR:       return "ATR";
      case GATE_ADX:       return "ADX";
      case GATE_EMA_RSI:   return "EMA_RSI";
      case GATE_MACD:      return "MACD";
     }
   return "UNKNOWN";
  }

string PatternName(ENUM_PATTERN_FILTER p)
  {
   switch(p)
     {
      case PAT_NONE:      return "NONE";
      case PAT_ENGULFING: return "ENGULFING";
      case PAT_PINBAR:    return "PINBAR";
      case PAT_RUN:       return "RUN";
      case PAT_INSIDE:    return "INSIDE";
      case PAT_DOJI:      return "DOJI";
      case PAT_LONG_BODY: return "LONG_BODY";
     }
   return "UNKNOWN";
  }

string ConfigSummary()
  {
   return StringFormat("%s/%s ind=%s pat=%s tf=%s",
                       ClassName(InpClass), FamilyName(InpFamily),
                       IndicatorName(InpIndicator), PatternName(InpPattern),
                       EnumToString(InpTimeframeFit));
  }

//+------------------------------------------------------------------+
//| STRATEGY LAYER 1 of 4 - base direction from the family.           |
//|                                                                  |
//| This is the only layer allowed to originate a trade idea. Every   |
//| other layer may veto. Returns +1 buy, -1 sell, 0 no opinion.       |
//+------------------------------------------------------------------+
int BaseSignal(ENUM_STRAT_FAMILY fam, const int shift)
  {
   double a, b, c, d;

   switch(fam)
     {
      case FAM_MA_CROSS:
        {
         if(!Val(g_hFast, 0, shift, a))      return(0);
         if(!Val(g_hFast, 0, shift + 1, b))  return(0);
         if(!Val(g_hSlow, 0, shift, c))      return(0);
         if(!Val(g_hSlow, 0, shift + 1, d))  return(0);
         if(b <= d && a > c) return(+1);
         if(b >= d && a < c) return(-1);
         return(0);
        }
      case FAM_RSI_REVERT:
        {
         if(!Val(g_hRSI, 0, shift, a)) return(0);
         double hi = 50.0 + InpThreshold;
         double lo = 50.0 - InpThreshold;
         if(a < lo) return(+1);   // oversold -> buy
         if(a > hi) return(-1);   // overbought -> sell
         return(0);
        }
      case FAM_BREAKOUT:
        {
         int n = MathMax(InpFast, 1);
         double hi = DonchianHigh(n, shift);
         double lo = DonchianLow(n, shift);
         if(hi <= 0.0 || lo <= 0.0) return(0);
         double cl = iClose(_Symbol, InpTimeframe, shift);
         if(cl > hi) return(+1);
         if(cl < lo) return(-1);
         return(0);
        }
      case FAM_BOLLINGER:
        {
         if(!Val(g_hBands, 1, shift, a)) return(0);   // upper
         if(!Val(g_hBands, 2, shift, b)) return(0);   // lower
         double cl = iClose(_Symbol, InpTimeframe, shift);
         if(cl < b) return(+1);
         if(cl > a) return(-1);
         return(0);
        }
      case FAM_MACD:
        {
         if(!Val(g_hMACD, 0, shift, a))      return(0);
         if(!Val(g_hMACD, 1, shift, b))      return(0);
         if(!Val(g_hMACD, 0, shift + 1, c))  return(0);
         if(!Val(g_hMACD, 1, shift + 1, d))  return(0);
         if(c <= d && a > b) return(+1);
         if(c >= d && a < b) return(-1);
         return(0);
        }
      case FAM_PATTERN:
        {
         // Shape only. The family does not need an indicator, which is why
         // it is worth keeping separate from the rest.
         if(!PatternGate(0, shift)) return(0);
         double o = iOpen(_Symbol, InpTimeframe, shift);
         double cl = iClose(_Symbol, InpTimeframe, shift);
         if(cl == o) return(0);
         return(cl > o ? +1 : -1);
        }
      case FAM_MOMENTUM:
        {
         int lb = MathMax(InpPeriod, 5);
         double now  = iClose(_Symbol, InpTimeframe, shift);
         double prev = iClose(_Symbol, InpTimeframe, shift + lb);
         if(now <= 0.0 || prev <= 0.0) return(0);
         double pt = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
         if(pt <= 0.0) pt = 0.0001;
         double vel = ((now - prev) / (pt * 10.0)) / (double)lb;
         double th = (InpThreshold > 0.0) ? InpThreshold : 1.5;
         if(vel >  th) return(+1);
         if(vel < -th) return(-1);
         return(0);
        }
      case FAM_RUN_FADE:
        {
         // Fade a genuine staircase, not merely same-coloured bars: the net
         // span must cover most of the summed same-direction bodies.
         int n = MathMax(InpRunLen, 2);
         if(Bars(_Symbol, InpTimeframe) < n + 1) return(0);
         if(StairStrength(n, shift) < InpStrengthMin) return(0);
         double first = iOpen(_Symbol, InpTimeframe, shift + n - 1);
         double last  = iClose(_Symbol, InpTimeframe, shift);
         if(last > first) return(-1);   // ran up -> fade
         if(last < first) return(+1);
         return(0);
        }
      case FAM_VOL_EXPANSION:
        {
         // Change WHEN we trade, not which way. On a random walk the direction
         // of a large bar is no more predictable than any other, so this takes
         // the reversion side and lets the t_stat decide.
         double base = MeanAbsMove(MathMax(InpRangeLen, 10));
         if(base <= 0.0) return(0);
         double cl = iClose(_Symbol, InpTimeframe, shift);
         double pv = iClose(_Symbol, InpTimeframe, shift + 1);
         if(MathAbs(cl - pv) < InpVolMult * base) return(0);
         return(cl > pv ? -1 : +1);
        }
      case FAM_RANGE_REVERT:
        {
         int n = MathMax(InpRangeLen, 5);
         double hi = DonchianHigh(n, shift + 1);
         double lo = DonchianLow(n, shift + 1);
         if(hi <= 0.0 || lo <= 0.0) return(0);
         double cl = iClose(_Symbol, InpTimeframe, shift);
         if(cl >= hi) return(-1);
         if(cl <= lo) return(+1);
         return(0);
        }
      case FAM_TREND_PULLBACK:
        {
         if(!Val(g_hFast, 0, shift, a))     return(0);
         if(!Val(g_hSlow, 0, shift, b))     return(0);
         if(!Val(g_hFast, 0, shift + 1, c)) return(0);
         double cl = iClose(_Symbol, InpTimeframe, shift);
         if(a > b && cl <= a) return(+1);   // uptrend, dipped to fast EMA
         if(a < b && cl >= a) return(-1);   // downtrend, pushed to fast EMA
         return(0);
        }
      case FAM_SEQUENTIAL:
        {
         // Deliberately stateful: if a constant side never shows an edge, a
         // rule that alternates might. Flips every three trades.
         double pv = iClose(_Symbol, InpTimeframe, shift + 1);
         double cl = iClose(_Symbol, InpTimeframe, shift);
         int dir = (cl > pv) ? +1 : (cl < pv ? -1 : 0);
         if(dir == 0) return(0);
         return(((g_trades / 3) % 2 == 0) ? -dir : dir);
        }
     }
   return(0);
  }

//+------------------------------------------------------------------+
//| STRATEGY LAYER 2 of 4 - indicator confirmation.                    |
//| Veto only: returns 0 to cancel, or `dir` unchanged to allow.       |
//+------------------------------------------------------------------+
int IndicatorGate(const int dir, const int shift)
  {
   if(dir == 0 || InpIndicator == GATE_NONE) return(dir);
   double a, b, c;

   switch(InpIndicator)
     {
      case GATE_EMA_TREND:
        if(!Val(g_hFast, 0, shift, a)) return(0);
        if(!Val(g_hSlow, 0, shift, b)) return(0);
        if(dir > 0 && !(a > b)) return(0);
        if(dir < 0 && !(a < b)) return(0);
        break;

      case GATE_RSI:
        // Do not enter a long into an overbought reading or a short into an
        // oversold one: that is chasing, which is the opposite of reversion.
        if(!Val(g_hRSI, 0, shift, c)) return(0);
        if(dir > 0 && c > 70.0) return(0);
        if(dir < 0 && c < 30.0) return(0);
        break;

      case GATE_BANDS:
        {
         if(!Val(g_hBands, 1, shift, a)) return(0);
         if(!Val(g_hBands, 2, shift, b)) return(0);
         double cl = iClose(_Symbol, InpTimeframe, shift);
         if(dir > 0 && cl > a) return(0);
         if(dir < 0 && cl < b) return(0);
         break;
        }

      case GATE_ATR:
        {
         // Volatility must be at least its own median over the lookback,
         // so the rule only fires when a move can plausibly reach the target.
         double med = MeanAbsMove(MathMax(InpRangeLen, 10));
         if(med <= 0.0) return(0);
         double clA = iClose(_Symbol, InpTimeframe, shift);
         double pvA = iClose(_Symbol, InpTimeframe, shift + 1);
         if(MathAbs(clA - pvA) < med) return(0);
         break;
        }

      case GATE_ADX:
        {
         int h = iADX(_Symbol, InpTimeframe, InpPeriod);
         if(h == INVALID_HANDLE) return(0);
         double adx[1];
         if(CopyBuffer(h, 0, shift, 1, adx) != 1) return(0);
         IndicatorRelease(h);
         if(adx[0] < 20.0) return(0);
         break;
        }
      case GATE_EMA_RSI:
        if(!Val(g_hFast, 0, shift, a)) return(0);
        if(!Val(g_hSlow, 0, shift, b)) return(0);
        if(!Val(g_hRSI, 0, shift, c)) return(0);
        if(dir > 0 && !(a > b && c >= 50.0)) return(0);
        if(dir < 0 && !(a < b && c <= 50.0)) return(0);
        break;

      case GATE_MACD:
        if(!Val(g_hMACD, 0, shift, a)) return(0);
        if(!Val(g_hMACD, 1, shift, b)) return(0);
        if(dir > 0 && !(a > b)) return(0);
        if(dir < 0 && !(a < b)) return(0);
        break;

      default:
        break;
     }
   return(dir);
  }

//+------------------------------------------------------------------+
//| STRATEGY LAYER 3 of 4 - candlestick shape filter.                  |
//| Veto only. FAM_PATTERN calls this with dir=0 to ask "is the bar    |
//| an acceptable shape?" and act on the bar's own direction.          |
//+------------------------------------------------------------------+
int PatternGate(const int dir, const int shift)
  {
   if(InpPattern == PAT_NONE) return(1);
   if(Bars(_Symbol, InpTimeframe) < shift + 2) return(0);

   double o  = iOpen (_Symbol, InpTimeframe, shift);
   double cl = iClose(_Symbol, InpTimeframe, shift);
   double hi = iHigh (_Symbol, InpTimeframe, shift);
   double lo = iLow  (_Symbol, InpTimeframe, shift);
   double po = iOpen (_Symbol, InpTimeframe, shift + 1);
   double pc = iClose(_Symbol, InpTimeframe, shift + 1);
   double ph = iHigh (_Symbol, InpTimeframe, shift + 1);
   double pl = iLow  (_Symbol, InpTimeframe, shift + 1);
   double rng = hi - lo;
   if(rng <= 0.0) return(0);

   double body  = MathAbs(cl - o);
   double upper = hi - MathMax(o, cl);
   double lower = MathMin(o, cl) - lo;
   bool   bull  = (cl > o);
   bool   bear  = (cl < o);

   switch(InpPattern)
     {
      case PAT_ENGULFING:
         if(bull && pc < po && cl >= po && o <= pc && body > MathAbs(pc - po)) break;
         if(bear && pc > po && cl <= po && o >= pc && body > MathAbs(pc - po)) break;
         return(0);

      case PAT_PINBAR:
         // Rejection wick occupying most of the range at the far end.
         if(bull && lower / rng >= 0.55 && body / rng <= 0.40) break;
         if(bear && upper / rng >= 0.55 && body / rng <= 0.40) break;
         return(0);

      case PAT_RUN:
         if(bull && pc > po) break;
         if(bear && pc < po) break;
         return(0);

      case PAT_INSIDE:
         // Inside bar: contained by the previous bar. MathMax/MathMin in MQL5
         // take exactly two arguments, so these are nested.
         if(hi <= ph && lo >= pl) break;
         return(0);

      case PAT_DOJI:
         if(body / rng <= 0.10) break;
         return(0);

      case PAT_LONG_BODY:
        {
         int n = MathMax(InpRangeLen, 5);
         double med = MeanAbsMove(n);
         if(med <= 0.0) return(0);
         if(body >= med) break;
         return(0);
        }
      default:
         break;
     }

   // When called with a direction, the shape must also agree with it.
   if(dir > 0 && !bull) return(0);
   if(dir < 0 && !bear) return(0);
   return(1);
  }

//+------------------------------------------------------------------+
//| STRATEGY LAYER 4 of 4 - timeframe eligibility.                      |
//+------------------------------------------------------------------+
bool TimeframeAllowed()
  {
   if(InpTimeframeFit == TFF_ANY) return(true);
   int p = PeriodSeconds(InpTimeframe);
   switch(InpTimeframeFit)
     {
      case TFF_SCALP: return(p <= 300);      // M1..M5
      case TFF_DAY:   return(p >= 900 && p <= 3600);   // M15..H1
      case TFF_SWING: return(p >= 14400);   // H4 and above
     }
   return(true);
  }

//+------------------------------------------------------------------+
//| Compose all four layers into one decision.                         |
//+------------------------------------------------------------------+
int SignalFor(const int shift)
  {
   int dir = BaseSignal(InpFamily, shift);
   if(dir == 0) return(0);
   dir = IndicatorGate(dir, shift);
   if(dir == 0) return(0);
   if(!PatternGate(dir, shift)) return(0);
   if(!TimeframeAllowed()) return(0);
   return(dir);
  }

//+------------------------------------------------------------------+
//| Entry Execution                                                  |
//+------------------------------------------------------------------+
void TryEnter(const int signal)
{
   if(signal == 0) return;

   //--- Guard: spread must not exceed InpSpreadMaxTicks (when enabled).
   if(InpSpreadMaxTicks > 0)
     {
      double sp = SpreadInTicks();
      if(sp > InpSpreadMaxTicks)
        { g_skipped++; Say(StringFormat("entry refused: spread %.1f ticks > limit %d", sp, InpSpreadMaxTicks)); return; }
     }

   //--- Guard: the take profit must clear the spread by a real margin.
   // On a 2-tick-spread instrument a 1-tick TP cannot profit, yet it still
   // produces a plausible-looking report, so refuse it outright.
   if(InpMinEdgeTicks > 0 && InpTakePips > 0.0)
     {
      double tpTicks = InpTakePips * g_pip / g_tickSize;
      double edge = tpTicks - SpreadInTicks();
      if(edge < InpMinEdgeTicks)
        { g_skipped++; Say(StringFormat("entry refused: TP edge %.1f ticks < required %d", edge, InpMinEdgeTicks)); return; }
     }

   if(HasOurPosition())
   {
      Say("signal ignored: already holding this symbol");
      return;
   }
   if(CountPositions() >= InpMaxPositions)
   {
      g_blocks++;
      Say("entry refused: position cap reached");
      return;
   }

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick)) { Say("entry refused: no tick"); return; }

   long spread = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(InpMaxSpreadPts > 0 && spread > InpMaxSpreadPts)
   {
      g_skipped++;
      Say(StringFormat("entry refused: spread %d > max %d", (int)spread, InpMaxSpreadPts));
      return;
   }

   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(point <= 0.0) { Say("entry refused: no point size"); return; }

   double pip  = point * 10.0;
   double lots = InpLots;

   if(InpRiskPercent > 0.0 && InpStopPips > 0.0)
   {
      double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
      double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
      if(tickValue > 0.0 && tickSize > 0.0)
      {
         double valuePerPipPerLot = tickValue * (pip / tickSize);
         double riskMoney = AccountInfoDouble(ACCOUNT_EQUITY) * InpRiskPercent / 100.0;
         if(valuePerPipPerLot > 0.0)
            lots = riskMoney / (InpStopPips * valuePerPipPerLot);
      }
   }

   lots = NormLots(lots);
   if(lots <= 0.0) { g_skipped++; Say("entry refused: lot size invalid"); return; }

   double price = (signal > 0) ? tick.ask : tick.bid;
   double sl = 0.0, tp = 0.0;
   double stopDist = InpStopPips * pip;
   double takeDist = InpTakePips * pip;

   //--- Floor both legs to the broker's minimum stop distance. Without this
   //    the order is simply rejected (retcode 10016) and the report shows a
   //    flat "no trades" that is indistinguishable from a losing strategy.
   //    Clamping is logged, never silent: a widened stop changes the payoff
   //    ratio, so it has to be visible in the journal.
   if(g_minStopDist > 0.0)
     {
      if(InpStopPips > 0.0 && stopDist < g_minStopDist)
        { stopDist = g_minStopDist; g_clamped++; }
      if(InpTakePips > 0.0 && takeDist < g_minStopDist)
        { takeDist = g_minStopDist; g_clamped++; }
     }

   if(InpStopPips > 0.0) sl = NormPrice(price - signal * stopDist);
   if(InpTakePips > 0.0) tp = NormPrice(price + signal * takeDist);

   if(g_clamped == 1)
      Say(StringFormat("stops clamped to broker minimum %.2f (%.0f ticks); "
                       "requested stop=%.2f take=%.2f",
                       g_minStopDist, g_minStopDist / point,
                       InpStopPips * pip, InpTakePips * pip));

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(20);

   // Configure symbol filling
   uint filling = (uint)SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_FOK) != 0)
      g_trade.SetTypeFilling(ORDER_FILLING_FOK);
   else if((filling & SYMBOL_FILLING_IOC) != 0)
      g_trade.SetTypeFilling(ORDER_FILLING_IOC);
   else
      g_trade.SetTypeFilling(ORDER_FILLING_RETURN);

   bool ok = (signal > 0)
             ? g_trade.Buy(lots, _Symbol, 0.0, sl, tp, "SF entry")
             : g_trade.Sell(lots, _Symbol, 0.0, sl, tp, "SF entry");

   if(ok)
   {
      g_trades++;
      g_volume += lots;
      g_barsHeld = 0;
      Say(StringFormat("%s %.2f lots @ %.*f sl=%.*f tp=%.*f",
                       (signal > 0 ? "BUY" : "SELL"), lots, g_digits, price,
                       g_digits, sl, g_digits, tp));
   }
   else
   {
      g_skipped++;
      Say(StringFormat("entry REJECTED retcode=%d %s",
                       g_trade.ResultRetcode(), g_trade.ResultRetcodeDescription()));
   }
}

//+------------------------------------------------------------------+
//| Position Management on Every Tick                                |
//+------------------------------------------------------------------+
void ManagePosition()
{
   if(!PositionSelect(_Symbol)) return;
   if(PositionGetInteger(POSITION_MAGIC) != InpMagic) return;

   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(point <= 0.0) return;

   long   posType  = PositionGetInteger(POSITION_TYPE);
   double open     = PositionGetDouble(POSITION_PRICE_OPEN);
   double sl       = PositionGetDouble(POSITION_SL);
   double tp       = PositionGetDouble(POSITION_TP);
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick)) return;

   double bid = tick.bid, ask = tick.ask;
   double pip = point * 10.0;

   // Breakeven logic
   if(InpBreakevenPips > 0.0 && sl == 0.0)
   {
      double moved = (posType == POSITION_TYPE_BUY) ? (bid - open) : (open - ask);
      if(moved >= InpBreakevenPips * pip)
      {
         double be = NormPrice(open);
         if(g_trade.PositionModify(_Symbol, be, tp))
            Say("stop moved to breakeven");
      }
      return;
   }

   // Trailing Stop logic
   if(InpTrailPoints > 0 && (sl != 0.0 || InpBreakevenPips <= 0.0))
   {
      double dist  = InpTrailPoints * point;
      double step  = InpTrailStep   * point;
      double newSl = 0.0;

      if(posType == POSITION_TYPE_BUY)
      {
         double candidate = bid - dist;
         if(candidate > open && (sl == 0.0 || candidate > sl + step))
            newSl = NormPrice(candidate);
      }
      else
      {
         double candidate = ask + dist;
         if(candidate < open && (sl == 0.0 || candidate < sl - step))
            newSl = NormPrice(candidate);
      }

      if(newSl > 0.0)
      {
         if(g_trade.PositionModify(_Symbol, newSl, tp))
            Say(StringFormat("trailing stop -> %.*f", g_digits, newSl));
      }
   }
}

//+------------------------------------------------------------------+
//| Expert Initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   g_tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   g_pip = g_tickSize * 10.0;   // pip size, needed by cost guards
   if(g_tickSize <= 0.0) g_tickSize = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   g_digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   if(InpFast < 1 || InpSlow < 1 || InpPeriod < 1)
   {
      Print("[SF] FATAL: periods must be >= 1");
      return(INIT_PARAMETERS_INCORRECT);
   }

   g_minStopDist = MinStopDistance();
   CreateHandles();

   // InpMode is inert since the taxonomy landed. Old .set files still carry
   // it, and a mismatch is exactly the kind of thing that produces a report
   // about a strategy nobody selected -- so say so out loud, once.
   if((int)InpMode != (int)InpFamily)
      PrintFormat("[SF] NOTE: InpMode=%d (%s) is ignored; InpFamily=%d (%s) selects the strategy.",
                  (int)InpMode, GetModeName(InpMode), (int)InpFamily, FamilyName(InpFamily));

   g_lastBar = 0;
   PrintFormat("[SF] Ready: %s | TF=%s | Lot=%.2f | Magic=%d | tick=%.4f | pip=%.2f | minStop=%.2f (%.0f ticks)",
               ConfigSummary(), EnumToString(InpTimeframe), NormLots(InpLots), InpMagic,
               g_tickSize, g_pip, g_minStopDist,
               (g_tickSize > 0.0 ? g_minStopDist / g_tickSize : 0.0));
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Broker minimum stop distance, in price units.                     |
//|                                                                  |
//| The Strategy Tester's synthetic broker enforces a LARGER minimum  |
//| than SYMBOL_TRADE_STOPS_LEVEL advertises on the live server:     |
//| Step Index reports 8 points, yet a 12-point stop was rejected    |
//| with retcode 10016 on every single order. So the level is read   |
//| at run time and both SL and TP are floored to it, with one tick  |
//| of margin.                                                        |
//|                                                                  |
//| Computed in ticks and converted once, because `pip` on these      |
//| synthetic indices is point*10 = 1.0 price units, which makes a   |
//| "pip" larger than a typical bar and hides every arithmetic error.|
//+------------------------------------------------------------------+
double MinStopDistance()
  {
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickSize <= 0.0) tickSize = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(tickSize <= 0.0) return(0.0);

   double pt   = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   long   lvl  = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   long   frz  = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_FREEZE_LEVEL);
   long   worst = (lvl > frz) ? lvl : frz;
   if(worst < 0) worst = 0;

   double minPt = (double)worst * pt;
   if(minPt <= 0.0) minPt = 2.0 * pt;          // never allow a zero stop
   return(minPt + tickSize);                    // one tick of margin
  }

//+------------------------------------------------------------------+
//| Create only the indicator handles this configuration can read.  |
//|                                                                  |
//| Derived from InpFamily and InpIndicator, NOT from the old flat  |
//| InpMode. Creating them from InpMode was a silent-failure bug: a  |
//| Bollinger family run had no Bollinger handle, every Val()        |
//| returned false, and the result looked like a losing strategy     |
//| instead of a wiring mistake.                                     |
//+------------------------------------------------------------------+
void CreateHandles()
  {
   const ENUM_MA_METHOD maMethod = MODE_EMA;
   bool needMA    = false;
   bool needRSI   = false;
   bool needBands = false;
   bool needMACD  = false;

   //--- Layer 1: what the family itself reads
   switch(InpFamily)
     {
      case FAM_MA_CROSS:
      case FAM_TREND_PULLBACK:  needMA = true; break;
      case FAM_RSI_REVERT:      needRSI = true; break;
      case FAM_BOLLINGER:       needBands = true; break;
      case FAM_MACD:            needMACD = true; break;
      default: break;   // FAM_PATTERN/MOMENTUM/RUN_FADE/VOL/RANGE/SEQ read only OHLC
     }

   //--- Layer 2: what the confirmation gate reads
   switch(InpIndicator)
     {
      case GATE_EMA_TREND: needMA = true; break;
      case GATE_RSI:       needRSI = true; break;
      case GATE_BANDS:     needBands = true; break;
      case GATE_EMA_RSI:   needMA = true; needRSI = true; break;
      case GATE_MACD:      needMACD = true; break;
      default: break;   // GATE_NONE / GATE_ATR / GATE_ADX need no cached handle
     }

   if(needMA)
     {
      g_hFast = iMA(_Symbol, InpTimeframe, InpFast, 0, maMethod, PRICE_CLOSE);
      g_hSlow = iMA(_Symbol, InpTimeframe, InpSlow, 0, maMethod, PRICE_CLOSE);
     }
   if(needRSI)   g_hRSI   = iRSI  (_Symbol, InpTimeframe, InpPeriod, PRICE_CLOSE);
   if(needBands) g_hBands = iBands(_Symbol, InpTimeframe, InpPeriod, 0, InpThreshold, PRICE_CLOSE);
   if(needMACD)  g_hMACD  = iMACD (_Symbol, InpTimeframe, InpFast, InpSlow, InpPeriod, PRICE_CLOSE);

   //--- Fail loudly rather than trade on a handle that will never resolve.
   // A missing handle makes every Val() fail, which is indistinguishable
   // from "the strategy found no signals" unless it is checked here.
   string miss = "";
   if(needMA    && (g_hFast == INVALID_HANDLE || g_hSlow == INVALID_HANDLE)) miss = "MA";
   if(needRSI   && g_hRSI   == INVALID_HANDLE) miss = "RSI";
   if(needBands && g_hBands == INVALID_HANDLE) miss = "Bands";
   if(needMACD  && g_hMACD  == INVALID_HANDLE) miss = "MACD";
   if(miss != "")
     {
      PrintFormat("[SF] FATAL: could not create %s handle(s) for %s", miss, ConfigSummary());
      return;
     }
   PrintFormat("[SF] handles: MA=%s RSI=%s BOL=%s MACD=%s",
               (needMA ? "y" : "n"), (needRSI ? "y" : "n"),
               (needBands ? "y" : "n"), (needMACD ? "y" : "n"));
  }

//+------------------------------------------------------------------+
//| Expert Tick Function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   ManagePosition();

   datetime bar = iTime(_Symbol, InpTimeframe, 0);
   if(bar == 0 || bar == g_lastBar) return;
   g_lastBar = bar;

   if(HasOurPosition())
   {
      g_barsHeld++;
      if(InpMaxHoldBars > 0 && g_barsHeld >= InpMaxHoldBars)
      {
         if(g_trade.PositionClose(_Symbol))
            Say(StringFormat("time stop: closing after %d bars", g_barsHeld));
      }
      return;
   }

   // Signals are evaluated on the LAST CLOSED bar, never on the bar that has
   // just opened. At the first tick of a bar open == close and the range is a
   // single tick, so every raw-OHLC filter reads "flat": PAT_RUN rejects all
   // bars because neither bull nor bear is set, and the taxonomy reported zero
   // trades while an offline port of the identical rules found over a thousand.
   // MA_CROSS hid the bug because an indicator buffer has the same value at
   // shift 0 and shift 1, so only the families reading OHLC were affected.
   const int sig = 1;
   int signal = SignalFor(sig);

   if(signal != 0 && InpConfirmBars > 1)
   {
      for(int k = 1; k < InpConfirmBars; k++)
      {
         if(SignalFor(sig + k) != signal) { signal = 0; break; }
      }
   }

   TryEnter(signal);
}

//+------------------------------------------------------------------+
//| Custom Tester Objective Score Calculation                        |
//+------------------------------------------------------------------+
double Score()
{
   double profit = TesterStatistics(STAT_PROFIT);
   double trades = TesterStatistics(STAT_TRADES);
   double pf     = TesterStatistics(STAT_PROFIT_FACTOR);
   double sharpe = TesterStatistics(STAT_SHARPE_RATIO);
   double ddRel  = TesterStatistics(STAT_EQUITY_DDREL_PERCENT);
   double ddAbs  = TesterStatistics(STAT_EQUITY_DD);

   if(trades < 1.0) return(0.0);

   if(pf <= 0.0)      pf = 0.0;
   if(pf > 1000.0)    pf = 1000.0;
   if(ddRel < 0.01)   ddRel = 0.01;
   if(sharpe > 100.0) sharpe = 100.0;
   if(sharpe < -100.0) sharpe = -100.0;

   switch(InpCriterion)
   {
      case CRIT_BALANCE:     return(TesterStatistics(STAT_INITIAL_DEPOSIT) + profit);
      case CRIT_SHARPE:      return(sharpe);
      case CRIT_PROFIT_FACT: return(pf);
      case CRIT_CALMAR:      return(profit / ddRel);
      case CRIT_PENALISED:   return(profit - (InpDrawdownPenalty * ddAbs));
      case CRIT_TRADE_COUNT: return(trades);
   }
   return(profit);
}

//+------------------------------------------------------------------+
//| Mean Pips per Trade                                              |
//+------------------------------------------------------------------+
double CSVNetPips()
{
   int    dig     = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double pipSize = MathPow(10, -(dig - 1));
   double pipPts  = (pipSize > 0.0)
                    ? pipSize / SymbolInfoDouble(_Symbol, SYMBOL_POINT)
                    : 10.0;
   double valPip  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE) * pipPts;

   if(g_volume <= 0.0 || valPip <= 0.0) return(0.0);
   return(TesterStatistics(STAT_PROFIT) / g_volume / valPip);
}

//+------------------------------------------------------------------+
//| FNV-1a Hash for Unique Pass File Names                           |
//+------------------------------------------------------------------+
uint FnHash(const string s)
{
   uint h = 2166136261;
   for(int i = 0; i < StringLen(s); i++)
   {
      h ^= (uint)StringGetCharacter(s, i);
      h *= 16777619;
   }
   return(h);
}

//+------------------------------------------------------------------+
//| Write CSV Report                                                 |
//+------------------------------------------------------------------+
void WriteReport(const double score, const bool hashed = false)
{
   string fname = "StrategyForge_" + InpTag;
   if(hashed)
   {
      string key = IntegerToString((int)InpMode) + "_"
                    + IntegerToString(InpFast) + "_"
                    + IntegerToString(InpSlow) + "_"
                    + IntegerToString(InpPeriod) + "_"
                    + DoubleToString(InpThreshold, 4) + "_"
                    + DoubleToString(InpLots, 4) + "_"
                    + DoubleToString(InpStopPips, 2) + "_"
                    + DoubleToString(InpTakePips, 2) + "_"
                    + IntegerToString((int)InpCriterion);
      fname += "_" + IntegerToString((int)(FnHash(key) & 0x7FFFFFFF));
   }
   fname += ".csv";

   int h = FileOpen(fname, FILE_WRITE | FILE_BIN | FILE_ANSI | FILE_COMMON);
   if(h == INVALID_HANDLE)
   {
      Print("[SF] Report could not be written, err=", GetLastError());
      return;
   }

   double netPips = CSVNetPips();

   string header =
      "tag,symbol,mode,timeframe,fast,slow,period,threshold,lots,stop_pips,"
    + "take_pips,criterion,score,trades,wins,losses,profit,net_pips,"
    + "profit_factor,expected_payoff,sharpe,dd_abs,dd_rel_pct,"
    + "max_win_run_money,max_loss_run_money,trades_basis,entries_attempted,"
    + "entries_skipped,position_blocks,t_stat,trade_profit_factor,spread_ticks,cost_share_pct,win_rate,avg_win_ticks,avg_loss_ticks,breakeven_win_rate,strat_class,strat_family,strat_indicator,strat_pattern,strat_timeframe,min_stop_dist,stops_clamped,initial_deposit,gross_profit,gross_loss,ahpr,total_deals,from_date,to_date,verdict";

   string values =
      InpTag + "," + _Symbol + ","
    + IntegerToString((int)InpFamily) + "," + IntegerToString((int)InpTimeframe) + ","
    + IntegerToString(InpFast) + "," + IntegerToString(InpSlow) + ","
    + IntegerToString(InpPeriod) + "," + DoubleToString(InpThreshold, 4) + ","
    + DoubleToString(InpLots, 4) + "," + DoubleToString(InpStopPips, 2) + ","
    + DoubleToString(InpTakePips, 2) + "," + IntegerToString((int)InpCriterion) + ","
    + DoubleToString(score, 8) + ","
    + IntegerToString((int)TesterStatistics(STAT_TRADES)) + ","
    + IntegerToString((int)TesterStatistics(STAT_PROFIT_TRADES)) + ","
    + IntegerToString((int)TesterStatistics(STAT_LOSS_TRADES)) + ","
    + DoubleToString(TesterStatistics(STAT_PROFIT), 2) + ","
    + DoubleToString(netPips, 4) + ","
    + DoubleToString(TesterStatistics(STAT_PROFIT_FACTOR), 4) + ","
    + DoubleToString(TesterStatistics(STAT_EXPECTED_PAYOFF), 4) + ","
    + DoubleToString(TesterStatistics(STAT_SHARPE_RATIO), 4) + ","
    + DoubleToString(TesterStatistics(STAT_EQUITY_DD), 2) + ","
    + DoubleToString(TesterStatistics(STAT_EQUITY_DDREL_PERCENT), 3) + ","
    + DoubleToString(TesterStatistics(STAT_MAX_CONWINS), 2) + ","
    + DoubleToString(TesterStatistics(STAT_MAX_CONLOSSES), 2) + ","
    + DoubleToString(TesterStatistics(STAT_TRADES), 4) + ","
    + IntegerToString(g_trades) + "," + IntegerToString(g_skipped) + ","
    + IntegerToString(g_blocks) + ","
    + DoubleToString(TradeTStat(), 3) + ","
    + DoubleToString(TradeProfitFactor(), 4) + ","
    + DoubleToString(SpreadInTicks(), 2) + ","
    + DoubleToString(costShare(), 2) + ","
    + DoubleToString(TradeWinRate(), 3) + ","
    + DoubleToString(AvgWinTicks(), 4) + ","
    + DoubleToString(AvgLossTicks(), 4) + ","
    + DoubleToString(BreakevenWinRate(), 3) + ","
    + CsvField(ClassName(InpClass)) + ","
    + CsvField(FamilyName(InpFamily)) + ","
    + CsvField(IndicatorName(InpIndicator)) + ","
    + CsvField(PatternName(InpPattern)) + ","
    + CsvField(EnumToString(InpTimeframeFit)) + ","
    + DoubleToString(g_minStopDist, 4) + ","
    + IntegerToString(g_clamped) + ","
    // MT5's own gross figures, so this row can be checked without opening a
    // binary cache file. Two identities must hold on them, and that is the
    // reason they are worth carrying: profit == gross_profit - gross_loss, and
    // profit_factor == gross_profit / gross_loss. A report failing either is
    // internally inconsistent, and that is now visible straight from the CSV
    // instead of only by diffing against Tester\cache\*.tst.
    + DoubleToString(TesterStatistics(STAT_INITIAL_DEPOSIT), 2) + ","
    + DoubleToString(TesterStatistics(STAT_GROSS_PROFIT), 2) + ","
    + DoubleToString(TesterStatistics(STAT_GROSS_LOSS), 2) + ","
    // This terminal build does not declare STAT_AHPR / STAT_AHPR_GROWTH, so the
    // risk-adjusted figure carried here is the recovery factor (net profit over
    // max drawdown) instead. Signed, like the one in the .tst summary.
    + DoubleToString(TesterStatistics(STAT_RECOVERY_FACTOR), 4) + ","
    + IntegerToString(g_dealCount * 2) + ","
    // The window the tester actually loaded, so any number in this row can be
    // traced back to the period that produced it. A bare profit figure is not
    // reproducible, and asking for 90 days silently returns 62 on this symbol.
    + TimeToString(g_testFrom, TIME_DATE | TIME_MINUTES) + ","
    + TimeToString(g_testTo,   TIME_DATE | TIME_MINUTES) + ","
    + CsvField(Verdict());

   FileWriteString(h, header + "\r\n" + values + "\r\n");
   g_wrote = true;
   FileClose(h);
   Print("[SF] Report exported: ", fname);
}

//+------------------------------------------------------------------+
//| HTTP POST Helper for Platform Transmission                       |
//+------------------------------------------------------------------+
int HttpPost(const string url, const string jsonPayload, string &responseOut)
{
   char postData[];
   char resultData[];
   string resultHeaders = "";
   int dataLen = StringToCharArray(jsonPayload, postData, 0, StringLen(jsonPayload), CP_UTF8);
   if(dataLen > 0 && postData[dataLen-1] == 0) ArrayResize(postData, dataLen - 1);

   ResetLastError();
   int res = WebRequest("POST", url, "Content-Type: application/json\r\n", 3000, postData, resultData, resultHeaders);
   if(res > 0)
   {
      responseOut = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
   }
   else
   {
      responseOut = "";
   }
   return res;
}

//+------------------------------------------------------------------+
//| Post Results to ScalarAI Platform                                |
//+------------------------------------------------------------------+
void PostResult(const double score)
{
   if(StringLen(InpPostUrl) < 4) return;

   string cleanUrl = InpPostUrl;
   while(StringLen(cleanUrl) > 0 && StringSubstr(cleanUrl, StringLen(cleanUrl)-1, 1) == "/")
   {
      cleanUrl = StringSubstr(cleanUrl, 0, StringLen(cleanUrl)-1);
   }
   string fullUrl = cleanUrl + InpPostPath;

   double trades = TesterStatistics(STAT_TRADES);
   double wins   = TesterStatistics(STAT_PROFIT_TRADES);
   double losses = TesterStatistics(STAT_LOSS_TRADES);
   double profit = TesterStatistics(STAT_PROFIT);
   double pf     = TesterStatistics(STAT_PROFIT_FACTOR);
   double sharpe = TesterStatistics(STAT_SHARPE_RATIO);
   double ddRel  = TesterStatistics(STAT_EQUITY_DDREL_PERCENT);
   double ddAbs  = TesterStatistics(STAT_EQUITY_DD);
   // winRate is deliberately not computed here. TesterStatistics' PROFIT/LOSS
   // TRADES split disagrees with the deal history on partially-closed trades,
   // and the deal scan is what t-stat and profit factor already use, so all
   // three now come from one source and cannot disagree with each other.

   string payload = StringFormat(
      "{"
      "\"tag\":\"%s\","
      "\"symbol\":\"%s\","
      "\"mode\":%d,"
      "\"modeName\":\"%s\","
      "\"timeframe\":\"%s\","
      "\"fast\":%d,"
      "\"slow\":%d,"
      "\"period\":%d,"
      "\"threshold\":%.4f,"
      "\"lots\":%.4f,"
      "\"stopPips\":%.2f,"
      "\"takePips\":%.2f,"
      "\"criterion\":%d,"
      "\"score\":%.6f,"
      "\"trades\":%d,"
      "\"wins\":%d,"
      "\"losses\":%d,"
      "\"profit\":%.2f,"
      "\"netPips\":%.4f,"
      "\"profitFactor\":%.4f,"
      "\"sharpe\":%.4f,"
      "\"drawdown\":%.2f,"
      "\"drawdownPct\":%.3f,"
      "\"winRate\":%.2f,"
      "\"stratClass\":\"%s\","
      "\"stratFamily\":\"%s\","
      "\"stratIndicator\":\"%s\","
      "\"stratPattern\":\"%s\","
      "\"stratTimeframe\":\"%s\","
      "\"fromDate\":\"%s\","
      "\"toDate\":\"%s\","
      "\"verdict\":\"%s\","
      "\"tStat\":%.4f,"
      "\"tradeProfitFactor\":%.4f,"
      "\"costSharePct\":%.4f,"
      "\"breakevenWinRate\":%.4f,"
      "\"avgWinTicks\":%.4f,"
      "\"avgLossTicks\":%.4f,"
      "\"spreadTicks\":%.4f,"
      "\"minStopDist\":%.4f,"
      "\"stopsClamped\":%d,"
      "\"initialDeposit\":%.2f,"
      "\"grossProfit\":%.2f,"
      "\"grossLoss\":%.2f,"
      "\"ahpr\":%.4f,"
      "\"recoveryFactor\":%.4f,"
      "\"totalDeals\":%d,"
      "\"attempts\":%d,"
      "\"skipped\":%d,"
      "\"blocked\":%d,"
      "\"timestamp\":%I64u"
      "}",
      InpTag,
      _Symbol,
      (int)InpFamily,
      FamilyName(InpFamily),
      EnumToString(InpTimeframe),
      InpFast,
      InpSlow,
      InpPeriod,
      InpThreshold,
      InpLots,
      InpStopPips,
      InpTakePips,
      (int)InpCriterion,
      score,
      (int)trades,
      (int)wins,
      (int)losses,
      profit,
      CSVNetPips(),
      pf,
      sharpe,
      ddAbs,
      ddRel,
      TradeWinRate(),
      ClassName(InpClass),
      IndicatorName(InpIndicator),
      PatternName(InpPattern),
      EnumToString(InpTimeframeFit),
      TimeToString(g_testFrom, TIME_DATE | TIME_MINUTES),
      TimeToString(g_testTo,   TIME_DATE | TIME_MINUTES),
      Verdict(),
      TradeTStat(),
      TradeProfitFactor(),
      costShare(),
      BreakevenWinRate(),
      AvgWinTicks(),
      AvgLossTicks(),
      SpreadInTicks(),
      g_minStopDist,
      g_clamped,
      TesterStatistics(STAT_INITIAL_DEPOSIT),
      TesterStatistics(STAT_GROSS_PROFIT),
      TesterStatistics(STAT_GROSS_LOSS),
      TesterStatistics(STAT_RECOVERY_FACTOR),
      TesterStatistics(STAT_RECOVERY_FACTOR),
      g_dealCount * 2,
      g_trades,
      g_skipped,
      g_blocks,
      (ulong)TimeCurrent()
   );

   string resp;
   int status = HttpPost(fullUrl, payload, resp);
   if(status > 0)
   {
      PrintFormat("[SF] Results posted to ScalarAI: Code=%d", status);
   }
   else
   {
      int err = GetLastError();
      if(err == 4014)
      {
         PrintFormat("[SF] Strategy Tester detected (Error 4014) - CSV saved to StrategyForge_%s.csv. In live/forward mode, add '%s' to WebRequest allowlist.", InpTag, cleanUrl);
      }
      else
      {
         PrintFormat("[SF] WebRequest post error: %d", err);
      }
   }
}

//+------------------------------------------------------------------+
//| OnTester hook: calculates objective, writes CSV and posts        |
//+------------------------------------------------------------------+
double OnTester()
{
   double s = Score();

   // Resolve the window the trades actually span, now that the deal history
   // exists. Reading Bars() or SYMBOL_TIME here reports whatever history is
   // loaded, not the simulated window -- a September 2026 run reported
   // from_date 2025.01.01. If nothing traded, both ends collapse onto the
   // final simulated time, which is the honest answer: no span, no result.
   ScanDeals();
   if(g_firstDeal > 0) { g_testFrom = g_firstDeal; g_testTo = g_lastDeal; }
   else                { g_testFrom = TimeCurrent(); g_testTo = TimeCurrent(); }

   PrintFormat("[SF] RESULT Tag=%s | %s | %s | Trades=%d | Win=%.1f%% (need %.1f%%) | Profit=%.2f | PF=%.3f | t=%.2f | Sharpe=%.3f | DD=%.2f%% | Score=%.6f | clamped=%d",
               InpTag, _Symbol, ConfigSummary(), (int)TesterStatistics(STAT_TRADES),
               TradeWinRate(), BreakevenWinRate(),
               TesterStatistics(STAT_PROFIT), TesterStatistics(STAT_PROFIT_FACTOR),
               TradeTStat(),
               TesterStatistics(STAT_SHARPE_RATIO), TesterStatistics(STAT_EQUITY_DDREL_PERCENT), s, g_clamped);

   if(InpWriteReport) WriteReport(s, false);
   PostResult(s);
   return(s);
}

//+------------------------------------------------------------------+
//| Deinitialization                                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(g_hFast  != INVALID_HANDLE) IndicatorRelease(g_hFast);
   if(g_hSlow  != INVALID_HANDLE) IndicatorRelease(g_hSlow);
   if(g_hRSI   != INVALID_HANDLE) IndicatorRelease(g_hRSI);
   if(g_hBands != INVALID_HANDLE) IndicatorRelease(g_hBands);
   if(g_hMACD  != INVALID_HANDLE) IndicatorRelease(g_hMACD);

   if(InpWriteReport && !g_wrote)
      WriteReport(Score(), true);

   PrintFormat("[SF] Stopped (Reason=%d) [%s]. Last: %s", reason, ConfigSummary(), g_lastReason);
}
//+------------------------------------------------------------------+
