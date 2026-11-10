// chat/82 GARCH volatility-premium + RSI/Bollinger intraday rule on real 30m bars. Run: npx tsx scripts/validate-garch.ts
import { readFileSync } from 'fs';
import { Bar } from '../lib/engine/core';
import { stressSuite } from '../lib/engine/validate';
import { garchIntraday, garchFit } from '../lib/engine/garch';
const load = (f: string): Bar[] => readFileSync('../data/' + f, 'utf8').trim().split('\n').slice(1).map(l => { const [t, o, h, lo, c, v] = l.split(',').map(Number); return { t, o, h, l: lo, c, v }; });
// sanity: recover known GARCH parameters from simulated returns
let h = 1e-4, x = 0, seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const sim: number[] = []; for (let i = 0; i < 3000; i++) { h = 2e-6 + 0.1 * x * x + 0.85 * h; x = Math.sqrt(h) * gauss(); sim.push(x); }
const f = garchFit(sim); console.log(JSON.stringify({ sanity: { alpha: +f.alpha.toFixed(3), beta: +f.beta.toFixed(3), true: [0.1, 0.85] } }));
for (const s of ['spy', 'qqq', 'iwm']) for (const k of [1.5, 1.0]) {
  const b = load(`${s}_30m.csv`), r = stressSuite(b, garchIntraday({ k }), { fee: 0.0002, slip: 0.0001 });
  console.log(JSON.stringify({ data: s.toUpperCase() + ' 30m', k, n: r.metrics.trades, ret: +(r.metrics.totalReturn * 100).toFixed(1), monkey: r.monkey.beat, passed: r.passed, of: r.of, checks: r.checks.filter(c => !c.pass).map(c => c.name) }));
}
