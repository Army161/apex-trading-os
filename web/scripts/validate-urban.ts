// Real-data checks for the Urban Forex rules (chat/60 + 61). Daily FX from data/*_1d.csv (USD pairs from the Massive connector);
// crosses are built from the USD legs. Trades are pooled across all pairs so the 50-trade bar means something.
// Run: npx tsx scripts/validate-urban.ts
import { readFileSync, existsSync } from 'fs';
import { Bar, Sig, Trade, backtest } from '../lib/engine/core';
import { monkeyTest, holdout, costBreakdown, MIN_TRADES } from '../lib/engine/validate';
import { usdValues, allCrosses, currencyStrength, strengthSide, withStrength, strengthTable, dealFlow, srMemory } from '../lib/engine/urban';

const load = (f: string): Bar[] => readFileSync(f, 'utf8').trim().split('\n').slice(1).map(l => { const [t, o, h, l2, c, v] = l.split(',').map(Number); return { t, o, h, l: l2, c, v }; });
const D = '../data/';
const pairs: Record<string, Bar[]> = {};
for (const p of ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCAD', 'USDCHF']) if (existsSync(D + p.toLowerCase() + '_1d.csv')) pairs[p] = load(D + p.toLowerCase() + '_1d.csv');
const v = usdValues(pairs), X = allCrosses(v), st = currencyStrength(v);
console.log('currencies', v.ccys.join(' '), '| days', v.dates.length, '| pairs', Object.keys(X).length);
console.log('strength now', strengthTable(st).map(r => r.ccy + ' ' + r.score + ' ' + r.label).join(' | '));

// FX costs: about 1 bp a side plus half a bp slippage (retail ECN-ish). Also shown at the engine default (10 bp) as a stress.
const COST = [{ name: 'fx costs 1bp', fee: 0.0001, slip: 0.00005 }, { name: 'default 10bp', fee: 0.001, slip: 0.0005 }];
type Build = (b: Bar[]) => Sig;
function pooled(label: string, mk: (pair: string) => Build, cost: { fee: number; slip: number }, window: 'all' | 'test' = 'all') {
  let trades: Trade[] = [], pnl = 0, beatSum = 0, beatN = 0, wins = 0;
  for (const [p, bars0] of Object.entries(X)) {
    const bars = window === 'test' ? holdout(bars0, 18).test : bars0;
    const r = backtest(bars, mk(p)(bars), cost);
    trades = trades.concat(r.trades); pnl += r.trades.reduce((a, t) => a + t.pnl, 0); wins += r.trades.filter(t => t.pnl > 0).length;
    if (r.trades.length) { const m = monkeyTest(bars, r.trades, { ...cost, runs: 200 }); beatSum += m.beat * r.trades.length; beatN += r.trades.length; }
  }
  const cb = costBreakdown(trades, cost.fee), n = trades.length, avgR = n ? trades.reduce((a, t) => a + t.r, 0) / n : 0;
  return { label, window, n, enough: n >= MIN_TRADES, winRate: n ? +(wins / n).toFixed(2) : 0, avgR: +avgR.toFixed(2), pnlPerPair10k: +(pnl / Object.keys(X).length).toFixed(0),
    monkeyBeat: beatN ? +(beatSum / beatN).toFixed(2) : 0, monkeyPass: beatN > 0 && beatSum / beatN >= 0.95, costs: cb.verdict };
}

const rows: ReturnType<typeof pooled>[] = [];
const sides: Record<string, Map<number, 1 | -1 | 0>> = Object.fromEntries(Object.keys(X).map(p => [p, strengthSide(st, p)]));
for (const c of COST) for (const w of ['all', 'test'] as const) {
  rows.push(pooled(`deal flow, no filter [${c.name}]`, () => dealFlow(), c, w));
  rows.push(pooled(`deal flow + strength [${c.name}]`, p => withStrength(dealFlow(), sides[p]), c, w));
  rows.push(pooled(`S/R memory + DNA, no filter [${c.name}]`, () => srMemory(), c, w));
  rows.push(pooled(`S/R memory + DNA + strength [${c.name}]`, p => withStrength(srMemory(), sides[p]), c, w));
}
// neighbour settings (FX costs, whole window)
for (const d of [0.3, 0.382, 0.5]) rows.push(pooled(`deal flow minDisc ${d}`, () => dealFlow({ minDisc: d }), COST[0]));
for (const g of [2, 2.5, 3]) rows.push(pooled(`S/R memory depart ${g}`, () => srMemory({ depart: g }), COST[0]));
console.log(JSON.stringify(rows, null, 1));

// Both webinars say the rules work on any product and any timeframe. Second, larger sample: SPY 30m resampled to 1h.
import { stressSuite } from '../lib/engine/validate';
import { resample } from '../lib/engine/trend';
const spy = resample(load(D + 'spy_30m.csv'), 3600e3).bars;
for (const [name, build] of [['deal flow', dealFlow()], ['S/R memory + DNA', srMemory()]] as const) {
  const r = stressSuite(spy, build, { fee: 0.0002, slip: 0.0001 });
  console.log('SPY1h', name, JSON.stringify({ n: r.metrics.trades, ret: +(r.metrics.totalReturn * 100).toFixed(1), monkey: r.monkey.beat, passed: `${r.passed}/${r.of}`, verdict: r.verdict, checks: r.checks.map(c => `${c.pass ? 'ok' : 'NO'} ${c.name}: ${c.why}`) }));
}
