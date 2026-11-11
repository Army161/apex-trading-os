// Browser check for the dashboard (docs/design/07 s10). Opens every screen in the route list in a real headless browser, in
// both themes, at phone (390) and desktop (1360) width. It fails on a page error, a console error, a failed request, a page
// that scrolls sideways, a missing mode badge, a Halt button that cannot be reached, or a page without exactly one heading.
// Usage: npm run build && npm start (in another terminal), then  APEX_URL=http://localhost:3000 npm run check:ui
// Screenshots go to ui-check/. Playwright is resolved from this project, or from a global install.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch { pw = createRequire(`${process.env.NODE_PATH || '/usr/lib/node_modules'}/`)('playwright'); }
const { chromium } = pw;
const URL = process.env.APEX_URL || 'http://localhost:3000';
const SCREENS = req('../lib/routes.json').sections.flatMap(s => s.screens.map(x => ({ ...x, section: s.label })));
// Market data can be blocked where you test (sandboxes, some networks): set UI_OFFLINE=1 to ignore those failures.
// The check runs signed out, so admin-only reads answer 401. The browser logs each one; that is the expected signed-out state.
const IGNORE = [/favicon/, /status of 401 \(Unauthorized\)/, ...(process.env.UI_OFFLINE ? [/\/api\/(candles|signals|macro|crowd)/, /50[23] \((Bad Gateway|Service Unavailable)\)/] : [])];
const SHOTS = process.env.UI_SHOTS !== '0';
const DETAILS = [['/autopilot', '/autopilot/pairs/', 'detail-pair'], ['/autopilot/slots', '/autopilot/slots/', 'detail-slot'], ['/autopilot/reports', '/autopilot/reports/', 'detail-report'], ['/autopilot/ledger', '/autopilot/ledger/', 'detail-ledger-entry'], ['/claims', '/claims/', 'detail-claim']];
const details = new Set();
fs.mkdirSync('ui-check', { recursive: true });
const b = await chromium.launch(); const problems = []; let pages = 0;
for (const theme of ['dark', 'light']) for (const [w, h, tag] of [[1360, 900, 'desktop'], [390, 844, 'phone']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
  const p = await ctx.newPage(); let where = '';
  const say = m => problems.push(`${theme} ${tag} ${where}: ${m}`);
  p.on('pageerror', e => say(`page error: ${e.message}`));
  p.on('console', m => m.type() === 'error' && !IGNORE.some(r => r.test(m.text())) && say(`console: ${m.text().slice(0, 200)}`));
  p.on('response', r => r.status() >= 500 && !IGNORE.some(x => x.test(r.url())) && say(`HTTP ${r.status()} ${r.url()}`));
  const look = async (href, shot) => {
    where = href; pages++;
    const res = await p.goto(URL + href, { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
    if (!res || res.status() !== 200) { say(`status ${res?.status()}`); return; }
    if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) say('scrolls sideways');
    const badge = p.getByTestId('mode-badge'); if (!(await badge.isVisible())) say('no mode badge'); else if (!/PAPER|LIVE/.test(await badge.innerText())) say('mode badge has no mode');
    const halt = p.getByTestId('halt');
    if (!(await halt.isVisible())) say('Halt is not visible'); else { const box = await halt.boundingBox(); if (!box || box.y < 0 || box.y + box.height > h || box.x < 0 || box.x + box.width > w) say('Halt is outside the first screenful'); if (tag === 'phone' && box && box.height < 44) say(`Halt is ${Math.round(box.height)} px tall, under 44`); }
    const h1 = await p.locator('h1').count(); if (h1 !== 1) say(`${h1} top headings, expected 1`);
    if (!(await p.locator(tag === 'phone' ? 'nav.ax-bottom' : 'nav.ax-rail').isVisible())) say('no section navigation');
    if (await p.locator('[data-metric-context="missing"]').count()) say('a figure is shown without its context');
    if (SHOTS) await p.screenshot({ path: `ui-check/${theme}-${tag}-${shot}.png`, fullPage: true });
  };
  for (const s of SCREENS) await look(s.href, s.href.replace(/^\//, '').replace(/\//g, '-') || 'today');
  // Detail screens have no fixed address: follow the first link to each kind from its list, when the ledger has one.
  for (const [list, prefix, shot] of DETAILS) {
    where = list; await p.goto(URL + list, { waitUntil: 'networkidle' });
    const href = await p.locator(`main a[href^="${prefix}"]`).first().getAttribute('href', { timeout: 1500 }).catch(() => null);
    if (href) { details.add(shot); await look(href, shot); }
  }
  // The command palette opens from the keyboard and goes somewhere.
  where = 'palette'; await p.goto(URL + '/', { waitUntil: 'networkidle' }); await p.keyboard.press('Control+k');
  if (!(await p.locator('dialog.ax-palette[open]').count())) say('Ctrl K did not open the palette');
  else { await p.locator('#ax-q').fill('setup'); await p.keyboard.press('Enter'); await p.waitForURL('**/you/setup', { timeout: 5000 }).catch(() => say('typing a screen name and Enter did not go there')); }
  await ctx.close();
}
// The installed app (docs/design/07 s6): what a browser needs before it offers to install, a saved screen with no connection,
// a screen that was never saved, and text shared in from another app. A service worker needs https or localhost.
let installed = 'not checked (the address is not https or localhost)';
if (/^https:|^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(URL)) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); const say = m => problems.push(`installed app: ${m}`);
  await p.goto(URL + '/autopilot/book', { waitUntil: 'networkidle' });
  const man = await p.evaluate(async () => { const l = document.querySelector('link[rel="manifest"]'); if (!l) return null; const m = await (await fetch(l.href)).json(); return { m, icons: await Promise.all(m.icons.map(async i => { const r = await fetch(i.src); return r.ok && r.headers.get('content-type') === 'image/png'; })) }; });
  if (!man) say('the page links no manifest');
  else { const { m, icons } = man;
    if (!m.name || !m.start_url || m.display !== 'standalone') say('the manifest lacks a name, a start address or standalone display');
    for (const size of ['192x192', '512x512']) if (!m.icons.some(i => i.sizes === size && i.purpose === 'any')) say(`no ${size} icon`);
    if (!m.icons.some(i => i.purpose === 'maskable')) say('no maskable icon'); if (icons.includes(false)) say('an icon does not load as a PNG');
    if (m.share_target?.method !== 'POST') say('no share target'); }
  const controlled = await p.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => navigator.serviceWorker.controller ? true : new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', () => r(true), { once: true }))), new Promise(r => setTimeout(() => r(false), 8000))]));
  if (!controlled) say('the service worker did not take charge of the page');
  else {
    await p.goto(URL + '/autopilot/book', { waitUntil: 'networkidle' });                     // opened once under the worker, so it is saved
    if (await p.getByTestId('offline').count()) say('the offline notice shows while online');
    await ctx.setOffline(true);
    await p.reload({ waitUntil: 'domcontentloaded' }).catch(e => say(`a saved screen did not open offline: ${e.message.split('\n')[0]}`)); await p.waitForTimeout(800);
    if ((await p.locator('h1').first().innerText().catch(() => '')) !== 'Paper book') say('offline, the saved screen is not the one that was opened');
    if (!(await p.getByTestId('offline').isVisible().catch(() => false))) say('offline, the screen does not say so');
    if (!(await p.getByTestId('halt').isDisabled().catch(() => false))) say('offline, Halt is not off');
    if (!(await p.getByTestId('mode-badge').isVisible().catch(() => false))) say('offline, the mode badge is gone');
    await p.goto(URL + '/autopilot/risk', { waitUntil: 'domcontentloaded' }).catch(e => say(`a screen never saved did not get the offline page: ${e.message.split('\n')[0]}`));
    if ((await p.locator('h1').first().innerText().catch(() => '')) !== 'You are offline') say('a screen never saved does not show the offline page');
    await ctx.setOffline(false);
    await p.goto(URL + '/claims', { waitUntil: 'networkidle' });
    if (await p.getByTestId('offline').count()) say('the offline notice stays after the connection is back');
    const shared = 'Buy when the 50 day average crosses above the 200 day average. '.repeat(60);
    await p.evaluate(text => { const f = document.createElement('form'); f.method = 'post'; f.action = '/api/share'; for (const [k, v] of [['title', 'A shared video'], ['text', text], ['url', 'https://example.com/v']]) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.append(i); } document.body.append(f); f.submit(); }, shared);
    await p.waitForURL('**/claims', { timeout: 8000 }).catch(() => say(`sharing did not land on New claim check (${p.url()})`)); await p.waitForTimeout(800);
    const got = await p.locator('main textarea').first().inputValue().catch(() => '');
    if (!got.startsWith('A shared video') || !got.includes(shared.trim())) say(`shared text did not arrive whole in the box (${got.length} characters)`);
    installed = `checked: manifest, a saved screen offline, the offline page, and ${got.length} characters shared in`;
  }
  await ctx.close();
}
await b.close();
const uniq = [...new Set(problems)];
console.log(uniq.length ? `${uniq.length} problems:\n${uniq.join('\n')}` : `all ${SCREENS.length} screens${details.size ? ` and ${details.size} kinds of detail screen` : ''} rendered clean in both themes on desktop and phone (${pages} page loads). Installed app ${installed}${SHOTS ? '; screenshots in ui-check/' : ''}`);
process.exit(uniq.length ? 1 : 0);
