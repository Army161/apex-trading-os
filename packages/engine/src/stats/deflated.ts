// Deflated Sharpe ratio (Bailey and Lopez de Prado) and the normal-distribution helpers it needs. Red path: this decides
// what counts as luck. Moved out of leaderboard.ts unchanged.
const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const sd = (x: number[]) => { const m = mean(x); return x.length > 1 ? Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1)) : 0; };

/** Standard normal CDF and inverse (Acklam). */
export const phi = (z: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
export function phiInv(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const q = Math.min(Math.max(p, 1e-12), 1 - 1e-12), lo = 0.02425;
  if (q < lo) { const r = Math.sqrt(-2 * Math.log(q)); return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1); }
  if (q > 1 - lo) return -phiInv(1 - q);
  const r = q - 0.5, s = r * r; return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}

/** Expected best Sharpe (per period) among N independent strategies with no edge, given T observations. */
export function expectedMaxSharpe(nTrials: number, T: number) {
  if (nTrials <= 1) return 0;
  const g = 0.5772156649, z = (1 - g) * phiInv(1 - 1 / nTrials) + g * phiInv(1 - 1 / (nTrials * Math.E));
  return z / Math.sqrt(Math.max(T - 1, 1));
}

/** Deflated Sharpe ratio: probability the true per-period Sharpe beats the luck benchmark of nTrials tries. */
export function deflatedSharpe(r: number[], nTrials: number) {
  const T = r.length, m = mean(r), s = sd(r); if (T < 10 || s === 0) return { psr: 0, sr: 0, sr0: 0 };
  const sr = m / s, sk = mean(r.map(x => ((x - m) / s) ** 3)), ku = mean(r.map(x => ((x - m) / s) ** 4)), sr0 = expectedMaxSharpe(nTrials, T);
  const den = Math.sqrt(Math.max(1 - sk * sr + ((ku - 1) / 4) * sr * sr, 1e-9));
  return { psr: phi(((sr - sr0) * Math.sqrt(T - 1)) / den), sr, sr0 };
}

