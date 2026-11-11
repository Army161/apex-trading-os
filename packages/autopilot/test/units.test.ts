import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backtest, type Bar, type Sig } from '@apex/engine/core';
import { STRATEGIES } from '@apex/engine/strategies';
import { GATE_V1 } from '@apex/kernel';
import type { PositionState } from '@apex/kernel/view';
import { stepBar, type PendingIntent, type SlotBook } from '../src/broker/barsim';
import type { Fill } from '../src/broker/types';
import { PRIOR_COSTS, costFor, makeCostModel, updateCostModel, type CostObs } from '../src/costs';
import { baselineOf, cusumStep, driftReading, binomCdf } from '../src/drift';
import { dedupe, overlapCorr, portfolioWeights, waterFill, type Daily } from '../src/portfolio';
import { agreement, digestOf } from '../src/validator';
import { forwardSig, graduation, holdDaily, strategyRecord } from '../src/incubator';
import { evaluate } from '@apex/kernel/gate';
import { plantedBars, markerStrategy, rng, COST } from '../../kernel/test/helpers';

/** Drive the bar simulator the way the pipeline does, with a fixed quantity, and return closed round trips. */
function paperTrades(bars: Bar[], sig: Sig, cost = COST) {
  const book: SlotBook = { position: null, pending: null }, fills: Fill[] = [], trips: { entryT: number; entry: number; exitT: number; exit: number; reason: string }[] = []; let cancels = 0;
  const apply = (f: Fill) => { fills.push(f);
    if (f.kind === 'entry') { book.position = { slotKey: 's', symbol: 'X', assetClass: 'crypto', side: f.side, qty: f.qty, entry: f.price, entryT: f.t, stop: f.stop, stop0: f.stop, target: f.target, riskUsd: 0, intent: f.intent, feeIn: f.fee } as unknown as PositionState; book.pending = null; }
    else if (f.kind === 'cancelled') { book.pending = null; cancels++; }
    else { trips.push({ entryT: book.position!.entryT, entry: book.position!.entry, exitT: f.t, exit: f.price, reason: f.kind }); book.position = null; } };
  for (let i = 0; i < bars.length; i++) {
    if (book.position || book.pending) stepBar(() => book, bars, i, sig, cost, apply);
    const side = sig.le[i] ? 1 : sig.se[i] ? -1 : 0;
    if (side && !book.position && !book.pending && i < bars.length - 1) book.pending = { id: `i${i}`, slotKey: 's', symbol: 'X', assetClass: 'crypto', side, barT: bars[i].t, qty: 1, stop: sig.stop[i], target: Number.isFinite(sig.target[i]) ? sig.target[i] : null } as PendingIntent;
  }
  return { trips, cancels, fills };
}

test('paper broker matches backtest() bar for bar on three fixtures (time exit, stop and target, trailing stop)', () => {
  const bars = plantedBars(1500, { seed: 5, vol: 0.012 });
  const withTrail = STRATEGIES.find(s => s.tf === '1d' && !!s.build(bars).trail), withTarget = STRATEGIES.find(s => s.tf === '1d' && s.build(bars).target.some(Number.isFinite) && !s.build(bars).trail);
  const fixtures: [string, Sig][] = [['marker', markerStrategy()(bars)], ['target', withTarget!.build(bars)]]; if (withTrail) fixtures.push(['trail', withTrail.build(bars)]);
  assert.ok(fixtures.length >= 2);
  for (const [name, sig] of fixtures) {
    const bt = backtest(bars, sig, { fee: COST.fee, slip: COST.slip }).trades.filter(t => t.reason !== 'end'), { trips, cancels } = paperTrades(bars, sig);
    // backtest() invents a stop when the open gaps past it; the paper broker cancels instead. Compare up to the first such case.
    const invented = bt.findIndex(t => { const i = bars.findIndex(b => b.t === t.entryT); const s0 = sig.stop[i - 1]; return !(Math.abs((t.stop0 ?? t.stop) - s0) < 1e-9); });
    const upTo = invented < 0 ? bt.length : invented;
    assert.ok(upTo >= 5, `${name}: needs at least five comparable trades, got ${upTo}`);
    if (invented < 0) assert.equal(cancels, 0, name);
    for (let k = 0; k < upTo; k++) { const a = bt[k], b = trips[k];
      assert.equal(b.entryT, a.entryT, `${name} trade ${k} entry time`); assert.ok(Math.abs(b.entry - a.entry) < 1e-9, `${name} trade ${k} entry price`);
      assert.equal(b.exitT, a.exitT, `${name} trade ${k} exit time`); assert.ok(Math.abs(b.exit - a.exit) < 1e-9, `${name} trade ${k} exit price`); assert.equal(b.reason === 'time' ? 'signal' : b.reason, a.reason, `${name} trade ${k} reason`); }   // backtest() labels a time exit "signal"
  }
});

test('paper broker: a pending entry is filled on the next bar only; a missed bar cancels it; a gap past the stop cancels it', () => {
  const bars = plantedBars(40, { seed: 2 }), sig = markerStrategy()(bars), pend = (i: number, stop: number): PendingIntent => ({ id: 'p', slotKey: 's', symbol: 'X', assetClass: 'crypto', side: 1, barT: bars[i].t, qty: 2, stop, target: null });
  const run = (p: PendingIntent, i: number) => { const book: SlotBook = { position: null, pending: p }; return stepBar(() => book, bars, i, sig, COST, f => { book.pending = null; }); };
  const ok = run(pend(12, bars[12].c * 0.97), 13); assert.equal(ok[0].kind, 'entry'); assert.equal(ok[0].qty, 2); assert.ok(ok[0].price > bars[13].o);
  assert.equal(run(pend(12, bars[12].c * 0.97), 15)[0].kind, 'cancelled');
  const gap = run(pend(12, bars[13].o * 1.01), 13); assert.equal(gap[0].kind, 'cancelled'); assert.match(gap[0].note!, /gapped/);
});

test('forward record: entries before the lock are removed, so a slot is judged only on bars after it (S11)', () => {
  const bars = plantedBars(2200), sig = markerStrategy()(bars), lockedAt = bars[1800].t, f = forwardSig(bars, sig, lockedAt);
  assert.ok(sig.le.slice(0, 1800).some(Boolean)); assert.ok(!f.le.slice(0, 1800).some(Boolean)); assert.deepEqual(f.le.slice(1800), sig.le.slice(1800));
  const rec = strategyRecord(bars, sig, lockedAt, COST, GATE_V1);
  assert.ok(rec.tradeList.every(t => t.entryT >= lockedAt)); assert.ok(rec.trades > 20); assert.ok(rec.months > 12 && rec.months < 14);
});

test('graduation: too early, held up, strict pass, failed; the forward gate deflates by M and reports N beside it (K1)', () => {
  const bars = plantedBars(2600, { drift: 0.008 }), sig = markerStrategy()(bars);
  const early = graduation(strategyRecord(bars.slice(0, 1860), markerStrategy()(bars.slice(0, 1860)), bars[1800].t, COST, GATE_V1), holdDaily(bars.slice(0, 1860), bars[1800].t), 1, 300, GATE_V1);
  assert.equal(early.state, 'too_early'); assert.ok(early.clock.note.length > 0);
  const rec = strategyRecord(bars, sig, bars[1800].t, COST, GATE_V1), hold = holdDaily(bars, bars[1800].t);
  const g1 = graduation(rec, hold, 1, 300, GATE_V1), g50 = graduation(rec, hold, 50, 300, GATE_V1);
  assert.ok(['held_up', 'strict_pass'].includes(g1.state), g1.state); assert.equal(g1.n, 300); assert.equal(g1.m, 1);
  assert.ok(g50.dsrM <= g1.dsrM, 'more slots ever locked makes the forward bar harder'); assert.ok(g1.dsrN <= g1.dsrM, 'N is the harsher readout');
  if (g1.state === 'strict_pass') assert.deepEqual(g1.fails, []);
  // the same rule on bars with no edge after the lock: negative forward record fails once six months are in
  const dead = [...bars.slice(0, 1800), ...plantedBars(800, { drift: -0.004, seed: 8 }).map((b, i) => ({ ...b, t: bars[1800].t + i * 864e5 }))];
  const bad = graduation(strategyRecord(dead, markerStrategy()(dead), dead[1800].t, COST, GATE_V1), holdDaily(dead, dead[1800].t), 1, 300, GATE_V1);
  assert.equal(bad.state, 'failed'); assert.ok(bad.ret < 0);
});

test('drift: CUSUM stays quiet on trades from the baseline and fires on a clear downward shift', () => {
  const r = rng(4), g = () => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());
  const base = Array.from({ length: 300 }, () => 0.3 + 1.1 * g()), bl = baselineOf(base, GATE_V1.drift);
  let alarms = 0;
  for (let run = 0; run < 200; run++) { let s = 0, fired = false; for (let k = 0; k < 30; k++) { s = cusumStep(s, 0.3 + 1.1 * g(), bl, GATE_V1.drift); if (s > GATE_V1.drift.threshold) fired = true; } if (fired) alarms++; }
  assert.ok(alarms / 200 < 0.2, `false alarm rate over 30 trades was ${alarms / 200}`);
  let detected = 0;
  for (let run = 0; run < 200; run++) { let s = 0, fired = false; for (let k = 0; k < 30; k++) { s = cusumStep(s, -1 + 0.6 * g(), bl, GATE_V1.drift); if (s > GATE_V1.drift.threshold) fired = true; } if (fired) detected++; }
  assert.ok(detected / 200 > 0.9, `detection rate was ${detected / 200}`);
  const losers = Array(12).fill(-1), rd = driftReading(losers, 0, bl, GATE_V1.drift); assert.ok(rd.alarms.length >= 1); assert.equal(rd.n, 12);
  assert.ok(Math.abs(binomCdf(0, 10, 0.5) - 1 / 1024) < 1e-12);
});

test('weights: capped at 25%, equal below the cap, and the unallocated part stays in cash', () => {
  const day = (seed: number, n = 200): Daily => { const r = rng(seed); return Array.from({ length: n }, (_, i) => [i, (r() - 0.48) * 0.02] as [number, number]); };
  const one = portfolioWeights([{ slotKey: 'a', daily: day(1) }], { cap: 0.25, minAlignedDays: 30, riskPct: 0.01 });
  assert.equal(one.weights.a, 0.25); assert.equal(one.riskFractions.a, 0.01, 'the largest slot trades at the full risk per trade');
  const six = portfolioWeights([1, 2, 3, 4, 5, 6].map(i => ({ slotKey: `s${i}`, daily: day(i) })), { cap: 0.25, minAlignedDays: 30, riskPct: 0.01 });
  const total = Object.values(six.weights).reduce((a, b) => a + b, 0); assert.ok(total <= 1 + 1e-5); assert.ok(Object.values(six.weights).every(w => w <= 0.25 + 1e-12 && w > 0));
  assert.deepEqual(waterFill([10, 1, 1], 0.25).map(x => +x.toFixed(4)), [0.25, 0.25, 0.25]);
  const short = portfolioWeights([{ slotKey: 'a', daily: day(1, 10) }, { slotKey: 'b', daily: day(2, 10) }], { cap: 0.25, minAlignedDays: 30, riskPct: 0.01 }); assert.match(short.method, /equal/);
});

test('dedupe: a near copy of a primary becomes its shadow; an unrelated stream stays primary; too little overlap never dedupes', () => {
  const r = rng(6), a: Daily = Array.from({ length: 200 }, (_, i) => [i, (r() - 0.5) * 0.02] as [number, number]), copy: Daily = a.map(([d, x]) => [d, x * 1.1 + 0.0001]), other: Daily = Array.from({ length: 200 }, (_, i) => [i, (r() - 0.5) * 0.02] as [number, number]);
  assert.ok(overlapCorr(a, copy, 60)!.corr > 0.99);
  assert.deepEqual({ role: dedupe(copy, [{ slotKey: 'p', daily: a }], 0.8, 60).role, of: dedupe(copy, [{ slotKey: 'p', daily: a }], 0.8, 60).shadowOf }, { role: 'shadow', of: 'p' });
  assert.equal(dedupe(other, [{ slotKey: 'p', daily: a }], 0.8, 60).role, 'primary');
  assert.equal(dedupe(copy.slice(0, 20), [{ slotKey: 'p', daily: a }], 0.8, 60).role, 'primary');
});

test('cost model: rises freely, falls by at most half, never below the prior without acknowledgement, and missing rows throw', () => {
  const row = PRIOR_COSTS.rows.find(x => x.assetClass === 'etf' && x.bucket === 'mega')!, obs = (slip: number, n = 40): CostObs[] => Array.from({ length: n }, () => ({ venue: row.venue, assetClass: 'etf', bucket: 'mega', halfSpreadBps: row.halfSpreadBps, slipBps: slip, feeBps: row.feeBps }));
  const up = updateCostModel(PRIOR_COSTS, obs(row.slipBps * 4)), upRow = up.rows.find(x => x.assetClass === 'etf' && x.bucket === 'mega')!;
  assert.equal(upRow.slipBps, row.slipBps * 4); assert.equal(upRow.source, 'measured'); assert.notEqual(up.version, PRIOR_COSTS.version);
  const down = updateCostModel(up, obs(0)).rows.find(x => x.assetClass === 'etf' && x.bucket === 'mega')!; assert.equal(down.slipBps, row.slipBps * 2, 'falls by half at most');
  const floor = updateCostModel(PRIOR_COSTS, obs(0)).rows.find(x => x.assetClass === 'etf' && x.bucket === 'mega')!; assert.equal(floor.slipBps, row.slipBps, 'never below the prior');
  const ack = updateCostModel(PRIOR_COSTS, obs(0), PRIOR_COSTS, { acknowledgedBelowFloor: true }).rows.find(x => x.assetClass === 'etf' && x.bucket === 'mega')!; assert.equal(ack.slipBps, row.slipBps / 2);
  assert.equal(updateCostModel(PRIOR_COSTS, obs(99, 5)).version, PRIOR_COSTS.version, 'too few observations change nothing');
  assert.throws(() => costFor(makeCostModel([]), { assetClass: 'etf', costBucket: 'mega' }), /no row/);
  const c = costFor(PRIOR_COSTS, { assetClass: 'etf', costBucket: 'mega' }); assert.ok(c.fee >= 0 && c.slip > 0);
});

test('validator agreement: identical results are exact; small differences agree; a flipped check or a big move does not', () => {
  const bars = plantedBars(), res = evaluate(bars, markerStrategy(), COST, GATE_V1), d = digestOf(res);
  const same = agreement(d, d, GATE_V1.validator, { orig: 'h', re: 'h' }); assert.deepEqual([same.agrees, same.exact], [true, true]);
  const near = agreement(d, { ...d, metrics: { ...d.metrics, ret: d.metrics.ret + 0.005 } }, GATE_V1.validator, { orig: 'h', re: 'h2' }); assert.deepEqual([near.agrees, near.exact], [true, false]);
  const far = agreement(d, { ...d, metrics: { ...d.metrics, ret: d.metrics.ret + 0.05 } }, GATE_V1.validator, { orig: 'h', re: 'h2' }); assert.equal(far.agrees, false); assert.ok(far.diffs.length);
  const flip = agreement(d, { ...d, checks: d.checks.map((c: any, i: number) => (i === 2 ? { ...c, pass: !c.pass } : c)) }, GATE_V1.validator, { orig: 'h', re: 'h2' }); assert.equal(flip.agrees, false);
});
