// Moving a slot by hand (docs/design/04 s12, 02 s4). What is held here: only the signed-in dashboard, with the password typed
// again and the slot's name typed out, can bring a paused slot back to paper or retire one; back to paper needs the strategy to
// match its lock, the data to load and an agreeing validator re-run since the pause; nothing can set live_eligible or a live
// stage by hand; one slot_status entry by Jeremy is all it writes; and no terminal command, MCP tool or API route reaches it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Ledger, MemoryLedgerStore, buildView, verifyChain } from '@apex/kernel';
import { changeSlot, decideSlotChange, type Checked, type SlotChangeDeps, type SlotFacts } from '../app/api/admin/slots/change';
import { checkAgainstRun } from '../app/api/admin/slots/checks';

const web = resolve(__dirname, '..'), src = (p: string) => readFileSync(join(web, p), 'utf8'), NOW = Date.UTC(2027, 5, 1), SLOT = 'dave_prev_range@csv:SPY:1h:split';
const PW = ['correct', 'horse', 'battery'].join('-');                      // put together here so no secret-looking literal sits in the file
const ORIGIN = 'https://apex.test', URL_ = `${ORIGIN}/api/admin/slots/${encodeURIComponent(SLOT)}`;
const facts = (o: Partial<SlotFacts> = {}): SlotFacts => ({ slotKey: SLOT, adminPassword: PW, status: 'paused_drift', fingerprintMatches: true, datasetReadable: true, rerun: 'agrees', rerunSeq: 9, ...o });
const form = (o: Record<string, unknown> = {}) => ({ to: 'paper', typed: SLOT, password: PW, reason: 'the market calmed down', ...o });

test('decision: the password, the typed name, a reason, and a move kernel/src/slots.ts allows', () => {
  const refuse = (f: SlotFacts, b: Record<string, unknown>, status: number, re: RegExp) => { const r = decideSlotChange(f, b); assert.equal(r.ok, false, re.source); if (!r.ok) { assert.equal(r.status, status, r.error); assert.match(r.error, re); } };
  const ok = decideSlotChange(facts(), form()); assert.ok(ok.ok);
  assert.deepEqual(ok.payload, { slotKey: SLOT, from: 'paused_drift', to: 'paper', reason: 'by hand: the market calmed down', numbers: {}, by: 'jeremy', rerunSeq: 9 });
  const rt = decideSlotChange(facts({ status: 'micro_live', fingerprintMatches: null, datasetReadable: null, rerun: null }), form({ to: 'retired' })); assert.ok(rt.ok);
  assert.deepEqual([rt.payload.from, rt.payload.to, rt.payload.by, rt.payload.rerunSeq], ['micro_live', 'retired', 'jeremy', null]);
  // The password again, before anything else.
  refuse(facts(), form({ password: 'wrong' }), 401, /not the password/); refuse(facts(), form({ password: undefined }), 401, /not the password/); refuse(facts(), form({ password: PW + ' ' }), 401, /not the password/);
  refuse(facts({ adminPassword: '' }), form({ password: '' }), 409, /No admin password is set/);
  refuse(facts({ status: 'retired' }), form({ password: 'wrong' }), 401, /not the password/);
  // The typed name.
  for (const typed of ['', SLOT.toLowerCase(), ` ${SLOT}`, 'dave_prev_range', undefined]) refuse(facts(), form({ typed }), 422, /Type the slot's name exactly/);
  // Only two moves: never straight to live_eligible or a live stage.
  for (const to of ['live_eligible', 'micro_live', 'live_10', 'live_50', 'live_100', 'paused_drift', 'PAPER', undefined]) refuse(facts(), form({ to }), 422, /only back to paper or to retired/);
  // A reason, kept in the ledger, and never the password.
  for (const reason of [undefined, '', '  ', 'ok', 'x'.repeat(501), 7]) refuse(facts(), form({ reason }), 422, /Say why/);
  refuse(facts(), form({ reason: `because ${PW}` }), 422, /must not contain the password/);
  // Illegal moves, worked out from the facts and never from the form.
  refuse(facts({ status: 'paper' }), form(), 409, /not paused/); refuse(facts({ status: 'live_10' }), form(), 409, /not paused/);
  refuse(facts({ status: 'retired' }), form({ to: 'retired' }), 409, /final/); refuse(facts({ status: 'retired' }), form(), 409, /final/);
  refuse(facts({ fingerprintMatches: false }), form({ fingerprintMatches: true }), 409, /no longer matches/);
  refuse(facts({ datasetReadable: false }), form(), 409, /missing or cannot be read/); refuse(facts({ datasetReadable: null }), form(), 409, /could not be checked/);
  refuse(facts({ rerun: 'none' }), form({ rerun: 'agrees' }), 409, /has not re-run/); refuse(facts({ rerun: 'disagrees' }), form(), 409, /does not agree/);
});

// A small ledger: a slot locked into paper, paused by the drift alarm, then re-run by the validator.
async function world(o: { status?: string; rerun?: boolean | null; session?: boolean; checked?: Checked; lockFree?: boolean } = {}) {
  const store = new MemoryLedgerStore([]), l = new Ledger(store, () => NOW - 1000), TK = 't'.repeat(64);
  await l.append('prereg', 'autopilot', { trialKey: TK, hypothesis: 'h', source: 'factory', strategy: { id: 'dave_prev_range', fingerprint: 'fp' }, panel: 'csv:SPY:1h:split', tf: '1h', gateVersion: 'g', passBar: 'p' });
  await l.append('slot_locked', 'autopilot', { slotKey: SLOT, trialKey: TK, strategy: 'dave_prev_range', dataset: 'csv:SPY:1h:split', symbol: 'SPY', tf: '1h', assetClass: 'etf', inputs: { strategy: { id: 'dave_prev_range', fingerprint: 'fp' } }, inputHash: 'in', lockedAt: 1, gateVersion: 'g', role: 'primary', baseline: { n: 1, mu: 0, sigma: 1, p: 0.5, ddR95: 1 } });
  const status = o.status ?? 'paused_drift'; if (status !== 'paper') await l.append('slot_status', 'autopilot', { slotKey: SLOT, from: 'paper', to: status, reason: 'drift alarm: test', numbers: {} });
  if (o.rerun !== null) await l.append('validator_run', 'validator', { trialKey: TK, slotKey: SLOT, purpose: 'pause', level: 'L1', inputHash: 'in', resultHash: 'out', agrees: o.rerun ?? true, exact: true });
  const checks: string[] = [], locks = { taken: 0, released: 0 };
  const deps: SlotChangeDeps = {
    session: async () => o.session ?? true, adminPassword: PW,
    load: async () => { const entries = await store.read(); return { ok: true, entries, view: buildView(entries, 10000), now: NOW }; },
    open: async () => ({ store, lock: async () => { if (o.lockFree === false) return null; locks.taken++; return async () => { locks.released++; }; } }),
    check: async s => { checks.push(s.slotKey); return o.checked ?? { fingerprintMatches: true, datasetReadable: true }; },
  };
  return { store, deps, checks, locks };
}
const post = (body: unknown, headers: Record<string, string> = { origin: ORIGIN }, url = URL_) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const call = async (w: Awaited<ReturnType<typeof world>>, body: unknown, headers?: Record<string, string>, key = encodeURIComponent(SLOT)) => { const res = await changeSlot(post(body, headers), key, w.deps); return { status: res.status, json: await res.json() as any }; };

test('route: no session, another origin, an unknown slot, the wrong typed name or password, or an illegal move write nothing', async () => {
  const cases: [Parameters<typeof world>[0], unknown, Record<string, string> | undefined, number, RegExp][] = [
    [{ session: false }, form(), undefined, 401, /Log in first/],
    [{}, form(), { origin: 'https://elsewhere.test' }, 403, /dashboard itself/], [{}, form(), {}, 403, /dashboard itself/],
    [{}, form({ typed: 'dave_prev_range' }), undefined, 422, /Type the slot's name/],
    [{}, form({ password: 'nope' }), undefined, 401, /not the password/],
    [{}, form({ to: 'live_eligible' }), undefined, 422, /only back to paper or to retired/], [{}, form({ to: 'micro_live' }), undefined, 422, /only back to paper or to retired/],
    [{ status: 'paper' }, form(), undefined, 409, /not paused/], [{ status: 'retired' }, form({ to: 'retired' }), undefined, 409, /final/],
    [{ rerun: null }, form(), undefined, 409, /has not re-run/], [{ rerun: false }, form(), undefined, 409, /does not agree/],
    [{ checked: { fingerprintMatches: false, datasetReadable: true } }, form(), undefined, 409, /no longer matches/],
    [{ checked: { fingerprintMatches: true, datasetReadable: false } }, form(), undefined, 409, /missing or cannot be read/],
    [{ lockFree: false }, form(), undefined, 409, /run is in progress/],
  ];
  for (const [o, body, headers, status, re] of cases) {
    const w = await world(o), before = (await w.store.read()).length, r = await call(w, body, headers);
    assert.equal(r.status, status, `${re.source}: ${r.json.error}`); assert.match(r.json.error, re); assert.equal((await w.store.read()).length, before, `${re.source} wrote nothing`);
    assert.equal(w.locks.taken, w.locks.released, 'the run lock is always released');
  }
  const w = await world(), missing = await changeSlot(post(form({ typed: 'nope@x' })), 'nope%40x', w.deps); assert.equal(missing.status, 404);
  // A check that throws counts as failed, not as passed.
  const t = await world(); t.deps.check = async () => { throw new Error('fixtures unreadable'); };
  const r = await call(t, form()); assert.equal(r.status, 409); assert.match(r.json.error, /could not be checked/);
});

test('route: a good move back to paper and a good retire each append one slot_status entry by Jeremy, and the chain holds', async () => {
  let w = await world(), before = await w.store.read(), r = await call(w, form());
  assert.deepEqual([r.status, r.json.ok, r.json.from, r.json.to], [200, true, 'paused_drift', 'paper']); assert.deepEqual(w.checks, [SLOT], 'the strategy and data were checked');
  let after = await w.store.read(), e = after[after.length - 1];
  assert.equal(after.length, before.length + 1); assert.deepEqual([e.kind, e.actor, e.seq], ['slot_status', 'dashboard', r.json.seq]);
  assert.deepEqual(e.payload, { slotKey: SLOT, from: 'paused_drift', to: 'paper', reason: 'by hand: the market calmed down', numbers: {}, by: 'jeremy', rerunSeq: before[before.length - 1].seq });
  assert.ok(!JSON.stringify(e).includes(PW), 'the password is never written'); assert.equal(verifyChain(after).ok, true);
  const v = buildView(after, 10000).slots.get(SLOT)!; assert.equal(v.status, 'paper'); assert.equal(v.cusum, 0, 'the CUSUM starts again; the pause stays on the record'); assert.equal(v.driftPauses, 1);
  assert.equal(w.locks.taken, 1); assert.equal(w.locks.released, 1);
  // Back in paper, it cannot be moved back to paper again, and the next pause needs its own validator re-run.
  assert.equal((await call(w, form())).status, 409);

  for (const status of ['paper', 'paused_data', 'live_eligible', 'micro_live', 'live_100']) {
    w = await world({ status, rerun: null }); before = await w.store.read(); r = await call(w, form({ to: 'retired', reason: 'not worth the risk' }));
    assert.deepEqual([r.status, r.json.from, r.json.to], [200, status, 'retired'], status); assert.deepEqual(w.checks, [], 'a retire needs no strategy or data check');
    after = await w.store.read(); e = after[after.length - 1]; assert.equal(after.length, before.length + 1);
    assert.deepEqual([e.kind, e.payload.from, e.payload.to, e.payload.by, e.payload.reason], ['slot_status', status, 'retired', 'jeremy', 'by hand: not worth the risk']);
    assert.equal(buildView(after, 10000).slots.get(SLOT)!.status, 'retired'); assert.equal((await call(w, form({ to: 'retired' }))).status, 409, 'retired is final');
  }
});

test('route: if anything is appended between the read and the write, nothing is written', async () => {
  const w = await world(), load = w.deps.load;
  w.deps.load = async () => { const l = await load(); await new Ledger(w.store, () => NOW).append('halt', 'cli', { level: 'andon', by: 'cli', reason: 'meanwhile' }); return l; };
  const before = (await w.store.read()).length, r = await call(w, form());
  assert.equal(r.status, 409); assert.match(r.json.error, /ledger moved/); assert.equal((await w.store.read()).length, before + 1, 'only the halt'); assert.equal(w.locks.released, 1);
});

test('checks: the strategy fingerprint the run would compute against the lock, and the dataset in the registry; unknown is never a pass', () => {
  const root = resolve(web, '..'), fp = JSON.parse(readFileSync(join(root, 'packages/engine/fingerprints.json'), 'utf8')).strategies, id = Object.keys(fp)[0], ds = 'csv:SPY:1h:split', now = Date.UTC(2026, 10, 11);
  assert.deepEqual(checkAgainstRun(root, { strategy: id, dataset: ds, fingerprint: fp[id] }, now), { fingerprintMatches: true, datasetReadable: true });
  assert.equal(checkAgainstRun(root, { strategy: id, dataset: ds, fingerprint: 'f'.repeat(64) }, now).fingerprintMatches, false, 'the code changed after the lock');
  assert.equal(checkAgainstRun(root, { strategy: id, dataset: ds, fingerprint: '' }, now).fingerprintMatches, false);
  assert.equal(checkAgainstRun(root, { strategy: 'no_such_strategy', dataset: ds, fingerprint: fp[id] }, now).fingerprintMatches, false, 'gone from the registry');
  assert.equal(checkAgainstRun(root, { strategy: id, dataset: 'csv:NOPE:1d:raw', fingerprint: fp[id] }, now).datasetReadable, false, 'the dataset is missing');
  assert.deepEqual(checkAgainstRun(null, { strategy: id, dataset: ds, fingerprint: fp[id] }, now), { fingerprintMatches: null, datasetReadable: null }, 'no repository here: cannot be checked');
});

test('route file: the session, the password from the environment, the run lock, and no other way in', () => {
  const r = src('app/api/admin/slots/[slot]/route.ts'), c = src('app/api/admin/slots/change.ts');
  assert.match(r, /session: \(\) => isAdmin\(\)/); assert.match(r, /adminPassword: process\.env\.APEX_ADMIN_PASSWORD \|\| ''/); assert.match(r, /runLock\(\)|fileLock\(/);
  assert.match(r, /export async function POST/); assert.doesNotMatch(r, /export (async function|const) (GET|PUT|PATCH|DELETE)\b/);
  // The checks run in order, and the one write is a slot_status entry.
  const h = c.slice(c.indexOf('export async function changeSlot')), order = ['d.session()', "req.headers.get('origin')", 'd.load()', 'decideSlotChange({', 'o.lock()', "'slot_status'", 'o.store.append('].map(x => h.indexOf(x));
  assert.ok(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), `checks run in order: ${order}`);
  for (const s of [r, c]) { assert.equal((s.match(/\.append\(/g) ?? []).length, s === c ? 1 : 0); assert.doesNotMatch(s, /live_approval|live_stage|live_fill|setJSON|releaseCord|ledgerResume|broker|APEX_ALLOW_LIVE|APEX_SIGNOFF_KEY/); }
  // Nothing outside the dashboard's own route reaches it: not the terminal, MCP, the v1 API or the SDK.
  const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return /node_modules|^test$/.test(n) ? [] : statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mjs|js)$/.test(n) ? [p] : []; });
  for (const dir of ['../apps/cli/src', '../packages/mcp/src', '../packages/api/src', '../packages/sdk/src', 'lib/api', 'app/api/v1', 'app/api/mcp', 'app/api/telegram'])
    for (const f of walk(join(web, dir))) assert.doesNotMatch(readFileSync(f, 'utf8'), /admin\/slots|changeSlot|decideSlotChange|slotMove\(/, f);
});
