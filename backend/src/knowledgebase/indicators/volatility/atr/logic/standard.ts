// ATR — Average True Range
import { sma } from "../../../trend/sma/logic/standard";

export function atr(high: number[], low: number[], close: number[], period = 14): (number | null)[] {
  const tr: number[] = [];
  for (let i = 0; i < high.length; i++) {
    if (i === 0) {
      tr.push(high[i] - low[i]);
    } else {
      const hl = high[i] - low[i];
      const hc = Math.abs(high[i] - close[i - 1]);
      const lc = Math.abs(low[i] - close[i - 1]);
      tr.push(Math.max(hl, hc, lc));
    }
  }
  return sma(tr, period);
}