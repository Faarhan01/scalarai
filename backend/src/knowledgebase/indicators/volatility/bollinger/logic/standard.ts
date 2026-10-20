// Bollinger Bands
import { sma } from "../../../trend/sma/logic/standard";

export function bollinger(values: number[], period = 20, numStd = 2.0) {
  const mid = sma(values, period);
  const upper: (number | null)[] = new Array(values.length).fill(null);
  const lower: (number | null)[] = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i++) {
    const m = mid[i];
    if (m === null) continue;
    const slice = values.slice(i - period + 1, i + 1);
    const variance = slice.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / period;
    const std = Math.sqrt(variance);
    upper[i] = m + numStd * std;
    lower[i] = m - numStd * std;
  }
  return { mid, upper, lower };
}