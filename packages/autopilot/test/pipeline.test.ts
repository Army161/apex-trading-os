import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyChain, buildView, DEFAULT_LIMITS, GATE_V1, gateVersion, passBar } from '@apex/kernel';
import { runAutopilot, renderReport, renderShort, FIRST_LINE, NOTHING_PASSED, type ReportData } from '../src/index';
import { plantedBars, coinFlip } from '../../kernel/test/helpers';
import { Sim, dataset, healthy, spec, strat, MARKER, FLIP } from './helpers';
import { rerunSince, slotMove } from '@apex/kernel/slots';

const ALL = plantedBars(2200), PAST = ALL.slice(0, 1800);
const withData = (bars = PAST, over = {}) => { const d = dataset(bars); return { datasets: [d], health: [healthy(d, over)] }; };

/** Find, validate and lock the marker strategy: three separate runs, as in production. */
async function lockMarker(sim: Sim) {
  const found = await sim.run({ ...withData(), mode: 'full' });
  const validated = await sim.run({ ...withData(), mode: 'validator', validator: { level: 'L1', source: 'same' } });
  const locked = await sim.run({ ...withData() });
  return { found, validated, locked };
}

test('life of a strategy: found, then validated by a separate run, then locked, then traded on paper only after the lock', async () => {
  const sim = new Sim({ registry: [MARKER, FLIP] }), { found, validated, locked } = await lockMarker(sim);

  // run 1 finds it and does not promote it (K2)
  const k1 = found.appends.map(a => a.kind);
  assert.ok(k1.indexOf('prereg') >= 0 && k1.indexOf('prereg') < k1.indexOf('trial_result'), 'pre-registration comes first (S9)');
  assert.ok(!k1.includes('slot_locked') && !k1.includes('intent') && !k1.includes('validator_run'));
  assert.equal(found.report.funnel.byStatus.passed_pending_validation, 1); assert.equal(found.report.funnel.n, 2);
  assert.ok(found.report.status.waiting.some(w => /waits for the independent validator/.test(w)));
  assert.ok(renderReport(found.report).includes(NOTHING_PASSED));

  // run 2 is the validator: one validator_run, nothing else that matters
  const k2 = validated.appends.map(a => a.kind); assert.deepEqual(k2.filter(k => !['config_snapshot', 'run'].includes(k)), ['validator_run']);
  const vr: any = validated.appends.find(a => a.kind === 'validator_run')!.payload; assert.equal(vr.agrees, true); assert.equal(vr.exact, true); assert.equal(vr.level, 'L1');
  assert.ok(validated.appends.every(a => a.actor === 'validator'));

  // run 3 locks it into paper with a weight
  const lock: any = locked.appends.find(a => a.kind === 'slot_locked')!.payload; assert.equal(lock.slotKey, 'marker@csv:TEST:1d:raw'); assert.equal(lock.role, 'primary'); assert.equal(lock.mode, 'paper');
  assert.equal(lock.lockedAt, PAST[PAST.length - 1].t + 864e5, 'lock is the bar after the last in-sample bar');
  const w: any = locked.appends.find(a => a.kind === 'weights')!.payload; assert.equal(w.weights[lock.slotKey], 0.25);
  assert.equal(locked.report.funnel.m, 1); assert.ok(!locked.appends.some(a => a.kind === 'intent'));

  // new bars arrive: intents go through the guard, fills come from the bar simulator, and nothing trades before the lock
  const fwd = await sim.run({ ...withData(ALL) });
  const intents: any[] = await sim.of('intent'), fills: any[] = await sim.of('fill'), blocks: any[] = await sim.of('intent_blocked');
  assert.ok(intents.length >= 20, `intents ${intents.length}`); assert.ok(fills.filter(f => f.kind === 'entry').length >= 20);
  assert.ok(intents.every(i => i.barT >= lock.lockedAt && i.mode === 'paper' && i.rules.includes('notional') && i.qty > 0 && i.riskUsd > 0));
  assert.ok(intents.every(i => i.riskUsd <= 10000 * 1.5 * DEFAULT_LIMITS.riskPct), 'no intent risks more than the risk per trade');
  assert.ok(fills.every(f => f.t > lock.lockedAt && f.mode === 'paper'));
  assert.equal(fwd.report.slots[0].bookTrades, fills.filter(f => !['entry', 'cancelled'].includes(f.kind)).length);
  assert.ok(fwd.report.slots[0].trades >= 20 && fwd.report.slots[0].months > 12);
  assert.ok(fwd.appends.some(a => a.kind === 'drift_reading')); assert.ok(fwd.appends.some(a => a.kind === 'graduation_check'));
  assert.equal(blocks.length + intents.length, fwd.report.intents.length + fwd.report.blocks.length);
  assert.notEqual(fwd.report.slots[0].status, 'live_eligible', 'paper never becomes live eligible without a fresh graduation validator run');

  // the same bars again: no new orders, no new trials, the ledger still verifies
  const again = await sim.run({ ...withData(ALL) });
  assert.ok(!again.appends.some(a => ['intent', 'fill', 'prereg', 'slot_locked'].includes(a.kind)));
  const entries = await sim.store.read(); assert.equal(verifyChain(entries).ok, true);
  assert.equal(buildView(entries, 10000).closed.length, fwd.report.book.closedTrades);
});

test('replay: the same input gives byte-identical appends and report (the validator and golden tests rest on this)', async () => {
  const sim = new Sim({ registry: [MARKER, FLIP] }); await lockMarker(sim);
  const inp = await sim.input({ ...withData(ALL) }), a = runAutopilot(inp), b = runAutopilot(inp);
  assert.deepEqual(a.appends, b.appends); assert.equal(a.report.ledger.digest, b.report.ledger.digest); assert.equal(renderReport(a.report), renderReport(b.report));
  assert.equal(JSON.stringify(inp.entries), JSON.stringify(await sim.store.read()), 'the run does not touch its input');
});

test('halts: kill, andon or an unreadable halt state give zero intents; every signal is recorded as blocked', async () => {
  for (const halts of [{ readable: true, kill: true, andon: false }, { readable: true, kill: false, andon: true }, { readable: false, kill: false, andon: false }]) {
    const sim = new Sim(); await lockMarker(sim);
    const out = await sim.run({ ...withData(ALL), halts });
    assert.equal(out.appends.filter(a => a.kind === 'intent').length, 0); assert.equal(out.appends.filter(a => a.kind === 'fill').length, 0);
    assert.ok(out.appends.filter(a => a.kind === 'intent_blocked').length >= 20); assert.ok(out.report.status.halts.length >= 1);
    assert.ok(renderShort(out.report).includes('Halts: ') && !renderShort(out.report).includes('Halts: none'));
  }
});

test('no durable ledger: nothing is locked into paper and the report says why', async () => {
  const sim = new Sim({}, false); const { locked } = await lockMarker(sim);
  assert.ok(!locked.appends.some(a => a.kind === 'slot_locked')); assert.ok(locked.report.status.problems.some(p => /no durable ledger/.test(p)));
  assert.ok(renderReport(locked.report).includes('There is no durable ledger'));
});

test('data firewall: blocked data is skipped and never becomes a trial; data that is not tradable is evaluated but cannot open orders', async () => {
  const sim = new Sim(), blocked = await sim.run({ ...withData(PAST, { status: 'blocked', tradable: false, checks: [{ id: 'order', status: 'blocked', detail: '3 bars out of order' }] }), mode: 'full' });
  assert.ok(blocked.appends.some(a => a.kind === 'skipped_data')); assert.ok(!blocked.appends.some(a => a.kind === 'prereg' || a.kind === 'trial_result'));
  assert.equal(blocked.report.funnel.n, 0); assert.equal(blocked.report.funnel.skipped, 1);
  const sim2 = new Sim(); await lockMarker(sim2);
  const stale = await sim2.run({ ...withData(ALL, { status: 'warn', tradable: false, checks: [{ id: 'stale', status: 'blocked', detail: 'last closed bar is old' }] }) });
  assert.equal(stale.appends.filter(a => a.kind === 'intent').length, 0);
  assert.ok(stale.appends.filter(a => a.kind === 'intent_blocked').every((a: any) => a.payload.rules.some((r: any) => r.id === 'data-blocked')));
});

test('trial budget: at most trialsPerWeek new trials start per week; a plan-approved seed batch is exempt and says so', async () => {
  const registry = Array.from({ length: 8 }, (_, i) => strat(`flip${i}`, coinFlip(100 + i)));
  const sim = new Sim({ registry, trialsPerWeek: 5 }), a = await sim.run({ ...withData(), budget: 100 });
  assert.equal(a.appends.filter(x => x.kind === 'prereg').length, 5); assert.equal(a.report.funnel.waitingBudget, 3); assert.ok(a.queue.some(q => q.kind === 'gap'));
  const b = await sim.run({ ...withData(), budget: 100 }); assert.equal(b.appends.filter(x => x.kind === 'prereg').length, 0, 'same week: still waiting');
  sim.now += 8 * 864e5; const c = await sim.run({ ...withData(), budget: 100 }); assert.equal(c.appends.filter(x => x.kind === 'prereg').length, 3);
  const seeded = new Sim({ registry, trialsPerWeek: 5, seedSource: 'plan:P1.13' }), s = await seeded.run({ ...withData(), mode: 'full' });
  assert.equal(s.appends.filter(x => x.kind === 'prereg').length, 8); assert.ok(s.appends.filter(x => x.kind === 'prereg').every((x: any) => x.payload.source === 'plan:P1.13'));
  const tick = new Sim({ registry, trialsPerWeek: 50 }), t = await tick.run({ ...withData(), budget: 3 }); assert.equal(t.report.funnel.evaluated, 3, 'a tick evaluates at most its budget');
});

test('a strategy that throws is still a recorded trial; a changed strategy is a new trial; unchanged inputs are never re-run', async () => {
  const boom = strat('boom', () => { throw new Error('bad rule'); }), sim = new Sim({ registry: [boom, FLIP] }), a = await sim.run({ ...withData(), mode: 'full' });
  const res: any[] = a.appends.filter(x => x.kind === 'trial_result').map(x => x.payload); assert.equal(res.length, 2);
  assert.equal(res.find(r => r.strategy === 'boom').status, 'rejected'); assert.match(res.find(r => r.strategy === 'boom').error, /bad rule/); assert.equal(a.report.funnel.errors, 1);
  const b = await sim.run({ ...withData(), mode: 'full' }); assert.equal(b.report.funnel.evaluated, 0);
  const c = await sim.run({ ...withData(), mode: 'full', registry: [boom, strat('flip', coinFlip(92), 'fp-flip-v2')] });
  assert.equal(c.appends.filter(x => x.kind === 'prereg').length, 1); assert.equal(c.report.funnel.n, 3, 'the changed strategy counts as a third trial');
  const d = await sim.run({ ...withData(ALL), mode: 'full', registry: [boom, FLIP] });
  assert.equal(d.appends.filter(x => x.kind === 'prereg').length, 0, 'new bars for a known pair are the same trial'); assert.equal(d.report.funnel.evaluated, 2); assert.equal(d.report.funnel.n, 3);
});

test('a locked strategy is frozen: if its code changes the slot is paused and not traded', async () => {
  const sim = new Sim(); await lockMarker(sim);
  const out = await sim.run({ ...withData(ALL), registry: [{ ...MARKER, fingerprint: 'fp-marker-edited' }] });
  const st: any = out.appends.find(a => a.kind === 'slot_status')!.payload; assert.equal(st.to, 'paused_data'); assert.match(st.reason, /new id/);
  assert.equal(out.appends.filter(a => a.kind === 'intent' || a.kind === 'fill').length, 0);
});

test('automatic pauses act on live_eligible and the live stages too, record where they came from, and never touch a retired slot', async () => {
  const KEY = 'marker@csv:TEST:1d:raw', edited = [{ ...MARKER, fingerprint: 'fp-marker-edited' }];
  // Bars after the lock where the marker's edge is gone: the drift alarm fires within a few trades, well before six months.
  const dead = [...PAST, ...plantedBars(60, { drift: -0.004, seed: 8 }).map((b, i) => ({ ...b, t: PAST[PAST.length - 1].t + (i + 1) * 864e5 }))];
  const at = async (status: string) => { const sim = new Sim(); await lockMarker(sim); if (status !== 'paper') await sim.ledger.append('slot_status', 'test', { slotKey: KEY, from: 'paper', to: status, reason: 'test' }); return sim; };
  const statuses = async (sim: Sim, from: number) => (await sim.store.read()).slice(from).filter(e => e.kind === 'slot_status').map(e => e.payload as any);

  // Drift on a live_eligible slot pauses it, and the entry says it was live_eligible.
  let sim = await at('live_eligible'), n = (await sim.store.read()).length, out = await sim.run({ ...withData(dead) });
  const drift = (await statuses(sim, n))[0]; assert.deepEqual([drift.from, drift.to], ['live_eligible', 'paused_drift']); assert.match(drift.reason, /drift alarm/);
  assert.equal(buildView(await sim.store.read(), 10000).slots.get(KEY)!.driftPauses, 1);
  const paused = out.appends.findIndex(a => a.kind === 'slot_status'); assert.ok(paused > 0);
  assert.ok(!out.appends.slice(paused).some(a => a.kind === 'intent'), 'no new order after the pause'); assert.ok(out.appends.slice(paused).some(a => a.kind === 'intent_blocked'));

  // A changed strategy pauses a live_eligible slot and a slot at any live stage, from that stage.
  for (const status of ['live_eligible', 'micro_live', 'live_10', 'live_50', 'live_100']) {
    sim = await at(status); n = (await sim.store.read()).length; out = await sim.run({ ...withData(ALL), registry: edited });
    const st = await statuses(sim, n); assert.equal(st.length, 1, status); assert.deepEqual([st[0].from, st[0].to], [status, 'paused_data']); assert.match(st[0].reason, /new id/);
    assert.equal(out.appends.filter(a => a.kind === 'intent' || a.kind === 'fill').length, 0, status);
    // Already paused: the next run does not pause it again.
    n = (await sim.store.read()).length; await sim.run({ ...withData(ALL), registry: edited }); assert.deepEqual(await statuses(sim, n), [], `${status} is paused once`);
  }

  // A failed re-validation pauses a live stage too. Bars that are not the ones it was locked on make the re-run disagree.
  sim = await at('micro_live'); n = (await sim.store.read()).length;
  const other = plantedBars(1800, { drift: 0, seed: 41 }).map((b, i) => ({ ...b, t: PAST[i].t }));
  await sim.run({ ...withData(other), mode: 'validator', validator: { level: 'L2', source: 'second' } });
  const rv = await statuses(sim, n); assert.equal(rv.length, 1); assert.deepEqual([rv[0].from, rv[0].to], ['micro_live', 'paused_data']); assert.match(rv[0].reason, /re-validation/);

  // A retired slot is final: no drift pause, no fingerprint pause, no validator re-run, no order.
  sim = await at('retired'); n = (await sim.store.read()).length;
  for (const o of [{ ...withData(dead) }, { ...withData(ALL), registry: edited }, { ...withData(other), mode: 'validator' as const, validator: { level: 'L2' as const, source: 'second' } }]) await sim.run(o);
  const after = (await sim.store.read()).slice(n);
  assert.deepEqual(after.filter(e => e.kind === 'slot_status' || e.kind === 'intent' || (e.kind === 'validator_run' && e.payload.slotKey === KEY)), []);
});

test('a paused slot gets one validator re-run after its pause, and only an agreeing one lets Jeremy bring it back to paper', async () => {
  const KEY = 'marker@csv:TEST:1d:raw', sim = new Sim(); await lockMarker(sim);
  await sim.run({ ...withData(), mode: 'validator', validator: { level: 'L1', source: 'same' } });                // this month's re-run, before any pause
  const fresh = () => ({ status: buildView(entries, 10000).slots.get(KEY)!.status, fingerprintMatches: true, datasetReadable: true, rerun: rerunSince(entries, KEY).verdict });
  let entries = await sim.store.read(); assert.equal(rerunSince(entries, KEY).verdict, 'agrees');
  await sim.run({ ...withData(ALL), registry: [{ ...MARKER, fingerprint: 'fp-marker-edited' }] });
  entries = await sim.store.read(); assert.equal(rerunSince(entries, KEY).verdict, 'none', 'a run from before the pause does not count');
  assert.match((slotMove(fresh(), 'paper') as { why: string }).why, /has not re-run it since the pause/);
  const v = await sim.run({ ...withData(), mode: 'validator', validator: { level: 'L1', source: 'same' } });
  assert.deepEqual(v.appends.filter(a => a.kind === 'validator_run').map(a => (a.payload as any).purpose), ['pause']);
  const again = await sim.run({ ...withData(), mode: 'validator', validator: { level: 'L1', source: 'same' } });
  assert.equal(again.appends.filter(a => a.kind === 'validator_run').length, 0, 'once per pause');
  entries = await sim.store.read(); const r = rerunSince(entries, KEY); assert.equal(r.verdict, 'agrees'); assert.ok(r.seq! > 0);
  assert.deepEqual(slotMove(fresh(), 'paper'), { ok: true, from: 'paused_data', to: 'paper' });
  assert.equal(slotMove({ ...fresh(), fingerprintMatches: false }, 'paper').ok, false, 'the strategy that paused it still differs');
});

test('validator mode never opens an order or locks a slot, and promotion needs level L2 once a second source exists', async () => {
  const sim = new Sim(); await sim.run({ ...withData(), mode: 'full' });
  const v = await sim.run({ ...withData(ALL), mode: 'validator', validator: { level: 'L1', source: 'same' } });
  assert.ok(!v.appends.some(a => ['intent', 'fill', 'slot_locked', 'prereg', 'trial_result', 'weights'].includes(a.kind)));
  const t = await sim.run({ ...withData(), secondSourceExists: true });
  assert.ok(!t.appends.some(a => a.kind === 'slot_locked'), 'L1 is not enough when a second source exists');
  await sim.run({ ...withData(), mode: 'validator', validator: { level: 'L2', source: 'second' } });
  const t2 = await sim.run({ ...withData(), secondSourceExists: true }); assert.ok(t2.appends.some(a => a.kind === 'slot_locked'));
});

test('a looser limit is recorded as pending and is not used for 24 hours', async () => {
  const sim = new Sim(); await sim.run({ ...withData() });
  const loose = { ...DEFAULT_LIMITS, riskPct: 0.02 }, a = await sim.run({ ...withData(), requestedLimits: loose });
  assert.ok(a.appends.some(x => x.kind === 'limit_change_pending')); assert.equal((a.appends.find(x => x.kind === 'config_snapshot')!.payload as any).limits.riskPct, 0.01);
  sim.now += 25 * 3600e3; const b = await sim.run({ ...withData(), requestedLimits: loose });
  assert.equal((b.appends.find(x => x.kind === 'config_snapshot')!.payload as any).limits.riskPct, 0.02);
});

test('report: fixed template. First line is the paper notice, ten sections, and every return carries its sample size', async () => {
  const sim = new Sim({ registry: [MARKER, FLIP] }); await lockMarker(sim);
  const out = await sim.run({ ...withData(ALL), runId: 'golden', commit: 'abcdef1234567890' }), md = renderReport(out.report, { seq: 123, hash: 'deadbeef' }), lines = md.split('\n');
  assert.equal(lines[2], FIRST_LINE); assert.equal(renderShort(out.report).split('\n')[0], FIRST_LINE);
  assert.deepEqual(lines.filter(l => l.startsWith('## ')).map(l => l.slice(3)), ['1. Status', '2. Funnel', '3. Paper book', '4. Slots', '5. New intents and blocks', '6. Closest near misses', '7. Research queue', '8. Where the data came from', '9. Costs', '10. Ledger']);
  assert.match(md, /forward, paper, \d+ closed trades, costs assumed/); assert.match(md, /\(n=\d+, forward\)/); assert.ok(md.includes('In-sample results on past data'));
  assert.ok(!/guaranteed (return|profit)|will make|risk[- ]free/i.test(md.replace(FIRST_LINE, '')));
  const golden = join(__dirname, 'golden-report.md'); if (!existsSync(golden) || process.env.UPDATE_GOLDEN) writeFileSync(golden, md);
  assert.equal(md, readFileSync(golden, 'utf8'), 'report changed: review the diff, then run with UPDATE_GOLDEN=1');
  const empty: ReportData = (await new Sim().run({ ...withData(), mode: 'full', registry: [FLIP] })).report;
  assert.ok(renderReport(empty).includes(NOTHING_PASSED)); assert.ok(renderShort(empty).includes(NOTHING_PASSED));
});

test('research queue: a queue test pairs only with its panel and timeframe, is pre-registered as queue:<id>, and waits for the weekly budget even in a seeded run', async () => {
  const bars = PAST, q = (id: string, tf = '1d') => { const s = strat(id, coinFlip(7)); return { ...s, def: { ...s.def, tf, queue: { id: 'P3-9', panels: ['queue-test'] } } }; };
  const board = dataset(bars, spec('BOARD', { panels: ['stress-board'] })), qd = dataset(bars, spec('QD', { panels: ['queue-test'] })), both = dataset(bars, spec('BOTH', { panels: ['stress-board', 'queue-test'] }));
  const qh = dataset(bars, spec('QH', { panels: ['queue-test'], tf: '1h', id: 'csv:QH:1h:raw' })), ds = [board, qd, both, qh];
  const registry = [FLIP, q('qa'), q('qb'), q('qc', '1h')];
  const sim = new Sim({ registry, trialsPerWeek: 3, seedSource: 'plan:P1.13' }), a = await sim.run({ datasets: ds, health: ds.map(d => healthy(d)), mode: 'full' });
  const pre = await sim.of('prereg') as any[], pairOf = (p: any) => `${p.strategy.id}@${p.panel.split(':')[1]}`;
  assert.deepEqual(pre.filter(p => p.source === 'plan:P1.13').map(pairOf).sort(), ['flip@BOARD', 'flip@BOTH'], 'a plain strategy never pairs with a queue-only panel');
  assert.deepEqual(pre.filter(p => p.source === 'queue:P3-9').map(pairOf), ['qa@QD', 'qa@BOTH', 'qb@QD'], 'queue pairs in registry order, stopped by the weekly budget of 3');
  assert.equal(a.report.funnel.waitingBudget, 2, 'qb@BOTH and qc@QH wait; nothing pairs qa or qb with the 1h set, or qc with a daily one');
  sim.now += 8 * 24 * 3600e3; const b = await sim.run({ datasets: ds, health: ds.map(d => healthy(d)), mode: 'full' });
  assert.deepEqual((await sim.of('prereg') as any[]).slice(pre.length).map(pairOf), ['qb@BOTH', 'qc@QH']); assert.equal(b.report.funnel.waitingBudget, 0);
});

test('weekly budget: tries spent by a claim check leave fewer for the factory in the same week', async () => {
  const d = dataset(PAST, spec('BOARD', { panels: ['stress-board'] })), sim = new Sim({ registry: [MARKER, FLIP], trialsPerWeek: 2 });
  await sim.ledger.appendAll('claim-checker', [{ kind: 'prereg', payload: { trialKey: 'k'.repeat(64), hypothesis: 'claim check', source: 'claim:chk_test', strategy: { id: 'tpl:x', fingerprint: 'fp' }, panel: d.spec.id, tf: '1d', gateVersion: gateVersion(GATE_V1), passBar: passBar(GATE_V1) } }]);
  const a = await sim.run({ datasets: [d], health: [healthy(d)], mode: 'full' });
  assert.equal((await sim.of('prereg') as any[]).filter(p => p.source === 'factory').length, 1); assert.equal(a.report.funnel.waitingBudget, 1);
});
