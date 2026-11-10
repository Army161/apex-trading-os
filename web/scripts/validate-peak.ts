// chat/88 example systems through the full checks, walk-forward, and a correlation matrix. Run: npx tsx scripts/validate-peak.ts
import { readFileSync } from 'fs';
import { Bar, backtest } from '../lib/engine/core';
import { stressSuite } from '../lib/engine/validate';
import { resample } from '../lib/engine/trend';
import { extremeFade, duelingMomentum, stopBreakout, walkForward, correlationMatrix, dailyEquityReturns } from '../lib/engine/peak';
const load = (f: string): Bar[] => readFileSync('../data/' + f, 'utf8').trim().split('\n').slice(1).map(l => { const [t, o, h, lo, c, v] = l.split(',').map(Number); return { t, o, h, l: lo, c, v }; });
const sets: [string, Bar[], number][] = [['GLD 1d', load('gld_1d.csv'), 0.0005], ['USO 1d', load('uso_1d.csv'), 0.0005], ['QQQ 1d', load('qqq_1d.csv'), 0.0002], ['BTC 1d', load('btc_1d.csv'), 0.001], ['EURUSD 1d', load('eurusd_1d.csv'), 0.0001]];
for (const s of ['spy', 'qqq', 'iwm']) sets.push([`${s.toUpperCase()} 4h`, resample(load(`${s}_30m.csv`), 4 * 3600e3).bars, 0.0002]);
const systems: [string, any][] = [['extreme fade 35', extremeFade()], ['low-volume reversal', extremeFade(35, 20, true)], ['dueling momentum 50/100', duelingMomentum()], ['stop breakout 45', stopBreakout()]];
for (const [name, build] of systems) for (const [d, b, fee] of sets) {
  const r = stressSuite(b, build, { fee, slip: fee / 2 });
  console.log(JSON.stringify({ sys: name, data: d, n: r.metrics.trades, ret: +(r.metrics.totalReturn * 100).toFixed(1), pf: +r.metrics.profitFactor.toFixed(2), hold: +(r.metrics.buyHold * 100).toFixed(1), passed: r.passed, of: r.of }));
}
// walk-forward the fade lookback on SPY 4h: optimise on ~1 year of bars, trade the next quarter
const spy4 = resample(load('spy_30m.csv'), 4 * 3600e3).bars;
const wf = walkForward(spy4, (n: number) => extremeFade(n), [10, 20, 35, 50], { train: 400, test: 100, fee: 0.0002 });
console.log(JSON.stringify({ walkForward: 'extreme fade SPY 4h', oos: +(wf.oosReturn * 100).toFixed(1), trades: wf.trades, picks: wf.windows.map(w => w.pick), stable: wf.stablePick }));
const wf2 = walkForward(spy4, (n: number) => stopBreakout(n), [20, 45, 60], { train: 400, test: 100, fee: 0.0002 });
console.log(JSON.stringify({ walkForward: 'stop breakout SPY 4h', oos: +(wf2.oosReturn * 100).toFixed(1), trades: wf2.trades, picks: wf2.windows.map(w => w.pick), stable: wf2.stablePick }));
const series: Record<string, Map<number, number>> = {};
for (const [name, build] of systems) for (const [d, b, fee] of sets.slice(0, 4)) { const r = backtest(b, build(b), { fee }); series[`${name} ${d}`] = dailyEquityReturns(b, r.equity); }
const m = correlationMatrix(series), ids = Object.keys(m), offs: number[] = [];
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (!isNaN(m[ids[i]][ids[j]])) offs.push(m[ids[i]][ids[j]]);
console.log(JSON.stringify({ correlation: { pairs: offs.length, mean: +(offs.reduce((a, b) => a + b, 0) / offs.length).toFixed(3), max: +Math.max(...offs).toFixed(2), min: +Math.min(...offs).toFixed(2) } }));
