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
  maxVisibleCandles: number = 80
): ChartData {
  return useMemo(() => {
    const candleData: CandleData[] =
      candles.length > 0
        ? candles
        : history.map((t) => ({
            time: t.time,
            open: t.open !== undefined ? t.open : t.price,
            high: t.high !== undefined ? t.high : t.price,
            low: t.low !== undefined ? t.low : t.price,
            close: t.close !== undefined ? t.close : t.price,
          }));

    const displayCandles = candleData.slice(-maxVisibleCandles);
    let minPrice = displayCandles.length > 0 ? displayCandles[0].low : 0;
    let maxPrice = displayCandles.length > 0 ? displayCandles[0].high : 0;
    for (let i = 1; i < displayCandles.length; i++) {
      if (displayCandles[i].low < minPrice) minPrice = displayCandles[i].low;
      if (displayCandles[i].high > maxPrice) maxPrice = displayCandles[i].high;
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

    return { candleData, displayCandles, minPrice, maxPrice, priceRange };
  }, [candles, history, maxVisibleCandles]);
}
