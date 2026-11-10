// chat/81 trailing-stop modes vs Dave's chat/78 exits on the previous-range pullback candidate. Run: npx tsx scripts/validate-trails.ts
// Every variant goes through the full stressSuite. Spread is modelled in the trail (stop measured from bid/ask) and the
// number of stop modifications is counted, because the EA author warns that heavy modification can get an account banned.
import { readFileSync } from 'fs';
import { Bar, Sig, backtest } from '../lib/engine/core';
import { stressSuite } from '../lib/engine/validate';
import { resample } from '../lib/engine/trend';
import { prevRange, DaveOpts } from '../lib/engine/dave';
import { TrailSpec } from '../lib/engine/trail';
const load = (f: string): Bar[] => readFileSync('../data/' + f, 'utf8').trim().split('\n').slice(1).map(l => { const [t, o, h, lo, c, v] = l.split(',').map(Number); return { t, o, h, l: lo, c, v }; });
const sets: [string, Bar[]][] = [];
for (const s of ['spy', 'qqq', 'iwm']) { const b = load(`${s}_30m.csv`); sets.push([`${s.toUpperCase()} 30m`, b], [`${s.toUpperCase()} 1h`, resample(b, 3600e3).bars]); }
const fee = 0.0002, spread = 0.0002;
const withTrail = (o: DaveOpts, t: TrailSpec) => (b: Bar[]): Sig => ({ ...prevRange(o)(b), trail: t });
const variants: [string, (b: Bar[]) => Sig][] = [
  ['fixed target (baseline)', prevRange({ depth: 0.5, exit: 'target' })],
  ['dave: candle-low trail', prevRange({ depth: 0.5, exit: 'candle' })],
  ['dave: swing-low trail', prevRange({ depth: 0.5, exit: 'swing' })],
  ['dave: 21 EMA trail', prevRange({ depth: 0.5, exit: 'ema21' })],
  ['ea: scalp 0.5/0.3 ATR', withTrail({ depth: 0.5 }, { mode: 'scalp', trigger: 0.5, distance: 0.3, spread })],
  ['ea: scalp 1.0/0.5 ATR', withTrail({ depth: 0.5 }, { mode: 'scalp', trigger: 1, distance: 0.5, spread })],
  ['ea: scalp 0.5/0.3 + target', withTrail({ depth: 0.5 }, { mode: 'scalp', trigger: 0.5, distance: 0.3, spread, keepTarget: true })],
  ['ea: previous 2 candles', withTrail({ depth: 0.5 }, { mode: 'candles', n: 2, spread })],
  ['ea: previous 3 candles + target', withTrail({ depth: 0.5 }, { mode: 'candles', n: 3, spread, keepTarget: true })],
  ['ea: fast EMA 9', withTrail({ depth: 0.5 }, { mode: 'ma', period: 9, maType: 'ema', spread })],
  ['ea: Tenkan-sen 9', withTrail({ depth: 0.5 }, { mode: 'tenkan', period: 9, spread })],
  ['ea: Tenkan-sen 9 + target', withTrail({ depth: 0.5 }, { mode: 'tenkan', period: 9, spread, keepTarget: true })],
];
for (const [name, build] of variants) for (const [d, b] of sets) {
  const r = stressSuite(b, build, { fee, slip: fee / 2 });
  const tr = backtest(b, build(b), { fee, slip: fee / 2 }).trades, mods = tr.reduce((s, t) => s + (t.mods ?? 0), 0);
  const days = (b[b.length - 1].t - b[0].t) / 864e5 * 252 / 365;
  console.log(JSON.stringify({ v: name, data: d, n: r.metrics.trades, ret: +(r.metrics.totalReturn * 100).toFixed(1), win: +((tr.filter(t => t.pnl > 0).length / Math.max(1, tr.length)) * 100).toFixed(0), monkey: r.monkey.beat, passed: r.passed, of: r.of, modsPerTrade: +(mods / Math.max(1, tr.length)).toFixed(1), modsPerDay: +(mods / days).toFixed(2) }));
}
