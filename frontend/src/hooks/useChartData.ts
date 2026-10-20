import { useMemo } from "react";
import type { Tick } from "../types";

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartData {
  candleData: CandleData[];
  displayCandles: CandleData[];
  minPrice: number;
  maxPrice: number;
  priceRange: number;
}

export function useChartData(
  candles: CandleData[],
  history: Tick[],
  maxVisibleCandles: number = 80,
  currentPrice: number = 0,
): ChartData {
  return useMemo(() => {
    // Live ticks are the point of the chart, so they are folded into the
    // candle series rather than replacing it. Previously the live tick
    // history was only used when there were no candles at all, which meant
    // that as soon as the first bar loaded, every tick stopped moving the
    // chart: the candles froze at their stored close while the price line
    // drifted away from them.
    const base: CandleData[] = candles.length > 0 ? candles.slice() : [];

    if (base.length === 0) {
      // No candles yet: draw the raw tick stream so something appears.
      const fromTicks: CandleData[] = history.map((t) => ({
        time: t.time,
        open: t.open !== undefined ? t.open : t.price,
        high: t.high !== undefined ? t.high : t.price,
        low: t.low !== undefined ? t.low : t.price,
        close: t.close !== undefined ? t.close : t.price,
      }));
      base.push(...fromTicks);
    }

    // The live price belongs to the most recent bar. Update that bar's close
    // and extend its range, which is what a trading terminal does with the
    // bar that is still forming.
    const live = currentPrice > 0 ? currentPrice : 0;
    if (live > 0 && base.length > 0) {
      const last = base[base.length - 1];
      base[base.length - 1] = {
        ...last,
        close: live,
        high: Math.max(last.high, live),
        low: Math.min(last.low, live),
      };
    }

    const displayCandles = base.slice(-maxVisibleCandles);
    let minPrice = displayCandles.length > 0 ? displayCandles[0].low : 0;
    let maxPrice = displayCandles.length > 0 ? displayCandles[0].high : 0;
    for (let i = 1; i < displayCandles.length; i++) {
      if (displayCandles[i].low < minPrice) minPrice = displayCandles[i].low;
      if (displayCandles[i].high > maxPrice) maxPrice = displayCandles[i].high;
    }

    // The live price has to be inside the plotted range, or the price line
    // is drawn off the canvas and the chart looks broken at the extremes.
    if (live > 0) {
      minPrice = Math.min(minPrice, live);
      maxPrice = Math.max(maxPrice, live);
    }

    let priceRange = maxPrice - minPrice || 1.0;
    const minRange = 1.5;
    if (priceRange < minRange) {
      const center = (maxPrice + minPrice) / 2;
      minPrice = center - minRange / 2;
      maxPrice = center + minRange / 2;
      priceRange = minRange;
    }
    const paddingPrice = priceRange * 0.05;
    minPrice -= paddingPrice;
    maxPrice += paddingPrice;

    return { candleData: base, displayCandles, minPrice, maxPrice, priceRange };
  }, [candles, history, maxVisibleCandles, currentPrice]);
}
