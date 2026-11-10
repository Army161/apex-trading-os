// chat/90 Sharpe reports on real data: SPY as the benchmark, buy-and-hold Sharpes with t-stats, the correlation-aware
// combiner (weights fitted on the first half, scored on the second), and the IWM AR(1) lead against SPY.
// Leverage rows are RESEARCH ONLY. Run: npx tsx scripts/validate-sharpe.ts
import { readFileSync } from 'fs';
import { Bar } from '../lib/engine/core';
import { resample } from '../lib/engine/trend';
import { takeStrategy } from '../lib/engine/quant';
import { sharpeReport, combine, vsBenchmark, leveredResearch, align } from '../lib/sharpe';
const load = (f: string): Bar[] => readFileSync('../data/' + f, 'utf8').trim().split('\n').slice(1).map(l => { const [t, o, h, lo, c, v] = l.split(',').map(Number); return { t, o, h, l: lo, c, v }; });
const DAY = 864e5, daily = (b: Bar[]) => { const m = new Map<number, number>(); for (let i = 1; i < b.length; i++) m.set(Math.floor(b[i].t / DAY), b[i].c / b[i - 1].c - 1); return m; };
const series: Record<string, Map<number, number>> = {};
for (const s of ['spy', 'qqq', 'iwm']) series[s.toUpperCase()] = daily(resample(load(`${s}_30m.csv`), DAY).bars);
for (const s of ['gld', 'uso', 'btc', 'eurusd']) series[s.toUpperCase()] = daily(load(`${s}_1d.csv`));
const f = (x: number, d = 2) => +x.toFixed(d), row = (o: object) => console.log(JSON.stringify(o));
// buy and hold, each on its own days (BTC trades weekends, so 365)
for (const [n, m] of Object.entries(series)) { const r = sharpeReport([...m.values()], n === 'BTC' ? 365 : 252); row({ kind: 'hold', name: n, n: r.n, sharpe: f(r.sharpe), annRet: f(r.annReturn * 100, 1), annVol: f(r.annVol * 100, 1), t: f(r.tStat), p: f(r.pValue, 3) }); }
// combiner on days every asset traded
const c = combine(series, { train: 0.5 });
row({ kind: 'corr', names: c.names, obs: c.observations, matrix: c.correlation });
for (const s of c.singles) row({ kind: 'test-single', name: s.name, sharpe: f(s.sharpe), t: f(s.tStat) });
for (const m of c.methods) row({ kind: 'mix', method: m.method, weights: m.weights, sharpe: f(m.sharpe), t: f(m.tStat), annVol: f(m.annVol * 100, 1), diversification: f(m.diversification) });
// IWM AR(1) 12h lead, summed to days, against SPY
const h = resample(load('iwm_30m.csv'), 3600e3).bars, ar = takeStrategy(h, { h: 12, fee: 0.0002 }), split = Math.floor(h.length * 0.6), am = new Map<number, number>();
ar.barReturns.forEach((r, k) => { const d = Math.floor(h[split + 1 + k].t / DAY); am.set(d, (am.get(d) ?? 0) + r); });
const al = align({ ar: am, spy: series.SPY }), vb = vsBenchmark(al.cols[0], al.cols[1]);
row({ kind: 'vs-spy', name: 'IWM AR(1) 12h', days: al.keys.length, sharpe: f(vb.strategy.sharpe), t: f(vb.strategy.tStat), p: f(vb.strategy.pValue, 3), spySharpe: f(vb.benchmark.sharpe), corr: f(vb.correlation), beta: f(vb.beta), alphaPct: f(vb.alpha * 100, 1), infoRatio: f(vb.infoRatio) });
for (const L of [1, 2, 3]) { const lv = leveredResearch(al.cols[0], L, 0.05 / 252); row({ kind: 'leverage-research-only', L, sharpe: f(sharpeReport(lv.returns).sharpe), maxDD: f(lv.maxDrawdown * 100, 1), ruined: lv.ruined }); }
