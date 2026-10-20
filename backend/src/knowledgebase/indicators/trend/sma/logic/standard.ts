// SMA — Simple Moving Average
// Different logic types for trend indicators live here as separate files.
// To remove: delete this file and its export from logic/index.ts.

export function sma(values: number[], period: number): (number | null)[] {
  if (period <= 0) throw new Error("period must be positive");
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;

  let total = 0;
  for (let i = 0; i < period; i++) total += values[i];
  out[period - 1] = total / period;

  for (let i = period; i < values.length; i++) {
    total += values[i] - values[i - period];
    out[i] = total / period;
  }
  return out;
}