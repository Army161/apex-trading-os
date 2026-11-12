// The moves Jeremy may make on a slot by hand (kernel/src/slots.ts). What is held here: a paused slot goes back to paper only,
// never straight to live_eligible or a live stage; it goes back only when its strategy still matches its lock, its data is
// there and the validator has re-run it since the pause and agrees; any slot but a retired one can be retired; unknown refuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger, MemoryLedgerStore } from '../src/ledger';
import { AUTO_PAUSABLE, PAUSED_STATUSES, SLOT_STATUSES, autoPausable, rerunSince, slotMove, type SlotMoveFacts } from '../src/slots';

const good = (o: Partial<SlotMoveFacts> = {}): SlotMoveFacts => ({ status: 'paused_drift', fingerprintMatches: true, datasetReadable: true, rerun: 'agrees', ...o });
const why = (r: ReturnType<typeof slotMove>) => (r.ok ? '' : r.why);

test('automatic pauses act on paper, live_eligible and every live stage, and on nothing else', () => {
  assert.deepEqual([...AUTO_PAUSABLE], ['paper', 'live_eligible', 'micro_live', 'live_10', 'live_50', 'live_100']);
  for (const s of SLOT_STATUSES) assert.equal(autoPausable(s), !['paused_drift', 'paused_data', 'retired'].includes(s), s);
  for (const s of ['', 'unknown', 'PAPER', 'live']) assert.equal(autoPausable(s), false, s);
});

test('back to paper: only from a pause, and only when every fact is known and good', () => {
  for (const status of PAUSED_STATUSES) assert.deepEqual(slotMove(good({ status }), 'paper'), { ok: true, from: status, to: 'paper' });
  // Never straight to live_eligible or a live stage: those are earned again.
  for (const to of ['live_eligible', 'micro_live', 'live_10', 'live_50', 'live_100', 'paused_drift', 'paused_data', 'PAPER', '', undefined, null, 1])
    assert.match(why(slotMove(good(), to)), /only back to paper or to retired/, String(to));
  // Only a paused slot goes back to paper.
  for (const status of ['paper', 'live_eligible', 'micro_live', 'live_10', 'live_50', 'live_100']) assert.match(why(slotMove(good({ status }), 'paper')), /not paused/, status);
  assert.match(why(slotMove(good({ status: 'retired' }), 'paper')), /final/);
  for (const status of [null, '', 'frozen']) assert.match(why(slotMove(good({ status }), 'paper')), /not one this knows/, String(status));
  // Each fact, false or unknown, refuses.
  assert.match(why(slotMove(good({ fingerprintMatches: false }), 'paper')), /no longer matches/); assert.match(why(slotMove(good({ fingerprintMatches: null }), 'paper')), /could not be checked/);
  assert.match(why(slotMove(good({ datasetReadable: false }), 'paper')), /missing or cannot be read/); assert.match(why(slotMove(good({ datasetReadable: null }), 'paper')), /could not be checked/);
  assert.match(why(slotMove(good({ rerun: 'disagrees' }), 'paper')), /does not agree/); assert.match(why(slotMove(good({ rerun: 'none' }), 'paper')), /has not re-run/);
  assert.match(why(slotMove(good({ rerun: null }), 'paper')), /has not re-run/);
});

test('retire: from any status but retired, whatever the other facts say', () => {
  for (const status of SLOT_STATUSES.filter(s => s !== 'retired')) assert.deepEqual(slotMove({ status, fingerprintMatches: null, datasetReadable: null, rerun: null }, 'retired'), { ok: true, from: status, to: 'retired' });
  assert.match(why(slotMove(good({ status: 'retired' }), 'retired')), /final/);
  assert.match(why(slotMove(good({ status: null }), 'retired')), /not one this knows/);
});

test('rerunSince: only a validator run for this slot after its last status change counts, and the latest one decides', async () => {
  const l = new Ledger(new MemoryLedgerStore([]), () => 1000), A = 'a@d', B = 'b@d';
  const pre = (k: string) => l.append('prereg', 'test', { trialKey: k, hypothesis: 'h', source: 'factory', strategy: { id: 's', fingerprint: 'f' }, panel: 'd', tf: '1d', gateVersion: 'g', passBar: 'p' });
  const vr = (slotKey: string, agrees: boolean) => l.append('validator_run', 'validator', { trialKey: 't'.repeat(64), slotKey, purpose: 'monthly', level: 'L1', inputHash: 'in', resultHash: 'out', agrees, exact: agrees });
  const st = (slotKey: string, to: string) => l.append('slot_status', 'autopilot', { slotKey, from: 'paper', to, reason: 'test' });
  await pre('t'.repeat(64)); const read = () => l.store.read();
  assert.deepEqual(rerunSince(await read(), A), { verdict: 'none', seq: null });
  await vr(A, true); await st(A, 'paused_drift'); assert.equal(rerunSince(await read(), A).verdict, 'none', 'a run before the pause does not count');
  await vr(B, true); assert.equal(rerunSince(await read(), A).verdict, 'none', 'another slot\'s run does not count');
  const e = await vr(A, true); assert.deepEqual(rerunSince(await read(), A), { verdict: 'agrees', seq: e.seq });
  await vr(A, false); assert.equal(rerunSince(await read(), A).verdict, 'disagrees', 'the latest run decides');
  await vr(A, true); await st(A, 'paused_data'); assert.equal(rerunSince(await read(), A).verdict, 'none', 'a new status change starts again');
});
