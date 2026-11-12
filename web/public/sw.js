// Apex service worker (docs/design/07 s6). It makes the last screens you opened readable with no connection.
// Rules, each held by web/test/pwa.test.ts:
//   - Only GET requests are ever answered here or stored. A write (halt, resume, claim check, login, keys) always goes to the
//     network, is never stored and is never queued for later. With no connection it fails, and the screen says so.
//   - No /api/ answer is stored. What is stored is the screen as it was last drawn, and the app's own static files.
//   - The You section (setup, keys) is never stored.
//   - A stored screen older than 24 hours is not shown. The offline page is shown instead.
//   - The one POST handled here is the share target: the shared text is held on this device and the browser is sent to
//     New claim check. Nothing is sent anywhere and nothing runs until Plan is pressed.
const VERSION = 'v1', PAGES = `apex-pages-${VERSION}`, STATIC = `apex-static-${VERSION}`, SHARE = 'apex-share';
const OFFLINE = '/offline.html', SHARE_ACTION = '/api/share', SHARED_KEY = '/__shared', MAX_AGE_MS = 24 * 3600 * 1000, MAX_PAGES = 60, STAMP = 'x-apex-saved-at';
const neverStore = path => path.startsWith('/api/') || path === '/you' || path.startsWith('/you/') || path === '/sw.js';
const isStatic = path => path.startsWith('/_next/static/') || path.startsWith('/icons/') || path === OFFLINE || path === '/manifest.webmanifest';

self.addEventListener('install', e => { e.waitUntil(caches.open(STATIC).then(c => c.add(OFFLINE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('apex-') && ![PAGES, STATIC, SHARE].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

async function stamped(res) { const h = new Headers(res.headers); h.set(STAMP, String(Date.now())); return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h }); }
async function trim(cache) { const keys = await cache.keys(); for (const k of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(k); }
async function offlinePage() { return (await caches.match(OFFLINE)) || new Response('You are offline.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }); }

// A screen: the network first, so what is shown is current whenever there is a connection. Stored copy only when there is none.
async function page(req, path) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic' && !neverStore(path)) { await cache.put(req.url, await stamped(res.clone())); trim(cache); }
    return res;
  } catch {
    const hit = neverStore(path) ? undefined : await cache.match(req.url);
    if (hit && Date.now() - Number(hit.headers.get(STAMP) || 0) <= MAX_AGE_MS) return hit;
    if (hit) await cache.delete(req.url);
    return offlinePage();
  }
}
// The app's own versioned files: stored copy first, since a file name never changes its content.
async function asset(req) {
  const cache = await caches.open(STATIC), hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req); if (res.ok && res.type === 'basic') await cache.put(req, res.clone());
  return res;
}
async function share(req) {
  let shared = '';
  try { const f = await req.formData(); shared = ['title', 'text', 'url'].map(k => String(f.get(k) || '').trim()).filter(Boolean).join('\n\n'); } catch { /* open the empty screen */ }
  if (shared) await (await caches.open(SHARE)).put(SHARED_KEY, new Response(shared, { headers: { 'content-type': 'text/plain; charset=utf-8' } }));
  return Response.redirect(new URL(shared ? '/claims?shared=1' : '/claims', self.location.origin).href, 303);
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.method === 'POST' && url.pathname === SHARE_ACTION) { e.respondWith(share(req)); return; }
  if (req.method !== 'GET') return;                                   // every write goes straight to the network
  if (isStatic(url.pathname)) { e.respondWith(asset(req)); return; }
  if (req.mode === 'navigate') { e.respondWith(page(req, url.pathname)); return; }
  // Everything else (API reads, data for a screen) goes to the network untouched.
});
