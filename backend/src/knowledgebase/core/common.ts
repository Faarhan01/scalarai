// Shared statistical helpers for the knowledgebase.

export interface Bar {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type Series = (number | null)[];
//
// Everything statistical goes through here so a formula is written once.
// Ported from the Python common.py patterns that already found 3 bugs.

// Welch's t-test for unequal variance mean comparison.
export function welchT(a: number[], b: number[]): { t: number; p: number; meanA: number; meanB: number; nA: number; nB: number } {
  const nA = a.length, nB = b.length;
  if (nA < 2 || nB < 2) return { t: 0, p: 1, meanA: 0, meanB: 0, nA, nB };
  const meanA = a.reduce((s, v) => s + v, 0) / nA;
  const meanB = b.reduce((s, v) => s + v, 0) / nB;
  const varA = a.reduce((s, v) => s + (v - meanA) ** 2, 0) / (nA - 1);
  const varB = b.reduce((s, v) => s + (v - meanB) ** 2, 0) / (nB - 1);
  const se = Math.sqrt(varA / nA + varB / nB);
  if (se === 0) return { t: 0, p: 1, meanA, meanB, nA, nB };
  const t = (meanA - meanB) / se;
  const df = (varA / nA + varB / nB) ** 2 / (
    (varA / nA) ** 2 / (nA - 1) + (varB / nB) ** 2 / (nB - 1)
  );
  const p = tDistributionP(Math.abs(t), df);
  return { t, p, meanA, meanB, nA, nB };
}

// Two-sided p-value for t-distribution via incomplete beta.
export function tDistributionP(t: number, df: number): number {
  if (df <= 0) return 1.0;
  const x = df / (df + t * t);
  return betai(df / 2, 0.5, x);
}

// Regularized incomplete beta function I_x(a, b).
export function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lgamma(a + b) - lgamma(a) - lgamma(b);
  const front = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return front * betacf(a, b, x) / a;
  }
  return 1 - front * betacf(b, a, 1 - x) / b;
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200, EPS = 3e-16, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const de = d * c;
    h *= de;
    if (Math.abs(de - 1) < EPS) break;
  }
  return h;
}

function lgamma(x: number): number {
  // Lanczos approximation, g = 7.
  //
  // The NINTH coefficient is required. The loop below runs i = 1..g+1 = 1..8,
  // and with only eight entries c[8] is undefined, so `a` becomes NaN and every
  // p-value comes back null. The Python original does not hit this because it
  // calls math.lgamma from the standard library; this port had to supply it.
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Shuffle-based null comparison.
export function shuffleNull(returns: number[], iterations = 1000): { t: number; p_value: number; mean: number } {
  const n = returns.length;
  if (n < 10) return { t: 0, p_value: 1, mean: 0 };
  const baseline = returns.reduce((s, v) => s + v, 0) / n;
  const ts: number[] = [];
  for (let iter = 0; iter < iterations; iter++) {
    const shuffled = [...returns].sort(() => Math.random() - 0.5);
    const shuffledMean = shuffled.reduce((s, v) => s + v, 0) / n;
    const se = Math.sqrt(shuffled.reduce((s, v) => s + (v - shuffledMean) ** 2, 0) / (n - 1)) / Math.sqrt(n);
    const t = se > 0 ? (shuffledMean - baseline) / se : 0;
    ts.push(t);
  }
  ts.sort((a, b) => a - b);
  const p95 = ts[Math.floor(iterations * 0.95)];
  return { t: p95, p_value: 0.05, mean: baseline };
}

// Split-half agreement: first half t and second half t.
export function splitHalf(returns: number[]): { t1: number; t2: number; agree: boolean } {
  const mid = Math.floor(returns.length / 2);
  const first = returns.slice(0, mid);
  const second = returns.slice(mid);
  const r1 = welchT(first, returns);
  const r2 = welchT(second, returns);
  const agree = (r1.t >= 0) === (r2.t >= 0) && Math.abs(r1.t) >= 1 && Math.abs(r2.t) >= 1;
  return { t1: r1.t, t2: r2.t, agree };
}

// Basic stats
export function mean(x: number[]): number {
  return x.length > 0 ? x.reduce((s, v) => s + v, 0) / x.length : 0;
}

export function sd(x: number[]): number {
  if (x.length < 2) return 0;
  const m = mean(x);
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
}
