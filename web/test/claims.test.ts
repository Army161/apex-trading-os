// A claim check from the dashboard, end to end against a file ledger: plan shows no result and writes nothing, run records
// the check and counts the tries once. The extraction is the hand-written one for the archived Turtle transcript.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { viewOf, claimChecks, claimDetail, ledgerPage } from '../lib/queries';

const root = join(import.meta.dirname, '../..'), dir = mkdtempSync(join(tmpdir(), 'apex-claims-')), file = join(dir, 'ledger.jsonl');
writeFileSync(file, ''); process.env.APEX_LEDGER_FILE = file; process.env.APEX_ROOT = root; delete process.env.DATABASE_URL; delete process.env.ANTHROPIC_API_KEY;
const lib = () => import('../lib/claimrun');      // loaded after the environment above is set
const TURTLE = readFileSync(join(root, 'archive/chat/03-turtle-breakout-ai-trading-bot-tradingview.md'), 'utf8').replace(/^<!--.*?-->\s*/, '');
const EXTRACTION = JSON.parse(readFileSync(join(root, 'packages/claims/test/fixtures/turtle.extraction.json'), 'utf8'));
const entries = () => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const NOW = Date.UTC(2026, 10, 11);

test('claim check: refusals say why, and nothing is written', async () => {
  const { claimCheck, repoRoot } = await lib();
  assert.equal(repoRoot(), root);
  const short = await claimCheck({ text: 'buy low' }); assert.ok(!short.ok && short.status === 422 && /Not checked/.test(short.error));
  const noKey = await claimCheck({ text: TURTLE }, { now: NOW }); assert.ok(!noKey.ok && noKey.status === 503 && /No model key/.test(noKey.error));
  const unplanned = await claimCheck({ text: TURTLE, run: true }, { now: NOW, aiEnabled: true }); assert.ok(!unplanned.ok && /Plan the check first/.test(unplanned.error), 'a run never calls the model: it uses the rules the plan showed');
  assert.equal(entries().length, 0);
});

test('claim check: the plan counts the tries and carries no result', async () => {
  const { claimCheck } = await lib();
  const p = await claimCheck({ text: TURTLE, extraction: EXTRACTION }, { now: NOW }); assert.ok(p.ok && p.step === 'plan');
  assert.deepEqual([p.plan.readings.length, p.plan.tries.planned, p.plan.tries.fresh, p.plan.waiting, p.plan.headline], [1, 1, 1, false, null]);
  assert.match(p.plan.readings[0].data, /^BTC 1d/); assert.equal(p.plan.readings[0].newTrial, true); assert.equal(p.extraction?.title, 'Turtle Breakout 55/20');
  const sent = JSON.stringify({ plan: p.plan }); for (const k of ['verdict', 'metrics', 'checks', 'sharpe', 'status', 'readouts']) assert.ok(!sent.includes(`"${k}"`), `the plan does not carry ${k}`);
  assert.equal(entries().length, 0, 'planning writes nothing');
  const bad = await claimCheck({ text: TURTLE, extraction: { title: 'x' } }, { now: NOW }); assert.ok(bad.ok && bad.step === 'plan');
  assert.ok(bad.extractionErrors.length > 0); assert.deepEqual([bad.plan.readings.length, bad.plan.tries.fresh], [0, 0]); assert.match(bad.plan.headline ?? '', /could not test/);
  const forged = structuredClone(EXTRACTION); forged.ruleSets[0].entry[0].evidence.quote = 'buy whenever the model says so';
  const f = await claimCheck({ text: TURTLE, extraction: forged }, { now: NOW }); assert.ok(f.ok && f.step === 'plan' && f.extractionErrors.length > 0, 'a quote that is not in the source fails the check on the way back in');
});

test('claim check: the run is recorded, pre-registered first, and counted once', async () => {
  const { claimCheck, planOf } = await lib();
  const r = await claimCheck({ text: TURTLE, extraction: EXTRACTION, run: true }, { now: NOW }); assert.ok(r.ok && r.step === 'run');
  assert.deepEqual([r.result.verdict, r.result.tries.fresh, r.result.ruleSets[0].tested.length], ['no_edge', 1, 1]);
  const es = entries(), kinds = es.map(e => e.kind); assert.deepEqual(kinds, ['gate_version', 'prereg', 'trial_result', 'claim_check']); assert.equal(r.seq, 4);
  assert.ok(es.every(e => e.actor === 'claim-checker')); assert.ok(!JSON.stringify(es).includes('729% in profit'), 'the source text is not in the ledger');
  assert.equal(ledgerPage(es).chain.ok, true);
  const again = await claimCheck({ text: TURTLE, extraction: EXTRACTION, run: true }, { now: NOW + 1000 }); assert.ok(again.ok && again.step === 'run');
  assert.equal(again.result.tries.fresh, 0); assert.deepEqual(entries().map(e => e.kind).slice(4), ['claim_check'], 'the same rules on the same data are one try');
  const all = entries(), v = viewOf(all, 10000), list = claimChecks(all);
  assert.deepEqual(list.map(c => [c.verdict, c.readings, c.sourceKind]), [['no_edge', 1, 'transcript'], ['no_edge', 1, 'transcript']]); assert.equal(list[0].id, r.result.id);
  const d = claimDetail(v, all, r.result.id); assert.ok(d);
  assert.deepEqual([d.check.seq, d.earlier.map(e => e.seq), d.readings.length, d.readings[0].row?.checks.length, d.readings[0].status], [5, [4], 1, 7, r.result.ruleSets[0].tested[0].status]);
  assert.ok(d.readings[0].rules, 'the rules are kept in the form they were run'); assert.match(d.readings[0].hypothesis, /Claim check chk_/);
  assert.equal(claimDetail(v, all, 'chk_nope'), null); assert.equal(claimDetail(v, all, ''), null);
  const p = planOf(r.result); assert.deepEqual([p.readings.length, p.headline], [1, null]);
});
