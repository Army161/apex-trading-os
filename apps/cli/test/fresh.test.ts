// The nightly job's last word (docs/runbooks/run-failed.md): `apex data pull --strict` says when the pull was not complete, and
// `apex data fresh` says when the newest bar is too old for the paper clock to move. Fake clocks, fixture bars, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { main } from '../src/main';
import { makeCtx, type Ctx } from '../src/runtime';
import { FIXTURE_LEDGER } from '../src/source';
import { checkFresh, freshScope, isTradingDay, nyseHolidays, tradingHoursBetween } from '../src/fresh';

const ROOT = resolve(__dirname, '../../..'), H = 36e5, DAY = 864e5;
const KEY = ['MASSIVE', 'API', 'KEY'].join('_');
const iso = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
const ctxAt = (now: number, env: Record<string, string> = {}, ledger = false): Ctx => {
  const dir = mkdtempSync(join(tmpdir(), 'apex-fresh-')); if (ledger) copyFileSync(FIXTURE_LEDGER, join(dir, 'ledger.jsonl'));
  return { ...makeCtx(ROOT, { APEX_STATE_DIR: dir, ...env }, () => now), sleep: async () => {} };
};
const run = async (ctx: Ctx, ...argv: string[]) => { const out: string[] = []; const code = await main(argv, ctx, s => out.push(s)); return { code, text: out.join('\n') }; };

test('the NYSE holidays match the exchange\'s published lists, observed days included', () => {
  assert.deepEqual([...nyseHolidays(2026)].sort().map(iso), ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25']);
  assert.deepEqual([...nyseHolidays(2027)].sort().map(iso), ['2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24']);
  // New Year's Day 2028 is a Saturday, and the exchange does not close on the Friday before.
  assert.ok(![...nyseHolidays(2028)].map(iso).includes('2027-12-31')); assert.equal(nyseHolidays(2028).size, 9);
  assert.equal(isTradingDay(Date.UTC(2026, 10, 26) / DAY, 'XNYS'), false, 'Thanksgiving'); assert.equal(isTradingDay(Date.UTC(2026, 10, 27) / DAY, 'XNYS'), true, 'the half day after it trades');
  assert.equal(isTradingDay(Date.UTC(2026, 10, 26) / DAY, 'CRYPTO'), true); assert.equal(isTradingDay(Date.UTC(2026, 10, 28) / DAY, 'FX'), false, 'a Saturday');
});

test('trading hours: weekends do not count for stocks or currencies, holidays not for stocks, and every hour counts for crypto', () => {
  const fri = Date.UTC(2026, 10, 6, 21), mon = Date.UTC(2026, 10, 9, 22, 30);           // Friday 16:00 New York, Monday 17:30
  assert.equal(tradingHoursBetween(fri, mon, 'XNYS'), 25.5); assert.equal(tradingHoursBetween(fri, mon, 'FX'), 25.5); assert.equal(tradingHoursBetween(fri, mon, 'CRYPTO'), 73.5);
  // Labor Day, Monday 7 September 2026 (daylight time): Friday 16:00 to Tuesday 18:30 New York is 8 + 18.5 hours, not four days.
  assert.equal(tradingHoursBetween(Date.UTC(2026, 8, 4, 20), Date.UTC(2026, 8, 8, 22, 30), 'XNYS'), 26.5);
  // Across the switch back to standard time (Sunday 1 November 2026): Friday 16:00 daylight time to Monday 17:30 standard time.
  assert.equal(tradingHoursBetween(Date.UTC(2026, 9, 30, 20), Date.UTC(2026, 10, 2, 22, 30), 'XNYS'), 8 + 17.5);
  assert.equal(tradingHoursBetween(mon, fri, 'XNYS'), 0);
});

test('checkFresh: a weekend or a holiday does not trip it for stocks, a missed weekday does, and crypto is held to every day', () => {
  const daily = (y: number, m: number, d: number) => Date.UTC(y, m, d + 1, 5);          // a New York daily bar closes at midnight New York
  // Monday night after a normal weekend: Friday's daily bar is the newest.
  const mon = Date.UTC(2026, 10, 9, 22, 30), stocks = checkFresh([{ dataset: 'GLD', calendar: 'XNYS', lastClose: daily(2026, 10, 6) }], mon, 36);
  assert.equal(stocks.ok, true); assert.equal(stocks.rows[0].ageHours, 17.5);
  // Tuesday after Labor Day: Friday's bar is still the newest, and that is right.
  assert.equal(checkFresh([{ dataset: 'GLD', calendar: 'XNYS', lastClose: Date.UTC(2026, 8, 5, 4) }], Date.UTC(2026, 8, 8, 22, 30), 36).ok, true);
  // The Monday after Thanksgiving week: the newest daily bar is Friday's half day.
  assert.equal(checkFresh([{ dataset: 'GLD', calendar: 'XNYS', lastClose: daily(2026, 10, 27) }], Date.UTC(2026, 10, 30, 23, 30), 36).ok, true);
  // Wednesday night with Friday's bar still the newest: two weekdays went by with nothing new.
  const wed = checkFresh([{ dataset: 'GLD', calendar: 'XNYS', lastClose: daily(2026, 10, 6) }], Date.UTC(2026, 10, 11, 23, 30), 36);
  assert.equal(wed.ok, false); assert.match(wed.rows[0].why, /trading hours ago, more than 36/);
  // Crypto trades at the weekend, so Friday's bar on Monday night is stale.
  const btc = checkFresh([{ dataset: 'BTC', calendar: 'CRYPTO', lastClose: Date.UTC(2026, 10, 7) }], mon, 36);
  assert.equal(btc.ok, false); assert.equal(btc.rows[0].ageHours, 70.5);
  assert.equal(checkFresh([{ dataset: 'BTC', calendar: 'CRYPTO', lastClose: Date.UTC(2026, 10, 9) }], mon, 36).ok, true);
  // Fail closed: no bars, an unknown calendar, a close in the future, or nothing to check at all.
  assert.equal(checkFresh([{ dataset: 'X', calendar: 'XNYS', lastClose: null }], mon, 36).rows[0].ok, false);
  assert.equal(checkFresh([{ dataset: 'X', calendar: null, lastClose: mon - H }], mon, 36).rows[0].ok, false);
  assert.equal(checkFresh([{ dataset: 'X', calendar: 'CRYPTO', lastClose: mon + 3 * H }], mon, 36).ok, false);
  assert.equal(checkFresh([], mon, 36).ok, false);
});

test('freshScope: the datasets behind slots that are not retired, or the whole registry before any slot exists', () => {
  assert.deepEqual(freshScope([], ['b', 'a']), { datasets: ['a', 'b'], basis: 'registry' });
  assert.deepEqual(freshScope([{ dataset: 'a', status: 'paper' }, { dataset: 'a', status: 'paused_drift' }, { dataset: 'c', status: 'retired' }], ['a', 'b', 'c']), { datasets: ['a'], basis: 'slots' });
  assert.deepEqual(freshScope([{ dataset: 'c', status: 'retired' }], ['a', 'c']), { datasets: ['a', 'c'], basis: 'registry' });
});

test('apex data fresh: exit 0 the night after the committed bars, exit 4 two nights later, naming what is stale', async () => {
  // The committed files end on Monday 9 November 2026 (daily) and Tuesday 10 November 01:00 UTC (30 minute bars).
  const ok = await run(ctxAt(Date.UTC(2026, 10, 10, 22, 30)), 'data', 'fresh', '--max-age-hours', '36');
  assert.equal(ok.code, 0, ok.text); assert.match(ok.text, /The paper clock is moving: every registry dataset/);
  const stale = await run(ctxAt(Date.UTC(2026, 10, 12, 22, 30)), 'data', 'fresh', '--max-age-hours', '36');
  assert.equal(stale.code, 4); assert.match(stale.text, /Stale: csv:BTC:1d:raw: newest bar closed/); assert.match(stale.text, /Stale: csv:SPY:1h:split/); assert.match(stale.text, /run-failed\.md/);
  const j = JSON.parse((await run(ctxAt(Date.UTC(2026, 10, 12, 22, 30)), 'data', 'fresh', '--json')).text);
  assert.equal(j.ok, false); assert.equal(j.maxAgeHours, 36); assert.equal(j.items.length, 12);
  // With slots locked, only their datasets count: the demo ledger has one slot, on SPY 1h.
  const slots = await run(ctxAt(Date.UTC(2026, 10, 12, 22, 30), {}, true), 'data', 'fresh', '--json');
  assert.equal(slots.code, 4); assert.deepEqual(JSON.parse(slots.text).items.map((x: any) => x.dataset), ['csv:SPY:1h:split']); assert.equal(JSON.parse(slots.text).basis, 'slots');
  assert.equal((await run(ctxAt(Date.UTC(2026, 10, 12, 22, 30)), 'data', 'fresh', '--max-age-hours', '0')).code, 2, 'the limit is a whole number of hours, at least 1');
  assert.equal((await run(ctxAt(Date.UTC(2026, 10, 12, 22, 30)), 'data', 'fresh', '--remote')).code, 2, 'local only');
});

test('apex data pull --strict: exit 4 without the key or on any provider problem, 0 when every file was pulled', async () => {
  const at = 1794270600000 + 6 * H;
  const none = await run(ctxAt(at), 'data', 'pull', '--strict');
  assert.equal(none.code, 4); assert.match(none.text, /Problem: MASSIVE_API_KEY is not set/); assert.match(none.text, /Strict: the pull is not complete/);
  assert.equal((await run(ctxAt(at), 'data', 'pull')).code, 0, 'without --strict the pull keeps its old exit code');
  const bars = (url: string) => (url.includes('/ticker/SPY/') ? [1, 2].map(k => ({ t: 1794270600000 + k * 18e5, o: 752.5, h: 753, l: 752, c: 752.8, v: 1000 })) : []);
  const answer = (refuse: string | null) => (async (url: string) => (refuse && url.includes(`/ticker/${refuse}/`) ? { ok: false, status: 403, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ results: bars(url) }) })) as any;
  const secret = 'fake-' + 'value-for-test';
  const refused = ctxAt(at, { [KEY]: secret }); refused.fetch = answer('GLD');
  const r = await run(refused, 'data', 'pull', '--strict');
  assert.equal(r.code, 4); assert.match(r.text, /Problem: GLD 1d: data fetch failed after 3 tries: HTTP 403 \(the provider refused the key, or the plan does not cover/); assert.match(r.text, /Pulled SPY 30m: 2 new bars/);
  assert.ok(!r.text.includes(secret), 'the key is never printed');
  const good = ctxAt(at, { [KEY]: secret }); good.fetch = answer(null);
  const g = await run(good, 'data', 'pull', '--strict'); assert.equal(g.code, 0, g.text); assert.doesNotMatch(g.text, /Problem|Strict/);
});
