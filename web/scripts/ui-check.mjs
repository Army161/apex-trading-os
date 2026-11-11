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
await b.close();
const uniq = [...new Set(problems)];
console.log(uniq.length ? `${uniq.length} problems:\n${uniq.join('\n')}` : `all ${SCREENS.length} screens${details.size ? ` and ${details.size} kinds of detail screen` : ''} rendered clean in both themes on desktop and phone (${pages} page loads)${SHOTS ? '; screenshots in ui-check/' : ''}`);
process.exit(uniq.length ? 1 : 0);
