// The executor's fill route (docs/design/02 s6, step 7), end to end against a file ledger: only a signed, fresh, well-formed
// fill for a slot with locks 1 to 3 open is written, it is written once, and it lands in the live book and never the paper book.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeEntry, buildView, signExecutor, EXECUTOR_SIG_HEADER, EXECUTOR_TS_HEADER, type LedgerEntry, type LedgerKind } from '@apex/kernel';

const dir = mkdtempSync(join(tmpdir(), 'apex-exec-')), file = join(dir, 'ledger.jsonl');
const KEY_NAME = ['APEX', 'EXECUTOR', 'KEY'].join('_'), KEY = ['exec', 'utor', 'test'].join('-').repeat(4);      // put together here so no secret-looking literal sits in the file
process.env.APEX_LEDGER_FILE = file; for (const k of ['DATABASE_URL', 'APEX_STATE_DIR', 'KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL']) delete process.env[k];
const route = () => import('../app/api/executor/fill/route');

const T0 = Date.now() - 3600e3, SLOT = 'alpha|SPY|1h', SHUT = 'beta|SPY|1h', TRIAL = 'a'.repeat(64), TRIAL_B = 'b'.repeat(64);
function chain(rows: [LedgerKind, object][]): LedgerEntry[] { const out: LedgerEntry[] = []; for (const [kind, payload] of rows) { const p = out[out.length - 1]; out.push(makeEntry(p ? { seq: p.seq, hash: p.hash } : null, T0 + out.length * 1000, kind, 'test', payload)); } return out; }
const slot = (slotKey: string, trialKey: string): [LedgerKind, object][] => [
  ['prereg', { trialKey, hypothesis: 'h', source: 'factory', strategy: { id: slotKey, fingerprint: 'f' }, panel: 'p', tf: '1h', gateVersion: 'g1', passBar: 'all seven' }],
  ['trial_result', { trialKey, gateVersion: 'g1', inputs: {}, inputHash: 'i', resultHash: 'r', status: 'passed_pending_validation' }],
  ['slot_locked', { slotKey, trialKey, strategy: slotKey, dataset: 'd', symbol: 'SPY', tf: '1h', assetClass: 'equity', inputs: {}, inputHash: 'i', lockedAt: T0, gateVersion: 'g1', role: 'primary', baseline: { n: 60, mu: 0.1, sigma: 1, p: 0.5, ddR95: 5 } }],
];
const ENTRIES = chain([...slot(SLOT, TRIAL), ...slot(SHUT, TRIAL_B),
  ['graduation_check', { slotKey: SLOT, state: 'strict_pass', m: 1, n: 1 }],                                                             // seq 7
  ['validator_run', { trialKey: TRIAL, slotKey: SLOT, purpose: 'graduation', level: 'L1', inputHash: 'i', resultHash: 'r', agrees: true }],
  ['slot_status', { slotKey: SLOT, from: 'paper', to: 'live_eligible', reason: 'graduated' }],
  ['promotion_review', { slotKey: SLOT, trialKey: TRIAL, gradSeq: 7, verdict: 'ok', by: 'you', model: 'reviewer', steps: ['owner', 'engineer', 'qa'].map(step => ({ step, verdict: 'ok', summary: 's', issues: [] })) }],
  ['live_approval', { slotKey: SLOT, stage: 'micro_live', sizeCap: 0.01, expiresAt: Date.now() + 864e5, by: 'you', checklist: ['x'] }],
  // The other slot is live-eligible too, but has no review and no approval.
  ['graduation_check', { slotKey: SHUT, state: 'strict_pass', m: 1, n: 1 }],
  ['validator_run', { trialKey: TRIAL_B, slotKey: SHUT, purpose: 'graduation', level: 'L1', inputHash: 'i', resultHash: 'r', agrees: true }],
  ['slot_status', { slotKey: SHUT, from: 'paper', to: 'live_eligible', reason: 'graduated' }],
]);
writeFileSync(file, ENTRIES.map(e => JSON.stringify(e)).join('\n') + '\n');
const rows = () => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as LedgerEntry);
const FILL = (o: Record<string, unknown> = {}) => ({ intent: 'i'.repeat(64), slotKey: SLOT, symbol: 'SPY', side: 1, kind: 'entry', t: Date.now(), price: 100, qty: 0.1, fee: 0.01, brokerOrderId: 'brk-1', stage: 'micro_live', ...o });
function post(body: unknown, o: { key?: string; ts?: number; sig?: string; raw?: string } = {}) {
  const raw = o.raw ?? JSON.stringify(body), ts = String(o.ts ?? Date.now());
  return route().then(r => r.POST(new Request('https://apex.test/api/executor/fill', { method: 'POST', headers: { 'content-type': 'application/json', [EXECUTOR_TS_HEADER]: ts,
    [EXECUTOR_SIG_HEADER]: o.sig ?? signExecutor(o.key ?? KEY, ts, raw) }, body: raw })));
}

test('fill route: no key set refuses everything, in every environment', async () => {
  delete process.env[KEY_NAME];
  const r = await post(FILL()); assert.equal(r.status, 401); assert.match((await r.json()).error, /not set/);
  process.env[KEY_NAME] = 'short'; assert.equal((await post(FILL(), { key: 'short' })).status, 401, 'a short key is no key');
  assert.equal(rows().length, ENTRIES.length);
});

test('fill route: a bad signature or an old timestamp is refused before anything is read', async () => {
  process.env[KEY_NAME] = KEY;
  for (const o of [{ key: KEY + 'x' }, { sig: 'f'.repeat(64) }, { sig: 'nothex' }]) { const r = await post(FILL(), o); assert.equal(r.status, 401, JSON.stringify(o)); assert.match((await r.json()).error, /signature/); }
  const body = JSON.stringify(FILL()), ts = String(Date.now()), r0 = await (await route()).POST(new Request('https://apex.test/api/executor/fill', { method: 'POST', headers: { [EXECUTOR_TS_HEADER]: ts, [EXECUTOR_SIG_HEADER]: signExecutor(KEY, ts, body) }, body: body.replace('100', '101') }));
  assert.equal(r0.status, 401, 'a changed body breaks the signature');
  for (const ts of [Date.now() - 5 * 60e3 - 5000, Date.now() + 5 * 60e3 + 5000]) { const r = await post(FILL(), { ts }); assert.equal(r.status, 401); assert.match((await r.json()).error, /five minutes/); }
  assert.equal(rows().length, ENTRIES.length);
});

test('fill route: a malformed body and a slot without locks 1 to 3 are refused', async () => {
  process.env[KEY_NAME] = KEY;
  assert.equal((await post(null, { raw: '{not json' })).status, 422);
  for (const bad of [{ side: 0 }, { qty: -1 }, { kind: 'cancelled' }, { stage: 'live_100x' }, { brokerOrderId: undefined }]) assert.equal((await post(FILL(bad))).status, 422, JSON.stringify(bad));
  const shut = await post(FILL({ slotKey: SHUT })); assert.equal(shut.status, 409); assert.match((await shut.json()).error, /Locks 1 to 3/);
  assert.equal((await post(FILL({ slotKey: 'nobody|SPY|1h' }))).status, 409);
  assert.equal((await post(FILL({ stage: 'live_10' }))).status, 409, 'only the approved stage');
  assert.equal(rows().length, ENTRIES.length);
});

test('fill route: a good fill is written once, to the live book only', async () => {
  process.env[KEY_NAME] = KEY;
  const before = buildView(rows(), 10000), fill = FILL();
  const ok = await post(fill); assert.equal(ok.status, 200); const j = await ok.json(); assert.equal(j.ok, true); assert.equal(j.seq, ENTRIES.length + 1);
  const dup = await post({ ...fill, t: fill.t + 1 }); assert.equal(dup.status, 200); assert.deepEqual(await dup.json(), { ok: true, duplicate: true });
  const all = rows(), last = all[all.length - 1]; assert.equal(all.length, ENTRIES.length + 1); assert.deepEqual([last.kind, last.actor], ['live_fill', 'executor']);
  assert.deepEqual(Object.keys(last.payload).sort(), ['brokerOrderId', 'fee', 'intent', 'kind', 'price', 'qty', 'side', 'slotKey', 'stage', 'symbol', 't']);
  const after = buildView(all, 10000);
  assert.deepEqual([after.cash, after.peak, after.positions.size, after.closed.length], [before.cash, before.peak, before.positions.size, before.closed.length]);
  assert.equal(after.live.positions.get(SLOT)?.qty, 0.1); assert.equal(after.slots.get(SLOT)?.status, 'live_eligible', 'a fill never changes a slot');
  // Extra fields in the body never reach the ledger.
  const extra = await post({ ...FILL({ brokerOrderId: 'brk-2', kind: 'target', price: 101 }), note: 'ignore me' }); assert.equal(extra.status, 200); assert.equal(rows().pop()!.payload.note, undefined);
});

test('fill route: the stop of a held live position is recorded even after the approval expired; an exit with nothing held is refused', async () => {
  process.env[KEY_NAME] = KEY;
  // Open a position while the approval holds, then append an approval that has expired, then post the stop.
  assert.equal((await post(FILL({ intent: 'k'.repeat(64), brokerOrderId: 'brk-open' }))).status, 200);
  const all = rows(), last = all[all.length - 1];
  const expired = makeEntry({ seq: last.seq, hash: last.hash }, Date.now() - 1000, 'live_approval', 'test', { slotKey: SLOT, stage: 'micro_live', sizeCap: 0.01, expiresAt: Date.now() - 500, by: 'you', checklist: ['x'] });
  writeFileSync(file, [...all, expired].map(e => JSON.stringify(e)).join('\n') + '\n');
  assert.equal((await post(FILL({ brokerOrderId: 'brk-9', intent: 'j'.repeat(64) }))).status, 409, 'no new entry once the approval expired');
  const held = buildView(rows(), 10000).live.positions.get(SLOT); assert.ok(held, 'the earlier entry is still held');
  const stop = await post(FILL({ intent: held!.intent, kind: 'stop', price: 99, qty: held!.qty, brokerOrderId: 'brk-stop' })); assert.equal(stop.status, 200, 'the stop is recorded');
  assert.equal(buildView(rows(), 10000).live.positions.get(SLOT), undefined, 'the live book is flat again');
  const orphan = await post(FILL({ kind: 'stop', brokerOrderId: 'brk-stop-2' })); assert.equal(orphan.status, 409); assert.match((await orphan.json()).error, /does not hold/);
});
