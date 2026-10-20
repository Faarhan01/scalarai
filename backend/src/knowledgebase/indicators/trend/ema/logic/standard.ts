// EMA — Exponential Moving Average
// Different logic types for trend indicators live here as separate files.
// To remove: delete this file and its export from logic/index.ts.

export function ema(values: number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error("period must be positive");
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;

  const k = 2.0 / (period + 1.0);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    const val = values[i] * k + prev * (1.0 - k);
    out[i] = val;
    prev = val;
  }
  return out;
}