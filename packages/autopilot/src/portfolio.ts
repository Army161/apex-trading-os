// Correlation dedupe and portfolio weights (docs/design/04 s9, idea 5). No optimiser: the study showed in-sample max-Sharpe
// weights lose out of sample, so this file must never import weightsFor(..., 'max_sharpe').
import { correlation } from '@apex/engine/sharpe';

export type Daily = [number, number][];
const sd = (x: number[]) => { const m = x.reduce((a, b) => a + b, 0) / (x.length || 1); return x.length > 1 ? Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1)) : 0; };

/** Correlation of two daily-return series over the days both have. null when the overlap is too short to say. */
export function overlapCorr(a: Daily, b: Daily, minDays: number): { corr: number; days: number } | null {
  const mb = new Map(b), xs: number[] = [], ys: number[] = [];
  for (const [d, r] of a) if (mb.has(d)) { xs.push(r); ys.push(mb.get(d)!); }
  return xs.length >= minDays ? { corr: correlation(xs, ys), days: xs.length } : null;
}

/** A new slot more than `maxCorr` correlated with an active primary becomes that primary's shadow: tracked, weight 0, no orders. */
export function dedupe(candidate: Daily, primaries: { slotKey: string; daily: Daily }[], maxCorr: number, minDays: number): { role: 'primary' | 'shadow'; shadowOf: string | null; corr: number | null } {
  let best: { slotKey: string; corr: number } | null = null;
  for (const p of primaries) { const c = overlapCorr(candidate, p.daily, minDays); if (c && c.corr > maxCorr && (!best || c.corr > best.corr)) best = { slotKey: p.slotKey, corr: c.corr }; }
  return best ? { role: 'shadow', shadowOf: best.slotKey, corr: best.corr } : { role: 'primary', shadowOf: null, corr: null };
}

/** Cap each weight by water-filling: the excess is shared among uncapped slots in proportion. If all are capped the rest stays in cash. */
export function waterFill(raw: number[], cap: number): number[] {
  const total = raw.reduce((a, b) => a + Math.max(0, b), 0); if (total <= 0) return raw.map(() => 0);
  const w = raw.map(x => Math.max(0, x) / total), capped = w.map(() => false);
  for (let iter = 0; iter < raw.length + 1; iter++) {
    let excess = 0; w.forEach((x, i) => { if (!capped[i] && x > cap) { excess += x - cap; w[i] = cap; capped[i] = true; } });
    if (excess <= 1e-12) break;
    const free = w.reduce((s, x, i) => s + (capped[i] ? 0 : x), 0); if (free <= 0) break;                 // everyone is capped: remainder is cash
    w.forEach((x, i) => { if (!capped[i]) w[i] = x + excess * (x / free); });
  }
  return w;
}

/**
 * Inverse-volatility weights when there are at least 2 primaries with enough aligned days, otherwise equal weights; then the cap.
 * Risk scale: the largest-weight slot trades at the full risk per trade, the rest are scaled down in proportion.
 */
export type Weights = { weights: Record<string, number>; riskFractions: Record<string, number>; method: 'none' | 'equal' | 'inverse_vol' };
export function portfolioWeights(slots: { slotKey: string; daily: Daily }[], o: { cap: number; minAlignedDays: number; riskPct: number }): Weights {
  if (!slots.length) return { weights: {}, riskFractions: {}, method: 'none' };
  let method: 'equal' | 'inverse_vol' = 'equal', raw = slots.map(() => 1);
  if (slots.length >= 2) {
    const common = slots.map(s => new Set(s.daily.map(d => d[0]))).reduce((a, b) => new Set([...a].filter(x => b.has(x))));
    if (common.size >= o.minAlignedDays) { const vols = slots.map(s => sd(s.daily.filter(d => common.has(d[0])).map(d => d[1]))); if (vols.every(v => v > 0)) { raw = vols.map(v => 1 / v); method = 'inverse_vol'; } }
  }
  const w = waterFill(raw, o.cap), max = Math.max(...w);
  return { weights: Object.fromEntries(slots.map((s, i) => [s.slotKey, +w[i].toFixed(6)])), riskFractions: Object.fromEntries(slots.map((s, i) => [s.slotKey, max > 0 ? +(o.riskPct * w[i] / max).toFixed(8) : 0])), method };
}
