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
    const minPrice =
      displayCandles.length > 0
        ? Math.min(...displayCandles.map((c) => c.low)) - 0.2
        : 1245.0;
    const maxPrice =
      displayCandles.length > 0
        ? Math.max(...displayCandles.map((c) => c.high)) + 0.2
        : 1255.0;
    const priceRange = maxPrice - minPrice || 1.0;

    return { candleData, displayCandles, minPrice, maxPrice, priceRange };
  }, [candles, history, maxVisibleCandles]);
}
