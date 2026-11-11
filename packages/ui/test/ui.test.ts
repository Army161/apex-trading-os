import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup as html } from 'react-dom/server';
import { STAGES } from '@apex/kernel';
import { VERDICTS } from '@apex/claims';
import { BANNERS, BASES, Banner, ChecksStrip, ChecksTable, ClaimCompare, EmptyState, FIXED, Funnel, GraduationClock, LockPanel, Metric, NEVER_WORDS, ProvenanceTable, Receipt, STATUS, SourceQuote, StatusChip, TOKENS, VERDICT_STATUS, WhyNot,
  checksSummary, contrast, contrastFailures, count, money, pct, ratio, share, shortHash, statusOf, tokensCss, type Check, type MetricProps } from '../src/index';

const SRC = join(__dirname, '../src');
const checks = (failed: number[]): Check[] => ['enough trades', 'monkey test', 'locked test window', 'one bar late', 'double costs', 'costs under half the moves', 'beats hold on risk'].map((name, i) => ({ n: i + 1, name, pass: !failed.includes(i + 1), why: `number ${i + 1}` }));

test('tokens: every text colour reads at 4.5:1 on every surface in both themes, and the file on disk is the generated one', () => {
  assert.deepEqual(contrastFailures(), []);
  assert.ok(contrast('#000000', '#ffffff') > 20.9 && Math.abs(contrast('#777777', '#777777') - 1) < 1e-9);
  assert.deepEqual(contrastFailures({ ...TOKENS, live: { ...TOKENS.live, light: '#b4520b' } }), ['light: --live on --chip is 4.49:1'], 'the design value this token was moved from is caught by the check');
  const file = join(SRC, 'tokens.css'); if (process.env.UPDATE_TOKENS === '1' || !existsSync(file)) writeFileSync(file, tokensCss());
  assert.equal(readFileSync(file, 'utf8'), tokensCss(), 'tokens.css is out of step with tokens.ts; run with UPDATE_TOKENS=1');
  for (const k of Object.keys(TOKENS)) { assert.match(TOKENS[k].light, /^#[0-9a-f]{6}$/); assert.match(TOKENS[k].dark, /^#[0-9a-f]{6}$/); }
  const css = readFileSync(join(SRC, 'ui.css'), 'utf8'), used = new Set([...css.matchAll(/var\(--([\w-]+)\)/g)].map(m => m[1])), known = new Set([...Object.keys(TOKENS), 'font-ui', 'font-num', 'radius-card', 'radius-control', 'motion']);
  assert.deepEqual([...used].filter(v => !known.has(v)), [], 'ui.css uses only tokens that exist'); assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css), 'no colour is written by hand in ui.css');
});

test('Metric: shows the figure with its basis, sample size and receipt, and refuses to render without them', () => {
  const m: MetricProps = { label: 'Return', value: 0.087, unit: 'pct', n: 51, nLabel: 'trades', basis: 'in-sample', net: true, receipt: 1284, receiptHref: '/ledger/1284' };
  const out = html(h(Metric, m));
  for (const s of ['Return', '+8.7%', 'Past data', 'n = 51 trades', 'after costs', 'href="/ledger/1284"', 'Receipt #1,284', '▲', 'data-metric-context="ok"']) assert.ok(out.includes(s), `missing ${s} in ${out}`);
  assert.match(html(h(Metric, { ...m, value: -0.021 })), /▼ <\/span>−2\.1%/); assert.match(html(h(Metric, { ...m, value: -0.021 })), /data-tone="bad"/);
  assert.match(html(h(Metric, { ...m, basis: 'forward' })), /data-tone="info">Forward/); assert.ok(!html(h(Metric, { label: 'Sharpe', value: 0.9, unit: 'ratio', n: 480, nLabel: 'days', basis: 'book' })).includes('▲'), 'a ratio is not a gain or a loss');
  assert.throws(() => html(h(Metric, { ...m, n: undefined as unknown as number })), /has no sample size/); assert.throws(() => html(h(Metric, { ...m, basis: undefined as unknown as 'book' })), /has no basis/);
  assert.throws(() => html(h(Metric, { ...m, n: NaN })), /sample size/);
  const env = process.env.NODE_ENV; try { (process.env as Record<string, string>).NODE_ENV = 'production'; const p = html(h(Metric, { ...m, n: undefined as unknown as number }));
    assert.match(p, /data-metric-context="missing"/); assert.match(p, /Context missing/); assert.match(p, /\+8\.7%/); } finally { (process.env as Record<string, string | undefined>).NODE_ENV = env; }
  assert.deepEqual(Object.keys(BASES), ['in-sample', 'forward', 'book']);
});

test('status: one vocabulary, every status a label and a shape, and the live colour only on live states', () => {
  for (const id of ['passed_pending_validation', 'needs_data', 'watch', 'rejected', 'paper', 'live_eligible', 'retired', ...STAGES.map(s => s.id)]) assert.ok(id in STATUS, `the ledger status ${id} has no entry`);
  for (const [id, d] of Object.entries({ ...STATUS, ...VERDICT_STATUS })) { assert.ok(d.label && d.shape && d.shapeName, id); assert.equal(d.tone === 'live', /^(micro_live|live_\d+)$/.test(id), `${id}: the live colour is for live stages only`); }
  assert.deepEqual(Object.keys(VERDICT_STATUS).sort(), [...VERDICTS].sort()); assert.notEqual(VERDICT_STATUS.holds_up.tone, 'acc', 'a pass on past data is not shown in the colour of something running');
  assert.equal(statusOf('paused_drift').label, 'Paused'); assert.deepEqual(statusOf('something_new'), { label: 'something new', shape: '?', shapeName: 'question mark', tone: 'mute' }); assert.equal(statusOf('constructor').shape, '?');
  const chip = html(h(StatusChip, { status: 'watch' })); assert.match(chip, /data-tone="warn"/); assert.match(chip, /aria-hidden="true">◐<\/span> Near miss/);
  assert.match(html(h(StatusChip, { status: 'micro_live' })), /data-tone="live".*LIVE 1%/); assert.match(html(h(StatusChip, { def: VERDICT_STATUS.no_edge })), /No edge found/);
});

test('checks: the table is a real table, and the strip says in words what its marks show', () => {
  assert.equal(checksSummary(checks([])), '7 of 7'); assert.equal(checksSummary(checks([1])), '6 of 7; failed: enough trades'); assert.equal(checksSummary(checks([2, 7])), '5 of 7; failed: monkey test, beats hold on risk'); assert.equal(checksSummary([]), 'not run');
  const strip = html(h(ChecksStrip, { checks: checks([1]) })); assert.match(strip, /role="img" aria-label="6 of 7; failed: enough trades"/); assert.equal(strip.match(/●/g)!.length, 6); assert.equal(strip.match(/✕/g)!.length, 1);
  const table = html(h(ChecksTable, { checks: checks([3]) })); assert.match(table, /<caption>The seven checks<\/caption>/); assert.equal(table.match(/<th scope="row">/g)!.length, 7); assert.equal(table.match(/<th scope="col">/g)!.length, 3);
  assert.match(table, /data-pass="false"><th scope="row">3\. locked test window<\/th><td><span class="ax-mark" data-tone="bad"><span aria-hidden="true">✕<\/span> Fail/);
});

test('funnel, graduation clock and locks: counts are written out, progress is in words, and no lock has a button', () => {
  const f = html(h(Funnel, { caption: 'Where every pair stands', stages: [{ label: 'Tried', count: 293 }, { label: 'Passed the gate', count: 2 }, { label: 'In paper', count: 1 }, { label: 'Eligible', count: 0, note: 'needs 6 forward months' }] }));
  assert.match(f, /<figcaption>Where every pair stands<\/figcaption>/); for (const s of ['Tried', '293', 'In paper', 'needs 6 forward months', 'width:100%', 'width:1%']) assert.ok(f.includes(s), s);
  const g = html(h(GraduationClock, { g: { months: 1.5, trades: 9, dsr: null, earliest: 'May 2027' } })); for (const s of ['1.50 of 6', '9 of 50', 'not enough forward trades to say', 'Earliest possible: May 2027 at the current pace', 'width:25%']) assert.ok(g.includes(s), s);
  assert.match(html(h(GraduationClock, { g: { months: 7, trades: 61, dsr: 0.97, earliest: null } })), /data-done="true"/); assert.match(html(h(GraduationClock, { g: { months: 0, trades: 0, dsr: null, earliest: null } })), /there are no forward trades/);
  const locks = html(h(LockPanel, { locks: [{ id: 'evidence', open: false, why: '2 of 6 forward months' }, { id: 'validated', open: true, why: 'validator run agreed' }, { id: 'approved', open: false, why: 'not signed' }, { id: 'machine', open: false, why: 'no live flag on any machine' }] }));
  assert.ok(!/<button|<a |<input|<form/.test(locks), 'the lock panel shows state only'); assert.match(locks, /Nothing on this page can open it/); assert.equal(locks.match(/Closed/g)!.length, 3); assert.equal(locks.match(/> Open</g)!.length, 1);
});

test('receipts, reasons, provenance, banners and empty states say what, why and what next', () => {
  const hash = 'a1b2c3d4'.repeat(8), r = html(h(Receipt, { entry: { seq: 1284, kind: 'trial_result', ts: Date.UTC(2026, 10, 11, 1, 5), actor: 'autopilot', hash, prevHash: hash, payloadHash: hash } }));
  for (const s of ['#1,284', 'trial_result', '2026-11-11 01:05 UTC', 'a1b2…c3d4', `title="${hash}"`, 'apex ledger show 1284', 'apex ledger verify']) assert.ok(r.includes(s), s);
  assert.match(html(h(WhyNot, { rules: [{ id: 'R7', text: 'Daily loss limit reached', detail: '2.1% of 2.0%' }] })), /<code>R7<\/code> Daily loss limit reached<span class="ax-n"> \(2\.1% of 2\.0%\)/);
  const p = html(h(ProvenanceTable, { rows: [{ dataset: 'csv:SPY:1h:split', source: 'massive', second: null, fetched: 0, adjustment: 'split', health: 'warn' }] })); assert.match(p, /One source cannot catch its own bad data/); assert.match(p, /data-tone="warn"><span aria-hidden="true">◐<\/span> Warning/);
  assert.match(html(h(Banner, { kind: 'halted' }, 'No new entries are being taken.')), /role="alert" data-tone="bad"><strong>Halted\.<\/strong> No new entries are being taken\./); assert.match(html(h(Banner, { kind: 'paper' }, FIXED.paper)), /role="status"/);
  assert.deepEqual(Object.keys(BANNERS).sort(), ['budget', 'data_blocked', 'halted', 'not_persistent', 'paper', 'run_failed']);
  assert.match(html(h(EmptyState, { title: 'No slots yet', reason: FIXED.nothingPassed, next: 'The next run is tonight.' })), /No slots yet.*Nothing has passed yet.*The next run is tonight\./);
});

test('claim check parts: claimed beside measured, and a rule always shown with the words it came from', () => {
  const c = html(h(ClaimCompare, { rows: [{ claim: 'Made 729% in profit', claimed: '729%', measured: '-1.6% total (7 trades, BTC 1d)' }] })); assert.match(c, /<caption>Claimed and measured<\/caption>/); assert.match(c, /<th scope="row">Made 729% in profit<\/th><td>729%<\/td><td>-1\.6% total/);
  const q = html(h(SourceQuote, { kind: 'Entry', text: 'Buy on a close above the 55-day high', quote: 'we buy when the daily close is <b>above</b>', offset: 24576, href: '#c24576' }));
  assert.match(q, /<blockquote>we buy when the daily close is &lt;b&gt;above&lt;\/b&gt;<\/blockquote>/, 'source text is escaped, never rendered as markup'); assert.match(q, /href="#c24576">In the source at character 24,576/);
});

test('formats and words: signed percentages, money to cents, short hashes, and no never-word outside the fixed denials', () => {
  assert.equal(pct(0.087), '+8.7%'); assert.equal(pct(-0.5), '−50.0%'); assert.equal(pct(0), '0.0%'); assert.equal(share(0.45), '45.0%'); assert.equal(money(-1234.5), '−$1,234.50'); assert.equal(money(441.84), '$441.84');
  assert.equal(ratio(1.031), '1.03'); assert.equal(count(1284), '1,284'); assert.equal(shortHash('abcdef0123456789'), 'abcd…6789'); assert.equal(shortHash('abc'), 'abc');
  const own = ['components.tsx', 'status.ts', 'tokens.ts'].map(f => readFileSync(join(SRC, f), 'utf8')).join('\n');
  assert.ok(!NEVER_WORDS.test(own), `a never-word is in a component: ${own.match(NEVER_WORDS)?.[0]}`); assert.ok(!/!['"`<]/.test(own.replace(/!==?|!\w|!\(/g, '')), 'no exclamation marks in copy');
  for (const w of ['guaranteed', 'risk-free', 'winning', 'proven']) assert.ok(NEVER_WORDS.test(`a ${w} system`), w); assert.ok(NEVER_WORDS.test(FIXED.paper), 'the paper notice names those words only to deny them');
});
