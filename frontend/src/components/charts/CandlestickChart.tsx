import React from "react";
import { Activity, Gauge, Zap } from "lucide-react";
import type { CandleData, ChartData } from "../../hooks/useChartData";

export interface CandlestickChartProps {
  chartData: ChartData;
  currentPrice: number;
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  chartData,
  currentPrice,
}) => {
  const { displayCandles, minPrice, maxPrice } = chartData;

  if (displayCandles.length <= 1) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs gap-1.5 py-12">
        <span className="font-bold text-slate-200">Waiting for MT5 EA Connection...</span>
        <span className="text-[11px] text-slate-400 max-w-sm text-center px-4">
          Launch your MetaTrader 5 terminal, verify that WebRequest is allowed for our address, and trigger active charts.
        </span>
      </div>
    );
  }

  const priceRange = maxPrice - minPrice || 1.0;
  const width = 800;
  const height = 500;
  const padding = 20;
  const candleWidth = 8;
  const gap = 2;
  const step = candleWidth + gap;
  const maxCandles = Math.floor((width - 2 * padding) / step);
  const visibleCandles = displayCandles.slice(-maxCandles);

  return (
    <div className="w-full h-full">
      <svg viewBox="0 0 800 500" className="w-full h-full overflow-visible">
        {/* Live Candlestick Bars */}
        {(() => {
          return (
            <>
              {visibleCandles.map((candle, idx) => {
                const openPrice = candle.open;
                const highPrice = candle.high;
                const lowPrice = candle.low;
                const closePrice = candle.close;

                const x = width - padding - (visibleCandles.length - 1 - idx) * step - candleWidth / 2;

                const y_high = padding + (1 - (highPrice - minPrice) / priceRange) * (height - 2 * padding);
                const y_low = padding + (1 - (lowPrice - minPrice) / priceRange) * (height - 2 * padding);
                const y_open = padding + (1 - (openPrice - minPrice) / priceRange) * (height - 2 * padding);
                const y_close = padding + (1 - (closePrice - minPrice) / priceRange) * (height - 2 * padding);

                const bodyY = Math.min(y_open, y_close);
                const bodyHeight = Math.max(1.5, Math.abs(y_open - y_close));

                const isBullish = closePrice >= openPrice;
                const isLastCandle = idx === visibleCandles.length - 1;

                // MT5-style colors: bullish = green/white, bearish = red/black
                const bullishColor = "#54f354";
                const bearishColor = "#ff4a4a";
                const strokeColor = isBullish ? bullishColor : bearishColor;

                return (
                  <g key={candle.time + "-" + idx}>
                    {/* Wick */}
                    <line
                      x1={x}
                      y1={y_high}
                      x2={x}
                      y2={y_low}
                      stroke={strokeColor}
                      strokeWidth="1"
                    />
                    {/* Body */}
                    {isLastCandle ? (
                      <rect
                        x={x - candleWidth / 2}
                        y={bodyY}
                        width={candleWidth}
                        height={bodyHeight}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="1.5"
                      />
                    ) : (
                      <rect
                        x={x - candleWidth / 2}
                        y={bodyY}
                        width={candleWidth}
                        height={bodyHeight}
                        fill={isBullish ? bullishColor : bearishColor}
                        stroke={strokeColor}
                        strokeWidth="1"
                      />
                    )}
                  </g>
                );
              })}

              {/* Last candle tracker - pulsing dot at the latest close price */}
              {(() => {
                const lastIndex = visibleCandles.length - 1;
                if (lastIndex < 0) return null;
                const lastCandle = visibleCandles[lastIndex];
                const lastClose = lastCandle.close;
                const lastOpen = lastCandle.open;

                const x = width - padding - candleWidth / 2;
                const y = padding + (1 - (lastClose - minPrice) / priceRange) * (height - 2 * padding);
                const isBullish = lastClose >= lastOpen;
                const glowColor = isBullish ? "#54f354" : "#ff4a4a";
                return (
                  <g>
                    <circle cx={x} cy={y} r="8" fill={glowColor} className="opacity-30 animate-pulse" />
                    <circle cx={x} cy={y} r="4" fill={glowColor} />
                  </g>
                );
              })()}
            </>
          );
        })()}
      </svg>
    </div>
  );
};
