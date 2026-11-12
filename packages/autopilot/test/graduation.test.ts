// From lock to live_eligible, night by night, the way the nightly job drives it: the validator first, then the run.
// Synthetic bars and a synthetic strategy, so the forward record is known in advance. Nothing here can open a live lock:
// live_eligible still needs the review, Jeremy's approval and his own machine (locks 2 to 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Bar } from '@apex/engine/core';
import { verifyChain, type LedgerEntry } from '@apex/kernel';
import { lockFactsOf } from '@apex/kernel/locks';
import { buildView } from '@apex/kernel/view';
import { slotDetail } from '@apex/api/queries';
import { plantedBars, markerStrategy } from '../../kernel/test/helpers';
import { Sim, dataset, healthy, strat } from './helpers';

const DAY = 864e5, KEY = 'fast@csv:TEST:1d:raw';
// A marker bar every 5 bars, then 2 bars of upward drift. The strategy buys the marker and holds 2 bars, about 6 trades a
// month, so 50 forward trades take about 8 months. Seed 4 passes the in-sample gate and stays clear of drift alarms.
const FAST = strat('fast', markerStrategy(2));
const BARS = plantedBars(2100, { every: 5, len: 2, drift: 0.008, seed: 4 }), PAST = BARS.slice(0, 1800), LAST = PAST[PAST.length - 1];
/** The in-sample bars followed by a different forward regime, continuous in time and price. */
const forward = (drift: number, seed: number): Bar[] => [...PAST, ...plantedBars(300, { every: 5, len: 2, drift, seed }).map((b, i) => {
  const k = LAST.c / 100; return { ...b, t: LAST.t + (i + 1) * DAY, o: b.o * k, h: b.h * k, l: b.l * k, c: b.c * k }; })];
const withData = (bars: Bar[]) => { const d = dataset(bars); return { datasets: [d], health: [healthy(d)] }; };
const at = (month: number, day: number) => Date.UTC(2021, month, day, 22, 30);

/** One night of .github/workflows/nightly.yml: `apex validate`, then `apex run`. */
async function night(sim: Sim, bars: Bar[], now: number) {
  sim.now = now; const from = (await sim.store.read()).length;
  const v = await sim.run({ ...withData(bars), mode: 'validator', validator: { level: 'L1', source: 'same' } }), mid = (await sim.store.read()).length;
  const r = await sim.run({ ...withData(bars) }), all = await sim.store.read();
  return { v, r, vEntries: all.slice(from, mid), rEntries: all.slice(mid) };
}
// The registry holds one strategy and the panel one dataset, so every entry of a kind is this pair's (or the slot's).
const mine = (es: LedgerEntry[], kind: string) => es.filter(e => e.kind === kind && (e.payload.slotKey ?? KEY) === KEY);
const locksOf = async (sim: Sim, now: number) => { const es = await sim.store.read(), d = slotDetail(buildView(es, 10000), es, KEY, now); assert.ok(d); return Object.fromEntries(d.locks.map(l => [l.id, l.open])); };

/** Nights 1 and 2: found and pre-registered, then validated by a separate run and locked into paper (K2). */
async function foundAndLocked(sim: Sim) {
  const n1 = await night(sim, PAST, at(0, 4));
  assert.deepEqual(n1.vEntries.filter(e => e.kind === 'validator_run'), [], 'night 1: nothing to validate yet');
  const pre = mine(n1.rEntries, 'prereg'), res = mine(n1.rEntries, 'trial_result');
  assert.equal(pre.length, 1); assert.equal(res.length, 1); assert.ok(pre[0].seq < res[0].seq, 'pre-registration comes first (S9)');
  assert.equal(res[0].payload.status, 'passed_pending_validation');
  assert.ok(!n1.rEntries.some(e => ['slot_locked', 'validator_run', 'intent'].includes(e.kind)), 'the run that found it does not promote it (K2)');

  const n2 = await night(sim, PAST, at(0, 5));
  const vr = mine(n2.vEntries, 'validator_run'); assert.equal(vr.length, 1);
  assert.deepEqual([vr[0].payload.purpose, vr[0].payload.agrees, vr[0].payload.exact, vr[0].payload.trialKey], ['promotion', true, true, pre[0].payload.trialKey]);
  assert.ok(n2.vEntries.every(e => e.actor === 'validator'));
  const lock = mine(n2.rEntries, 'slot_locked'); assert.equal(lock.length, 1);
  assert.ok(vr[0].seq < lock[0].seq); assert.equal(lock[0].payload.validatorSeq, vr[0].seq, 'the lock names the validator run it rests on');
  assert.deepEqual([lock[0].payload.mode, lock[0].payload.role, lock[0].payload.lockedAt], ['paper', 'primary', LAST.t + DAY]);
  assert.ok(!mine(n2.rEntries, 'prereg').length && !mine(n2.rEntries, 'trial_result').length, 'locking does not re-register or re-judge the pair');
  return { lockSeq: lock[0].seq };
}

test('graduation, night by night: strict pass on the monthly check, then an agreeing graduation re-run, then live_eligible, and locks 2 to 4 stay shut', async () => {
  const sim = new Sim({ registry: [FAST] }), { lockSeq } = await foundAndLocked(sim);

  // Monthly nights with a month of new bars each. The check runs once a month, never before a month of forward bars.
  let pass: LedgerEntry | null = null, month = 0, bars = PAST;
  for (month = 1; month <= 10 && !pass; month++) {
    bars = BARS.slice(0, 1800 + 30 * month); const n = await night(sim, bars, at(month, 4));
    const monthly = mine(n.vEntries, 'validator_run'); assert.equal(monthly.length, 1, `month ${month}: one re-run`);
    assert.deepEqual([monthly[0].payload.purpose, monthly[0].payload.agrees], ['monthly', true], `month ${month}`);
    const checks = mine(n.rEntries, 'graduation_check'); assert.ok(checks.length <= 1);
    if (month === 1) assert.equal(checks.length, 0, 'less than a month of forward bars: no check yet');
    for (const c of checks) {
      assert.ok(['too_early', 'held_up', 'strict_pass'].includes(c.payload.state), `month ${month}: ${c.payload.state}`);
      if (c.payload.months < 6) assert.equal(c.payload.state, 'too_early', 'nothing passes before six forward months');
      if (c.payload.state === 'strict_pass') pass = c;
    }
    assert.ok(!mine(n.rEntries, 'slot_status').length, `month ${month}: the slot stays in paper`);
    assert.ok(mine(n.rEntries, 'intent').every(e => e.payload.mode === 'paper'));
  }
  assert.ok(pass, 'a strict pass within ten months'); month--;
  assert.ok(pass.payload.months >= 7 && pass.payload.trades >= 50 && pass.payload.ret > 0 && pass.payload.dsrM >= 0.95, JSON.stringify(pass.payload));
  assert.deepEqual(pass.payload.fails, []); assert.equal(pass.payload.m, 1);
  assert.ok(pass.seq > lockSeq);
  // The strict pass alone opens nothing: the slot is still paper, so lock 1 is shut.
  assert.deepEqual(await locksOf(sim, at(month, 4)), { evidence: false, validated: false, approved: false, machine: false });

  // The next night, same month: the validator re-runs the slot for graduation, then the run moves it to live_eligible.
  const n = await night(sim, bars, at(month, 5));
  const grad = mine(n.vEntries, 'validator_run'); assert.equal(grad.length, 1);
  assert.deepEqual([grad[0].payload.purpose, grad[0].payload.agrees, grad[0].payload.exact, grad[0].payload.slotKey], ['graduation', true, true, KEY]);
  assert.ok(grad[0].seq > pass.seq, 'the graduation re-run comes after the check it answers');
  const moves = mine(n.rEntries, 'slot_status'); assert.equal(moves.length, 1);
  assert.deepEqual([moves[0].payload.from, moves[0].payload.to], ['paper', 'live_eligible']); assert.ok(moves[0].seq > grad[0].seq);
  assert.match(moves[0].payload.reason, /Live still needs locks 2, 3 and 4/);
  assert.ok(!mine(n.rEntries, 'graduation_check').length, 'no second check in the same month');

  const es = await sim.store.read(), f = lockFactsOf(buildView(es, 10000), es, KEY);
  assert.deepEqual([f.slotStatus, f.graduationPassedSeq, f.validatorAgreeSeq, f.reviewClean, f.approval, f.machine], ['live_eligible', pass.seq, grad[0].seq, false, null, null]);
  const d = slotDetail(buildView(es, 10000), es, KEY, at(month, 6))!;
  assert.deepEqual(d.locks.map(l => [l.id, l.open]), [['evidence', true], ['validated', false], ['approved', false], ['machine', false]]);
  assert.match(d.locks[1].why, /clean review/, 'lock 2 waits for the promotion review');
  assert.deepEqual([d.slot.status, d.clock.state, d.events[0].to], ['live_eligible', 'strict_pass', 'live_eligible']);

  // Nothing went anywhere but paper, and nothing touched the live book.
  assert.ok(!es.some(e => ['live_approval', 'live_fill', 'promotion_review'].includes(e.kind)));
  assert.ok(es.filter(e => e.kind === 'intent' || e.kind === 'fill').every(e => e.payload.mode === 'paper'));
  assert.equal(verifyChain(es).ok, true);

  // Another night in the same month changes nothing about the status: live_eligible is written once.
  const again = await night(sim, bars, at(month, 6));
  assert.ok(!mine(again.rEntries, 'slot_status').length && !mine(again.vEntries, 'validator_run').length);
});

test('negative twin: a weak forward record holds up for a while, then a check with a non-positive return retires the slot; it is never live_eligible', async () => {
  // The same lock, then a forward regime with a tenth of the drift: the record is positive for a while, then turns.
  const sim = new Sim({ registry: [FAST] }); await foundAndLocked(sim);
  const bars = forward(0.002, 8), states: string[] = []; let retired: LedgerEntry | null = null, failed: LedgerEntry | null = null, retiredIn = 0;
  for (let month = 1; month <= 12; month++) {
    const n = await night(sim, bars.slice(0, 1800 + 30 * month), at(month, 4));
    assert.ok(!n.vEntries.some(e => e.kind === 'validator_run' && e.payload.purpose === 'graduation'), 'no graduation re-run without a strict pass');
    for (const c of mine(n.rEntries, 'graduation_check')) { states.push(c.payload.state); if (c.payload.state === 'failed') failed = c; }
    for (const s of mine(n.rEntries, 'slot_status')) {
      assert.notEqual(s.payload.to, 'live_eligible');
      if (s.payload.to === 'retired') { assert.ok(!retired, 'retired once'); retired = s; retiredIn = month; }
    }
    if (retired && month > retiredIn) {
      // A retired slot is final: no more checks, re-runs, orders or moves.
      assert.deepEqual([...mine(n.vEntries, 'validator_run'), ...mine(n.rEntries, 'graduation_check'), ...mine(n.rEntries, 'intent'), ...mine(n.rEntries, 'slot_status')], [], `month ${month}`);
    }
  }
  assert.ok(!states.includes('strict_pass'), states.join(','));
  assert.ok(states.includes('held_up'), `it held up before it failed: ${states.join(',')}`);
  assert.deepEqual(states.slice(states.indexOf('held_up')).filter(s => s !== 'held_up'), ['failed'], 'held up, then one failed check, then nothing');
  assert.ok(failed && retired, 'the failed check retires the slot');
  assert.ok(failed.payload.ret <= 0, `retired on a non-positive return: ${failed.payload.ret}`); assert.ok(failed.payload.months >= 6);
  assert.equal(retired.seq, failed.seq + 1, 'the retirement is written straight after the check that failed');
  assert.match(retired.payload.reason, /forward record failed/);

  const es = await sim.store.read(), d = slotDetail(buildView(es, 10000), es, KEY, at(12, 5))!;
  assert.equal(d.slot.status, 'retired'); assert.ok(d.locks.every(l => !l.open), 'every lock is shut on a retired slot');
  assert.ok(!es.some(e => e.kind === 'slot_status' && e.payload.to === 'live_eligible')); assert.equal(verifyChain(es).ok, true);
});

test('a strict pass on a paused slot is not enough: the graduation re-run may agree, but only a paper slot becomes live_eligible', async () => {
  // A forward regime weak enough that the drift alarm pauses the slot early, yet strong enough for the strategy record to pass later.
  const sim = new Sim({ registry: [FAST] }); await foundAndLocked(sim);
  const bars = forward(0.003, 12); let pass: LedgerEntry | null = null, month = 0;
  for (month = 1; month <= 12 && !pass; month++) { const n = await night(sim, bars.slice(0, 1800 + 30 * month), at(month, 4)); pass = mine(n.rEntries, 'graduation_check').find(c => c.payload.state === 'strict_pass') ?? null; }
  assert.ok(pass, 'the strategy record passes'); month--;
  let es = await sim.store.read(); assert.equal(buildView(es, 10000).slots.get(KEY)!.status, 'paused_drift');
  const n = await night(sim, bars.slice(0, 1800 + 30 * month), at(month, 5));
  assert.deepEqual(mine(n.vEntries, 'validator_run').map(e => [e.payload.purpose, e.payload.agrees]), [['graduation', true]]);
  assert.ok(!mine(n.rEntries, 'slot_status').length, 'a paused slot does not move to live_eligible');
  es = await sim.store.read(); const d = slotDetail(buildView(es, 10000), es, KEY, at(month, 6))!;
  assert.equal(d.slot.status, 'paused_drift'); assert.ok(d.locks.every(l => !l.open));
});
