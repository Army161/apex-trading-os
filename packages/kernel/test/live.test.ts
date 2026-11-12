// The live path's ledger facts (docs/design/02 s6): lockFactsOf as the one derivation of locks 1 to 3, the promotion review
// record for lock 2, the live fill and its separate live book, and the executor's signature.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger, MemoryLedgerStore, LiveFillDuplicate, REQUIRED, makeEntry, buildView, bookAt, lockFactsOf, liveAllowed, serverLocksOpen, signExecutor, verifyExecutor,
  EXECUTOR_MAX_SKEW_MS, type LedgerEntry, type LedgerKind } from '../src/index';

const T0 = 1_800_000_000_000, NOW = T0 + 86400e3, SLOT = 'alpha|SPY|1h', TRIAL = 'a'.repeat(64);
function chain(rows: [LedgerKind, object][], from: LedgerEntry[] = []): LedgerEntry[] {
  const out = [...from]; for (const [kind, payload] of rows) { const p = out[out.length - 1]; out.push(makeEntry(p ? { seq: p.seq, hash: p.hash } : null, T0 + out.length * 1000, kind, 'test', payload)); } return out;
}
const step = (s: string, verdict = 'ok', issues: object[] = []) => ({ step: s, verdict, summary: `${s} read it`, issues });
const review = (gradSeq: number, o: Record<string, unknown> = {}): [LedgerKind, object] => ['promotion_review', { slotKey: SLOT, trialKey: TRIAL, gradSeq, verdict: 'ok', by: 'you', model: 'reviewer',
  steps: [step('owner'), step('engineer'), step('qa')], ...o }];
const grad = (): [LedgerKind, object] => ['graduation_check', { slotKey: SLOT, state: 'strict_pass', m: 1, n: 1, month: '2027-01' }];
const reRun = (purpose: string, agrees: boolean): [LedgerKind, object] => ['validator_run', { trialKey: TRIAL, slotKey: SLOT, purpose, level: 'L1', inputHash: 'i', resultHash: 'r', agrees }];
// Seqs: 1 prereg, 2 result, 3 slot, 4 strict pass, 5 agreeing validator, 6 live_eligible.
const BASE = chain([
  ['prereg', { trialKey: TRIAL, hypothesis: 'h', source: 'factory', strategy: { id: 'alpha', fingerprint: 'f' }, panel: 'p', tf: '1h', gateVersion: 'g1', passBar: 'all seven' }],
  ['trial_result', { trialKey: TRIAL, gateVersion: 'g1', inputs: {}, inputHash: 'i', resultHash: 'r', status: 'passed_pending_validation' }],
  ['slot_locked', { slotKey: SLOT, trialKey: TRIAL, strategy: 'alpha', dataset: 'd', symbol: 'SPY', tf: '1h', assetClass: 'equity', inputs: {}, inputHash: 'i', lockedAt: T0, gateVersion: 'g1', role: 'primary', baseline: { n: 60, mu: 0.1, sigma: 1, p: 0.5, ddR95: 5 } }],
  grad(), reRun('graduation', true), ['slot_status', { slotKey: SLOT, from: 'paper', to: 'live_eligible', reason: 'graduated' }],
]);
const facts = (entries: LedgerEntry[]) => lockFactsOf(buildView(entries, 10000), entries, SLOT);
const lock2 = (entries: LedgerEntry[]) => liveAllowed(SLOT, facts(entries), NOW).locks[1].open;
const approval: [LedgerKind, object] = ['live_approval', { slotKey: SLOT, stage: 'micro_live', sizeCap: 0.01, expiresAt: NOW + 864e5, by: 'you', checklist: ['x'] }];

test('lockFactsOf: lock 1 and the validator seq come from the ledger, and machine is always null', () => {
  const f = facts(BASE); assert.deepEqual([f.slotStatus, f.graduationPassedSeq, f.validatorAgreeSeq, f.reviewClean, f.reviewSeq, f.approval, f.machine], ['live_eligible', 4, 5, false, null, null, null]);
  const missing = lockFactsOf(buildView(BASE, 10000), BASE, 'nope'); assert.equal(missing.slotStatus, 'unknown'); assert.equal(liveAllowed('nope', missing, NOW).locks.some(l => l.open), false);
  // A graduation check that is not a strict pass closes lock 1 again.
  assert.equal(facts(chain([['graduation_check', { slotKey: SLOT, state: 'pending', m: 1, n: 1 }]], BASE)).graduationPassedSeq, null);
});

test('lock 2: closed without a review, open after a clean one newer than graduation and the validator, closed again by a later block', () => {
  assert.equal(lock2(BASE), false, 'no review, no lock 2');
  const clean = chain([review(4)], BASE); assert.equal(lock2(clean), true); assert.equal(facts(clean).reviewSeq, 7);
  // Concerns do not block; a block with no high-severity issue was already turned into concerns by the review chain.
  assert.equal(lock2(chain([review(4, { verdict: 'concerns', steps: [step('owner', 'concerns'), step('engineer', 'block', [{ severity: 'medium', issue: 'x', fix: 'y' }]), step('qa')] })], BASE)), true);
  // A later block closes it, and a later clean review opens it again.
  const blocked = chain([review(4, { verdict: 'block' })], clean); assert.equal(lock2(blocked), false);
  assert.equal(lock2(chain([review(4)], blocked)), true);
  // A step that blocks with a high-severity issue keeps it closed whatever the recorded verdict says.
  assert.equal(lock2(chain([review(4, { steps: [step('owner'), step('engineer', 'block', [{ severity: 'high', issue: 'look-ahead', fix: 'shift' }]), step('qa')] })], BASE)), false);
  // All three steps are needed, and the review must name this graduation and this trial.
  assert.equal(lock2(chain([review(4, { steps: [step('owner'), step('engineer')] })], BASE)), false);
  assert.equal(lock2(chain([review(3)], BASE)), false); assert.equal(lock2(chain([review(4, { trialKey: 'b'.repeat(64) })], BASE)), false);
  // A review for another slot counts for nothing here.
  assert.equal(lock2(chain([review(4, { slotKey: 'other' })], BASE)), false);
});

test('lock 2: a review written before the latest strict pass or validator run does not count', () => {
  // Review at seq 7, then a newer strict pass at 8 and its validator run at 9: the old review is stale.
  const stale = chain([review(4), grad(), reRun('graduation', true)], BASE); assert.deepEqual([facts(stale).graduationPassedSeq, facts(stale).validatorAgreeSeq], [8, 9]); assert.equal(lock2(stale), false);
  assert.equal(lock2(chain([review(8)], stale)), true, 'a fresh review of the new graduation opens it');
  // A review between the strict pass and its validator run does not count either.
  const between = chain([review(7), reRun('graduation', true)], chain([grad()], BASE)); assert.equal(lock2(between), false);
  assert.equal(lock2(chain([review(7)], between)), true);
  // A later re-run that does not agree closes lock 2 even with a clean review.
  assert.equal(lock2(chain([reRun('monthly', false)], chain([review(4)], BASE))), false);
});

test('lock 3: an approval counts only when made after the latest review', () => {
  const ok = chain([review(4), approval], BASE), f = facts(ok); assert.deepEqual(liveAllowed(SLOT, f, NOW).locks.map(l => l.open), [true, true, true, false]);
  assert.equal(serverLocksOpen(SLOT, f, NOW), true); assert.equal(liveAllowed(SLOT, f, NOW).allowed, false, 'lock 4 is never open away from the machine');
  // A block after the approval closes locks 2 and 3; a clean review after that does not revive the old approval.
  const blocked = chain([review(4, { verdict: 'block' })], ok); assert.equal(serverLocksOpen(SLOT, facts(blocked), NOW), false);
  const revived = chain([review(4)], blocked), r = liveAllowed(SLOT, facts(revived), NOW).locks; assert.deepEqual(r.map(l => l.open), [true, true, false, false]);
  assert.equal(serverLocksOpen(SLOT, facts(ok), NOW + 2 * 864e5), false, 'an expired approval closes lock 3');
});

test('REQUIRED and shape: both new kinds refuse a payload with a field missing or malformed', () => {
  assert.deepEqual(REQUIRED.promotion_review, ['slotKey', 'trialKey', 'gradSeq', 'verdict', 'steps', 'by', 'model']);
  assert.deepEqual(REQUIRED.live_fill, ['intent', 'slotKey', 'symbol', 'side', 'kind', 't', 'price', 'qty', 'fee', 'brokerOrderId', 'stage']);
  const r = review(4)[1] as Record<string, unknown>;
  for (const k of REQUIRED.promotion_review!) assert.throws(() => makeEntry(null, T0, 'promotion_review', 'dashboard', { ...r, [k]: undefined }), new RegExp(`missing ${k}`));
  for (const bad of [{ verdict: 'fine' }, { gradSeq: 0 }, { steps: 'all' }, { steps: [{ step: 'owner', verdict: 'ok' }] }]) assert.throws(() => makeEntry(null, T0, 'promotion_review', 'dashboard', { ...r, ...bad }), /refused/, JSON.stringify(bad));
  const f = FILL();
  for (const k of REQUIRED.live_fill!) assert.throws(() => makeEntry(null, T0, 'live_fill', 'executor', { ...f, [k]: undefined }), new RegExp(`missing ${k}`));
  for (const bad of [{ side: 2 }, { kind: 'cancelled' }, { qty: 0 }, { price: -1 }, { fee: -0.1 }, { t: 1.5 }, { stage: 'live_200' }, { brokerOrderId: 'has space' }, { slotKey: '' }]) assert.throws(() => makeEntry(null, T0, 'live_fill', 'executor', { ...f, ...bad }), /refused/, JSON.stringify(bad));
});

const FILL = (o: Record<string, unknown> = {}) => ({ intent: 'i'.repeat(64), slotKey: SLOT, symbol: 'SPY', side: 1, kind: 'entry', t: T0 + 5, price: 100, qty: 2, fee: 0.5, brokerOrderId: 'brk-1', stage: 'micro_live', ...o });

test('live fills: the ledger records each one once', async () => {
  const L = new Ledger(new MemoryLedgerStore());
  await L.append('live_fill', 'executor', FILL());
  await assert.rejects(L.append('live_fill', 'executor', FILL()), LiveFillDuplicate);
  await L.append('live_fill', 'executor', FILL({ kind: 'target', brokerOrderId: 'brk-2', price: 110 }));
  await assert.rejects(L.append('live_fill', 'executor', FILL({ kind: 'target', brokerOrderId: 'brk-2', price: 111 })), LiveFillDuplicate, 'same intent, kind and order id');
  // Two writers racing with the same fill still record it once.
  const store = new MemoryLedgerStore(), a = new Ledger(store), b = new Ledger(store), fill = FILL({ brokerOrderId: 'race' });
  const out = await Promise.allSettled([a.append('live_fill', 'executor', fill), b.append('live_fill', 'executor', fill)]);
  assert.deepEqual(out.map(x => x.status).sort(), ['fulfilled', 'rejected']); assert.equal((await store.read()).length, 1);
});

test('live book: built only from live fills and kept apart from the paper book', () => {
  const paper = chain([
    ['intent', { id: 'p1', slotKey: SLOT, symbol: 'SPY', side: 1, barT: T0, qty: 10, riskUsd: 50, stop: 95, rules: [] }],
    ['fill', { intent: 'p1', slotKey: SLOT, kind: 'entry', t: T0 + 1, price: 100, qty: 10, symbol: 'SPY', assetClass: 'equity', side: 1, stop: 95, fee: 1 }],
    ['book_snapshot', { at: T0 + 2, equity: 9999, cash: 9999, peak: 10000, cursors: { d: T0 } }],
  ], BASE);
  const before = buildView(paper, 10000);
  const live = chain([['live_fill', FILL()], ['live_fill', FILL({ kind: 'entry', brokerOrderId: 'brk-1b', price: 104, qty: 2, fee: 0.5 })], ['live_fill', FILL({ kind: 'target', brokerOrderId: 'brk-2', price: 110, qty: 3, fee: 1 })],
    ['live_fill', FILL({ intent: 'j'.repeat(64), slotKey: 'beta|SPY|1h', kind: 'stop', brokerOrderId: 'orphan' })]], paper);
  const after = buildView(live, 10000);
  // The paper book is exactly as it was.
  assert.deepEqual([after.cash, after.peak, after.cursors, [...after.positions.entries()], after.closed, after.pending.size], [before.cash, before.peak, before.cursors, [...before.positions.entries()], before.closed, before.pending.size]);
  assert.deepEqual(bookAt(after, NOW), bookAt(before, NOW));
  // The live book: two entries average to 102, three of four shares closed at 110, one left, the orphan stop is flagged.
  const p = after.live.positions.get(SLOT)!; assert.deepEqual([p.qty, p.entry, p.stage], [1, 102, 'micro_live']); assert.ok(Math.abs(p.fees - 0.25) < 1e-9);
  assert.equal(after.live.closed.length, 1); const c = after.live.closed[0]; assert.deepEqual([c.qty, c.entry, c.exit, c.reason], [3, 102, 110, 'target']); assert.ok(Math.abs(c.pnl - (24 - 1 - 0.75)) < 1e-9);
  assert.deepEqual([after.live.fills, after.live.unmatched], [4, 1]);
  assert.equal(before.live.fills, 0); assert.equal(before.live.positions.size, 0);
});

test('executor signature: one helper signs and checks, and every doubt is a refusal', () => {
  const key = ['k'.repeat(16), 'e'.repeat(16)].join(''), body = JSON.stringify(FILL()), ts = String(NOW), sig = signExecutor(key, ts, body);
  assert.deepEqual(verifyExecutor(key, ts, sig, body, NOW), { ok: true });
  assert.equal(verifyExecutor(key, ts, sig, body + ' ', NOW).ok, false, 'the body is covered');
  assert.equal(verifyExecutor(key, String(NOW + 1), sig, body, NOW).ok, false, 'the timestamp is covered');
  assert.equal(verifyExecutor('x'.repeat(32), ts, sig, body, NOW).ok, false, 'another key');
  for (const k of [undefined, '', 'short']) assert.match((verifyExecutor(k, ts, k ? signExecutor(k, ts, body) : sig, body, NOW) as any).why, /not set/, 'no key or a short key refuses everything');
  assert.match((verifyExecutor(key, ts, sig, body, NOW + EXECUTOR_MAX_SKEW_MS + 1) as any).why, /five minutes/);
  assert.match((verifyExecutor(key, String(NOW + EXECUTOR_MAX_SKEW_MS + 1), signExecutor(key, String(NOW + EXECUTOR_MAX_SKEW_MS + 1), body), body, NOW) as any).why, /five minutes/, 'the future too');
  assert.equal(verifyExecutor(key, ts, sig, body, NOW + EXECUTOR_MAX_SKEW_MS).ok, true);
  for (const [t, s] of [[null, sig], ['abc', sig], [ts, null], [ts, 'zz'], [ts, sig.toUpperCase()], [ts, sig.slice(2)]] as [string | null, string | null][]) assert.equal(verifyExecutor(key, t, s, body, NOW).ok, false, `${t} ${s}`);
});
