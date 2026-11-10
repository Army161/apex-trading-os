// Sharpe ratio reports and a correlation-aware portfolio combiner (archive/chat/90, a Sharpe ratio explainer). Our own code,
// paper only.
//  - Annualised Sharpe = mean / sd of per-period returns × √(periods per year): √252 for daily bars, √12 for monthly.
//  - t-stat for "mean return > 0" = per-period Sharpe × √n. Sharpe already ranks by significance; this adds the scale.
//  - SPY as the benchmark (the video quotes ~0.45 over 20 years; our 2-year window will differ, and we print what we measure).
//  - Combining: two equal-Sharpe series with negative correlation make a higher-Sharpe mix. Weights here come from the
//    covariance matrix, fitted on a training slice and scored on the rest, because in-sample weights flatter themselves.
//  - Leverage: RESEARCH ONLY. It scales return and volatility together, so Sharpe is unchanged before borrowing costs, but
//    it raises drawdown and the chance of ruin. Nothing in the bots or settings reads leveredResearch(); it is never a
//    live parameter.
import { phi } from './stats/deflated';

export const PPY = { daily: 252, weekly: 52, monthly: 12, hourly: 252 * 6.5, crypto_daily: 365 } as const;
const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const sd = (x: number[]) => { const m = mean(x); return x.length > 1 ? Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1)) : 0; };

export type SharpeReport = { n: number; srPeriod: number; sharpe: number; annReturn: number; annVol: number; tStat: number; pValue: number; significant: boolean };
/** rf is the risk-free return per period (0 by default). pValue is one-sided: the chance of a t this large with no edge. */
export function sharpeReport(r: number[], periodsPerYear: number = PPY.daily, rf = 0): SharpeReport {
  const ex = r.map(x => x - rf), n = ex.length, m = mean(ex), s = sd(ex), sr = s > 0 ? m / s : 0, t = sr * Math.sqrt(n);
  return { n, srPeriod: sr, sharpe: sr * Math.sqrt(periodsPerYear), annReturn: m * periodsPerYear, annVol: s * Math.sqrt(periodsPerYear), tStat: t, pValue: 1 - phi(t), significant: t >= 1.96 };
}

export function correlation(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length), ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n)); let c = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return va > 0 && vb > 0 ? c / Math.sqrt(va * vb) : 0;
}

/** Line two return series up by key (day number, bar time). */
export function align(series: Record<string, Map<number, number>>) {
  const names = Object.keys(series), keys = [...series[names[0]].keys()].filter(k => names.every(n => series[n].has(k))).sort((a, b) => a - b);
  return { names, keys, cols: names.map(n => keys.map(k => series[n].get(k)!)) };
}

/** Strategy against a benchmark (SPY by convention): both Sharpes, correlation, beta, alpha and information ratio. */
export function vsBenchmark(r: number[], bench: number[], periodsPerYear: number = PPY.daily) {
  const n = Math.min(r.length, bench.length), a = r.slice(0, n), b = bench.slice(0, n), mb = mean(b), vb = sd(b) ** 2;
  const beta = vb > 0 ? a.reduce((s, x, i) => s + (x - mean(a)) * (b[i] - mb), 0) / (n - 1) / vb : 0, act = a.map((x, i) => x - b[i]);
  return { strategy: sharpeReport(a, periodsPerYear), benchmark: sharpeReport(b, periodsPerYear), correlation: correlation(a, b), beta,
    alpha: (mean(a) - beta * mb) * periodsPerYear, infoRatio: sd(act) > 0 ? (mean(act) / sd(act)) * Math.sqrt(periodsPerYear) : 0 };
}

function covMatrix(cols: number[][]) { const ms = cols.map(mean), n = cols[0].length; return cols.map((a, i) => cols.map((b, j) => a.reduce((s, x, k) => s + (x - ms[i]) * (b[k] - ms[j]), 0) / Math.max(1, n - 1))); }
function solve(A: number[][], y: number[]) {
  const n = y.length, M = A.map((r, i) => [...r, y[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; if (Math.abs(M[c][c]) < 1e-18) continue;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => (Math.abs(r[i]) < 1e-18 ? 0 : r[n] / r[i]));
}

export type CombineMethod = 'equal' | 'inverse_vol' | 'min_variance' | 'max_sharpe';
/** Weights (summing to 1, long only by default) from returns. max_sharpe is the tangency portfolio, Σ⁻¹μ, with the
 *  covariance shrunk toward its diagonal (shrink 0.2) so a short sample can't produce wild weights. */
export function weightsFor(cols: number[][], method: CombineMethod, o: { longOnly?: boolean; shrink?: number } = {}) {
  const k = cols.length, longOnly = o.longOnly ?? true, sh = o.shrink ?? 0.2;
  if (method === 'equal') return Array(k).fill(1 / k);
  const C = covMatrix(cols).map((r, i) => r.map((v, j) => (i === j ? v : (1 - sh) * v)));
  let w = method === 'inverse_vol' ? C.map((r, i) => 1 / Math.sqrt(r[i] || 1e-18)) : solve(C, method === 'max_sharpe' ? cols.map(mean) : Array(k).fill(1));
  if (longOnly) w = w.map(x => Math.max(0, x));
  const s = w.reduce((a, b) => a + (longOnly ? b : Math.abs(b)), 0);
  return s > 0 ? w.map(x => x / s) : Array(k).fill(1 / k);
}
export const portfolioReturns = (cols: number[][], w: number[]) => cols[0].map((_, t) => cols.reduce((a, c, i) => a + w[i] * c[t], 0));

/** Fit weights on the first `train` share, score every method on the rest. diversification = portfolio Sharpe ÷ the
 *  average single-series Sharpe on the same test window (above 1 means the mix helped). */
export function combine(series: Record<string, Map<number, number>>, o: { train?: number; periodsPerYear?: number; longOnly?: boolean } = {}) {
  const { names, keys, cols } = align(series), ppy = o.periodsPerYear ?? PPY.daily, cut = Math.floor(keys.length * (o.train ?? 0.5));
  const tr = cols.map(c => c.slice(0, cut)), te = cols.map(c => c.slice(cut));
  const singles = names.map((n, i) => ({ name: n, ...sharpeReport(te[i], ppy) })), avg = mean(singles.map(s => s.sharpe));
  const corr = names.map((_, i) => names.map((_, j) => +correlation(cols[i], cols[j]).toFixed(3)));
  const methods = (['equal', 'inverse_vol', 'min_variance', 'max_sharpe'] as CombineMethod[]).map(m => {
    const w = weightsFor(tr, m, { longOnly: o.longOnly }), rep = sharpeReport(portfolioReturns(te, w), ppy);
    return { method: m, weights: Object.fromEntries(names.map((n, i) => [n, +w[i].toFixed(3)])), ...rep, diversification: avg > 0 ? rep.sharpe / avg : NaN };
  });
  return { names, observations: keys.length, trainObs: cut, correlation: corr, singles, methods };
}

/** RESEARCH ONLY, never a live setting. Levered per-period returns with a borrow cost on the borrowed part, plus whether the
 *  path would have been wiped out (any single period losing all equity). */
export function leveredResearch(r: number[], L: number, borrowPerPeriod = 0) {
  const lr = r.map(x => L * x - Math.max(0, L - 1) * borrowPerPeriod);
  let eq = 1, peak = 1, dd = 0, ruined = false;
  for (const x of lr) { eq *= 1 + x; if (eq <= 0) { ruined = true; eq = 0; break; } peak = Math.max(peak, eq); dd = Math.min(dd, eq / peak - 1); }
  return { leverage: L, returns: lr, maxDrawdown: ruined ? -1 : dd, ruined, finalEquity: eq, researchOnly: true as const };
}
