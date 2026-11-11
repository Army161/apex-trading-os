// The Autopilot screens' queries: each is a pure function of the ledger, so each is tested on a small ledger built here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ledger, MemoryLedgerStore, DEFAULT_LIMITS, type LedgerEntry } from '@apex/kernel';
import { RESUMABLE, board, book, confirmPhrase, dataHealth, intents, ledgerEntry, ledgerPage, pair, queue, risk, runs, slotDetail, slots, today, viewOf } from '../lib/queries';
import { inline, parseMarkdown } from '../lib/markdown';

const web = join(import.meta.dirname, '..'), T0 = 1_700_000_000_000, NOW = T0 + 3600e3, G = 'gate-v1';
const E = (seq: number, kind: string, payload: object, ts = T0 + seq) => ({ seq, ts, kind, actor: 'test', payload, payloadHash: `p${seq}`, prevHash: `h${seq - 1}`, hash: `h${seq}` }) as unknown as LedgerEntry;
const key = (c: string) => c.repeat(64);
const prereg = (seq: number, k: string, id: string, source: string, panel = 'csv:SPY:1h:split') => E(seq, 'prereg', { trialKey: key(k), gateVersion: G, source, panel, tf: '1h', hypothesis: `${id} has an edge`, passBar: 'all seven', strategy: { id, fingerprint: `fp-${id}` } });
const result = (seq: number, k: string, id: string, status: string, passes: number, sharpe: number, ret: number, symbol = 'SPY') => E(seq, 'trial_result', { trialKey: key(k), gateVersion: G, strategy: id, symbol, tf: '1h', panel: `csv:${symbol}:1h:split`, status, why: `${passes} of 7`,
  checks: [1, 2, 3, 4, 5, 6, 7].map(n => ({ n, name: `check ${n}`, pass: n <= passes, why: n <= passes ? 'ok' : 'short', value: n })), metrics: { trades: 60, ret, hold: 0.1, sharpe, holdSharpe: 0.7, dd: -0.1, holdDd: -0.2 }, readouts: { dsrN: 0.4, nTrials: 3 } });
const lock = (seq: number, slotKey: string, k: string) => E(seq, 'slot_locked', { slotKey, trialKey: key(k), strategy: 'alpha', dataset: 'csv:SPY:1h:split', symbol: 'SPY', tf: '1h', assetClass: 'equity', lockedAt: T0, inputHash: 'h', gateVersion: G, role: 'primary', baseline: {} });
const ENTRIES = [
  prereg(1, 'a', 'alpha', 'factory'), result(2, 'a', 'alpha', 'passed_pending_validation', 7, 0.9, 0.2),
  prereg(3, 'b', 'beta', 'queue:P3-1'), result(4, 'b', 'beta', 'watch', 5, 1.4, 0.9, 'QQQ'),
  prereg(5, 'c', 'gamma', 'queue:P3-1'), result(6, 'c', 'gamma', 'rejected', 5, 0.2, 2.5),
  prereg(7, 'd', 'delta', 'plan:batch-1'),
  E(8, 'data_version', { dataset: 'csv:SPY:1h:split', status: 'ok', tradable: true, rows: 100, first: T0, last: T0, source: 'csv', version: 'v1' }),
  E(9, 'data_version', { dataset: 'csv:IWM:1h:split', status: 'blocked', tradable: false, rows: 5, first: T0, last: T0, source: 'csv', version: 'v2', warnings: ['gaps'] }),
  E(10, 'data_version', { dataset: 'csv:QQQ:1h:split', status: 'warn', tradable: false, rows: 90, first: T0, last: T0, source: 'csv', version: 'v3', warnings: ['stale'] }),
  lock(11, 'alpha@csv:SPY:1h:split', 'a'),
  E(12, 'intent_blocked', { id: 'i1', slotKey: 'alpha@csv:SPY:1h:split', symbol: 'SPY', side: 1, barT: T0, rules: [{ id: 'R3', detail: 'two positions open, limit two' }] }),
  E(13, 'halt', { level: 'andon', by: 'cli', reason: 'checking a fill' }),
  E(14, 'run', { id: '20231114T221320-full', mode: 'full', evaluated: 3, newTrials: 3, intents: 1, blocked: 1, fills: 0, errors: 2, waitingBudget: 1, problems: ['one feed timed out'] }),
];
const V = viewOf(ENTRIES, 10000);

test('board: sorted by status, then checks passed, then Sharpe, and never by return', () => {
  const b = board(V);
  assert.deepEqual(b.rows.map(r => r.strategy), ['alpha', 'beta', 'gamma'], 'gamma has the highest return and still comes last');
  assert.equal(b.total, 3, 'a pair that is registered but has not run is not on the board');
  assert.equal(b.rows[0].status, 'paper', 'a pair with a slot shows the slot status'); assert.equal(b.rows[0].slotKey, 'alpha@csv:SPY:1h:split');
  assert.deepEqual([b.markets, b.tfs], [['QQQ', 'SPY'], ['1h']]);
  assert.deepEqual(board(V, { market: 'QQQ' }).rows.map(r => r.strategy), ['beta']); assert.deepEqual(board(V, { q: 'GAM' }).rows.map(r => r.strategy), ['gamma']);
  assert.deepEqual(board(V, { status: 'watch' }).rows.map(r => r.strategy), ['beta']); assert.equal(board(V, { status: 'nope' }).rows.length, 0);
  const same = viewOf([prereg(1, 'a', 'low', 'factory'), result(2, 'a', 'low', 'watch', 5, 0.3, 9), prereg(3, 'b', 'high', 'factory'), result(4, 'b', 'high', 'watch', 5, 1.1, -0.5)], 10000);
  assert.deepEqual(board(same).rows.map(r => r.strategy), ['high', 'low'], 'equal status and checks: the steadier one first');
});

test('pair: found by key prefix, with what was written down before it ran', () => {
  const p = pair(V, ENTRIES, key('b').slice(0, 16)); assert.ok(p);
  assert.deepEqual([p.row.strategy, p.hypothesis, p.passBar, p.preregSeq, p.row.seq, p.row.passed], ['beta', 'beta has an edge', 'all seven', 3, 4, 5]);
  assert.equal(p.receipt?.seq, 4); assert.deepEqual(p.validator, []);
  assert.equal(pair(V, ENTRIES, 'zzzz'), null); assert.equal(pair(V, ENTRIES, ''), null, 'an empty key matches nothing');
});

test('slots: the two live locks a dashboard cannot hold are always closed here', () => {
  assert.deepEqual(slots(V).map(s => [s.slotKey, s.status, s.role]), [['alpha@csv:SPY:1h:split', 'paper', 'primary']]);
  const d = slotDetail(V, ENTRIES, 'alpha@csv:SPY:1h:split', NOW); assert.ok(d);
  assert.equal(d.locks.length, 4); assert.ok(d.locks.every(l => !l.open), 'a slot in paper has no open lock');
  assert.deepEqual([d.forward.n, d.position, d.inSample?.strategy, d.lock?.seq, d.clock.state], [0, null, 'alpha', 11, null]);
  assert.deepEqual([d.clock.needMonths, d.clock.needTrades, d.clock.needDsr], [6, 50, 0.95]);
  assert.deepEqual(d.intents.map(i => [i.ok, i.rules[0].id]), [[false, 'R3']]);
  assert.equal(slotDetail(V, ENTRIES, 'nope', NOW), null);
});

test('book and risk: an empty book is flat, and a blocked order keeps its rule', () => {
  const b = book(V, ENTRIES, DEFAULT_LIMITS, NOW);
  assert.deepEqual([b.summary.capital, b.summary.equity, b.summary.drawdown, b.summary.open, b.summary.closed], [10000, 10000, 0, 0, 0]);
  assert.equal(b.summary.limits.dailyLossPct, DEFAULT_LIMITS.dailyLossPct); assert.equal(b.summary.costs, null);
  assert.deepEqual(b.blocked.map(i => i.rules[0].detail), ['two positions open, limit two']);
  assert.deepEqual(intents(ENTRIES, { slotKey: 'other' }), []);
  const r = risk(V, ENTRIES, DEFAULT_LIMITS, NOW);
  assert.deepEqual(r.halts.map(h => [h.level, h.by, h.reason]), [['andon', 'cli', 'checking a fill']]);
  assert.deepEqual(r.history.map(h => [h.kind, h.seq]), [['halt', 13]]);
  for (const l of r.limits) { assert.equal(l.inForce, l.def, l.key); assert.ok(l.inForce <= l.ceiling, `${l.key} is within its ceiling`); assert.equal(l.pending, null); }
  assert.deepEqual(r.exposure, []); assert.equal(r.drift.length, 1);
  const after = [...ENTRIES, E(15, 'resume', { level: 'andon', by: 'you', reason: 'fill checked' })];
  const r2 = risk(viewOf(after, 10000), after, DEFAULT_LIMITS, NOW);
  assert.deepEqual([r2.halts.length, r2.history.map(h => h.kind)], [0, ['resume', 'halt']], 'the halt is released and both stay in the history');
});

test('resume: only named levels, and the phrase names the level', () => {
  assert.deepEqual(Object.keys(RESUMABLE), ['andon', 'kill', 'book-drawdown']);
  assert.equal(confirmPhrase('andon'), 'resume andon'); assert.notEqual(confirmPhrase('kill'), confirmPhrase('andon'));
  for (const bad of ['__proto__', 'constructor', 'toString', 'live', '']) assert.equal(Object.prototype.hasOwnProperty.call(RESUMABLE, bad), false, bad);
  const route = readFileSync(join(web, 'app/api/resume/route.ts'), 'utf8'), order = ['isAdmin()', "headers.get('origin')", 'hasOwnProperty.call(RESUMABLE', 'confirmPhrase(level)', 'ledgerResume('].map(x => route.indexOf(x));
  assert.ok(order.every(i => i > 0), 'the route checks the session, the origin, the level and the phrase');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'and it checks them all before it writes');
  assert.doesNotMatch(route, /approval|signoff|setLimit|slot_status/i, 'a resume cannot approve, sign or move a slot');
  const red = readFileSync(join(web, '../.github/red-paths.txt'), 'utf8'); assert.match(red, /web\/app\/api\/resume\//);
});

test('data health, runs and queue', () => {
  assert.deepEqual(dataHealth(V, ENTRIES).map(d => [d.dataset, d.status, d.tradable, d.seq]), [['csv:IWM:1h:split', 'blocked', false, 9], ['csv:QQQ:1h:split', 'warn', false, 10], ['csv:SPY:1h:split', 'ok', true, 8]], 'problems first');
  assert.deepEqual(runs(ENTRIES).map(r => [r.id, r.mode, r.errors, r.problems]), [['20231114T221320-full', 'full', 2, ['one feed timed out']]]);
  const q = queue(V, ENTRIES, 25, NOW);
  assert.deepEqual([q.used, q.budget, q.waiting], [3, 25, 1], 'factory and queue tries count against the week; an approved plan batch does not');
  assert.deepEqual(q.items.map(i => [i.source, i.pairs, i.done, i.passed, i.nearMiss]), [['plan:batch-1', 1, 0, 0, 0], ['queue:P3-1', 2, 2, 0, 1], ['factory', 1, 1, 1, 0]]);
  assert.equal(queue(V, ENTRIES, 25, NOW + 8 * 86400e3).used, 0, 'tries older than a week no longer count');
});

test('today: what needs a person comes from the ledger, each with where to go', () => {
  const t = today(V, ENTRIES, DEFAULT_LIMITS, NOW);
  assert.deepEqual(t.needsYou.map(n => n.href), ['/autopilot/risk', '/autopilot/data', '/autopilot/reports']);
  assert.match(t.needsYou[0].text, /andon.*checking a fill/); assert.match(t.needsYou[1].text, /1 dataset is blocked: csv:IWM/); assert.match(t.needsYou[2].text, /2 errors/);
  assert.deepEqual(t.nearMisses.map(r => r.strategy), ['beta', 'gamma'], 'near misses leave out anything that holds a slot, and are not sorted by return');
  assert.deepEqual([t.slots.length, t.lastRun?.id, t.funnel.tried], [1, '20231114T221320-full', 3]);
  const calm = today(viewOf(ENTRIES.slice(0, 2), 10000), ENTRIES.slice(0, 2), DEFAULT_LIMITS, NOW); assert.deepEqual([calm.needsYou, calm.lastRun], [[], null]);
});

test('ledger: pages newest first, filters, and a changed entry breaks the chain', async () => {
  const store = new MemoryLedgerStore(), led = new Ledger(store, () => T0);
  for (let i = 0; i < 7; i++) await led.append(i % 2 ? 'resume' : 'halt', 'test', i % 2 ? { level: 'andon', by: 'you' } : { level: 'andon', by: 'cli', reason: `r${i}`, slotKey: i === 4 ? 's1' : undefined });
  const all = await store.read();
  const p1 = ledgerPage(all, { limit: 3 }); assert.deepEqual([p1.rows.map(r => r.seq), p1.next, p1.total, p1.chain.ok, p1.head?.seq, p1.kinds], [[7, 6, 5], 5, 7, true, 7, ['halt', 'resume']]);
  const p2 = ledgerPage(all, { limit: 3, before: p1.next! }); assert.deepEqual([p2.rows.map(r => r.seq), p2.next], [[4, 3, 2], 2]);
  assert.deepEqual([ledgerPage(all, { limit: 3, before: 2 }).rows.map(r => r.seq), ledgerPage(all, { limit: 3, before: 2 }).next], [[1], null]);
  assert.deepEqual(ledgerPage(all, { kind: 'resume' }).rows.map(r => r.seq), [6, 4, 2]); assert.deepEqual(ledgerPage(all, { slot: 's1' }).rows.map(r => r.seq), [5]);
  assert.equal(ledgerPage(all, { limit: 100000 }).rows.length, 7); assert.match(p1.rows[0].summary, /andon: r6/);
  const e = ledgerEntry(all, 4); assert.deepEqual([e?.receipt.seq, e?.prev, e?.next, e?.summary], [4, 3, 5, 'andon resumed by you']);
  assert.deepEqual([ledgerEntry(all, 1)?.prev, ledgerEntry(all, 7)?.next, ledgerEntry(all, 99)], [null, null, null]);
  const forged = all.map(x => x.seq === 3 ? { ...x, payload: { ...x.payload, reason: 'edited later' } } : x), bad = ledgerPage(forged);
  assert.deepEqual([bad.chain.ok, bad.chain.badSeq], [false, 3]);
});

test('report text: parsed into data, so nothing in a report can become markup', () => {
  const b = parseMarkdown('# Title\n\nPaper mode. Run `r1` was **clean**.\nSecond line.\n\n- one\n- two `x`\n\n| Slot | Status |\n|---|---|\n| a@b | paper |\n\n```\nraw <b>\n```\n\n<script>alert(1)</script>');
  assert.deepEqual(b.map(x => x.t), ['h', 'p', 'ul', 'table', 'pre', 'p']);
  assert.deepEqual(b[1], { t: 'p', inline: [{ t: 'text', s: 'Paper mode. Run ' }, { t: 'code', s: 'r1' }, { t: 'text', s: ' was ' }, { t: 'strong', s: 'clean' }, { t: 'text', s: '. Second line.' }] });
  assert.deepEqual(b[2].t === 'ul' && b[2].items.length, 2);
  assert.deepEqual(b[3].t === 'table' && [b[3].head.length, b[3].rows.length, b[3].rows[0][0]], [2, 1, [{ t: 'text', s: 'a@b' }]]);
  assert.deepEqual(b[5], { t: 'p', inline: [{ t: 'text', s: '<script>alert(1)</script>' }] }, 'a tag stays text');
  assert.deepEqual(inline('a | b'), [{ t: 'text', s: 'a | b' }]); assert.deepEqual(parseMarkdown(''), []); assert.equal(parseMarkdown('| lone pipe').length, 1, 'a stray table line does not loop');
  assert.doesNotMatch(readFileSync(join(web, 'components/Markdown.tsx'), 'utf8'), /dangerouslySetInnerHTML/);
});
