import React from "react";
import type { CandlestickChartProps, PriceTick } from "./types";
import {
  CHART_WIDTH,
  CHART_HEIGHT,
  CHART_PADDING,
  LEFT_AXIS_WIDTH,
  BOTTOM_AXIS_HEIGHT,
  CANDLE_WIDTH,
  CANDLE_GAP,
  CANDLE_STEP,
  PRICE_TICK_COUNT,
  PRICE_PADDING_RATIO,
  MIN_PRICE_RANGE,
  WICK_STROKE_WIDTH,
  BODY_STROKE_WIDTH,
  LAST_CANDLE_OPACITY,
  BULLISH_COLOR,
  BEARISH_COLOR,
  GRID_COLOR,
  AXIS_TEXT_COLOR,
  CURRENT_PRICE_COLOR,
  CURRENT_PRICE_DASH,
  CURRENT_PRICE_OPACITY,
  TRACKER_RADIUS_OUTER,
  TRACKER_RADIUS_INNER,
  TRACKER_GLOW_OPACITY,
  AXIS_FONT_SIZE,
  AXIS_FONT_FAMILY,
} from "./constants";

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
  const chartWidth = CHART_WIDTH - LEFT_AXIS_WIDTH - CHART_PADDING;
  const chartHeight = CHART_HEIGHT - CHART_PADDING - BOTTOM_AXIS_HEIGHT;
  const maxCandles = Math.floor(chartWidth / CANDLE_STEP);
  const visibleCandles = displayCandles.slice(-maxCandles);

  const priceTicks: PriceTick[] = [];
  for (let i = 0; i <= PRICE_TICK_COUNT; i++) {
    const p = minPrice + (priceRange * i) / PRICE_TICK_COUNT;
    const y = CHART_PADDING + (1 - (p - minPrice) / priceRange) * chartHeight;
    priceTicks.push({ p, y, label: p.toFixed(1) });
  }

  return (
    <div className="w-full h-full">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full h-full overflow-visible">
        {priceTicks.map((t, i) => (
          <line
            key={`grid-${i}`}
            x1={LEFT_AXIS_WIDTH}
            y1={t.y}
            x2={chartWidth + LEFT_AXIS_WIDTH}
            y2={t.y}
            stroke={GRID_COLOR}
            strokeWidth="1"
          />
        ))}

        {priceTicks.map((t, i) => (
          <text
            key={`price-${i}`}
            x={CHART_WIDTH - 4}
            y={t.y + 3}
            fill={AXIS_TEXT_COLOR}
            fontSize={AXIS_FONT_SIZE}
            fontFamily={AXIS_FONT_FAMILY}
            textAnchor="end"
          >
            {t.label}
          </text>
        ))}

        {currentPrice > 0 && (
          <line
            x1={LEFT_AXIS_WIDTH}
            y1={CHART_PADDING + (1 - (currentPrice - minPrice) / priceRange) * chartHeight}
            x2={chartWidth + LEFT_AXIS_WIDTH}
            y2={CHART_PADDING + (1 - (currentPrice - minPrice) / priceRange) * chartHeight}
            stroke={CURRENT_PRICE_COLOR}
            strokeWidth="1"
            strokeDasharray={CURRENT_PRICE_DASH}
            opacity={CURRENT_PRICE_OPACITY}
          />
        )}

        {visibleCandles.map((candle, idx) => {
          const openPrice = candle.open;
          const highPrice = candle.high;
          const lowPrice = candle.low;
          const closePrice = candle.close;

          const x = LEFT_AXIS_WIDTH + idx * CANDLE_STEP + CANDLE_WIDTH / 2;

          const y_high = CHART_PADDING + (1 - (highPrice - minPrice) / priceRange) * chartHeight;
          const y_low = CHART_PADDING + (1 - (lowPrice - minPrice) / priceRange) * chartHeight;
          const y_open = CHART_PADDING + (1 - (openPrice - minPrice) / priceRange) * chartHeight;
          const y_close = CHART_PADDING + (1 - (closePrice - minPrice) / priceRange) * chartHeight;

          const bodyY = Math.min(y_open, y_close);
          const bodyHeight = Math.max(1.5, Math.abs(y_open - y_close));

          const isBullish = closePrice >= openPrice;
          const isLast = idx === visibleCandles.length - 1;
          const fillColor = isBullish ? BULLISH_COLOR : BEARISH_COLOR;

          return (
            <g key={`${candle.time}-${idx}`}>
              <line
                x1={x}
                y1={y_high}
                x2={x}
                y2={y_low}
                stroke={fillColor}
                strokeWidth={WICK_STROKE_WIDTH}
              />
              <rect
                x={x - CANDLE_WIDTH / 2}
                y={bodyY}
                width={CANDLE_WIDTH}
                height={bodyHeight}
                fill={fillColor}
                stroke={fillColor}
                strokeWidth={BODY_STROKE_WIDTH}
                opacity={isLast ? LAST_CANDLE_OPACITY : 1}
              />
            </g>
          );
        })}

        {(() => {
          const lastIndex = visibleCandles.length - 1;
          if (lastIndex < 0) return null;
          const lastCandle = visibleCandles[lastIndex];
          const lastClose = lastCandle.close;
          const lastOpen = lastCandle.open;
          const x = LEFT_AXIS_WIDTH + lastIndex * CANDLE_STEP + CANDLE_WIDTH / 2;
          const y = CHART_PADDING + (1 - (lastClose - minPrice) / priceRange) * chartHeight;
          const glowColor = lastClose >= lastOpen ? BULLISH_COLOR : BEARISH_COLOR;

          return (
            <g>
              <circle cx={x} cy={y} r={TRACKER_RADIUS_OUTER} fill={glowColor} opacity={TRACKER_GLOW_OPACITY} className="animate-pulse" />
              <circle cx={x} cy={y} r={TRACKER_RADIUS_INNER} fill={glowColor} />
            </g>
          );
        })()}
      </svg>
    </div>
  );
};
