import React from "react";
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
  const leftAxisWidth = 50;
  const bottomAxisHeight = 24;
  const candleWidth = 10;
  const gap = 2;
  const step = candleWidth + gap;
  const chartWidth = width - leftAxisWidth - padding;
  const chartHeight = height - padding - bottomAxisHeight;
  const maxCandles = Math.floor(chartWidth / step);
  const visibleCandles = displayCandles.slice(-maxCandles);

  const bullishColor = "#10b981";
  const bearishColor = "#f43f5e";
  const gridColor = "rgba(148, 163, 184, 0.12)";
  const axisTextColor = "#94a3b8";

  const priceTicks = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i++) {
    const p = minPrice + (priceRange * i) / tickCount;
    const y = padding + (1 - (p - minPrice) / priceRange) * chartHeight;
    priceTicks.push({ p, y, label: p.toFixed(1) });
  }

  return (
    <div className="w-full h-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
        {/* Grid lines */}
        {priceTicks.map((t, i) => (
          <line
            key={`grid-${i}`}
            x1={leftAxisWidth}
            y1={t.y}
            x2={chartWidth + leftAxisWidth}
            y2={t.y}
            stroke={gridColor}
            strokeWidth="1"
          />
        ))}

        {/* Price axis labels */}
        {priceTicks.map((t, i) => (
          <text
            key={`price-${i}`}
            x={chartWidth + leftAxisWidth + 6}
            y={t.y + 3}
            fill={axisTextColor}
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
          >
            {t.label}
          </text>
        ))}

        {/* Current price line */}
        {currentPrice > 0 && (
          <line
            x1={leftAxisWidth}
            y1={padding + (1 - (currentPrice - minPrice) / priceRange) * chartHeight}
            x2={chartWidth + leftAxisWidth}
            y2={padding + (1 - (currentPrice - minPrice) / priceRange) * chartHeight}
            stroke="#6366f1"
            strokeWidth="1"
            strokeDasharray="4 3"
            opacity="0.8"
          />
        )}

        {/* Candles */}
        {visibleCandles.map((candle, idx) => {
          const openPrice = candle.open;
          const highPrice = candle.high;
          const lowPrice = candle.low;
          const closePrice = candle.close;

          const x = leftAxisWidth + idx * step + candleWidth / 2;

          const y_high = padding + (1 - (highPrice - minPrice) / priceRange) * chartHeight;
          const y_low = padding + (1 - (lowPrice - minPrice) / priceRange) * chartHeight;
          const y_open = padding + (1 - (openPrice - minPrice) / priceRange) * chartHeight;
          const y_close = padding + (1 - (closePrice - minPrice) / priceRange) * chartHeight;

          const bodyY = Math.min(y_open, y_close);
          const bodyHeight = Math.max(1.5, Math.abs(y_open - y_close));

          const isBullish = closePrice >= openPrice;
          const isLast = idx === visibleCandles.length - 1;
          const fillColor = isBullish ? bullishColor : bearishColor;

          return (
            <g key={`${candle.time}-${idx}`}>
              <line
                x1={x}
                y1={y_high}
                x2={x}
                y2={y_low}
                stroke={fillColor}
                strokeWidth="1.2"
              />
              <rect
                x={x - candleWidth / 2}
                y={bodyY}
                width={candleWidth}
                height={bodyHeight}
                fill={fillColor}
                stroke={fillColor}
                strokeWidth="1"
                opacity={isLast ? 0.95 : 1}
              />
            </g>
          );
        })}

        {/* Last price tracker */}
        {(() => {
          const lastIndex = visibleCandles.length - 1;
          if (lastIndex < 0) return null;
          const lastCandle = visibleCandles[lastIndex];
          const lastClose = lastCandle.close;
          const lastOpen = lastCandle.open;
          const x = leftAxisWidth + lastIndex * step + candleWidth / 2;
          const y = padding + (1 - (lastClose - minPrice) / priceRange) * chartHeight;
          const glowColor = lastClose >= lastOpen ? bullishColor : bearishColor;

          return (
            <g>
              <circle cx={x} cy={y} r="7" fill={glowColor} opacity="0.18" className="animate-pulse" />
              <circle cx={x} cy={y} r="3.5" fill={glowColor} />
            </g>
          );
        })()}
      </svg>
    </div>
  );
};
