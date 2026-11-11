// Rule language (spec) tests: version 1 still means what it meant, every version 2 operand is free of look-ahead, and the
// version 2 pieces do what their one-line description says.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { backtest, type Bar, type Sig } from '../src/core';
import { fixtures } from '../src/fingerprint';
import { EXAMPLE, SPEC_SCHEMA_V2, clock, compile, fromModel, knobs, validate, type Cond, type Session, type Spec } from '../src/spec';
import { openingRange, sessionBars, sessionVwap } from '../src/queue';

const [SPY30, BTC1D] = fixtures();
const NY: Session = { tz: 'America/New_York', start: '09:30', end: '16:00', days: [1, 2, 3, 4, 5] };
const ind = (id: string, type: any, length: number, mult = 0, length2 = 0, length3 = 0) => ({ id, type, length, length2, length3, mult });
const base = (over: Partial<Spec> = {}): Spec => ({ name: 't', description: 't', symbol: 'SPY', tf: '30m', direction: 'both', indicators: [], long_entry: [], short_entry: [], exit_long: [], exit_short: [],
  stop: { type: 'atr', value: 2 }, target: { type: 'r', value: 2 }, max_bars: 0, unsupported: [], ...over });
const gt = (left: string, right: string): Cond => ({ left, op: '>', right }), lt = (left: string, right: string): Cond => ({ left, op: '<', right });
const same = (a: number, b: number) => (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
const diffAt = (x: Sig, y: Sig, i: number) => (['le', 'se', 'lx', 'sx'] as const).some(k => x[k][i] !== y[k][i]) || ((x.le[i] || x.se[i]) && (!same(x.stop[i], y.stop[i]) || !same(x.target[i], y.target[i])));
const count = (s: Sig) => s.le.filter(Boolean).length + s.se.filter(Boolean).length;

test('version 1 specs compile to exactly the signals they did before version 2', () => {
  const d = (s: Spec) => createHash('sha256').update(JSON.stringify(fixtures().map(b => compile(s)(b)))).digest('hex');
  assert.equal(d(EXAMPLE), '611a0efc3a6b0826d6680ac046bfc33984f2f930a735207e3fa80b594b59e503'); assert.deepEqual(validate(EXAMPLE), []);
});

// One spec per version 2 feature. Each must signal on the fixture (so the test is not passing on silence) and must give the
// same answer on bar i whether or not later bars exist, and whatever those later bars are.
const CASES: Record<string, { spec: Spec; bars?: Bar[] }> = {
  vwap: { spec: base({ session: NY, long_entry: [{ left: 'close', op: 'crosses_above', right: 'vwap' }], short_entry: [{ left: 'close', op: 'crosses_below', right: 'vwap' }] }) },
  'vwap bands': { spec: base({ session: NY, long_entry: [lt('low', 'vwap.lower2'), gt('close', 'vwap.lower2')], short_entry: [gt('high', 'vwap.upper2'), lt('close', 'vwap.upper2')], target: { type: 'level', value: 0, operand: 'vwap' } }) },
  'vwap bands 1 and 3': { spec: base({ session: NY, long_entry: [gt('close', 'vwap.upper1'), lt('close', 'vwap.upper3')], short_entry: [lt('close', 'vwap.lower1'), gt('close', 'vwap.lower3')] }) },
  prev_day: { spec: base({ long_entry: [{ left: 'close', op: 'crosses_above', right: 'prev_day.high' }], short_entry: [{ left: 'close', op: 'crosses_below', right: 'prev_day.low' }], exit_long: [lt('close', 'prev_day.close')] }) },
  open_range: { spec: base({ session: NY, flat_at_close: true, cooldown_bars: 12, long_entry: [gt('close', 'open_range(30).high')], short_entry: [lt('close', 'open_range(30).low')],
    stop: { type: 'indicator', value: 0, operand: 'open_range(30).low', operand_short: 'open_range(30).high' } }) },
  'highest and lowest': { spec: base({ long_entry: [gt('close', 'highest(20)')], short_entry: [lt('close', 'lowest(20)')], stop: { type: 'bar', value: 0.1 }, target: { type: 'measured_move', value: 20 } }) },
  time: { spec: base({ session: NY, long_entry: [gt('time', '600'), lt('time', '720'), gt('close', 'open')], cooldown_bars: 3 }) },
  htf: { spec: base({ indicators: [ind('e', 'ema', 10), ind('st', 'supertrend', 10, 3)], long_entry: [gt('htf(4h).close', 'htf(4h).e'), gt('htf(1d).st.dir', '0'), { left: 'close', op: 'crosses_above', right: 'e' }], short_entry: [lt('htf(4h).close', 'htf(4h).e'), { left: 'close', op: 'crosses_below', right: 'e' }] }) },
  'swing stop': { spec: base({ indicators: [ind('e', 'ema', 20)], long_entry: [{ left: 'close', op: 'crosses_above', right: 'e' }], short_entry: [{ left: 'close', op: 'crosses_below', right: 'e' }], stop: { type: 'swing', value: 0.1, left: 3, right: 3 } }) },
  'indicator stop and trail': { spec: base({ indicators: [ind('st', 'supertrend', 10, 3)], direction: 'long', long_entry: [{ left: 'close', op: 'crosses_above', right: 'st.line' }], stop: { type: 'indicator', value: 0, operand: 'st.line' }, target: { type: 'none', value: 0 }, trail: { type: 'ema', value: 21 } }) },
  'daily prev_day and htf': { bars: BTC1D, spec: base({ symbol: 'BTCUSDT', tf: '1d', indicators: [ind('e', 'ema', 10)], long_entry: [gt('close', 'prev_day.high'), gt('htf(1w).close', 'htf(1w).e')], short_entry: [lt('close', 'prev_day.low'), lt('htf(1w).close', 'htf(1w).e')] }) },
};
for (const [name, c] of Object.entries(CASES)) {
  test(`version 2, ${name}: valid, signals, and no look-ahead`, () => {
    const b = c.bars ?? SPY30, build = compile(c.spec), full = build(b);
    assert.deepEqual(validate(c.spec), []); assert.ok(count(full) >= 5, `only ${count(full)} signals`);
    let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = b.length - 400; n < b.length; n += 3) {
      assert.ok(!diffAt(full, build(b.slice(0, n)), n - 1), `bar ${n - 1} changes when later bars are removed`);
      if (n % 30) continue;
      const f = 0.5 + rnd(), later = b.slice(n).map(x => ({ ...x, o: x.o * f, h: x.h * f * 1.01, l: x.l * f * 0.99, c: x.c * f, v: x.v * 3 }));
      const alt = build([...b.slice(0, n), ...later]); for (let i = n - 40; i < n; i++) assert.ok(!diffAt(full, alt, i), `bar ${i} changes when later bars are altered`);
    }
  });
}

test('the spec opening-range breakout is the built-in one, signal for signal', () => {
  const a = compile(CASES.open_range.spec)(SPY30), b = openingRange()(SPY30);
  assert.ok(count(b) > 50); for (let i = 0; i < SPY30.length; i++) assert.ok(!diffAt(a, b, i), `bar ${i}`);
});

test('session VWAP in a spec equals the engine helper; prev_day, highest and time hold what they say', () => {
  const s = base({ session: NY, long_entry: [gt('close', 'vwap'), gt('close', 'prev_day.high'), gt('close', 'highest(5)'), gt('time', '0')] }), sig = compile(s)(SPY30);
  const ses = sessionBars(SPY30), { vwap } = sessionVwap(SPY30, ses), ck = clock(SPY30, NY.tz);
  let checked = 0;
  for (let i = 40; i < SPY30.length; i++) {
    let j = i - 1; while (j >= 0 && ck.day[j] === ck.day[i]) j--; if (j < 0) continue; const d = ck.day[j]; let ph = -Infinity; for (; j >= 0 && ck.day[j] === d; j--) ph = Math.max(ph, SPY30[j].h);
    const want = ses[i].rth && SPY30[i].c > vwap[i] && SPY30[i].c > ph && SPY30[i].c > Math.max(...SPY30.slice(i - 5, i).map(x => x.h));
    assert.equal(sig.le[i], want, `bar ${i}`); if (want) checked++;
  }
  assert.ok(checked > 10); assert.equal(ck.min[ses.findIndex(x => x.first)], 570);
});

test('sessions, flat at close and cooldown', () => {
  const s = base({ session: NY, flat_at_close: true, direction: 'long', long_entry: [gt('close', '0')] }), sig = compile(s)(SPY30), ck = clock(SPY30, NY.tz);
  sig.le.forEach((v, i) => assert.equal(v, ck.min[i] >= 570 && ck.min[i] <= 870, `entries only from 09:30 to 14:30, bar ${i}`));
  sig.lx.forEach((v, i) => assert.equal(v, ck.min[i] < 570 || ck.min[i] >= 900, `flat from the 15:00 bar until the next open, bar ${i}`));
  // Out by the 15:30 open. The exception is an exchange half day: the data has no 15:00 bar, so the exit fills on the next bar it does have, the same day.
  const r = backtest(SPY30, sig), has1500 = new Set(ck.min.map((m, i) => (m === 900 ? ck.day[i] : -1))); let late = 0;
  for (const t of r.trades) { const a = clock([{ t: t.entryT } as Bar, { t: t.exitT } as Bar], NY.tz); assert.equal(a.day[0], a.day[1], 'no trade is held overnight'); if (a.min[1] > 930) { late++; assert.ok(!has1500.has(a.day[0])); } }
  assert.ok(r.trades.length > 20 && late <= 3);
  const cool = compile({ ...s, flat_at_close: false, cooldown_bars: 5 })(SPY30); let last = -99; cool.le.forEach((v, i) => { if (v) { assert.ok(i - last > 5); last = i; } });
  const tue = compile({ ...s, session: { ...NY, days: [2] } })(SPY30); assert.ok(tue.le.some(Boolean)); tue.le.forEach((v, i) => v && assert.equal(ck.dow[i], 2));
});

test('stops and targets land on the right side of price, or are left to the engine', () => {
  const s = base({ indicators: [ind('e', 'ema', 200)], long_entry: [gt('close', 'highest(10)')], short_entry: [lt('close', 'lowest(10)')], stop: { type: 'indicator', value: 0, operand: 'e' }, target: { type: 'level', value: 0, operand: 'prev_day.high', operand_short: 'prev_day.low' } });
  const sig = compile(s)(SPY30); let stops = 0, none = 0;
  sig.le.forEach((v, i) => { if (!v && !sig.se[i]) return; const side = v ? 1 : -1, c = SPY30[i].c;
    if (Number.isNaN(sig.stop[i])) none++; else { stops++; assert.ok((c - sig.stop[i]) * side > 0); } if (!Number.isNaN(sig.target[i])) assert.ok((sig.target[i] - c) * side > 0); });
  assert.ok(stops > 5 && none > 0, 'an EMA on the wrong side of price is not used as a stop');
  const sw = compile(base({ direction: 'long', long_entry: [gt('close', 'highest(10)')], stop: { type: 'swing', value: 0 } }))(SPY30), t = compile(base({ direction: 'long', long_entry: [gt('close', 'highest(10)')], trail: { type: 'atr', value: 2 } }))(SPY30);
  assert.ok(sw.stop.some(x => !Number.isNaN(x))); assert.deepEqual(t.trail, { mode: 'scalp', trigger: 0, distance: 2, beyondEntry: false }); assert.ok(backtest(SPY30, t).trades.some(x => x.reason === 'trail'));
});

test('validate refuses what version 2 cannot run, in plain words', () => {
  const bad = (over: Partial<Spec>, re: RegExp) => assert.match(validate(base({ long_entry: [gt('close', 'open')], ...over })).join(' | '), re);
  bad({ long_entry: [gt('close', 'open_range(30).high')] }, /needs a session/);
  bad({ session: NY, long_entry: [gt('close', 'open_range(45).high')] }, /multiple of the bar size/);
  bad({ long_entry: [gt('close', 'htf(5m).close')] }, /above the strategy's own/);
  bad({ long_entry: [gt('close', 'htf(4h).nope')] }, /not a price or a defined indicator/);
  bad({ tf: '1d', long_entry: [gt('close', 'vwap')] }, /intraday/);
  bad({ session: { ...NY, start: '16:00', end: '09:30' } }, /overnight/);
  bad({ session: { ...NY, tz: 'Mars/Olympus' as any } }, /time zone/);
  bad({ flat_at_close: true }, /needs a session/);
  bad({ stop: { type: 'indicator', value: 0 } }, /stop: empty operand/);
  bad({ target: { type: 'level', value: 0, operand: 'nope' } }, /target: operand "nope"/);
  bad({ target: { type: 'measured_move', value: 1 } }, /measured_move/);
  bad({ trail: { type: 'atr', value: 0 } }, /trail/);
  bad({ cooldown_bars: -1 }, /cooldown/);
  bad({ stop: { type: 'none', value: 0 } }, /a stop is required/);
  assert.ok(knobs(base({ long_entry: [gt('close', 'open')], trail: { type: 'ema', value: 21 }, cooldown_bars: 3, stop: { type: 'swing', value: 0.1 } })).map(k => k.path).join().includes('trail.value,cooldown_bars'));
});

test('the version 2 schema is strict, and a model answer with nulls becomes a clean spec', () => {
  const walk = (o: any, path: string): void => { if (!o || typeof o !== 'object') return; if (o.type === 'object') { assert.equal(o.additionalProperties, false, path); assert.deepEqual([...o.required].sort(), Object.keys(o.properties).sort(), path); }
    for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`); };
  walk(SPEC_SCHEMA_V2, 'spec');
  const s = fromModel({ ...base({ long_entry: [gt('close', 'open')] }), stop: { type: 'atr', value: 2, left: null, right: null, operand: null, operand_short: null }, target: { type: 'r', value: 2, operand: null, operand_short: null }, session: null, flat_at_close: null, cooldown_bars: null, trail: null });
  assert.deepEqual(validate(s), []); assert.deepEqual(Object.keys(s.stop), ['type', 'value']); assert.ok(!('session' in s) && !('trail' in s));
});
