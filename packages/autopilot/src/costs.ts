// Venue cost model (docs/design/04 s13, idea 7). One-way cost = fee + half spread + slippage for the row matching the dataset.
// Costs are judged pessimistically: updates use the 75th percentile of what was measured, may rise freely, may fall by at most
// half per update, and never go below the prior without Jeremy's acknowledgement.
import { hashOf } from '@apex/kernel/canonical';
import type { Cost } from '@apex/kernel/gate';
import prior from './costs.prior.json';

export type CostRow = { venue: string; assetClass: string; bucket: 'mega' | 'liquid' | 'thin'; feeBps: number; halfSpreadBps: number; slipBps: number; n: number; source: 'prior' | 'measured'; why?: string };
export type CostModel = { version: string; rows: CostRow[] };
export type CostObs = { venue: string; assetClass: string; bucket: string; halfSpreadBps: number; slipBps: number; feeBps: number };

const strip = (rows: CostRow[]) => rows.map(({ why, ...r }) => r);
export const makeCostModel = (rows: CostRow[]): CostModel => ({ version: hashOf(strip(rows)), rows });
export const PRIOR_COSTS: CostModel = makeCostModel(prior.rows as CostRow[]);

export function costRow(m: CostModel, d: { assetClass: string; costBucket: string }, venue = 'paper'): CostRow {
  const r = m.rows.find(x => x.venue === venue && x.assetClass === d.assetClass && x.bucket === d.costBucket) ?? m.rows.find(x => x.venue === venue && x.assetClass === d.assetClass && x.bucket === 'liquid');
  if (!r) throw new Error(`cost model has no row for ${d.assetClass}/${d.costBucket}`);       // never guess a cost
  return r;
}
/** As backtest() takes them: fee per side as a fraction of notional, slip as a price fraction per side. */
export const costFor = (m: CostModel, d: { assetClass: string; costBucket: string }): Cost => { const r = costRow(m, d); return { fee: r.feeBps / 1e4, slip: (r.halfSpreadBps + r.slipBps) / 1e4 }; };
export const measured = (m: CostModel, d: { assetClass: string; costBucket: string }) => costRow(m, d).source === 'measured';

const pctl = (x: number[], p: number) => { const s = [...x].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]; };
/** Monthly update. `floor` is the prior model. `acknowledgedBelowFloor` is Jeremy's explicit yes to going under a prior. */
export function updateCostModel(current: CostModel, obs: CostObs[], floor: CostModel = PRIOR_COSTS, o: { minObs?: number; acknowledgedBelowFloor?: boolean } = {}): CostModel {
  const minObs = o.minObs ?? 30;
  const rows = current.rows.map(r => {
    const mine = obs.filter(x => x.venue === r.venue && x.assetClass === r.assetClass && x.bucket === r.bucket); if (mine.length < minObs) return r;
    const fl = floor.rows.find(x => x.venue === r.venue && x.assetClass === r.assetClass && x.bucket === r.bucket);
    const next = (key: 'feeBps' | 'halfSpreadBps' | 'slipBps') => { let v = pctl(mine.map(x => x[key]), 0.75); v = Math.max(v, r[key] / 2); if (fl && !o.acknowledgedBelowFloor) v = Math.max(v, fl[key]); return Math.round(v * 1000) / 1000; };
    return { ...r, feeBps: next('feeBps'), halfSpreadBps: next('halfSpreadBps'), slipBps: next('slipBps'), n: mine.length, source: 'measured' as const };
  });
  return makeCostModel(rows);
}
