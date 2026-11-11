// /api/v1, driven through the same `serve` the route file uses, over a small ledger with real hashes. Covers the contract
// (every route answers in the shape the contract promises), who may call what, the limits, and the two writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { GATE_V1, loadConfig, makeEntry, type LedgerEntry, type LedgerKind } from '@apex/kernel';
import { buildView } from '@apex/kernel/view';
import { RATE, READ_SCOPES, ROUTES, ROUTE_IDS, SCOPES, pathParams, validate, verifyReceipt, type RouteDef, type RouteId, type Scope } from '@apex/sdk';
import { statusFrom } from '../lib/status';
import { HANDLERS } from '../lib/api/handlers';
import { serve, type Caller, type ServeDeps } from '../lib/api/serve';

const web = join(import.meta.dirname, '..'), T0 = 1_700_000_000_000, NOW = T0 + 3600e3, G = 'gate-v1', SLOT = 'alpha@csv:SPY:1h:split', key = (c: string) => c.repeat(64);
function chain(rows: [LedgerKind, object][]): LedgerEntry[] { const out: LedgerEntry[] = []; for (const [kind, payload] of rows) { const prev = out[out.length - 1]; out.push(makeEntry(prev ? { seq: prev.seq, hash: prev.hash } : null, T0 + out.length * 1000, kind, 'test', payload)); } return out; }
const prereg = (k: string, id: string, source: string): [LedgerKind, object] => ['prereg', { trialKey: key(k), gateVersion: G, source, panel: 'csv:SPY:1h:split', tf: '1h', hypothesis: `${id} has an edge`, passBar: 'all seven', strategy: { id, fingerprint: `fp-${id}` }, rules: { enter: 'x' } }];
const result = (k: string, id: string, status: string, passes: number): [LedgerKind, object] => ['trial_result', { trialKey: key(k), gateVersion: G, strategy: id, symbol: 'SPY', tf: '1h', panel: 'csv:SPY:1h:split', status, why: `${passes} of 7`, inputHash: 'ih', resultHash: 'rh',
  inputs: { strategy: { fingerprint: `fp-${id}` }, dataset: [{ id: 'csv:SPY:1h:split', version: 'v1' }], gateVersion: G, costModelVersion: 'cm1', engineFingerprint: 'eng', seed: 7 }, data: { first: T0 - 9e9, last: T0, rows: 4000 },
  checks: [1, 2, 3, 4, 5, 6, 7].map(n => ({ n, name: `check ${n}`, pass: n <= passes, why: 'because', value: n })), metrics: { trades: 60, ret: 0.2, hold: 0.1, sharpe: 0.9, holdSharpe: 0.7, dd: -0.1, holdDd: -0.2 }, readouts: { dsrN: 0.4, nTrials: 2, tStat: 2.1 } }];
const ENTRIES = chain([
  ['gate_version', { version: G, config: GATE_V1 }],
  ['data_version', { dataset: 'csv:SPY:1h:split', status: 'ok', tradable: true, rows: 4000, first: T0 - 9e9, last: T0, source: 'csv', version: 'v1' }],
  ['cost_model', { version: 'cm1', rows: [{ bucket: 'liquid', source: 'prior', bps: 2 }] }],
  prereg('a', 'alpha', 'factory'), result('a', 'alpha', 'passed_pending_validation', 7),
  prereg('b', 'beta', 'claim:c1'), result('b', 'beta', 'watch', 5),
  ['validator_run', { trialKey: key('a'), level: 'L1', purpose: 'promotion', inputHash: 'ih', resultHash: 'rh', agrees: true, exact: true, source: 'same' }],
  ['slot_locked', { slotKey: SLOT, trialKey: key('a'), strategy: 'alpha', dataset: 'csv:SPY:1h:split', symbol: 'SPY', tf: '1h', assetClass: 'equity', lockedAt: T0, inputHash: 'ih', gateVersion: G, role: 'primary', baseline: { n: 60, mu: 0.2, p: 0.5 }, inputs: { strategy: { fingerprint: 'fp-alpha' } } }],
  ['weights', { weights: { [SLOT]: 0.25 }, riskFractions: { [SLOT]: 0.01 }, method: 'equal' }],
  ['intent', { id: 'i1', slotKey: SLOT, symbol: 'SPY', side: 1, barT: T0, qty: 10, riskUsd: 50, stop: 95, rules: [] }],
  ['fill', { intent: 'i1', slotKey: SLOT, kind: 'entry', t: T0 + 1, price: 100, qty: 10, symbol: 'SPY', assetClass: 'equity', side: 1, stop: 95, fee: 1 }],
  ['fill', { intent: 'i1', slotKey: SLOT, kind: 'target', t: T0 + 2, price: 110, qty: 10, fee: 1 }],
  ['intent', { id: 'i2', slotKey: SLOT, symbol: 'SPY', side: 1, barT: T0 + 3, qty: 10, riskUsd: 50, stop: 105, rules: [] }],
  ['fill', { intent: 'i2', slotKey: SLOT, kind: 'entry', t: T0 + 4, price: 110, qty: 10, symbol: 'SPY', assetClass: 'equity', side: 1, stop: 105, fee: 1 }],
  ['intent_blocked', { id: 'i3', slotKey: SLOT, symbol: 'SPY', side: 1, barT: T0 + 5, rules: [{ id: 'R3', detail: 'one position a symbol' }] }],
  ['drift_reading', { slotKey: SLOT, n: 1, s: 0.3, alarms: [] }],
  ['slot_status', { slotKey: SLOT, from: 'paper', to: 'paused_manual', reason: 'looking at a fill' }],
  ['book_snapshot', { at: T0 + 6, equity: 10098, cash: 10097, peak: 10098, cursors: {} }],
  ['claim_check', { id: 'c1', contentHash: 'ch', sourceKind: 'transcript', chars: 900, verdict: 'no_edge', gateVersion: G, trialKeys: [key('b')], readings: [{ ruleSet: 1, strategy: 'beta', panel: 'csv:SPY:1h:split', proxy: false, status: 'watch', resultHash: 'rh', dsrInCheck: 0.3 }], untested: 0, flags: ['guaranteed'] }],
  ['anchor', { seq: 5, hash: 'x'.repeat(64) }],
  ['run', { id: '20231114T221320-full', mode: 'full', evaluated: 2, newTrials: 2, intents: 2, blocked: 1, fills: 3, errors: 0, waitingBudget: 0, problems: [] }],
]);
const CFG = loadConfig({}), RUN = '20231114T221320-full', PARAMS: Record<string, string> = { trialKey: key('a').slice(0, 16), key: SLOT, slotKey: SLOT, id: 'c1', seq: '5' };
const callerOf = (scopes: readonly Scope[], id = 'k1'): Caller => ({ id, scopes });

type World = { entries: LedgerEntry[]; keys: Record<string, Caller>; session: boolean; counts: Map<string, number>; halts: [string, string][]; cord: boolean; claims: any[]; claimAnswer: (req: any) => any; noLedger: boolean; memo: Map<string, string> };
const world = (over: Partial<World> = {}): World => ({ entries: ENTRIES, keys: { good: callerOf(SCOPES) }, session: false, counts: new Map(), halts: [], cord: false, claims: [], claimAnswer: () => ({ ok: false, status: 503, error: 'not set' }), noLedger: false, memo: new Map(), ...over });
function deps(w: World): ServeDeps {
  return { now: () => NOW,
    key: async h => w.keys[(h ?? '').replace(/^Bearer /, '')] ?? null, session: async () => w.session,
    count: async k => { const n = (w.counts.get(k) ?? 0) + 1; w.counts.set(k, n); return { n, resetSec: 42 }; },
    status: async () => statusFrom({ ledger: w.noLedger ? 'none' : 'file', entries: w.noLedger ? [] : w.entries, capital: CFG.paperCapital, cord: { on: w.cord, by: 'you', reason: 'pulled' }, killswitch: false, persistent: false, signedIn: w.session, authEnabled: true, aiEnabled: false, now: NOW }),
    ledger: async () => w.noLedger ? { ok: false, note: 'no ledger is connected' } : { ok: true, entries: w.entries, view: buildView(w.entries, CFG.paperCapital), cfg: CFG },
    readReport: async id => (id === RUN ? '# Run\n\nTwo pairs.' : null),
    claimCheck: async req => { w.claims.push(req); return w.claimAnswer(req); },
    halt: async (by, reason) => { const already = w.cord; w.cord = true; w.halts.push([by, reason]); return { already, ledger: already ? 'already' : 'recorded' }; },
    remember: { get: async k => w.memo.get(k) ?? null, set: async (k, v) => { w.memo.set(k, v); } } };
}
const urlOf = (id: RouteId, qs = '') => { let p: string = ROUTES[id].path; for (const n of pathParams(p)) p = p.replace(`{${n}}`, encodeURIComponent(id === 'report' && PARAMS.id === 'c1' ? RUN : PARAMS[n])); return `https://apex.test/api/v1${p}${qs}`; };
const BODIES: Partial<Record<RouteId, object>> = { halt: { reason: 'checking a fill' }, claimCheckStart: { text: 'Buy when the close is above the 55 day high.', extraction: { interpretations: [] } } };
async function call(w: World, id: RouteId, o: { key?: string; qs?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const r: RouteDef = ROUTES[id], body = r.method === 'POST' ? JSON.stringify(o.body ?? BODIES[id]) : undefined;
  const res = await serve(new Request(urlOf(id, o.qs), { method: r.method, headers: { ...(o.key ? { authorization: `Bearer ${o.key}` } : {}), ...o.headers }, body }), deps(w));
  const text = await res.text(); let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { /* markdown */ }
  return { res, json, text };
}
const RAN = { ok: true, step: 'run', seq: 99, result: { id: 'c9', status: 'done', verdict: 'no_edge', headline: 'No edge was found.', tries: { planned: 1, fresh: 1, leftThisWeek: 24, everAfter: 3 } } };

test('contract: every route has a handler, and each answer fits the shape the contract promises', async () => {
  assert.deepEqual(Object.keys(HANDLERS).sort(), [...ROUTE_IDS].sort());
  const w = world({ claimAnswer: () => RAN });
  for (const id of ROUTE_IDS) { const r: RouteDef = ROUTES[id], { res, json } = await call(w, id, { key: 'good' });
    assert.equal(res.status, r.status ?? 200, `${id}: ${JSON.stringify(json)}`); assert.deepEqual(validate(r.response, json), [], id);
    assert.equal(res.headers.get('x-apex-mode'), 'paper', id); assert.equal(res.headers.get('x-apex-trials'), '2', id); assert.equal(res.headers.get('content-type'), 'application/json', id);
    if (r.method === 'GET') assert.match(res.headers.get('etag') ?? '', /^"[\w-]{27}"$/, id); }
});

test('contract: the figures are the ledger\'s own, each with its sample and basis', async () => {
  const w = world(), get = async (id: RouteId, qs = '') => (await call(w, id, { key: 'good', qs })).json;
  const board = await get('board'); assert.deepEqual(board.items.map((e: any) => [e.strategy, e.status, e.checksPassed]), [['alpha', 'paused_manual', 7], ['beta', 'watch', 5]]);
  assert.deepEqual(board.items[1].metrics.sharpe, { value: 0.9, unit: 'ratio', n: 60, basis: 'in_sample', net: true, receipt: 7 });
  const pair = await get('pair'); assert.deepEqual(pair.benchmark.ret, { value: 0.1, unit: 'pct', n: 4000, basis: 'in_sample', net: false, receipt: 5 }, 'buy and hold is counted in bars and has no costs taken off');
  assert.deepEqual([pair.hypothesis, pair.preregSeq, pair.validator.length, pair.inputs.seed, pair.data.rows], ['alpha has an edge', 4, 1, 7, 4000]);
  const slot = await get('slot'); assert.deepEqual([slot.status, slot.weight, slot.forward.trades, slot.forward.wins, slot.position.side, slot.locks.length, slot.locks.some((l: any) => l.open)], ['paused_manual', 0.25, 1, 1, 'long', 4, false]);
  assert.deepEqual(slot.forward.pnl, { value: 98, unit: 'usd', n: 1, basis: 'forward', net: true });
  assert.deepEqual((await get('locks')).allowed, false);
  assert.deepEqual((await get('slotTrades')).items.map((t: any) => [t.side, t.pnl, t.reason, t.exitAt]), [['long', 98, 'target', new Date(T0 + 2).toISOString()]]);
  assert.deepEqual((await get('slotEvents')).items.map((e: any) => [e.from, e.to, e.why]), [['paper', 'paused_manual', 'looking at a fill']]);
  assert.deepEqual((await get('slotDrift')).items.map((d: any) => [d.n, d.s, d.threshold]), [[1, 0.3, GATE_V1.drift.threshold]]);
  const book = await get('book'); assert.deepEqual([book.equity.basis, book.equity.n, book.openPositions, book.closedTrades, book.costs.assumed], ['book', 1, 1, 1, 1]);
  assert.deepEqual((await get('positions')).items.map((p: any) => [p.slotKey, p.qty, p.riskUsd]), [[SLOT, 10, 50]]);
  assert.equal((await get('fills')).items.length, 3); assert.deepEqual((await get('intents', '?ok=false')).items.map((i: any) => i.rules[0].id), ['R3']); assert.equal((await get('intents', '?ok=true')).items.length, 2);
  assert.deepEqual((await get('queue')).items.map((q: any) => q.source).sort(), ['claim:c1', 'factory']);
  assert.deepEqual((await get('dataHealth')).items.map((d: any) => [d.dataset, d.status, d.receipt]), [['csv:SPY:1h:split', 'ok', 2]]);
  assert.deepEqual((await get('costs')).version, 'cm1'); assert.deepEqual((await get('funnel')).tried, 2);
  const claim = await get('claimCheck'); assert.deepEqual([claim.verdict, claim.trialsUsed, claim.interpretations[0].evaluation.strategy, claim.interpretations[0].dsrInCheck.unit, claim.flags], ['no_edge', 1, 'beta', 'prob', ['guaranteed']]);
  const rep = await get('report'); assert.equal(rep.markdown, '# Run\n\nTwo pairs.');
  const md = await call(w, 'report', { key: 'good', qs: '?format=md' }); assert.equal(md.text, '# Run\n\nTwo pairs.'); assert.match(md.res.headers.get('content-type')!, /^text\/markdown/);
  const st = await get('status'); assert.deepEqual([st.mode, st.halted, st.trials, st.slots, st.data, st.lastRun.id], ['paper', false, 2, 1, 'ok', '20231114T221320-full']);
});

test('auth: no key, an unknown key, a key without the scope and the right key, on every route', async () => {
  for (const id of ROUTE_IDS) { const r: RouteDef = ROUTES[id], other = SCOPES.filter(s => s !== r.scope);
    const w = world({ keys: { right: callerOf([r.scope]), wrong: callerOf(other) }, claimAnswer: () => RAN });
    const none = await call(w, id); assert.equal(none.res.status, 401, id); assert.equal(none.json.code, 'unauthorized'); assert.equal(none.res.headers.get('www-authenticate'), 'Bearer'); assert.deepEqual(validate('Problem', none.json), []);
    assert.equal(none.res.headers.get('content-type'), 'application/problem+json');
    const revoked = await call(w, id, { key: 'gone' }); assert.equal(revoked.res.status, 401, id);
    const wrong = await call(w, id, { key: 'wrong' }); assert.equal(wrong.res.status, 403, id); assert.equal(wrong.json.code, 'forbidden_scope'); assert.ok(wrong.json.detail.includes(r.scope));
    assert.equal(w.halts.length + w.claims.length, 0, `${id}: nothing ran for a caller who was refused`);
    assert.equal((await call(w, id, { key: 'right' })).res.status, r.status ?? 200, id); }
});

test('auth: the dashboard session reads from the dashboard itself, and never writes', async () => {
  const w = world({ session: true, keys: {} });
  assert.equal((await call(w, 'board')).res.status, 200); assert.equal((await call(w, 'board', { headers: { 'sec-fetch-site': 'same-origin' } })).res.status, 200);
  assert.equal((await call(w, 'board', { headers: { 'sec-fetch-site': 'cross-site' } })).res.status, 401, 'another site cannot read with the session');
  assert.equal((await call(w, 'halt')).res.status, 401); assert.equal((await call(w, 'claimCheckStart')).res.status, 401); assert.equal(w.halts.length + w.claims.length, 0);
  assert.equal((await call(w, 'board', { key: 'bad' })).res.status, 401, 'a bad key is refused even when a session is present');
  assert.equal(w.counts.size, 0, 'the session is not counted against a key limit');
});

test('limits: each key has its own count for reads, queue writes and halts', async () => {
  const w = world({ keys: { a: callerOf(SCOPES, 'ka'), b: callerOf(SCOPES, 'kb') }, claimAnswer: () => RAN });
  for (let i = 1; i <= RATE.read.limit; i++) { const r = await call(w, 'funnel', { key: 'a' }); if (i === 1 || i === RATE.read.limit) { assert.equal(r.res.status, 200); assert.equal(r.res.headers.get('ratelimit-remaining'), String(RATE.read.limit - i)); } }
  const over = await call(w, 'funnel', { key: 'a' }); assert.deepEqual([over.res.status, over.json.code, over.res.headers.get('retry-after'), over.res.headers.get('ratelimit-remaining')], [429, 'rate_limited', '42', '0']);
  assert.equal((await call(w, 'funnel', { key: 'b' })).res.status, 200, 'another key is not affected');
  assert.equal((await call(w, 'halt', { key: 'a' })).res.status, 200, 'a key that has used up its reads can still halt');
  for (let i = 1; i < RATE.halt.limit; i++) await call(w, 'halt', { key: 'a' });
  assert.equal((await call(w, 'halt', { key: 'a' })).res.status, 429); assert.equal(w.halts.length, RATE.halt.limit);
});

test('reads: paging, filters, ETag and bad query values', async () => {
  const w = world(), get = (id: RouteId, qs = '', headers = {}) => call(w, id, { key: 'good', qs, headers });
  const p1 = await get('ledger', '?limit=5'); assert.deepEqual(p1.json.items.map((e: any) => e.seq), [22, 21, 20, 19, 18]); assert.equal(p1.json.next, 'o5');
  const p2 = await get('ledger', `?limit=5&cursor=${p1.json.next}`); assert.deepEqual(p2.json.items.map((e: any) => e.seq), [17, 16, 15, 14, 13]);
  const all: number[] = []; for (let c: string | null = '', n = 0; c !== null && n < 20; n++) { const p: any = (await get('ledger', `?limit=7${c ? `&cursor=${c}` : ''}`)).json; all.push(...p.items.map((e: any) => e.seq)); c = p.next; }
  assert.deepEqual(all, ENTRIES.map(e => e.seq).reverse(), 'the pages cover every entry once');
  assert.deepEqual((await get('ledger', '?kind=fill')).json.items.map((e: any) => e.seq), [15, 13, 12]); assert.equal((await get('ledger', `?slot=${encodeURIComponent(SLOT)}&kind=intent`)).json.items.length, 2);
  assert.deepEqual((await get('ledger', `?from=${new Date(T0 + 20000).toISOString()}`)).json.items.map((e: any) => e.seq), [22, 21]); assert.deepEqual((await get('ledger', `?to=${new Date(T0).toISOString()}`)).json.items.map((e: any) => e.seq), [1]);
  for (const qs of ['?limit=0', '?limit=201', '?limit=abc', '?limit=1.5', '?cursor=zzz', '?cursor=o-1', '?from=soon']) { const r = await get('ledger', qs); assert.deepEqual([r.res.status, r.json.code], [422, 'validation'], qs); }
  assert.equal((await get('intents', '?ok=maybe')).res.status, 422); assert.equal((await get('report', '?format=pdf')).res.status, 422);
  const first = await get('board'), etag = first.res.headers.get('etag')!; const again = await get('board', '', { 'if-none-match': etag });
  assert.deepEqual([again.res.status, again.text, again.res.headers.get('etag')], [304, '', etag]); assert.equal((await get('board', '', { 'if-none-match': '"other"' })).res.status, 200);
  for (const [id, over] of [['pair', { trialKey: 'zzzzzzzzzz' }], ['slot', { key: 'nope' }], ['slotTrades', { key: 'nope' }], ['locks', { slotKey: 'nope' }], ['report', { id: 'nope' }], ['ledgerEntry', { seq: '999' }], ['claimCheck', { id: 'nope' }]] as [RouteId, Record<string, string>][]) {
    const saved = { ...PARAMS }; Object.assign(PARAMS, over); const r = await get(id); Object.assign(PARAMS, saved); assert.deepEqual([r.res.status, r.json.code], [404, 'not_found'], id); assert.deepEqual(validate('Problem', r.json), []); }
  const saved = PARAMS.seq; PARAMS.seq = 'abc'; assert.equal((await get('ledgerEntry')).res.status, 422); PARAMS.seq = saved;
  const miss = await serve(new Request('https://apex.test/api/v1/orders', { method: 'POST', headers: { authorization: 'Bearer good' }, body: '{}' }), deps(w)); assert.equal(miss.status, 404, 'there is no such route');
  assert.equal((await serve(new Request('https://apex.test/api/v1/halt', { method: 'DELETE', headers: { authorization: 'Bearer good' } }), deps(w))).status, 404, 'a halt cannot be released through v1');
});

test('ledger: an entry can be checked by the caller, and a changed ledger is reported', async () => {
  const w = world(), e = (await call(w, 'ledgerEntry', { key: 'good' })).json;
  assert.deepEqual(await verifyReceipt(e, e.payload), { ok: true, why: null }, 'the receipt recomputes on the client from what the API sent');
  assert.equal((await verifyReceipt(e, { ...e.payload, status: 'passed' })).ok, false);
  const head = (await call(w, 'ledgerHead', { key: 'good' })).json; assert.deepEqual([head.seq, head.hash, head.anchor.seq], [22, ENTRIES[21].hash, 5]);
  assert.deepEqual((await call(w, 'ledgerVerify', { key: 'good' })).json, { ok: true, from: 1, to: 22, checked: 22, badSeq: null, why: null });
  assert.deepEqual((await call(w, 'ledgerVerify', { key: 'good', qs: '?from=10&to=12' })).json, { ok: true, from: 10, to: 12, checked: 3, badSeq: null, why: null });
  const bad = ENTRIES.map(x => (x.seq === 11 ? { ...x, payload: { ...x.payload, price: 1 } } : x)), wb = world({ entries: bad });
  const v = (await call(wb, 'ledgerVerify', { key: 'good' })).json; assert.deepEqual([v.ok, v.badSeq], [false, 11]); assert.match(v.why, /payload was changed/);
  assert.equal((await call(wb, 'ledgerVerify', { key: 'good', qs: '?from=12&to=20' })).json.ok, true, 'a range that does not hold the changed entry still checks');
  for (const qs of ['?from=5&to=4', '?from=1&to=5001', '?from=0']) assert.equal((await call(w, 'ledgerVerify', { key: 'good', qs })).res.status, 422, qs);
  assert.deepEqual((await call(w, 'ledgerVerify', { key: 'good', qs: '?from=23&to=30' })).res.status, 200);
  assert.equal((await call(w, 'ledgerVerify', { key: 'good', qs: '?from=40&to=50' })).res.status, 404);
});

test('no ledger: status says so, a halt still works, and every other route says it cannot answer', async () => {
  const w = world({ noLedger: true });
  const st = await call(w, 'status', { key: 'good' }); assert.deepEqual([st.res.status, st.json.ledger, st.json.trials, st.res.headers.get('x-apex-trials')], [200, 'none', null, null], 'unknown is not zero');
  assert.deepEqual(validate('Status', st.json), []);
  assert.equal((await call(w, 'halt', { key: 'good' })).res.status, 200); assert.equal(w.halts.length, 1);
  for (const id of ROUTE_IDS.filter(i => i !== 'status' && i !== 'halt')) { const r = await call(w, id, { key: 'good' }); assert.deepEqual([r.res.status, r.json.code], [503, 'unavailable'], id); }
});

test('halt: needs a reason, records who pulled it, and is safe to repeat', async () => {
  const w = world({ keys: { h: callerOf(['halt'], 'kh') } });
  for (const body of [{}, { reason: 'x' }, { reason: 5 }, 'halt']) assert.equal((await call(w, 'halt', { key: 'h', body })).res.status, 422, JSON.stringify(body));
  assert.equal(w.halts.length, 0); w.counts.clear();
  const bad = await serve(new Request(urlOf('halt'), { method: 'POST', headers: { authorization: 'Bearer h' }, body: '{not json' }), deps(w)); assert.equal(bad.status, 422); assert.equal(w.halts.length, 0);
  assert.deepEqual((await call(w, 'halt', { key: 'h' })).json, { halted: true, already: false, ledger: 'recorded' }); assert.deepEqual(w.halts, [['api:kh', 'checking a fill']]);
  assert.deepEqual((await call(w, 'halt', { key: 'h' })).json, { halted: true, already: true, ledger: 'already' });
  assert.equal((await call(w, 'status', { key: 'h' })).res.status, 403, 'a halt-only key can do nothing else');
});

test('claim check: refused while halted, counted once for an idempotency key, and honest about the budget', async () => {
  const body = { text: 'Buy when the close is above the 55 day high.', extraction: { interpretations: [] }, idempotencyKey: 'abc' };
  const halted = world({ cord: true, claimAnswer: () => RAN }), h = await call(halted, 'claimCheckStart', { key: 'good', body }); assert.deepEqual([h.res.status, h.json.code, halted.claims.length], [409, 'halted', 0]);
  assert.equal((await call(halted, 'board', { key: 'good' })).res.status, 200, 'reads still work while halted');
  const w = world({ claimAnswer: () => ({ ...RAN, result: { ...RAN.result, id: 'c1' } }) });
  const first = await call(w, 'claimCheckStart', { key: 'good', body }); assert.deepEqual([first.res.status, first.json], [202, { id: 'c1', status: 'done', verdict: 'no_edge', headline: 'No edge was found.', trialsUsed: 1, receipt: 99, repeated: false }]);
  assert.deepEqual(w.claims, [{ text: body.text, kind: 'transcript', extraction: body.extraction, run: true }], 'with an extraction sent, the model is not called');
  const second = await call(w, 'claimCheckStart', { key: 'good', body }); assert.deepEqual([second.res.status, second.json.id, second.json.repeated, second.json.trialsUsed, w.claims.length], [202, 'c1', true, 0, 1]);
  const planned = world({ claimAnswer: req => (req.run ? RAN : { ok: true, step: 'plan', plan: {}, extraction: { interpretations: [1] }, extractionErrors: [] }) });
  await call(planned, 'claimCheckStart', { key: 'good', body: { text: body.text } }); assert.deepEqual(planned.claims.map(c => [c.run, c.extraction]), [[false, undefined], [true, { interpretations: [1] }]], 'without one, the rules are extracted first and then run');
  const unread = world({ claimAnswer: () => ({ ok: true, step: 'plan', plan: {}, extraction: null, extractionErrors: ['no rule found'] }) }), u = await call(unread, 'claimCheckStart', { key: 'good', body: { text: body.text } });
  assert.deepEqual([u.res.status, u.json.code, unread.claims.length], [422, 'validation', 1]); assert.match(u.json.detail, /no rule found/);
  const cases: [any, number, string][] = [[{ ok: false, status: 422, error: 'Not checked: too short.' }, 422, 'validation'], [{ ok: false, status: 409, error: 'A run is in progress.' }, 409, 'busy'], [{ ok: false, status: 503, error: 'No ledger.' }, 503, 'unavailable'],
    [{ ...RAN, result: { ...RAN.result, status: 'waiting_budget', headline: 'The weekly budget is used up.' } }, 409, 'budget']];
  for (const [answer, status, code] of cases) { const r = await call(world({ claimAnswer: () => answer }), 'claimCheckStart', { key: 'good', body }); assert.deepEqual([r.res.status, r.json.code], [status, code]); assert.deepEqual(validate('Problem', r.json), []); }
  for (const b of [{}, { text: 5 }, { text: 'x', kind: 'video' }, { text: 'x', idempotencyKey: 'k'.repeat(101) }]) assert.equal((await call(world(), 'claimCheckStart', { key: 'good', body: b })).res.status, 422);
});

test('a handler that throws answers with a problem and leaks nothing', async () => {
  const w = world(), d = deps(w); d.ledger = async () => { throw new Error('connection string postgres://user:hunter2@db'); };
  const res = await serve(new Request(urlOf('board'), { headers: { authorization: 'Bearer good' } }), d), json = await res.json();
  assert.deepEqual([res.status, json.code], [503, 'unavailable']); assert.doesNotMatch(JSON.stringify(json), /hunter2|postgres/);
});

// ---- the route inventory (docs/design/02 s8) ----
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : n === 'route.ts' ? [p] : []; });
test('inventory: every HTTP route is accounted for, and none outside the dashboard\'s own list can move money or open a lock', () => {
  const api = join(web, 'app/api'), files = walk(api).map(f => ({ name: '/' + relative(api, f).replace(/\/route\.ts$/, ''), src: readFileSync(f, 'utf8') }));
  // Session-only dashboard routes whose names hold a guarded word. Each needs the signed-in session; none is reachable with an API key.
  const SESSION_ONLY = ['/resume', '/admin/keys', '/admin/keys/[id]', '/admin/live/[key]/approve', '/killswitch', '/decisions', '/proposals'];
  const guarded = /order|withdraw|transfer|pay|approve|resume|release|live|signoff|key|decision|proposal|kill/i;
  for (const f of files) if (guarded.test(f.name)) { assert.ok(SESSION_ONLY.includes(f.name), `${f.name} has a guarded word in its name and is not on the session-only list`); assert.match(f.src, /isAdmin\(\)/, `${f.name} checks the session`); }
  // Every route that changes something says how the caller is checked.
  // The routes below take a call with no session. Each is listed with what it checks instead, and the test holds it to that.
  const OPEN_BY_DESIGN: Record<string, RegExp> = { '/login': /APEX_ADMIN_PASSWORD/,                 // the sign-in itself: it checks the password
    '/telegram': /TELEGRAM_WEBHOOK_SECRET/,                                                             // Telegram calls it: it checks the webhook secret
    '/risk': /guard\(\)/, '/builder': /guard\(\)/,
    '/share': /NextResponse\.redirect\(to, 303\)/,
    '/automations': /if \(on && !\(await isAdmin\(\)\)\)/ };                                        // a job's switch: off is open like Halt (it only stops something), on checks the session                                                // the share target's landing: it writes nothing and only sends the browser to New claim check                                                    // model chats that change nothing but their own notes: held by the daily AI budget
  for (const f of files) { if (!/export (async function|const) (POST|PUT|PATCH|DELETE)\b/.test(f.src)) continue;
    if (OPEN_BY_DESIGN[f.name]) { assert.match(f.src, OPEN_BY_DESIGN[f.name], f.name); continue; }
    assert.match(f.src, /isAdmin\(\)|ingestOk\(|CRON_SECRET|cronOk\(|serve\(req, deps\)|await deps\.key\(auth\)/, `${f.name} changes something and names its check`); }
  // v1 is one catch-all file. It and everything it serves stay clear of the broker and of the session-only routes.
  assert.deepEqual(files.filter(f => f.name.startsWith('/v1')).map(f => f.name), ['/v1/[...path]']);
  for (const p of ['app/api/v1/[...path]/route.ts', 'app/api/mcp/route.ts', 'lib/api/deps.ts', 'lib/api/serve.ts', '../packages/mcp/src/server.ts', '../packages/api/src/handlers.ts', '../packages/api/src/queries.ts', '../packages/api/src/status.ts']) { const src = readFileSync(join(web, p), 'utf8');
    assert.doesNotMatch(src, /autopilot\/(src\/)?broker|app\/api\/(admin|resume|killswitch|live)|ledgerResume|releaseCord|createKey|revokeKey|setJSON\('killswitch'/, `${p} imports nothing that trades, resumes or makes keys`); }
  // The handlers and the queries under them live in packages/api so the terminal can use the very same ones. They take what they are handed.
  for (const f of ['handlers', 'queries', 'status']) { assert.doesNotMatch(readFileSync(join(web, '../packages/api/src', `${f}.ts`), 'utf8'), /from '(\.\.\/|@\/|next\/)|node:fs|node:child_process|process\.env|\bfetch\(/, `packages/api/src/${f}.ts reaches the outside only through what it is handed`);
    assert.match(readFileSync(join(web, f === 'handlers' ? 'lib/api/handlers.ts' : `lib/${f}.ts`), 'utf8'), new RegExp(`^export \\* from '@apex/api/${f}';\\s*$`, 'm'), `web/lib ${f} is the shared one`); }
  // The MCP route makes every tool call through `serve` with the caller's own key, and has no other way to reach Apex.
  const mcp = readFileSync(join(web, 'app/api/mcp/route.ts'), 'utf8'); assert.match(mcp, /serve\(new Request\(url, init\), deps\)/); assert.doesNotMatch(mcp, /readLedger|ledgerHalt|pullCord|claimCheck\(|isAdmin|@\/lib\/(store|andon|ledger|auth)/, 'the MCP route touches nothing directly');
  assert.deepEqual(READ_SCOPES.filter(s => !s.startsWith('read:')), []);
});

// ---- keys ----
test('keys: shown once, stored as a hash, held to their scopes, and dead once revoked', async () => {
  delete process.env.KV_REST_API_URL; delete process.env.UPSTASH_REDIS_REST_URL;
  const { createKey, verifyKey, revokeKey, listKeys, keysUsable, cleanScopes } = await import('../lib/api/keys'), { getJSON } = await import('../lib/store');
  const env = { NODE_ENV: 'production', APEX_API_KEYS_PEPPER: 'p'.repeat(24) } as NodeJS.ProcessEnv, bearer = (k: string) => `Bearer ${k}`;
  assert.equal(keysUsable({ NODE_ENV: 'production' } as NodeJS.ProcessEnv), false, 'in production, no pepper means no keys');
  assert.equal(keysUsable({ NODE_ENV: 'production', APEX_API_KEYS_PEPPER: 'short' } as NodeJS.ProcessEnv), false); assert.equal(keysUsable({ NODE_ENV: 'development' } as NodeJS.ProcessEnv), true); assert.equal(keysUsable(env), true);
  const refused = await createKey('mcp', ['read:status'], { NODE_ENV: 'production' } as NodeJS.ProcessEnv); assert.ok(!refused.ok && /PEPPER/.test(refused.error));
  for (const [name, scopes] of [['', ['read:status']], ['mcp', []], ['mcp', ['approve']], ['mcp', ['read:status', 'resume']], ['mcp', 'read:status'], ['mcp', ['live']]] as [string, unknown][]) assert.equal((await createKey(name, scopes, env)).ok, false, JSON.stringify([name, scopes]));
  assert.deepEqual(cleanScopes(['halt', 'read:status', 'halt']), ['read:status', 'halt']);
  const made = await createKey('  the   mcp server ', ['queue:claims', 'read:status'], env, 1000); assert.ok(made.ok);
  assert.match(made.key, /^apx_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/); assert.deepEqual([made.info.name, made.info.scopes, made.info.revoked], ['the mcp server', ['read:status', 'queue:claims'], null]);
  const stored = JSON.stringify(await getJSON('apikeys', [])), secret = made.key.split('_').slice(2).join('_');
  assert.ok(!stored.includes(secret), 'the secret is not in the store'); assert.ok(!JSON.stringify(await listKeys()).includes('hash'), 'the list never carries the hash');
  const who = await verifyKey(bearer(made.key), env, 2000); assert.deepEqual([who?.id, who?.scopes], [made.info.id, ['read:status', 'queue:claims']]);
  assert.equal((await listKeys())[0].lastUsed, 2000);
  const flip = made.key.slice(0, -1) + (made.key.endsWith('A') ? 'B' : 'A');
  for (const h of [null, '', made.key, `Basic ${made.key}`, bearer(flip), bearer(`apx_${'0'.repeat(12)}_${secret}`), bearer('apx_short_x'), bearer(made.key + ' extra')]) assert.equal(await verifyKey(h, env), null, String(h).slice(0, 20));
  assert.equal(await verifyKey(bearer(made.key), { ...env, APEX_API_KEYS_PEPPER: 'q'.repeat(24) }), null, 'a changed pepper retires every key');
  assert.equal(await verifyKey(bearer(made.key), { NODE_ENV: 'production' } as NodeJS.ProcessEnv), null);
  assert.equal(await revokeKey('nope'), false); assert.equal(await revokeKey(made.info.id, 3000), true);
  assert.equal(await verifyKey(bearer(made.key), env), null, 'a revoked key stops at once'); assert.equal((await listKeys())[0].revoked, 3000, 'and stays in the list, marked');
  const { incr } = await import('../lib/store'); assert.deepEqual([(await incr('t:rl', 60)).n, (await incr('t:rl', 60)).n], [1, 2]); assert.equal((await incr('t:other', 60)).n, 1);
});
