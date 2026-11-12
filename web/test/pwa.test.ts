// The installable app (docs/design/07 s6): the manifest, the icons, the share landing, and the service worker run in a
// stand-in for the browser, so its rules are tested as behaviour: writes are never answered or stored, no API answer and no
// You screen is stored, a stored screen is shown only with no connection and only for 24 hours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { TOKENS } from '@apex/ui';
import manifest, { SHARE_ACTION } from '../app/manifest';
import { POST as sharePost } from '../app/api/share/route';

const web = resolve(__dirname, '..'), ORIGIN = 'https://apex.test';
const png = (p: string) => { const b = readFileSync(join(web, 'public', p)); assert.equal(b.subarray(1, 4).toString(), 'PNG', p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('manifest: installable, with the token colours, both icon purposes, three shortcuts and the share target', () => {
  const m = manifest();
  assert.equal(m.name, 'Apex'); assert.equal(m.display, 'standalone'); assert.equal(m.start_url, '/'); assert.equal(m.scope, '/');
  assert.equal(m.theme_color, TOKENS.bg.dark); assert.equal(m.background_color, TOKENS.bg.dark);
  for (const purpose of ['any', 'maskable']) for (const size of [192, 512]) {
    const icon = m.icons!.find(i => i.purpose === purpose && i.sizes === `${size}x${size}`); assert.ok(icon, `${purpose} ${size}`); assert.deepEqual(png(icon!.src), [size, size]); }
  assert.deepEqual(png('icons/apple-touch-icon.png'), [180, 180]);
  assert.deepEqual(m.shortcuts!.map(s => s.name), ['Today', 'New claim check', 'Halt']);
  // A shortcut is a link. None of them is a route that changes anything, and the Halt one only puts the button in focus.
  for (const s of m.shortcuts!) assert.doesNotMatch(s.url, /^\/api\//); assert.equal(m.shortcuts![2].url, '/#halt');
  assert.match(readFileSync(join(web, 'components/shell/Shell.tsx'), 'utf8'), /location\.hash === '#halt'\) document\.querySelector<HTMLButtonElement>\('\[data-testid="halt"\]'\)\?\.focus\(\)/);
  assert.deepEqual(m.share_target, { action: SHARE_ACTION, method: 'POST', enctype: 'application/x-www-form-urlencoded', params: { title: 'title', text: 'text', url: 'url' } });
});

test('share landing: it only redirects to New claim check with the start of the text, and writes nothing', async () => {
  const body = new URLSearchParams({ title: 'A video', text: 'Buy when the 50 crosses the 200. '.repeat(100), url: 'https://example.com/v' });
  const r = await sharePost(new Request(`${ORIGIN}${SHARE_ACTION}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }));
  assert.equal(r.status, 303); const to = new URL(r.headers.get('location')!);
  assert.equal(to.origin + to.pathname, `${ORIGIN}/claims`); const text = to.searchParams.get('text')!; assert.ok(text.startsWith('A video\n\nBuy when')); assert.equal(text.length, 1500);
  const empty = await sharePost(new Request(`${ORIGIN}${SHARE_ACTION}`, { method: 'POST', body: 'not a form' })); assert.equal(new URL(empty.headers.get('location')!).search, '');
  const src = readFileSync(join(web, 'app/api/share/route.ts'), 'utf8'); assert.doesNotMatch(src, /@\/lib|ledger|store|fetch\(/, 'the landing touches nothing');
});

// ---- the service worker, run in a stand-in ----
type Stored = Map<string, Response>;
function worker(now: () => number) {
  const stores = new Map<string, Stored>(), listeners: Record<string, (e: any) => void> = {}, net = { up: true, calls: [] as string[], serve: (_r: Request): Response => new Response('fresh', { status: 200 }) };
  const keyOf = (k: Request | string) => new URL(typeof k === 'string' ? k : k.url, ORIGIN).href;
  const open = async (name: string) => { if (!stores.has(name)) stores.set(name, new Map()); const s = stores.get(name)!; return {
    put: async (k: Request | string, r: Response) => { s.set(keyOf(k), r); }, match: async (k: Request | string) => s.get(keyOf(k))?.clone(), delete: async (k: Request | string) => s.delete(keyOf(k)),
    keys: async () => [...s.keys()].map(u => new Request(u)), add: async (k: string) => { s.set(keyOf(k), new Response('offline page', { status: 200 })); } }; };
  const caches = { open, keys: async () => [...stores.keys()], delete: async (n: string) => stores.delete(n), match: async (k: Request | string) => { for (const s of stores.values()) { const r = s.get(keyOf(k)); if (r) return r.clone(); } return undefined; } };
  const fetchFn = async (r: Request) => { net.calls.push(`${r.method} ${new URL(r.url).pathname}`); if (!net.up) throw new TypeError('Failed to fetch'); const res = net.serve(r); Object.defineProperty(res, 'type', { value: 'basic' }); return res; };
  const self = { addEventListener: (n: string, f: (e: any) => void) => { listeners[n] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} }, location: { origin: ORIGIN } };
  class RealDate extends Date { static now() { return now(); } }
  vm.runInNewContext(readFileSync(join(web, 'public/sw.js'), 'utf8'), { self, caches, fetch: fetchFn, Response, Request, Headers, URL, Date: RealDate, Promise, String, Number, Math });
  /** Send a request through the worker. Null means the worker left it to the network. */
  const send = async (path: string, init: RequestInit & { navigate?: boolean } = {}): Promise<Response | null> => {
    const req = new Request(path.startsWith('http') ? path : ORIGIN + path, init); Object.defineProperty(req, 'mode', { value: init.navigate ? 'navigate' : 'cors' });
    let answer: Promise<Response> | null = null; listeners.fetch({ request: req, respondWith: (p: Promise<Response>) => { answer = p; } }); return answer ? await answer : null; };
  const install = async () => { let p: Promise<unknown> = Promise.resolve(); listeners.install({ waitUntil: (x: Promise<unknown>) => { p = x; } }); await p; listeners.activate({ waitUntil: (x: Promise<unknown>) => { p = x; } }); await p; };
  return { send, install, net, stores };
}
const all = (stores: Map<string, Stored>) => [...stores.values()].flatMap(s => [...s.keys()]).map(u => new URL(u).pathname);

test('service worker: a write is never answered here, never stored and never queued', async () => {
  const w = worker(() => 0); await w.install();
  for (const [path, method] of [['/api/halt', 'POST'], ['/api/resume', 'POST'], ['/api/claims', 'POST'], ['/api/login', 'POST'], ['/api/admin/keys', 'POST'], ['/api/admin/keys/k1', 'DELETE'], ['/api/v1/halt', 'POST'], ['/api/mcp', 'POST'], ['/claims', 'PUT']] as const)
    assert.equal(await w.send(path, { method, body: method === 'DELETE' ? undefined : '{}' }), null, `${method} ${path} is left to the network`);
  assert.deepEqual(w.net.calls, [], 'the worker itself sent nothing'); assert.deepEqual(all(w.stores), ['/offline.html']);
  const src = readFileSync(join(web, 'public/sw.js'), 'utf8'); assert.doesNotMatch(src, /\bsync\b|SyncManager|indexedDB|BackgroundFetch|postMessage|PushManager|addEventListener\('(sync|push|message)'/, 'no queue, no background sync, no push');
});

test('service worker: no API answer and no You screen is stored; a request to another site is left alone', async () => {
  const w = worker(() => 0); await w.install();
  for (const p of ['/api/status', '/api/v1/board', '/api/v1/ledger/entries', '/api/bots']) assert.equal(await w.send(p), null, `${p} goes to the network untouched`);
  assert.equal(await w.send('https://elsewhere.test/x', { navigate: true }), null);
  for (const p of ['/you', '/you/setup']) { const r = await w.send(p, { navigate: true }); assert.equal(await r!.text(), 'fresh'); }
  assert.deepEqual(all(w.stores), ['/offline.html']);
  w.net.up = false; assert.equal(await (await w.send('/you/setup', { navigate: true }))!.text(), 'offline page');
});

test('service worker: a screen comes from the network when there is one, from this device only when there is none, and for 24 hours at most', async () => {
  let t = 1_000_000; const w = worker(() => t); await w.install();
  w.net.serve = () => new Response('book v1'); assert.equal(await (await w.send('/autopilot/book', { navigate: true }))!.text(), 'book v1');
  w.net.serve = () => new Response('book v2'); assert.equal(await (await w.send('/autopilot/book', { navigate: true }))!.text(), 'book v2', 'online: always the network');
  w.net.serve = () => new Response('server error', { status: 500 }); assert.equal((await w.send('/autopilot/book', { navigate: true }))!.status, 500); 
  w.net.up = false;
  assert.equal(await (await w.send('/autopilot/book', { navigate: true }))!.text(), 'book v2', 'offline: the last good copy, not the error');
  assert.equal(await (await w.send('/autopilot/risk', { navigate: true }))!.text(), 'offline page', 'a screen never opened here');
  t += 24 * 3600 * 1000 + 1;
  assert.equal(await (await w.send('/autopilot/book', { navigate: true }))!.text(), 'offline page', 'older than 24 hours is not shown');
  assert.ok(!all(w.stores).includes('/autopilot/book'), 'and it is dropped');
});

test('service worker: its own static files are kept; shared text is held on this device and the browser is sent to New claim check', async () => {
  const w = worker(() => 0); await w.install();
  w.net.serve = () => new Response('js'); await w.send('/_next/static/chunks/a.js'); w.net.up = false; assert.equal(await (await w.send('/_next/static/chunks/a.js'))!.text(), 'js');
  const r = await w.send(SHARE_ACTION, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ title: 'T', text: 'x'.repeat(5000), url: 'https://example.com' }) });
  assert.equal(r!.status, 303); assert.equal(new URL(r!.headers.get('location')!, ORIGIN).pathname + new URL(r!.headers.get('location')!, ORIGIN).search, '/claims?shared=1');
  const held = await w.stores.get('apex-share')!.get(`${ORIGIN}/__shared`)!.text(); assert.equal(held.length, 'T'.length + 2 + 5000 + 2 + 'https://example.com'.length, 'the whole text, with no cut');
  assert.ok(!w.net.calls.some(c => c.startsWith('POST')), 'nothing was sent anywhere');
  // The form reads it once and removes it.
  assert.match(readFileSync(join(web, 'components/claims/ClaimForm.tsx'), 'utf8'), /caches\.open\('apex-share'\), r = await c\.match\('\/__shared'\); if \(r\) \{ shared = await r\.text\(\); await c\.delete\('\/__shared'\); \}/);
});

test('offline: the shell turns every control in a screen off and says so, and Halt explains itself', () => {
  const shell = readFileSync(join(web, 'components/shell/Shell.tsx'), 'utf8');
  assert.match(shell, /<fieldset className="ax-screen" disabled=\{offline\}>\{children\}<\/fieldset>/);
  assert.match(shell, /disabled=\{busy \|\| s\.halted \|\| offline\}[^>]*data-testid="halt"/); assert.match(shell, /data-testid="offline"/);
  assert.match(shell, /process\.env\.NODE_ENV === 'production' && 'serviceWorker' in navigator/);
  const off = readFileSync(join(web, 'public/offline.html'), 'utf8'); assert.doesNotMatch(off, /<script|<form|<button/, 'the offline page has no control and no script');
});

test('layout: nothing of ours is rendered in the page head, and the theme script is the first thing in the body', () => {
  // The loader adds and removes its own script tags in the head while the page is being made live. An element of ours there
  // was matched against a head that was changing, and on a slow machine that was a page error on about 1 load in 13.
  const layout = readFileSync(join(web, 'app/layout.tsx'), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  assert.doesNotMatch(layout, /<head[\s>]/); assert.match(layout, /<body><script dangerouslySetInnerHTML=\{\{ __html: THEME_SCRIPT \}\} \/><Shell/);
});
