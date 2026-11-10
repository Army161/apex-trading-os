// chat/87 AR(1) taking strategy on real bars: fit on the first 60% in time order, trade the rest. Run: npx tsx scripts/validate-quant.ts
import { readFileSync } from 'fs';
import { Bar } from '../lib/engine/core';
import { resample } from '../lib/engine/trend';
import { takeStrategy, sharpe, Sizing } from '../lib/engine/quant';
import { deflatedSharpe } from '../lib/leaderboard';
const TRIALS = 78;   // every configuration this script runs
const load = (f: string): Bar[] => readFileSync('../data/' + f, 'utf8').trim().split('\n').slice(1).map(l => { const [t, o, h, lo, c, v] = l.split(',').map(Number); return { t, o, h, l: lo, c, v }; });
const sets: [string, Bar[], number, number][] = [];
for (const s of ['spy', 'qqq', 'iwm']) { const b = load(`${s}_30m.csv`); sets.push([`${s.toUpperCase()} 1h`, resample(b, 3600e3).bars, 0.0002, 252 * 7]); }
sets.push(['BTC 1d', load('btc_1d.csv'), 0.001, 365], ['GLD 1d', load('gld_1d.csv'), 0.0005, 252], ['EURUSD 1d', load('eurusd_1d.csv'), 0.0001, 252]);
for (const [d, b, fee, ppy] of sets) for (const h of [1, 12]) for (const sizing of ['constant', 'hardtanh', 'tanh'] as Sizing[]) for (const thr of [0, 1]) {
  for (const fit of ['ols', 'sgd'] as const) {
    if (fit === 'sgd' && (sizing !== 'constant' || thr)) continue;
    const r = takeStrategy(b, { h, fee, sizing, fit, thresholdQ: thr ? 0.7 : undefined });
    console.log(JSON.stringify({ data: d, h, sizing, fit, thr, w: +r.model.w.toFixed(4), beh: r.behaviour, trades: r.ev.n, evBps: +(r.ev.ev * 1e4).toFixed(2), win: +(r.ev.winRate * 100).toFixed(1), ret: +(r.total * 100).toFixed(1), hold: +(r.buyHold * 100).toFixed(1), sharpe: +sharpe(r.barReturns, ppy).toFixed(2), dsr: +deflatedSharpe(r.barReturns, TRIALS).psr.toFixed(3) }));
  }
}
