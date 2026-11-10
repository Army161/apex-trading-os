// chat/78 rules through the full checks, with every exit and filter variant. Run: npx tsx scripts/validate-dave.ts
import { readFileSync } from 'fs';
import { Bar } from '../lib/engine/core';
import { stressSuite } from '../lib/engine/validate';
import { resample } from '../lib/engine/trend';
import { swingCount, prevRange, DaveOpts } from '../lib/engine/dave';
const load = (f: string): Bar[] => readFileSync('../data/' + f, 'utf8').trim().split('\n').slice(1).map(l => { const [t, o, h, lo, c, v] = l.split(',').map(Number); return { t, o, h, l: lo, c, v }; });
const spy30 = load('spy_30m.csv');
const sets: [string, Bar[], number, boolean][] = [
  ['SPY 30m', spy30, 0.0002, true], ['SPY 1h', resample(spy30, 3600e3).bars, 0.0002, true], ['SPY 4h', resample(spy30, 4 * 3600e3).bars, 0.0002, true],
  ['GLD 1d', load('gld_1d.csv'), 0.0005, false], ['QQQ 1d', load('qqq_1d.csv'), 0.0002, false], ['EURUSD 1d', load('eurusd_1d.csv'), 0.0001, false], ['BTC 1d', load('btc_1d.csv'), 0.001, false],
];
const variants: [string, (o: DaveOpts) => any, DaveOpts][] = [];
for (const exit of ['target', 'candle', 'swing', 'ema21'] as const) {
  variants.push([`swing_count min4 ${exit}`, swingCount, { exit, minSwings: 4 }]);
  for (const depth of [0.3, 0.5, 0.7]) variants.push([`prev_range ${depth} ${exit}`, prevRange, { exit, depth }]);
}
variants.push(['swing_count min0 target (no swing rule)', swingCount, { exit: 'target', minSwings: 0 }]);
variants.push(['swing_count min2 target', swingCount, { exit: 'target', minSwings: 2 }]);
variants.push(['prev_range 0.5 target +align', prevRange, { exit: 'target', depth: 0.5, align: true }]);
variants.push(['prev_range 0.5 target +skipNY', prevRange, { exit: 'target', depth: 0.5, skipNyOpen: true }]);
variants.push(['swing_count min4 target +skipNY', swingCount, { exit: 'target', minSwings: 4, skipNyOpen: true }]);
for (const [name, mk, o] of variants) for (const [d, b, fee, intraday] of sets) {
  if (o.skipNyOpen && !intraday) continue;
  const r = stressSuite(b, mk(o), { fee, slip: fee / 2 });
  console.log(JSON.stringify({ v: name, data: d, n: r.metrics.trades, ret: +(r.metrics.totalReturn * 100).toFixed(1), monkey: r.monkey.beat, passed: r.passed, of: r.of }));
}
