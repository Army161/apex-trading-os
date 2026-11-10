// Every registered strategy through the stress suite on real data. Run: npx tsx scripts/validate-all.ts
import { readFileSync } from 'fs';
import { Bar } from '../lib/engine/core';
import { STRATEGIES } from '../lib/engine/strategies';
import { stressSuite } from '../lib/engine/validate';
import { resample } from '../lib/engine/trend';
const load = (f: string): Bar[] => readFileSync('../data/' + f, 'utf8').trim().split('\n').slice(1).map(l => { const [t, o, h, lo, c, v] = l.split(',').map(Number); return { t, o, h, l: lo, c, v }; });
const spy30 = load('spy_30m.csv');
const sets: [string, Bar[], number][] = [
  ['SPY 1h', resample(spy30, 3600e3).bars, 0.0002], ['SPY 4h', resample(spy30, 4 * 3600e3).bars, 0.0002],
  ['GLD 1d', load('gld_1d.csv'), 0.0005], ['USO 1d', load('uso_1d.csv'), 0.0005], ['QQQ 1d', load('qqq_1d.csv'), 0.0002],
  ['EURUSD 1d', load('eurusd_1d.csv'), 0.0001], ['BTC 1d', load('btc_1d.csv'), 0.001],
];
const only = process.argv[2] ? process.argv[2].split(',') : null;
for (const s of STRATEGIES) {
  if (only && !only.includes(s.id)) continue;
  for (const [name, b, fee] of sets) {
    try {
      const r = stressSuite(b, s.build, { fee, slip: fee / 2 });
      console.log(JSON.stringify({ id: s.id, data: name, n: r.metrics.trades, ret: +(r.metrics.totalReturn * 100).toFixed(1), dd: +(r.metrics.maxDrawdown * 100).toFixed(1), monkey: r.monkey.beat, passed: r.passed, of: r.of, fails: r.checks.filter(c => !c.pass).map(c => c.name) }));
    } catch (e: any) { console.log(JSON.stringify({ id: s.id, data: name, error: String(e.message).slice(0, 80) })); }
  }
}
