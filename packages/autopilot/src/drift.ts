// Drift alarm (docs/design/04 s12, idea 4). Compares a slot's forward trades with its own backtest and pauses it before the
// drawdown limit does. Parameters live in the gate config.
import type { GateConfig } from '@apex/kernel/gate';
import type { Baseline } from '@apex/kernel/view';

const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
export const maxDdR = (rs: number[]) => { let cum = 0, peak = 0, dd = 0; for (const r of rs) { cum += r; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); } return dd; };

/** Frozen at lock from the in-sample per-trade R values. ddR95 is the 95th percentile of maximum drawdown (in R) over bootstrap resamples. */
export function baselineOf(rs: number[], g: GateConfig['drift'], seed = 7): Baseline {
  const n = rs.length, mu = mean(rs), sigma = n > 1 ? Math.sqrt(rs.reduce((a, r) => a + (r - mu) ** 2, 0) / (n - 1)) : 0, p = n ? rs.filter(r => r > 0).length / n : 0;
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, dds: number[] = [];
  for (let k = 0; k < g.bootstrapRuns && n > 0; k++) dds.push(maxDdR(Array.from({ length: n }, () => rs[Math.floor(rnd() * n)])));
  dds.sort((a, b) => a - b);
  return { n, mu, sigma, p, ddR95: dds.length ? dds[Math.min(dds.length - 1, Math.floor(g.ddPct * dds.length))] : 0 };
}

/** P(X <= k) for X ~ Binomial(n, p). */
export function binomCdf(k: number, n: number, p: number) { if (p <= 0) return 1; if (p >= 1) return k >= n ? 1 : 0; let term = (1 - p) ** n, sum = term; for (let i = 1; i <= k; i++) { term *= ((n - i + 1) / i) * (p / (1 - p)); sum += term; } return Math.min(1, sum); }

/** One-sided CUSUM step on the standardised R of a closed trade. */
export function cusumStep(S: number, r: number, b: Baseline, g: GateConfig['drift']) { const z = b.sigma > 0 ? Math.max(-g.clip, Math.min(g.clip, (r - b.mu) / b.sigma)) : 0; return Math.max(0, S - z - g.allowance); }

export type DriftReading = { n: number; s: number; winP: number | null; ddR: number; alarms: string[]; costNote: string };
/** Reading after the newest closed forward trade. `forwardR` is every closed forward trade of the slot in order; `prevS` is the CUSUM before the newest. */
export function driftReading(forwardR: number[], prevS: number, b: Baseline, g: GateConfig['drift'], costRatio: number | null = null): DriftReading {
  const n = forwardR.length, s = cusumStep(prevS, forwardR[n - 1], b, g), wins = forwardR.filter(r => r > 0).length;
  const winP = n >= g.minWinN ? binomCdf(wins, n, b.p) : null, ddR = maxDdR(forwardR), alarms: string[] = [];
  if (s > g.threshold) alarms.push(`mean R has dropped (CUSUM ${s.toFixed(2)} above ${g.threshold})`);
  if (winP !== null && winP < g.winP) alarms.push(`win rate ${wins} of ${n} is unlikely given the backtest's ${(b.p * 100).toFixed(0)}% (p=${winP.toFixed(4)})`);
  if (b.ddR95 > 0 && ddR > b.ddR95) alarms.push(`forward drawdown ${ddR.toFixed(1)}R is beyond the backtest's 95th percentile (${b.ddR95.toFixed(1)}R)`);
  if (costRatio !== null && costRatio > g.costMult) alarms.push(`measured cost is ${costRatio.toFixed(1)}x the cost model`);
  return { n, s, winP, ddR, alarms, costNote: costRatio === null ? 'costs are assumed, not measured' : `measured cost ${costRatio.toFixed(2)}x the model` };
}
