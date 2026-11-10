// Out-of-sample check for the chat/78 rules that passed on SPY: same settings, untouched, on other ETFs' 30m data.
// Run: npx tsx scripts/validate-dave-oos.ts
import { readFileSync, existsSync } from 'fs';
import { Bar, backtest } from '../lib/engine/core';
import { stressSuite } from '../lib/engine/validate';
import { resample } from '../lib/engine/trend';
import { swingCount, prevRange, DaveOpts } from '../lib/engine/dave';
const load = (f: string): Bar[] => readFileSync('../data/' + f, 'utf8').trim().split('\n').slice(1).map(l => { const [t, o, h, lo, c, v] = l.split(',').map(Number); return { t, o, h, l: lo, c, v }; });
const variants: [string, (o: DaveOpts) => any, DaveOpts][] = [
  ['prev_range 0.5 target', prevRange, { depth: 0.5 }], ['prev_range 0.7 target', prevRange, { depth: 0.7 }],
  ['prev_range 0.5 target +skipNY', prevRange, { depth: 0.5, skipNyOpen: true }],
  ['swing_count min4 target', swingCount, { minSwings: 4 }], ['swing_count min2 target', swingCount, { minSwings: 2 }],
];
for (const tk of ['qqq', 'iwm']) {
  if (!existsSync(`../data/${tk}_30m.csv`)) continue;
  const b30 = load(`${tk}_30m.csv`);
  console.log(JSON.stringify({ data: tk.toUpperCase(), buyHold: +((b30[b30.length - 1].c / b30[0].o - 1) * 100).toFixed(1) }));
  for (const [name, mk, o] of variants) for (const [d, b] of [['30m', b30], ['1h', resample(b30, 3600e3).bars], ['4h', resample(b30, 4 * 3600e3).bars]] as [string, Bar[]][]) {
    const r = stressSuite(b, mk(o), { fee: 0.0002, slip: 0.0001 }), t = backtest(b, mk(o)(b), { fee: 0.0002, slip: 0.0001 }).trades;
    console.log(JSON.stringify({ v: name, data: `${tk.toUpperCase()} ${d}`, n: r.metrics.trades, shorts: t.filter(x => x.side === -1).length, ret: +(r.metrics.totalReturn * 100).toFixed(1), monkey: r.monkey.beat, passed: r.passed, of: r.of }));
  }
}
