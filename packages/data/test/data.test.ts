import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GATE_V1 } from '@apex/kernel/gate';
import { checkData, parseCsv, toCsv, versionOf, mergeBars, closedOnly, loadRegistry, loadCsvDataset, massiveAdapter, alpacaAdapter, termsOk, pullDataset, TF_MS, type Bar, type DatasetSpec } from '../src/index';

const ROOT = join(__dirname, '../../..'), TH = GATE_V1.firewall, DAY = 864e5;
const spec = (o: Partial<DatasetSpec> = {}): DatasetSpec => ({ id: 'test:X:1d:split', source: 'test', symbol: 'X', tf: '1d', assetClass: 'etf', adj: 'split', session: 'rth', calendar: 'CRYPTO', panels: [], costBucket: 'liquid', ...o });
function daily(n = 400, seed = 5): Bar[] { let s = seed, c = 100; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; const out: Bar[] = [];
  for (let i = 0; i < n; i++) { const o = c; c = o * (1 + (r() - 0.5) * 0.02); out.push({ t: Date.UTC(2024, 0, 1) + i * DAY, o, h: Math.max(o, c) * 1.002, l: Math.min(o, c) * 0.998, c, v: 1000 + Math.floor(r() * 500) }); } return out; }
const now = (b: Bar[]) => b[b.length - 1].t + DAY + 1000;
const st = (h: ReturnType<typeof checkData>, id: string) => h.checks.find(c => c.id === id)!.status;
const check = (b: Bar[], o: any = {}, s: Partial<DatasetSpec> = {}) => checkData(b, spec(s), versionOf(b), TH, { now: now(b), ...o });

test('clean data is ok and tradable', () => { const h = check(daily()); assert.equal(h.status, 'ok'); assert.equal(h.tradable, true); assert.equal(h.provenance.source, 'test'); });

test('schema: a malformed recent bar blocks, an old one warns', () => {
  const a = daily(); a[a.length - 3] = { ...a[a.length - 3], h: a[a.length - 3].l * 0.9 }; assert.equal(st(check(a), 'schema'), 'blocked');
  const b = daily(900); b[10] = { ...b[10], l: -1 }; const h = check(b); assert.equal(st(h, 'schema'), 'warn'); assert.equal(h.tradable, true);
  const c = daily(); c[c.length - 1] = { ...c[c.length - 1], c: NaN }; assert.equal(check(c).status, 'blocked');
});

test('order: duplicates or out-of-order bars block', () => { const a = daily(); a[200] = { ...a[200], t: a[199].t }; const h = check(a); assert.equal(st(h, 'order'), 'blocked'); assert.equal(h.tradable, false); });

test('stale: an old feed blocks trading but still allows evaluation', () => {
  const a = daily(), h = checkData(a, spec(), 'v', TH, { now: now(a) + 5 * DAY });
  assert.equal(st(h, 'stale'), 'blocked'); assert.equal(h.tradable, false); assert.equal(h.status, 'warn');
  const wk = checkData(a.slice(0, 5), spec({ calendar: 'XNYS' }), 'v', TH, { now: a[4].t + 3 * DAY });       // Friday's bar read on Monday morning is not stale
  assert.equal(st(wk, 'stale'), 'ok');
});

test('gaps: 1% missing warns, 5% blocks', () => {
  const a = daily(400), drop = (share: number) => a.filter((_, i) => i < 100 || (i * 7919) % 1000 >= share * 1000);
  assert.equal(st(check(drop(0.02)), 'gaps'), 'warn'); assert.equal(st(check(drop(0.08)), 'gaps'), 'blocked'); assert.equal(st(check(a), 'gaps'), 'ok');
});

test('bad print: a spike that reverts warns, and blocks when it is in the newest bars', () => {
  const a = daily(); a[250] = { ...a[250], h: a[250].o * 1.4, c: a[250].o * 1.35 }; a[251] = { ...a[251], o: a[250].o * 1.01 };
  const h = check(a); assert.equal(st(h, 'bad-prints'), 'warn'); assert.ok(h.checks.find(c => c.id === 'bad-prints')!.bars!.includes(a[250].t));
  const b = daily(); const k = b.length - 2; b[k] = { ...b[k], l: b[k].o * 0.5 }; assert.equal(st(check(b), 'bad-prints'), 'blocked');
});

test('unadjusted split: a 2-for-1 jump blocks unless the second source shows the same move', () => {
  const a = daily().map((b, i) => (i >= 300 ? { ...b, o: b.o / 2, h: b.h / 2, l: b.l / 2, c: b.c / 2 } : b));
  assert.equal(st(check(a), 'unadjusted-split'), 'blocked');
  assert.equal(st(check(a, { second: { source: 'other', bars: a } }), 'unadjusted-split'), 'ok');              // both sources agree: a real halving
  assert.equal(st(check(a, { second: { source: 'other', bars: daily() } }), 'unadjusted-split'), 'blocked');
});

test('zero volume run warns; a market with no volume at all does not', () => {
  const a = daily().map((b, i) => (i >= 100 && i < 125 ? { ...b, v: 0 } : b)); assert.equal(st(check(a), 'zero-volume'), 'warn');
  assert.equal(st(check(daily().map(b => ({ ...b, v: 0 }))), 'zero-volume'), 'ok');
});

test('second source: small drift warns, disagreement in the newest bars blocks', () => {
  const a = daily(), near = a.map(b => ({ ...b, c: b.c * 1.0001 })), drift = a.map(b => ({ ...b, c: b.c * 1.0008 })), bad = a.map((b, i) => (i === a.length - 2 ? { ...b, c: b.c * 1.02 } : b));
  assert.equal(st(check(a, { second: { source: 's', bars: near } }), 'second-source'), 'ok');
  assert.equal(st(check(a, { second: { source: 's', bars: drift } }), 'second-source'), 'warn');
  const h = check(a, { second: { source: 's', bars: bad } }); assert.equal(st(h, 'second-source'), 'blocked'); assert.equal(h.tradable, false);
});

test('short history warns', () => { assert.equal(st(check(daily(120), { minBars: 500 }), 'short-history'), 'warn'); });

test('round trip: store then load gives identical bars and the same version hash', () => {
  for (const seed of [1, 2, 3, 4, 5]) { const a = daily(50 + seed * 37, seed), b = parseCsv(toCsv(a)); assert.deepEqual(b, a); assert.equal(versionOf(b), versionOf(a)); }
  assert.notEqual(versionOf(daily(50, 1)), versionOf(daily(50, 2))); assert.throws(() => parseCsv('a,b\n1,2')); assert.throws(() => parseCsv('t,o,h,l,c,v\n1,2,3,x,5,6'));
});

test('merge: a restated overlap is reported, never silently overwritten; unfinished bars are dropped', () => {
  const a = daily(20), fresh = [{ ...a[18], c: a[18].c * 1.01 }, a[19], { ...a[19], t: a[19].t + DAY }];
  const m = mergeBars(a, fresh); assert.equal(m.added, 1); assert.deepEqual(m.restated, [a[18].t]); assert.equal(m.bars.length, 21);
  assert.deepEqual(mergeBars(a, a.slice(15)).restated, []);
  assert.equal(closedOnly(a, DAY, a[19].t + DAY - 1).length, 19); assert.equal(closedOnly(a, DAY, a[19].t + DAY).length, 20);
});

test('committed registry loads; every board dataset passes the firewall for evaluation', () => {
  const reg = loadRegistry(ROOT); assert.equal(reg.datasets.filter(d => d.panels.includes('stress-board')).length, 7);
  for (const d of reg.datasets) { const ds = loadCsvDataset(ROOT, d, Date.UTC(2026, 10, 11)); assert.ok(ds.bars.length > 400, d.id); assert.match(ds.version, /^[0-9a-f]{64}$/);
    const h = checkData(ds.bars, d, ds.version, TH, { now: ds.bars[ds.bars.length - 1].t + TF_MS[d.tf] }); assert.notEqual(h.status, 'blocked', `${d.id}: ${JSON.stringify(h.checks.filter(c => c.status !== 'ok'))}`); }
});

test('adapters: recorded responses parse; a changed response shape fails loudly; keys never reach an error message', async () => {
  const pages: any[] = [{ results: [{ t: 2, o: 1, h: 2, l: 1, c: 2, v: 10 }, { t: 1, o: 1, h: 2, l: 1, c: 1.5, v: 5 }], next_url: 'https://api.massive.com/next' }, { results: [{ t: 3, o: 2, h: 3, l: 2, c: 3, v: 7 }] }];
  const seen: any[] = []; const f = async (url: string, init: any) => { seen.push([url, init.headers]); return { ok: true, status: 200, json: async () => pages.shift() }; };
  const bars = await massiveAdapter('KEY123', f).fetchBars({ symbol: 'SPY', tf: '30m', from: 0, to: 9, adj: 'split', session: 'eth' });
  assert.deepEqual(bars.map(b => b.t), [1, 2, 3]); assert.ok(seen[0][0].includes('/v2/aggs/ticker/SPY/range/30/minute/0/9')); assert.ok(!seen[0][0].includes('KEY123')); assert.equal(seen[0][1].Authorization, 'Bearer KEY123');
  await assert.rejects(massiveAdapter('K', async () => ({ ok: true, status: 200, json: async () => ({ results: [{ t: 1, o: 'x' }] }) })).fetchBars({ symbol: 'S', tf: '1d', from: 0, to: 1, adj: 'split', session: 'rth' }), /provider response changed/);
  await assert.rejects(massiveAdapter('SECRETKEY', async () => ({ ok: false, status: 403, json: async () => ({}) })).fetchBars({ symbol: 'S', tf: '1d', from: 0, to: 1, adj: 'split', session: 'rth' }), (e: Error) => /HTTP 403/.test(e.message) && !e.message.includes('SECRETKEY'));
  await assert.rejects(massiveAdapter('', f).fetchBars({ symbol: 'S', tf: '1d', from: 0, to: 1, adj: 'split', session: 'rth' }), /not set/);
  const al = await alpacaAdapter('id', 'sec', async () => ({ ok: true, status: 200, json: async () => ({ bars: [{ t: '2026-01-05T14:30:00Z', o: 1, h: 2, l: 1, c: 2, v: 3 }], next_page_token: null }) })).fetchBars({ symbol: 'SPY', tf: '1h', from: 0, to: 1, adj: 'split', session: 'rth' });
  assert.equal(al[0].t, Date.UTC(2026, 0, 5, 14, 30)); assert.throws(() => alpacaAdapter('a', 'b', f, 'https://api.alpaca.markets'), /non-data host/);
});

test('terms gate: an adapter refuses to fetch for a source with no accepted entry', async () => {
  const md = readFileSync(join(ROOT, 'data/SOURCES.md'), 'utf8');
  assert.equal(termsOk(md, 'massive'), true); assert.equal(termsOk(md, 'csv'), true); assert.equal(termsOk(md, 'alpaca'), false); assert.equal(termsOk(md, 'tiingo'), false); assert.equal(termsOk(md, 'stooq'), false);
  const a = daily(30), f = async () => ({ ok: true, status: 200, json: async () => ({ results: a }) }), dir = mkdtempSync(join(tmpdir(), 'apex-'));
  const s = spec({ source: 'massive', id: 'massive:X:1d:split' });
  await assert.rejects(pullDataset(s, massiveAdapter('k', f), { cacheDir: dir, now: now(a), sourcesMd: '' }), /refusing to fetch/);
  const first = await pullDataset(s, massiveAdapter('k', f), { cacheDir: dir, now: now(a), sourcesMd: md }); assert.equal(first.added, 30);
  const again = await pullDataset(s, massiveAdapter('k', f), { cacheDir: dir, now: now(a), sourcesMd: md }); assert.equal(again.added, 0); assert.equal(again.version, first.version);
});
