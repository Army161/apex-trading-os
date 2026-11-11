// Look-ahead test (docs/design/14 P3.2). A rule's answer on bar i may use bars 0..i only. So if we cut the history off at bar i
// and run the rule again, the answer on bar i must be the same as it was with the full history. A rule that peeks at later bars
// gives a different answer once those bars are gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Bar, Sig } from '../src/core';
import { fixtures } from '../src/fingerprint';
import { STRATEGIES } from '../src/strategies';
import { sessionBars, sessionVwap } from '../src/queue';

const same = (a: number, b: number) => (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
/** What the trader would act on at the close of bar i: enter or exit flags, and the stop and target if entering. */
function diffAt(full: Sig, cut: Sig, i: number): string | null {
  for (const k of ['le', 'se', 'lx', 'sx'] as const) if (full[k][i] !== cut[k][i]) return `${k} ${full[k][i]} -> ${cut[k][i]}`;
  if (full.le[i] || full.se[i]) { if (!same(full.stop[i], cut.stop[i])) return `stop ${full.stop[i]} -> ${cut.stop[i]}`; if (!same(full.target[i], cut.target[i])) return `target ${full.target[i]} -> ${cut.target[i]}`; }
  return null;
}
const FX = fixtures(), cutsFor = (n: number) => { const out: number[] = []; for (let k = 0; k < 8; k++) out.push(Math.floor(n * 0.5) + Math.floor((k * (n * 0.5 - 1)) / 7)); return [...new Set(out)]; };

for (const s of STRATEGIES) {
  test(`no look-ahead: ${s.id}`, () => {
    const problems: string[] = [];
    FX.forEach((b: Bar[], f) => {
      const full = s.build(b);
      for (const n of cutsFor(b.length)) { const d = diffAt(full, s.build(b.slice(0, n)), n - 1); if (d) problems.push(`fixture ${f}, bar ${n - 1}: ${d}`); }
      if (s.queue) for (let n = b.length - 150; n < b.length; n++) { if (n < 60) continue; const d = diffAt(full, s.build(b.slice(0, n)), n - 1); if (d) problems.push(`fixture ${f}, bar ${n - 1}: ${d}`); }
    });
    assert.deepEqual(problems.slice(0, 5), [], `${s.id} changes its answer when later bars are removed`);
  });
}

test('queue tests fire on the intraday fixture, so the look-ahead test is not passing on silence', () => {
  for (const s of STRATEGIES.filter(x => x.queue)) { const sig = s.build(FX[0]); assert.ok(sig.le.some(Boolean) || sig.se.some(Boolean), `${s.id} never signals on the SPY 30m fixture`); }
});

test('session helpers: the opening bar starts the count and VWAP, and entries stop one bar before the close', () => {
  const b = FX[0], ses = sessionBars(b), { vwap } = sessionVwap(b, ses), first = ses.findIndex(x => x.first);
  assert.ok(first >= 0 && ses[first].min === 570 && ses[first].n === 1);
  assert.ok(same(vwap[first], (b[first].h + b[first].l + b[first].c) / 3), 'VWAP on the opening bar is that bar alone');
  assert.ok(ses.every(x => !(x.canEnter && x.flat)) && ses.some(x => x.rth && x.flat && x.min === 900) && ses.every(x => !x.canEnter || x.min <= 870));
});
