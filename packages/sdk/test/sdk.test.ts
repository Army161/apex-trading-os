// The v1 contract and the client built on it. The contract is the one list of routes, so these tests hold the OpenAPI file,
// the schemas, the safety rules on route names and the receipt maths to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson as kernelCanonical } from '@apex/kernel/canonical';
import { Ledger, MemoryLedgerStore } from '@apex/kernel';
import { ApexApiError, ApexClient, PROBLEMS, RATE, ROUTES, ROUTE_IDS, SCHEMAS, SCOPES, canonicalJson, matchRoute, openapi, openapiYaml, pathParams, routeClass, toYaml, validate, verifyReceipt, type Receipt, type RouteDef } from '../src/index';

const route = (id: string): RouteDef => ROUTES[id as keyof typeof ROUTES];

test('openapi.yaml is exactly what the contract produces', () => {
  const file = readFileSync(join(import.meta.dirname, '../../../docs/design/openapi.yaml'), 'utf8');
  assert.equal(file, openapiYaml(), 'run `npm run openapi` after changing the contract');
  const doc = openapi() as any, ops = Object.values(doc.paths).flatMap((p: any) => Object.values(p)) as any[];
  assert.deepEqual(ops.map(o => o.operationId).sort(), [...ROUTE_IDS].sort(), 'every route is in the document, and nothing else is');
  for (const o of ops) assert.equal(o.security[0].apiKey.length, 1, `${o.operationId} names its one scope`);
});

test('contract: every schema reference resolves, and every route names a real scope and shape', () => {
  const refs: string[] = []; JSON.stringify(openapi(), (k, v) => { if (k === '$ref') refs.push(String(v)); return v; });
  const doc = openapi() as any;
  for (const r of refs) { const [, , group, name] = r.split('/'); assert.ok(doc.components[group]?.[name], `${r} exists`); }
  for (const id of ROUTE_IDS) { const r = route(id);
    assert.ok(SCOPES.includes(r.scope), `${id}: scope`); assert.ok(SCHEMAS[r.response], `${id}: response schema`); if (r.body) assert.ok(SCHEMAS[r.body], `${id}: body schema`);
    assert.ok(r.path.startsWith('/') && r.summary.endsWith('.'), id); assert.equal(RATE[routeClass(r)].limit > 0, true); }
  assert.equal(new Set(ROUTE_IDS.map(id => `${route(id).method} ${route(id).path}`)).size, ROUTE_IDS.length, 'no two routes share a method and path');
});

test('safety: no route, scope or path can trade, approve, resume or change a limit', () => {
  const banned = /order|withdraw|transfer|pay|approve|resume|release|limit|live|signoff|key/i;
  for (const s of SCOPES) assert.doesNotMatch(s, banned, s);
  for (const id of ROUTE_IDS) { const r = route(id); assert.doesNotMatch(id, /order|withdraw|transfer|pay|approve|resume|release|signoff/i, id); assert.doesNotMatch(r.path, /order|withdraw|transfer|pay|approve|resume|release|limit|live|signoff|admin/i, r.path); }
  const writes = ROUTE_IDS.filter(id => route(id).method !== 'GET').map(id => `${route(id).method} ${route(id).path} ${route(id).scope}`);
  assert.deepEqual(writes, ['POST /claim-checks queue:claims', 'POST /halt halt'], 'the only writes are a claim check and a halt');
  assert.equal(ROUTE_IDS.filter(id => !['GET', 'POST'].includes(route(id).method)).length, 0, 'nothing is changed or deleted through v1');
});

test('a Metric is never a bare number: n and basis are required', () => {
  const ok = { value: 0.1, unit: 'pct', n: 60, basis: 'in_sample', net: true };
  assert.deepEqual(validate('Metric', ok), []);
  for (const k of ['n', 'basis', 'unit', 'net', 'value']) { const m: any = { ...ok }; delete m[k]; assert.ok(validate('Metric', m).some(e => e.includes(`.${k}: missing`)), k); }
  assert.ok(validate('Metric', { ...ok, basis: 'backtest' }).length > 0); assert.ok(validate('Metric', { ...ok, n: 1.5 }).length > 0); assert.ok(validate('Metric', 0.1).length > 0);
  // No response schema holds a plain number under a performance name: those fields are Metrics.
  for (const [name, s] of Object.entries(SCHEMAS)) JSON.stringify(s, (k, v) => { if (['ret', 'sharpe', 'maxDrawdown', 'dsr', 'equity', 'change', 'drawdown', 'avgR', 'dsrInCheck'].includes(k) && v && typeof v === 'object') assert.ok(JSON.stringify(v).includes('schemas/Metric'), `${name}.${k} is a Metric`); return v; });
});

test('validate: types, enums, times, nulls and nested paths', () => {
  assert.deepEqual(validate('Receipt', { seq: 1, kind: 'run', ts: '2026-11-11T00:00:00.000Z', actor: 'a', payloadHash: 'p', prevHash: 'q', hash: 'h' }), []);
  assert.match(validate('Receipt', { seq: 1, kind: 'run', ts: 'yesterday', actor: 'a', payloadHash: 'p', prevHash: 'q', hash: 'h' })[0], /\$\.ts: not an RFC 3339/);
  assert.match(validate('EvaluationPage', { items: [{}], next: null })[0], /\$\.items\[0\]\./);
  assert.deepEqual(validate('HaltBody', { reason: 'checking a fill' }), []); assert.ok(validate('HaltBody', { reason: 'x' }).length > 0); assert.ok(validate('HaltBody', {}).length > 0);
  assert.ok(validate('ClaimCheckBody', { text: 5 }).length > 0); assert.deepEqual(validate('ClaimCheckBody', { text: 'a rule' }), []);
  assert.match(validate('Nope', 1)[0], /no schema named/);
});

test('matchRoute: a fixed segment wins over a parameter, and keys are decoded', () => {
  assert.deepEqual(matchRoute('GET', '/ledger/head'), { id: 'ledgerHead', params: {} });
  assert.deepEqual(matchRoute('GET', '/ledger/verify'), { id: 'ledgerVerify', params: {} });
  assert.deepEqual(matchRoute('GET', '/ledger/12'), { id: 'ledgerEntry', params: { seq: '12' } });
  assert.deepEqual(matchRoute('GET', `/slots/${encodeURIComponent('alpha@csv:SPY:1h:split')}/trades`), { id: 'slotTrades', params: { key: 'alpha@csv:SPY:1h:split' } });
  assert.equal(matchRoute('POST', '/board'), null); assert.equal(matchRoute('DELETE', '/halt'), null); assert.equal(matchRoute('GET', '/halt'), null); assert.equal(matchRoute('GET', '/slots/%E0%A4%A/trades'), null);
  assert.equal(matchRoute('GET', '/admin/keys'), null); assert.deepEqual(pathParams('/slots/{key}/trades'), ['key']);
});

test('toYaml: strings that could be read as something else are quoted', () => {
  assert.equal(toYaml({ a: 'yes', b: '200', c: 'plain', d: 3, e: true, f: null, g: [], h: {}, 'x-y': ['1', 2], '200': { k: 'a: b' } }),
    '"200":\n  k: "a: b"\na: "yes"\nb: "200"\nc: plain\nd: 3\ne: true\nf: null\ng: []\nh: {}\nx-y:\n  - "1"\n  - 2\n');
  assert.equal(toYaml([{ a: 1, b: [2] }]), '- a: 1\n  b:\n    - 2\n');
});

test('verifyReceipt: recomputes a real ledger entry, and catches a changed payload, field or order', async () => {
  const store = new MemoryLedgerStore(), ledger = new Ledger(store, () => 1_700_000_000_123);
  await ledger.append('halt', 'cli', { level: 'andon', by: 'you', reason: 'checking', n: 0.1 + 0.2, nested: { b: [1, 2.5, null], a: 'é' } });
  await ledger.append('resume', 'cli', { level: 'andon', by: 'you' });
  const [a, b] = await store.read(), rc = (e: typeof a): Receipt => ({ seq: e.seq, kind: e.kind, ts: new Date(e.ts).toISOString(), actor: e.actor, payloadHash: e.payloadHash, prevHash: e.prevHash, hash: e.hash });
  for (const v of [a.payload, { z: 1, a: [0.1 + 0.2, 1e21, -0, 12345678901234567890], s: 'q"\n' }, null, 'x', 3]) assert.equal(canonicalJson(v), kernelCanonical(v), 'the client and the ledger write the same canonical JSON');
  assert.deepEqual(await verifyReceipt(rc(a), a.payload), { ok: true, why: null });
  assert.deepEqual(await verifyReceipt(rc(b), b.payload, rc(a)), { ok: true, why: null });
  assert.match((await verifyReceipt(rc(a), { ...a.payload, reason: 'changed' })).why!, /payload/);
  assert.match((await verifyReceipt({ ...rc(a), actor: 'someone' }, a.payload)).why!, /entry hash/);
  assert.match((await verifyReceipt(rc(b), b.payload, { seq: 5, hash: a.hash })).why!, /does not follow/);
  assert.equal((await verifyReceipt({ ...rc(a), ts: 'never' })).ok, false);
});

test('client: builds the call from the contract and turns a problem into an error', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const answer = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
  let next: Response[] = [];
  const c = new ApexClient({ baseUrl: 'https://apex.example/api/v1/', apiKey: ['apx', 'id', 'secret'].join('_'), fetch: (async (url: string, init: RequestInit) => { calls.push({ url, init }); return next.shift()!; }) as typeof fetch });
  next = [answer(200, { items: [], next: null })];
  await c.call('slotTrades', { params: { key: 'alpha@csv:SPY:1h:split' }, query: { limit: 10, cursor: undefined } });
  assert.equal(calls[0].url, 'https://apex.example/api/v1/slots/alpha%40csv%3ASPY%3A1h%3Asplit/trades?limit=10');
  assert.equal((calls[0].init.headers as any).authorization, 'Bearer apx_id_secret'); assert.equal(calls[0].init.method, 'GET'); assert.equal(calls[0].init.body, undefined);
  next = [answer(200, { halted: true, already: false, ledger: 'recorded' })];
  await c.call('halt', { body: { reason: 'checking a fill' } }); assert.equal(calls[1].init.method, 'POST'); assert.equal(calls[1].init.body, '{"reason":"checking a fill"}');
  next = [answer(429, { type: 't', title: 'Too many calls', status: 429, code: 'rate_limited' }, { 'retry-after': '17' })];
  await assert.rejects(c.call('status'), (e: unknown) => e instanceof ApexApiError && e.code === 'rate_limited' && e.status === 429 && e.retryAfterSec === 17);
  next = [new Response('<html>', { status: 502 })];
  await assert.rejects(c.call('status'), (e: unknown) => e instanceof ApexApiError && e.code === 'unavailable' && e.status === 502);
  await assert.rejects(c.call('slot'), /slot needs key/);
  next = [answer(200, { items: [1, 2], next: 'o2' }), answer(200, { items: [3], next: null })]; const seen: number[] = [], cursors: (string | undefined)[] = [];
  for await (const x of c.paginate<number>(async cur => { cursors.push(cur); return (await (next.shift()!).json()) as any; })) seen.push(x);
  assert.deepEqual([seen, cursors], [[1, 2, 3], [undefined, 'o2']]);
  next = [answer(404, { type: 't', title: 'Not found', status: 404, code: 'not_found' }), answer(200, { id: 'c1' })];
  assert.deepEqual(await c.waitForClaimCheck('c1', { everyMs: 1 }), { id: 'c1' } as any);
  assert.equal(Object.keys(PROBLEMS).length, 9);
});
