// Two nights of .github/workflows/nightly.yml on an empty state folder, through the same commands the workflow calls, with the
// committed data and no network. Night 1 seeds, night 2 locks what the validator agreed with into paper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { main } from '../src/main';
import { makeCtx } from '../src/runtime';

const ROOT = resolve(__dirname, '../../..'), DAY = 864e5;

test('nightly rehearsal: night 1 seeds, night 2 locks the validated passes into paper, and the ledger verifies before and after each night', { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'apex-nightly-')); let now = Date.UTC(2026, 10, 10, 22, 30);
  const ctx = { ...makeCtx(ROOT, { APEX_STATE_DIR: dir }, () => now), fetch: (async () => { throw new Error('no network in this test'); }) as any };
  const apex = async (...argv: string[]) => { const out: string[] = []; const code = await main(argv, ctx, s => out.push(s)); return { code, text: out.join('\n') }; };
  const ledger = () => readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));

  /** The workflow's steps, in its order. The pull has no key here, so it fails strict and the night goes on, as in the workflow. */
  async function night() {
    assert.equal((await apex('ledger', 'verify')).code, 0, 'the chain is intact before anything is added');
    const pull = await apex('data', 'pull', '--strict'); assert.equal(pull.code, 4); assert.match(pull.text, /MASSIVE_API_KEY is not set/);
    const before = existsSync(join(dir, 'ledger.jsonl')) ? ledger().length : 0;
    const v = await apex('validate'); assert.equal(v.code, 0, `no andon: ${v.text}`);
    const mid = ledger().length;
    const r = await apex('run', '--seed-if-empty', 'plan:P1.13', '--send', 'telegram'); assert.equal(r.code, 0);
    assert.equal(r.text.split('\n')[2], 'Paper mode. Nothing here is proven or guaranteed.'); assert.match(r.text, /Not sent to Telegram: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set/);
    const verify = await apex('ledger', 'verify'); assert.equal(verify.code, 0, verify.text);
    assert.equal((await apex('ledger', 'anchor')).code, 0);
    assert.equal((await apex('ledger', 'verify')).code, 0, 'the anchored head matches the chain');
    assert.ok(!existsSync(join(dir, 'run.lock')), 'no run lock is left behind');
    const all = ledger(); return { validator: all.slice(before, mid), run: all.slice(mid), all, report: r.text };
  }

  // Night 1: an empty ledger gets the plan-approved seed batch. Nothing is validated or locked by the run that found it (K2).
  const n1 = await night();
  assert.deepEqual(n1.validator.filter(e => e.kind === 'validator_run'), [], 'nothing to validate on an empty ledger');
  const pre = n1.run.filter(e => e.kind === 'prereg'), res = n1.run.filter(e => e.kind === 'trial_result');
  assert.ok(pre.length > 100, `seeded ${pre.length} pairs`); assert.equal(res.length, pre.length);
  assert.ok(pre.every(e => e.payload.source === 'plan:P1.13' || e.payload.source.startsWith('queue:')), 'every seed names the plan item, or its queue test');
  assert.ok(pre.some(e => e.payload.source === 'plan:P1.13'));
  const first = new Map(pre.map(e => [e.payload.trialKey, e.seq])); assert.ok(res.every(e => first.get(e.payload.trialKey)! < e.seq), 'pre-registration comes first (S9)');
  assert.ok(!n1.run.some(e => ['slot_locked', 'validator_run', 'intent', 'fill'].includes(e.kind)));
  const passes = res.filter(e => e.payload.status === 'passed_pending_validation');
  assert.ok(passes.length >= 1, 'the committed data gives at least one pass to carry into night 2'); assert.match(n1.report, /waits for the independent validator/);

  // Night 2: the validator re-runs each pass, then the run (a budgeted tick, no second seed) locks the agreeing ones into paper.
  now += DAY; const n2 = await night();
  const vr = n2.validator.filter(e => e.kind === 'validator_run');
  assert.deepEqual(vr.map(e => e.payload.trialKey).sort(), passes.map(e => e.payload.trialKey).sort());
  assert.ok(vr.every(e => e.payload.purpose === 'promotion' && e.payload.agrees === true && e.actor === 'validator'));
  const locks = n2.run.filter(e => e.kind === 'slot_locked'); assert.equal(locks.length, passes.length, 'every validated pass is locked');
  for (const l of locks) {
    const v = vr.find(e => e.payload.trialKey === l.payload.trialKey)!; assert.ok(v, l.payload.slotKey);
    assert.equal(l.payload.validatorSeq, v.seq); assert.ok(l.seq > v.seq); assert.equal(l.payload.mode, 'paper');
    assert.equal(l.payload.resultHash, passes.find(e => e.payload.trialKey === l.payload.trialKey)!.payload.resultHash, 'locked on the result the validator agreed with');
  }
  assert.ok(!n2.run.some(e => e.kind === 'prereg' && e.payload.source === 'plan:P1.13'), 'the seed batch runs once, on an empty ledger');
  assert.ok(!n2.run.some(e => e.kind === 'trial_result' && first.has(e.payload.trialKey)), 'known pairs are not judged again on the same bars');
  assert.ok(n2.all.filter(e => ['intent', 'fill', 'slot_locked', 'book_snapshot'].includes(e.kind)).every(e => e.payload.mode === 'paper'));
  assert.ok(!n2.all.some(e => ['live_approval', 'live_fill', 'promotion_review'].includes(e.kind) || (e.kind === 'slot_status' && e.payload.to !== 'paper' && !String(e.payload.to).startsWith('paused'))));
  assert.match((await apex('live', 'status')).text, /Live trading is off/);
});
