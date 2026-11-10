// Browser check for the dashboard (idea from archive/chat/32, Playwright for agents checking their own UI work).
// Opens every tab in a real headless browser, fails on page errors, console errors or failed requests, and saves a
// screenshot per tab to ui-check/. Usage: npm run build && npm start (in another terminal), then
//   APEX_URL=http://localhost:3000 npm run check:ui
// Needs Playwright: npm i -D playwright && npx playwright install chromium (already present in some sandboxes).
import { createRequire } from 'node:module';
// resolve Playwright from this project, or from a global install when it is not a project dependency
const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch { pw = createRequire(`${process.env.NODE_PATH || '/usr/lib/node_modules'}/`)('playwright'); }
const { chromium } = pw;
import fs from 'node:fs';
const URL = process.env.APEX_URL || 'http://localhost:3000';
const TABS = ['Command', 'Strategies', 'Strategy Lab', 'Signals', 'Journal', 'Council', 'Assistants', 'Apex AI', 'Library', 'Setup'];
// Market data can be blocked where you test (sandboxes, some networks): set UI_OFFLINE=1 to ignore /api/candles failures.
const IGNORE = [/favicon/, ...(process.env.UI_OFFLINE ? [/\/api\/candles/, /502 \(Bad Gateway\)/] : [])];
fs.mkdirSync('ui-check', { recursive: true });
const b = await chromium.launch(); const problems = [];
for (const [w, h, tag] of [[1280, 900, 'desktop'], [390, 844, 'phone']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', e => problems.push(`${tag}: page error: ${e.message}`));
  p.on('console', m => m.type() === 'error' && !IGNORE.some(r => r.test(m.text())) && problems.push(`${tag}: console: ${m.text().slice(0, 200)}`));
  p.on('response', r => r.status() >= 500 && !IGNORE.some(x => x.test(r.url())) && problems.push(`${tag}: HTTP ${r.status()} ${r.url()}`));
  await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  for (const t of TABS) {
    await p.getByRole('button', { name: t, exact: true }).click(); await p.waitForTimeout(1200);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (wide && tag === 'phone') problems.push(`${tag}: ${t} scrolls sideways`);
    await p.screenshot({ path: `ui-check/${tag}-${t.toLowerCase().replace(/\s+/g, '-')}.png`, fullPage: true });
  }
  await p.close();
}
await b.close();
console.log(problems.length ? `${problems.length} problems:\n${[...new Set(problems)].join('\n')}` : `all ${TABS.length} tabs rendered clean on desktop and phone; screenshots in ui-check/`);
process.exit(problems.length ? 1 : 0);
