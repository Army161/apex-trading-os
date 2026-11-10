// chat/86: a daily profit-target stop and a midday-lull filter, each tested against always-on trading. Run: npx tsx scripts/validate-session.ts
import { readFileSync } from 'fs';
import { Bar, Sig } from '../lib/engine/core';
import { stressSuite } from '../lib/engine/validate';
import { resample } from '../lib/engine/trend';
import { byId } from '../lib/engine/strategies';
import { skipMidday } from '../lib/engine/session';
const load = (f: string): Bar[] => readFileSync('../data/' + f, 'utf8').trim().split('\n').slice(1).map(l => { const [t, o, h, lo, c, v] = l.split(',').map(Number); return { t, o, h, l: lo, c, v }; });
const strats = ['dave_prev_range', 'ict_silver_bullet', 'smc_sweep_lite', 'rsi2_dip'];
for (const id of strats) {
  const st = byId(id); if (!st) { console.log(JSON.stringify({ missing: id })); continue; }
  for (const s of ['spy', 'qqq', 'iwm']) {
    const b30 = load(`${s}_30m.csv`);
    for (const [tf, b] of [['30m', b30], ['1h', resample(b30, 3600e3).bars]] as [string, Bar[]][]) {
      const cases: [string, (b: Bar[]) => Sig, object][] = [
        ['always on', st.build, {}], ['skip midday', skipMidday(st.build), {}],
        ['stop at +0.5% day', st.build, { dayTarget: 0.005 }], ['stop at +1% day', st.build, { dayTarget: 0.01 }], ['stop at -1% day', st.build, { dayLoss: 0.01 }],
      ];
      for (const [name, build, extra] of cases) {
        const r = stressSuite(b, build, { fee: 0.0002, slip: 0.0001, ...extra });
        console.log(JSON.stringify({ strat: id, data: `${s.toUpperCase()} ${tf}`, v: name, n: r.metrics.trades, ret: +(r.metrics.totalReturn * 100).toFixed(1), dd: +(r.metrics.maxDrawdown * 100).toFixed(1), passed: r.passed, of: r.of }));
      }
    }
  }
}
