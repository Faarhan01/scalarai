// MACD — Moving Average Convergence Divergence
import { ema } from "../../../trend/ema/logic/standard";

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine: (number | null)[] = new Array(values.length).fill(null);

  for (let i = 0; i < values.length; i++) {
    if (fastEma[i] !== null && slowEma[i] !== null) {
      macdLine[i] = (fastEma[i] as number) - (slowEma[i] as number);
    }
  }

  const validMacd = macdLine.map((v) => (v === null ? 0 : v));
  const signalLine = ema(validMacd, signalPeriod);
  const histogram: (number | null)[] = new Array(values.length).fill(null);

  for (let i = 0; i < values.length; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null) {
      histogram[i] = (macdLine[i] as number) - (signalLine[i] as number);
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}