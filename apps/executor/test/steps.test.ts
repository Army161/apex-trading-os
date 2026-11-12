// The executor's steps (docs/design/02 s6): every refusal, the stage sizing, the journal and the one happy path, all with a
// fake broker and a fake dashboard. No network, no real key, no live flag given a value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeLiveBroker } from './fake';
import { ALLOW, EXEC, HOUR, ID, NOW, BAR_T, SLOT, SIGNOFF, KEY, approvalOf, baseEnv, chain, deps, fakeFetch, lastIntent, signatureFor, tmp, world } from './fixture';
import { executeIntent, mirrorOf, retryPosts, verifyLedger } from '../src/steps';
import { DryRunBroker, type LiveOrder } from '../src/broker';
import { FileJournal, pendingPosts } from '../src/journal';

const failedAt = (r: Awaited<ReturnType<typeof executeIntent>>) => { const s = r.steps[r.steps.length - 1]; assert.equal(s.ok, false, JSON.stringify(r.steps)); return s; };
const run = (o: Parameters<typeof deps>[2] = {}, w = world(), b = new FakeLiveBroker({ fillT: NOW })) => { const d = deps(w, b, o); return executeIntent(d, lastIntent(w)).then(r => ({ r, d, b })); };

test('happy path: all eight checks pass, one bracket is placed, and the fill is posted signed', async () => {
  const f = fakeFetch(), { r, d, b } = await run({ fetch: f.fetch });
  assert.deepEqual(r.steps.map(s => [s.n, s.id, s.ok]), [[0, 'fresh', true], [1, 'chain-and-locks', true], [2, 'halts', true], [3, 'not-sent', true], [4, 'reconcile', true], [5, 'guard', true], [6, 'place', true], [7, 'post', true]]);
  assert.equal(r.sent, true); assert.equal(r.outcome, 'sent'); assert.equal(b.calls.bracket, 1); assert.equal(b.calls.submit, 0, 'only the bracket is used');
  assert.match(r.steps[1].detail, /all four locks are open/);
  const post = f.calls.find(c => c.method === 'POST')!, body = JSON.parse(post.body!);
  assert.equal(post.url, 'https://dash.example/api/executor/fill');
  assert.deepEqual([body.intent, body.slotKey, body.kind, body.stage, body.brokerOrderId, body.side], [ID, SLOT, 'entry', 'micro_live', 'B-1', 1]);
  assert.match(post.headers['x-apex-signature'], /^[0-9a-f]{64}$/); assert.ok(!JSON.stringify(f.calls).includes(KEY) && !JSON.stringify(f.calls).includes(d.env[EXEC]!), 'no key travels');
  assert.deepEqual(d.journal.read().map(x => x.type), ['submitting', 'sent', 'fill', 'posted']);
  assert.equal(b.submitted[0].id, ID, 'the client order id is the intent id');
});

test('stage sizing: micro_live is 1% of the paper-sized risk, and the approval\'s size cap can only lower it', async () => {
  const { r } = await run();
  assert.equal(r.order!.riskFraction, 0.005 * 0.01); assert.ok(Math.abs(r.order!.riskUsd - 10000 * 0.005 * 0.01) < 1e-3, String(r.order!.riskUsd));
  const half = await run({}, world({ approval: { sizeCap: 0.005 } }));
  assert.equal(half.r.order!.riskFraction, 0.005 * 0.005); assert.ok(half.r.order!.riskUsd < r.order!.riskUsd);
  const over = await run({}, world({ approval: { sizeCap: 0.05 } }));
  assert.match(failedAt(over.r).detail, /size cap 0\.05 is outside 0 to 0\.01/); assert.equal(over.b.calls.bracket, 0);
  // Any other stage is refused, even with a matching cap: the ledger takes an approval from any writer.
  for (const a of [{ stage: 'live_100', sizeCap: 1 }, { stage: 'live_10', sizeCap: 0.01 }, { stage: 'nope', sizeCap: 0.01 }]) {
    const x = await run({}, world({ approval: a })), s = failedAt(x.r);
    assert.equal(s.n, 5, a.stage); assert.match(s.detail, /only micro_live is sent/, a.stage); assert.equal(x.b.calls.bracket, 0, a.stage);
  }
});

test('step 0: a stale intent, an unclosed bar, a non-paper intent and an intent before the approval are refused', async () => {
  const stale = await run({ now: () => BAR_T + 2 * HOUR });
  assert.equal(stale.r.outcome, 'stale'); assert.equal(failedAt(stale.r).n, 0); assert.match(failedAt(stale.r).detail, /stale/);
  const early = await run({ now: () => BAR_T + HOUR - 1 }); assert.match(failedAt(early.r).detail, /has not closed/);
  assert.match(failedAt((await run({}, world({ intent: { mode: 'live' } }))).r).detail, /paper pipeline/);
  assert.match(failedAt((await run({}, world({ intent: { symbol: 'QQQ' } }))).r).detail, /symbol, asset class or side/);
  assert.match(failedAt((await run({}, world({ intent: { side: 2 } }))).r).detail, /symbol, asset class or side/);
  assert.match(failedAt((await run({}, world({ intent: { assetClass: 'crypto' } }))).r).detail, /symbol, asset class or side/);
  const notPipeline = world({ intent: null, extra: [['intent', { ...(world().at(-1)!.payload) }, 'mcp']] });
  assert.match(failedAt((await run({}, notPipeline)).r).detail, /paper pipeline/);
  assert.match(failedAt((await run({}, world({ approval: null }))).r).detail, /no live approval/);
  assert.match(failedAt((await run({}, world({ approval: { slotKey: 'other@x' } }))).r).detail, /no live approval/);
  const before = world({ approval: null, intent: null, extra: [['intent', world().at(-1)!.payload, 'autopilot'], ['live_approval', approvalOf(world()).payload]] });
  assert.match(failedAt((await run({}, before)).r).detail, /older than the approval/);
  for (const x of [stale, early]) assert.equal(x.b.calls.bracket, 0);
});

test('step 1: a broken chain is refused, always checked from genesis; anchors and saved heads only add checks', async () => {
  const w = world(); w[4] = { ...w[4], payload: { ...w[4].payload, method: 'edited' } };
  const s = failedAt((await run({}, w)).r); assert.equal(s.n, 1); assert.match(s.detail, /broken at seq 5: payload was changed/);
  const anchored = chain([['anchor', { seq: 9, hash: world()[8].hash }]], world({ intent: null, approval: null })), full = chain([['live_approval', approvalOf(world()).payload], ['intent', lastIntent(world()).payload, 'autopilot']], anchored);
  // re-sign: the approval moved to a new seq
  const ok = await run({ signature: () => signatureFor(full) }, full); assert.equal(ok.r.outcome, 'sent', JSON.stringify(ok.r.steps)); assert.match(ok.r.steps[1].detail, /from genesis through seq 12, and 1 anchored head\(s\) match/);
  // An entry before the anchor that was changed without rehashing is still caught: the anchor does not vouch for itself.
  const tampered = full.map(e => (e.seq === 7 ? { ...e, payload: { ...e.payload, agrees: true, level: 'L3' } } : e));
  const t = await run({ signature: () => signatureFor(tampered) }, tampered), ts = failedAt(t.r);
  assert.equal(ts.n, 1); assert.match(ts.detail, /broken at seq 7/); assert.equal(t.b.calls.bracket, 0);
  const bad = chain([['anchor', { seq: 9, hash: 'f'.repeat(64) }]], world({ intent: null, approval: null }));
  assert.match(verifyLedger(chain([['live_approval', approvalOf(world()).payload]], bad), 11).why, /names a head that is not in the ledger/);
  // Heads saved outside the ledger must match too, and one that cannot be read refuses.
  const head = (hash: string) => () => ({ heads: [{ seq: 9, hash, date: '2027-01-02' }], unreadable: [] });
  assert.equal((await run({ signature: () => signatureFor(full), heads: head(full[8].hash) }, full)).r.outcome, 'sent');
  assert.match(failedAt((await run({ signature: () => signatureFor(full), heads: head('e'.repeat(64)) }, full)).r).detail, /saved on 2027-01-02 does not match entry 9/);
  assert.match(failedAt((await run({ heads: () => ({ heads: [], unreadable: ['2027-01-03.json'] }) })).r).detail, /2027-01-03\.json cannot be read/);
  assert.match(failedAt((await run({ heads: () => { throw new Error('EACCES'); } })).r).detail, /cannot be read/);
});

test('step 1: each lock closed is refused, and so are a bad signature, a short key, a missing flag and a broker flag that is off', async () => {
  const cases: [string, Promise<{ r: any }>, RegExp][] = [
    ['lock 1', run({}, world({ status: false })), /evidence/],
    ['lock 2', run({}, world({ review: false })), /validated/],
    ['lock 3 expired', run({}, world({ approval: { expiresAt: NOW - 1 } })), /approved/],
    ['no signature', run({ signature: () => null }), /no signature file/],
    ['bad signature', run({ signature: () => ({ ...signatureFor(world()), signature: 'f'.repeat(64) }) }), /does not match this approval/],
    ['signature for another approval', run({ signature: () => ({ ...signatureFor(world()), approvalSeq: 3 }) }), /does not match this approval/],
    ['short key', run({ env: { ...baseEnv(), [SIGNOFF]: KEY.slice(0, 31) } }), /shorter than 32/],
    ['no key', run({ env: (({ [SIGNOFF]: _k, ...e }) => e)(baseEnv()) }), /APEX_SIGNOFF_KEY is missing/],
    ['flag missing', run({ env: (({ [ALLOW]: _a, ...e }) => e)(baseEnv()) }), /APEX_ALLOW_LIVE is not yes/],
    ['flag not yes', run({ env: { ...baseEnv(), [ALLOW]: 'true' } }), /APEX_ALLOW_LIVE is not yes/],
    ['broker flag off', run({}, world(), new FakeLiveBroker({ live: false })), /live flag is off/],
    ['broker in paper mode', run({}, world(), new FakeLiveBroker({ mode: 'paper' })), /not in live mode/],
  ];
  for (const [name, p, re] of cases) { const { r } = await p, s = failedAt(r); assert.equal(s.n, 1, name); assert.match(s.detail, re, name); assert.equal(r.sent, false, name); }
});

test('step 2: an unreachable or unreadable dashboard, an active halt anywhere, or no executor key means halted', async () => {
  const cases: [string, Parameters<typeof deps>[2], RegExp, ReturnType<typeof world>?][] = [
    ['unreachable', { fetch: fakeFetch({ status: 'throw' }).fetch }, /could not be reached/],
    ['500', { fetch: fakeFetch({ status: 500 }).fetch }, /answered 500/],
    ['not a clear no', { fetch: fakeFetch({ status: { mode: 'paper' } }).fetch }, /not a clear no/],
    ['andon on the dashboard', { fetch: fakeFetch({ status: { halted: true, halts: [{ level: 'andon' }] } }).fetch }, /halt \(andon\)/],
    ['no url', { env: { ...baseEnv(), APEX_DASHBOARD_URL: '' } }, /cannot be read: treated as halted/],
    ['plain http elsewhere', { env: { ...baseEnv(), APEX_DASHBOARD_URL: 'http://dash.example' } }, /not an https address/],
    ['kill in the ledger', {}, /ledger has an active halt: kill/, world({ extra: [['halt', { level: 'kill', by: 'you', reason: 'test' }]] })],
    ['drawdown in the ledger', {}, /book-drawdown/, world({ extra: [['halt', { level: 'book-drawdown', by: 'autopilot', reason: 'test' }]] })],
    ['no executor key', { env: { ...baseEnv(), [EXEC]: 'short' } }, /APEX_EXECUTOR_KEY/],
  ];
  for (const [name, o, re, w] of cases) { const { r, b } = await run(o, w), s = failedAt(r); assert.equal(s.n, 2, name); assert.match(s.detail, re, name); assert.equal(b.calls.bracket, 0, name); }
  // A halt that was resumed no longer counts.
  const resumed = await run({}, world({ extra: [['halt', { level: 'andon', by: 'you', reason: 'x' }], ['resume', { level: 'andon', by: 'you' }]] })); assert.equal(resumed.r.outcome, 'sent');
});

test('step 3: a duplicate in the journal or at the broker, a wrong id and an unreadable journal are refused', async () => {
  const j = new FileJournal(join(tmp(), 'j.jsonl')); j.append({ type: 'submitting', mode: 'live', at: NOW - 1, id: ID });
  const inJournal = await run({ journal: j }); assert.equal(inJournal.r.outcome, 'duplicate'); assert.equal(failedAt(inJournal.r).n, 3);
  const atBroker = await run({}, world(), new FakeLiveBroker({ clientIds: ['x', ID] })); assert.equal(atBroker.r.outcome, 'duplicate'); assert.match(failedAt(atBroker.r).detail, /client order id/);
  assert.match(failedAt((await run({}, world({ intent: { id: 'c'.repeat(64) } }))).r).detail, /sha256\(slot key, bar time, side\)/);
  const broken = join(tmp(), 'j.jsonl'); writeFileSync(broken, '{"type":"sent"\n'); assert.match(failedAt((await run({ journal: new FileJournal(broken) })).r).detail, /journal cannot be read/);
  assert.match(failedAt((await run({}, world(), new FakeLiveBroker({ failReads: true }))).r).detail, /client order ids could not be read/);
  // A rehearsal of the same intent does not count as sent.
  const rj = new FileJournal(join(tmp(), 'j.jsonl')); rj.append({ type: 'rehearsal', mode: 'rehearsal', at: NOW - 1, id: ID }); assert.equal((await run({ journal: rj })).r.outcome, 'sent');
  for (const x of [inJournal, atBroker]) assert.equal(x.b.calls.bracket, 0);
});

const stopFor = (o: Partial<LiveOrder> = {}): LiveOrder => ({ id: 'S', slotKey: 'beta@qqq-1h', kind: 'stop', side: -1, qty: 0.01, ...o });
const LIVE_FILL = { intent: 'd'.repeat(64), slotKey: 'beta@qqq-1h', symbol: 'QQQ', side: 1, kind: 'entry', t: NOW - HOUR, price: 400, qty: 0.01, fee: 0, brokerOrderId: 'B-0', stage: 'micro_live' };
test('step 4: any disagreement between the broker and the live book pulls the andon cord and stops', async () => {
  const extra = { slotKey: 'beta@qqq-1h', symbol: 'QQQ', assetClass: 'etf' as const, side: 1 as const, qty: 0.01, entry: 400, stop: 390, riskUsd: 0.1 };
  const cases: [string, ReturnType<typeof world>, FakeLiveBroker, RegExp][] = [
    ['broker holds more', world(), new FakeLiveBroker({ positions: [extra], orders: [stopFor()] }), /the live book does not/],
    ['book holds more', world({ extra: [['live_fill', LIVE_FILL, 'executor']] }), new FakeLiveBroker(), /the broker does not/],
    ['quantity differs', world({ extra: [['live_fill', LIVE_FILL, 'executor']] }), new FakeLiveBroker({ positions: [{ ...extra, qty: 0.02 }], orders: [stopFor()] }), /broker 1 0\.02 QQQ, live book 1 0\.01 QQQ/],
    ['no resting stop', world({ extra: [['live_fill', LIVE_FILL, 'executor']] }), new FakeLiveBroker({ positions: [extra] }), /no stop resting/],
    ['only a target resting', world({ extra: [['live_fill', LIVE_FILL, 'executor']] }), new FakeLiveBroker({ positions: [extra], orders: [stopFor({ kind: 'target' })] }), /no stop resting at the broker that covers/],
    ['stop on the wrong side', world({ extra: [['live_fill', LIVE_FILL, 'executor']] }), new FakeLiveBroker({ positions: [extra], orders: [stopFor({ side: 1 })] }), /no stop resting at the broker that covers/],
    ['stop smaller than the position', world({ extra: [['live_fill', LIVE_FILL, 'executor']] }), new FakeLiveBroker({ positions: [extra], orders: [stopFor({ qty: 0.005 })] }), /no stop resting at the broker that covers/],
    ['order of no known kind', world({ extra: [['live_fill', LIVE_FILL, 'executor']] }), new FakeLiveBroker({ positions: [extra], orders: [stopFor(), stopFor({ id: 'X', kind: 'oco' as any })] }), /no readable kind/],
    ['stray order', world(), new FakeLiveBroker({ orders: [stopFor({ id: 'O', slotKey: SLOT })] }), /holds no live position/],
  ];
  for (const [name, w, b, re] of cases) {
    const andon: string[] = [], r = await executeIntent(deps(w, b, { andon }), lastIntent(w)), s = failedAt(r);
    assert.equal(s.n, 4, name); assert.match(s.detail, re, name); assert.match(s.detail, /andon cord is pulled/, name); assert.equal(andon.length, 1, name); assert.equal(b.calls.bracket, 0, name);
  }
  // Matching books pass; a broker that cannot be read is refused without guessing.
  const match = await run({}, world({ extra: [['live_fill', LIVE_FILL, 'executor']] }), new FakeLiveBroker({ positions: [extra], orders: [stopFor(), stopFor({ id: 'T', kind: 'target' })], fillT: NOW }));
  assert.equal(match.r.outcome, 'sent', JSON.stringify(match.r.steps));
});

test('step 5: the guard blocks with the broker\'s numbers and nothing is sent', async () => {
  const wrongStop = await run({}, world({ intent: { stop: 103 } })), s = failedAt(wrongStop.r); assert.equal(s.n, 5); assert.match(s.detail, /stop-required/); assert.equal(wrongStop.b.calls.bracket, 0);
  assert.match(failedAt((await run({}, world({ extra: [['data_version', { dataset: 'spy-1h', version: 'v2', rows: 100, status: 'blocked', tradable: false }]] }))).r).detail, /data-blocked/);
  assert.match(failedAt((await run({}, world(), new FakeLiveBroker({ equity: 0 }))).r).detail, /equity could not be read/);
  assert.match(failedAt((await run({}, world(), new FakeLiveBroker({ minQty: 1 }))).r).detail, /min-size/);
});

test('step 6: no resting stop cancels the entry and pulls the cord; no answer is never resent; a refusal is recorded', async () => {
  const noStop = await run({}, world(), new FakeLiveBroker({ stopResting: false })), s = failedAt(noStop.r);
  assert.equal(s.n, 6); assert.match(s.detail, /did not confirm a resting stop; the entry was cancelled; the andon cord is pulled/);
  assert.deepEqual(noStop.b.cancelled, ['B-1']); assert.equal(noStop.d.andon.length, 1); assert.equal(noStop.r.sent, false);
  assert.deepEqual(noStop.d.journal.read().map(x => x.type), ['submitting', 'cancelled']);
  const silent = await run({}, world(), new FakeLiveBroker({ noAnswer: true })); assert.equal(silent.r.outcome, 'unconfirmed'); assert.equal(silent.d.andon.length, 1);
  const again = await executeIntent(silent.d, lastIntent(world())); assert.equal(again.outcome, 'duplicate'); assert.equal(silent.b.calls.bracket, 1, 'never sent twice');
  const refused = await run({}, world(), new FakeLiveBroker({ refuse: true })); assert.match(failedAt(refused.r).detail, /refused the order: insufficient buying power/);
});

test('step 6: two runs at once on the same journal send the intent once; the other is refused as a duplicate', async () => {
  const dir = tmp(), w = world(), b = new FakeLiveBroker({ fillT: NOW });
  const [x, y] = await Promise.all([1, 2].map(() => executeIntent(deps(w, b, { journal: new FileJournal(join(dir, 'journal.jsonl')) }), lastIntent(w))));
  assert.equal(b.calls.bracket, 1, 'the broker saw one order');
  assert.deepEqual([x.outcome, y.outcome].sort(), ['duplicate', 'sent']);
  const lost = [x, y].find(r => r.outcome === 'duplicate')!; assert.equal(failedAt(lost).n, 6); assert.match(failedAt(lost).detail, /already claimed/);
  // Both had passed step 3: the journal was empty when each read it.
  for (const r of [x, y]) assert.equal(r.steps[3].ok, true);
});

test('step 7: a failed fill post stays in the journal, is retried, and the order is never sent to the broker again', async () => {
  const down = fakeFetch({ post: 'fail' }), first = await run({ fetch: down.fetch });
  assert.equal(first.r.sent, true); const s = failedAt(first.r); assert.equal(s.n, 7); assert.match(s.detail, /posted again on the next run, never sent to the broker again/);
  assert.equal(pendingPosts(first.d.journal.read()).length, 1);
  const unreachable = await retryPosts({ ...first.d, fetch: fakeFetch({ post: 'throw' }).fetch }); assert.equal(unreachable.posted, 0); assert.equal(unreachable.failed.length, 1);
  const up = fakeFetch(), retry = await retryPosts({ ...first.d, fetch: up.fetch });
  assert.deepEqual(retry, { posted: 1, failed: [] }); assert.equal(pendingPosts(first.d.journal.read()).length, 0);
  assert.equal(up.calls.filter(c => c.method === 'POST')[0].body, down.calls.filter(c => c.method === 'POST')[0].body, 'the same fill, word for word');
  const again = await executeIntent({ ...first.d, fetch: up.fetch }, lastIntent(world())); assert.equal(again.outcome, 'duplicate');
  assert.equal(first.b.calls.bracket, 1, 'the broker saw one order');
  assert.deepEqual(await retryPosts({ ...first.d, fetch: up.fetch }), { posted: 0, failed: [] }, 'nothing left to post');
});

test('rehearsal: steps 0 to 5 run, the order goes to the journal under its own marker, and no submit is ever called', async () => {
  const w = world(), inner = new FakeLiveBroker(), dry = new DryRunBroker({ inner, mirror: mirrorOf(w, 10000, NOW) });
  const env = (({ [ALLOW]: _a, ...e }) => e)(baseEnv());               // no live flag needed to rehearse
  const d = deps(w, dry, { mode: 'rehearsal', env }), r = await executeIntent(d, lastIntent(w));
  assert.equal(r.outcome, 'rehearsed', JSON.stringify(r.steps)); assert.equal(r.sent, false);
  assert.deepEqual(r.steps.map(s => [s.n, s.ok]), [[0, true], [1, true], [2, true], [3, true], [4, true], [5, true], [6, true]]);
  assert.deepEqual(inner.calls, { submit: 0, bracket: 0, cancel: 0 }); assert.equal(dry.wouldSend.length, 1);
  assert.deepEqual(d.journal.read().map(x => [x.type, x.mode]), [['rehearsal', 'rehearsal']]);
  assert.equal(r.order!.riskFraction, 0.005 * 0.01);
  // Without an adapter the live book stands in for the broker.
  const bare = await executeIntent(deps(w, new DryRunBroker({ mirror: mirrorOf(w, 10000, NOW) }), { mode: 'rehearsal', env }), lastIntent(w));
  assert.equal(bare.outcome, 'rehearsed'); assert.match(bare.steps[4].detail, /live book stands in/);
  // Rehearsal still needs locks 1 to 3 and the signature.
  assert.equal(failedAt(await executeIntent(deps(w, dry, { mode: 'rehearsal', env, signature: () => null }), lastIntent(w))).n, 1);
  // A rehearsal never takes a live adapter, and live never takes the rehearsal broker.
  assert.match(failedAt(await executeIntent(deps(w, inner, { mode: 'rehearsal' }), lastIntent(w))).detail, /only with the rehearsal broker/);
  assert.match(failedAt(await executeIntent(deps(w, dry, { mode: 'live' }), lastIntent(w))).detail, /refuses the rehearsal broker/);
  assert.equal(inner.calls.bracket, 0);
});

test('the source: nothing gives a live flag a value, and no adapter is installed', () => {
  for (const f of ['steps.ts', 'main.ts', 'broker.ts', 'journal.ts', 'signature.ts']) {
    const src = readFileSync(join(__dirname, '../src', f), 'utf8');
    assert.doesNotMatch(src, /\b[A-Z][A-Z0-9_]*_LIVE\b\s*[:=]\s*["']?\w/, f); assert.doesNotMatch(src, /console\.(log|error)\([^)]*(KEY|key)\b/, f);
  }
  assert.match(readFileSync(join(__dirname, '../src/main.ts'), 'utf8'), /adapter: \(\) => null/);
});
