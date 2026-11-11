// The claim check flow on a real Postgres (docs/design/12 s4.3, s5 and s13; build plan P5.3): the per-account ledger, the
// count of tries, the monthly quota at its boundary, and the two job steps run twice, at once and after a crash.
// The model is a stand-in that hands back a hand-written extraction, so no key is needed and nothing is spent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import type { Bar } from '@apex/engine/core';
import { EXAMPLE } from '@apex/engine/spec';
import { engineFingerprint } from '@apex/engine/fingerprint';
import { GATE_V1, verifyChain } from '@apex/kernel';
import { Ledger, LedgerConflict, makeEntry } from '@apex/kernel/ledger';
import { PRIOR_COSTS, type ClaimExtraction, type Extracted } from '@apex/claims';
import { versionOf } from '@apex/data/bars';
import type { DataHealth, DatasetSpec, LoadedDataset } from '@apex/data/types';
import { MemoryBlobs, advance, finish, history, inputKey, rulePage, startCheck, type Deps } from '../lib/checks';
import { asUser, asWorker } from '../lib/db';
import { AccountLedgerStore, familyOf } from '../lib/ledger';
import { PLANS, periodStart, triesPerWeek } from '../lib/plans';
import { MESSAGES } from '../lib/copy';

const DB = resolve(__dirname, '../db'), admin = process.env.APEX_TEST_DATABASE_URL, NOW = Date.UTC(2026, 10, 11, 12);
const id = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;

// A source with a real edge on planted bars: buy the high-volume marker bar, hold a few bars, 3% stop.
const TEXT = 'My rule is simple. Buy at the close when volume is more than 1.5 times normal. Use a 3 percent stop. Get out after 4 bars. Trade it on the TEST daily chart. It made 250% for me.';
const ev = (quote: string) => ({ quote, offset: TEXT.indexOf(quote) });
const rules = (maxBars: number) => ({ ...EXAMPLE, name: 'Volume marker', description: 'Buy the high-volume bar', symbol: 'TEST', tf: '1d', direction: 'long', indicators: [], long_entry: [{ left: 'volume', op: '>', right: '1.5' }], short_entry: [], exit_long: [], exit_short: [],
  stop: { type: 'pct', value: 0.03, left: null, right: null, operand: null, operand_short: null }, target: { type: 'none', value: 0, operand: null, operand_short: null }, max_bars: maxBars, unsupported: [], session: null, flat_at_close: null, cooldown_bars: null, trail: null });
const extraction = (holds: number[]): ClaimExtraction => ({ title: 'Volume marker', sourceKind: 'rules',
  claims: [{ text: 'It made 250%', metric: 'return', value: 250, unit: '%', period: null, evidence: ev('It made 250% for me') }],
  ruleSets: [{ name: 'Volume marker', market: ['TEST'], timeframe: ['daily'], direction: 'long', entry: [{ text: 'Buy at the close when volume is more than 1.5 times normal', evidence: ev('Buy at the close when volume is more than 1.5 times normal') }],
    exit: [{ text: 'Exit after 4 bars', evidence: ev('Get out after 4 bars') }], stop: { text: '3% stop', evidence: ev('Use a 3 percent stop') }, target: null, filters: [], sizing: null, assumptions: [], ambiguity: 'low' }],
  interpretations: holds.map((n, i) => ({ ruleSet: 0, label: i ? `Hold ${n} bars instead` : 'As stated', target: 'spec' as const, template: null, spec: rules(n), unsupported: [] })), flags: [] });
const SPEC: DatasetSpec = { id: 'csv:TEST:1d:raw', source: 'csv', symbol: 'TEST', tf: '1d', assetClass: 'crypto', adj: 'raw', session: '24x7', calendar: 'CRYPTO', panels: ['test'], costBucket: 'liquid' };
// Daily bars with a planted edge: every 12th bar is a marker (volume 2) and the four bars after it drift up. The product does
// not reach into another package's test folder, so the generator the kernel's tests use is repeated here.
function plantedBars(n: number): Bar[] {
  let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647, gauss = () => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r()), out: Bar[] = []; let c = 100;
  for (let i = 0; i < n; i++) {
    const k = i % 12, open = c; c = open * (1 + (k >= 1 && k <= 4 ? 0.006 : 0) + 0.005 * gauss());
    const h = Math.max(open, c) * (1 + Math.abs(0.0015 * gauss())), l = Math.min(open, c) * (1 - Math.abs(0.0015 * gauss()));
    out.push({ t: Date.UTC(2015, 0, 5) + i * 864e5, o: open, h, l, c, v: k === 0 ? 2 : 1 });
  }
  return out;
}
const bars: Bar[] = plantedBars(2200), DATA: LoadedDataset = { spec: SPEC, bars, version: versionOf(bars), fetchedAt: 1 };
const HEALTH: DataHealth = { dataset: SPEC.id, version: DATA.version, at: 1, status: 'ok', tradable: true, checks: [], provenance: { source: 'csv', fetchedAt: 1, adj: 'raw', termsRef: 'test' } };

test('rule family: the same rules with other numbers are one family, and other rules are another', () => {
  assert.equal(familyOf({ template: 'breakout_channel', params: { entryN: 55 } }), 'template:breakout_channel');
  assert.equal(familyOf({ template: 'breakout_channel', params: { entryN: 20, exitN: 10 } }), 'template:breakout_channel');
  const a = familyOf(rules(4)); assert.match(a, /^rules:[0-9a-f]{16}$/); assert.equal(familyOf(rules(9)), a);
  assert.equal(familyOf({ ...rules(4), long_entry: [{ left: 'volume', op: '>', right: '2.5' }] }), a, 'a number inside a condition is still a number');
  assert.notEqual(familyOf({ ...rules(4), long_entry: [{ left: 'close', op: '>', right: 'sma(20)' }] }), a);
  assert.equal(triesPerWeek(PLANS.free), 3); assert.equal(periodStart(NOW), '2026-11-01'); assert.equal(periodStart(Date.UTC(2026, 11, 31, 23, 59)), '2026-12-01');
});

test('claim check flow: per-account ledger, counted tries, quota at the boundary, steps that are safe to repeat', { skip: !admin && 'set APEX_TEST_DATABASE_URL to run' }, async () => {
  const name = `proof_flow_${process.pid}_${Date.now()}`, root = new pg.Client(admin); await root.connect(); await root.query(`create database ${name}`);
  const url = new URL(admin!); url.pathname = `/${name}`; const pool = new pg.Pool({ connectionString: url.toString(), max: 6 });
  try {
    await pool.query(readFileSync(join(DB, 'test/supabase_shim.sql'), 'utf8'));
    for (const f of readdirSync(join(DB, 'migrations')).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort()) await pool.query(readFileSync(join(DB, 'migrations', f), 'utf8'));
    const [A, B, C, D, E] = [1, 2, 3, 4, 5].map(id);
    for (const [who, n] of [[A, 'a'], [B, 'b'], [C, 'c'], [D, 'd'], [E, 'e']]) await pool.query('insert into auth.users (id, email) values ($1, $2)', [who, `${n}@example.test`]);
    await pool.query("update accounts set plan = 'trader' where id = $1", [B]);

    const blobs = new MemoryBlobs(); let calls = 0, next: () => Extracted = () => ({ ok: true, extraction: extraction([4]), attempts: 1 }), dataCalls = 0, dataFails = false;
    const deps: Deps = { pool, blobs, now: () => NOW, gate: GATE_V1, costModel: PRIOR_COSTS, engineFingerprint: engineFingerprint(),
      extract: async () => { calls++; return { extracted: next(), usd: 0.02 }; },
      data: async () => { dataCalls++; if (dataFails) throw new Error('the data provider did not answer'); return { datasets: [DATA], health: [HEALTH] }; } };
    const one = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows[0];
    const usage = async (who: string) => { const r = await one('select checks_used, tries_used, ai_usd from usage where account_id = $1', [who]); return r ? [r.checks_used, r.tries_used, Number(r.ai_usd)] : null; };
    const kinds = async (who: string) => (await pool.query('select kind from ledger where account_id = $1 order by seq', [who])).rows.map(r => r.kind);
    const started = async (who: string, text = TEXT) => { const s = await startCheck(deps, who, { text, kind: 'rules' }); assert.ok(s.ok, s.ok ? '' : s.error); return s.id; };

    // ---- start: as the signed-in person. The text goes to the store, not the database. ----
    assert.deepEqual(await startCheck(deps, A, { text: 42 }), { ok: false, status: 422, error: 'Not checked: the input must be text.' });
    assert.equal((await startCheck(deps, id(9), { text: TEXT, kind: 'rules' }) as any).status, 404);
    const a1 = await started(A), row = await one('select * from claim_checks where id = $1', [a1]);
    assert.equal(row.status, 'queued'); assert.equal(row.account_id, A); assert.equal(row.input_uri, inputKey(A, row.input_hash)); assert.deepEqual(blobs.keys(), [row.input_uri]);
    assert.doesNotMatch(JSON.stringify(row), /Buy at the close/, 'the pasted text is not in the row');
    assert.deepEqual(await startCheck(deps, A, { text: TEXT, kind: 'rules' }), { ok: false, status: 429, error: MESSAGES.busy(1) }, 'the free plan runs one check at a time');

    // ---- extract: one model call, the answer kept, nothing tested and nothing counted but the spend ----
    assert.deepEqual(await advance(deps, a1), { id: a1, status: 'planned', moved: true });
    assert.equal(calls, 1); assert.deepEqual(await kinds(A), []); assert.deepEqual(await usage(A), [0, 0, 0.02]);
    const kept = (await one('select extraction from claim_checks where id = $1', [a1])).extraction; assert.equal(kept.ok, true); assert.equal(kept.leftOut, 0); assert.equal(kept.extraction.interpretations.length, 1);

    // ---- run: written down before it runs, in A's own chain, and counted once ----
    assert.deepEqual(await advance(deps, a1), { id: a1, status: 'done', moved: true });
    assert.deepEqual(await kinds(A), ['gate_version', 'prereg', 'trial_result', 'claim_check']);
    const store = (q: any, who: string) => new AccountLedgerStore(q, who), entries = await asWorker(pool, q => store(q, A).read()); assert.ok(verifyChain(entries).ok);
    const done = await one('select status, verdict, result, trials_used, title from claim_checks where id = $1', [a1]);
    assert.equal(done.verdict, 'holds_up'); assert.equal(done.trials_used, 1); assert.equal(done.title, 'Volume marker'); assert.equal(done.result.counted, true); assert.deepEqual(done.result.tries, { planned: 1, fresh: 1, leftThisWeek: 3, everAfter: 1 });
    assert.deepEqual(await usage(A), [1, 1, 0.02]);
    const fam = familyOf(entries[1].payload.rules); assert.deepEqual((await pool.query('select first_seq::int, family, panel from trials where account_id = $1', [A])).rows, [{ first_seq: 2, family: fam, panel: SPEC.id }]);
    // Again, and from two workers at once: nothing moves, nothing is called, nothing is written.
    assert.deepEqual(await Promise.all([advance(deps, a1), advance(deps, a1), finish(deps, a1)]), Array(3).fill({ id: a1, status: 'done', moved: false }));
    assert.equal(calls, 1); assert.equal((await kinds(A)).length, 4); assert.deepEqual(await usage(A), [1, 1, 0.02]);

    // ---- the same rules again cost a check but not a try; another version is a second try in the same family ----
    const a2 = await started(A); assert.equal((await finish(deps, a2)).status, 'done'); assert.deepEqual(await usage(A), [2, 1, 0.04]);
    assert.deepEqual((await kinds(A)).slice(4), ['claim_check']);
    next = () => ({ ok: true, extraction: extraction([6, 7, 8]), attempts: 1 });                // three readings offered; the free plan tests one
    const a3 = await started(A); assert.equal((await finish(deps, a3)).status, 'done');
    const r3 = (await one('select result from claim_checks where id = $1', [a3])).result; assert.equal(r3.leftOut, 2); assert.equal(r3.tries.planned, 1); assert.equal(r3.tries.everAfter, 2);
    assert.deepEqual(await usage(A), [3, 2, 0.06]);
    // The month is used up: a fourth check is refused before anything is stored or called.
    const before = { calls, blobs: blobs.keys().length };
    assert.deepEqual(await startCheck(deps, A, { text: TEXT, kind: 'rules' }), { ok: false, status: 402, error: MESSAGES.quota(3, 3) });
    assert.deepEqual({ calls, blobs: blobs.keys().length }, before); assert.equal((await one('select count(*)::int n from claim_checks where account_id = $1', [A])).n, 3);

    // ---- a paid plan tests three readings: three tries, one family, and the page says so ----
    const b1 = await started(B); assert.equal((await finish(deps, b1)).status, 'done'); assert.deepEqual(await usage(B), [1, 3, 0.02]);
    assert.deepEqual(await kinds(B), ['gate_version', 'prereg', 'prereg', 'prereg', 'trial_result', 'trial_result', 'trial_result', 'claim_check'], 'every reading is written down before any of them runs');
    assert.ok(verifyChain(await asWorker(pool, q => store(q, B).read())).ok);
    const pageB = (await rulePage(deps, B, fam))!; assert.equal(pageB.tries, 3); assert.equal(pageB.line, 'You tried 3 versions of this rule. The best one is marked down for that.');
    assert.deepEqual(pageB.versions.map(v => [v.seq, v.status !== null, v.triesThen]), [[2, true, 3], [3, true, 3], [4, true, 3]]); assert.ok(pageB.best !== null && pageB.versions[pageB.best].sharpe === Math.max(...pageB.versions.map(v => v.sharpe!)));
    // Each person sees their own history and their own count, and nothing of the other's.
    const hA = await history(deps, A), hB = await history(deps, B);
    assert.deepEqual(hA.checks.map(c => c.id).sort(), [a1, a2, a3].sort()); assert.deepEqual(hA.families, [{ family: fam, tries: 2 }]); assert.deepEqual(hA.usage, { period: '2026-11-01', checks: 3, tries: 2, checksPerMonth: 3 });
    assert.deepEqual(hB.checks.map(c => [c.id, c.verdict !== null, c.newTries, c.counted, c.families]), [[b1, true, 3, true, [fam]]]); assert.deepEqual(hB.families, [{ family: fam, tries: 3 }]);
    assert.equal((await rulePage(deps, A, fam))!.tries, 2); assert.equal(await rulePage(deps, A, 'template:none'), null);
    assert.equal((await asUser(pool, A, q => q.query('select count(*)::int n from ledger where account_id = $1', [B]))).rows[0].n, 0);

    // ---- what does not count: unreadable, refused at the boundary, failed on Proof's side ----
    next = () => ({ ok: false, reason: 'could not extract rules reliably', errors: ['claim 1: no quote'], attempts: 2 });
    const c1 = await started(C); assert.equal((await finish(deps, c1)).status, 'done');
    const u = await one('select verdict, result from claim_checks where id = $1', [c1]); assert.equal(u.verdict, 'untestable'); assert.equal(u.result.counted, false);
    assert.deepEqual(await usage(C), [0, 0, 0.02]); assert.deepEqual(await kinds(C), ['claim_check'], 'an unreadable source is still on the record');
    next = () => ({ ok: true, extraction: extraction([4]), attempts: 1 });
    // The quota is checked again when the run starts, with the usage row locked: two checks cannot both take the last place.
    const c2 = await started(C); await advance(deps, c2); await pool.query('update usage set checks_used = 3 where account_id = $1', [C]);
    assert.deepEqual(await advance(deps, c2), { id: c2, status: 'refused', moved: true });
    assert.deepEqual((await one('select result from claim_checks where id = $1', [c2])).result, { reason: MESSAGES.quota(3, 3), counted: false }); assert.deepEqual(await kinds(C), ['claim_check']); assert.deepEqual(await usage(C), [3, 0, 0.04]);
    // The model fails, then the data fails: the check ends as failed, nothing is counted, nothing is in the ledger.
    next = () => { throw new Error('the model\n did not answer'); };
    const d1 = await started(D); assert.deepEqual(await finish(deps, d1), { id: d1, status: 'failed', moved: false });
    assert.deepEqual((await one('select result from claim_checks where id = $1', [d1])).result, { error: 'the model did not answer', counted: false }); assert.equal(await usage(D), null);
    next = () => ({ ok: true, extraction: extraction([4]), attempts: 1 });
    const d2 = await started(D); await advance(deps, d2); dataFails = true; assert.equal((await advance(deps, d2)).status, 'failed'); dataFails = false;
    assert.deepEqual(await kinds(D), []); assert.deepEqual(await usage(D), [0, 0, 0.02]);
    assert.deepEqual((await pool.query('select kind, detail from events where account_id = $1 order by id', [D])).rows, [{ kind: 'check_failed', detail: { step: 'extracting' } }, { kind: 'check_failed', detail: { step: 'running' } }]);
    // A suspended account starts nothing.
    await pool.query("update accounts set status = 'suspended' where id = $1", [D]); assert.deepEqual(await startCheck(deps, D, { text: TEXT, kind: 'rules' }), { ok: false, status: 403, error: MESSAGES.notActive });

    // ---- after a crash, and with two workers on the same step ----
    const e1 = await started(E); await pool.query("update claim_checks set status = 'extracting' where id = $1", [e1]);            // a worker died after taking the step
    const n0 = calls; assert.deepEqual(await advance(deps, e1), { id: e1, status: 'planned', moved: true }); assert.equal(calls, n0 + 1);
    await pool.query("update claim_checks set status = 'running' where id = $1", [e1]);                                             // and another died in the run, having written nothing
    const both = await Promise.all([advance(deps, e1), advance(deps, e1)]);
    assert.equal(both.filter(s => s.moved).length, 1, JSON.stringify(both)); assert.deepEqual(await kinds(E), ['gate_version', 'prereg', 'trial_result', 'claim_check']); assert.deepEqual(await usage(E), [1, 1, 0.02]);
    // The stored text was changed after the check started: the step fails and says why.
    const e2 = await started(E); await blobs.put((await one('select input_uri from claim_checks where id = $1', [e2])).input_uri, TEXT.replace('4 bars', '9 bars'));
    assert.equal((await finish(deps, e2)).status, 'failed'); assert.match((await one('select result from claim_checks where id = $1', [e2])).result.error, /does not match the hash/);

    // ---- the chain itself: no fork, no entry out of order, no result without its pre-registration ----
    const head = (await asWorker(pool, q => store(q, E).head()))!;
    await assert.rejects(asWorker(pool, q => store(q, E).append(makeEntry({ seq: head.seq - 1, hash: head.hash }, NOW, 'run', 'test', { id: 'x', mode: 'check' }))), LedgerConflict);
    await assert.rejects(asWorker(pool, q => new Ledger(store(q, E), () => NOW).append('trial_result', 'test', { trialKey: 'f'.repeat(64), gateVersion: 'x' })), /no pre-registration/);
    assert.equal((await asWorker(pool, q => store(q, E).head()))!.seq, head.seq);
    assert.throws(() => new AccountLedgerStore(pool, "x' or '1'='1"), /not an account id/);
  } finally { await pool.end(); await root.query(`drop database if exists ${name} with (force)`); await root.end(); }
});
