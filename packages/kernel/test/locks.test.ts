import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveAllowed, pickBroker, signApproval, verifyApproval, loadConfig, type LockFacts } from '../src/index';

const now = 1_800_000_000_000;
const open: LockFacts = { slotStatus: 'live_eligible', graduationPassedSeq: 10, validatorAgreeSeq: 11, reviewClean: true,
  approval: { seq: 12, slotKey: 's', stage: 'micro_live', sizeCap: 0.01, expiresAt: now + 1, hash: 'h' }, machine: { allowLive: true, signatureValid: true } };

test('S1/S3 lock matrix: every combination except all-open gives the paper broker', () => {
  const variants: [string, Partial<LockFacts>][] = [['evidence', { slotStatus: 'paper' }], ['evidence', { graduationPassedSeq: null }], ['validated', { validatorAgreeSeq: null }],
    ['validated', { validatorAgreeSeq: 9 }], ['validated', { reviewClean: false }], ['approved', { approval: null }], ['approved', { approval: { ...open.approval!, expiresAt: now } }],
    ['approved', { approval: { ...open.approval!, slotKey: 'other' } }], ['approved', { approval: { ...open.approval!, seq: 5 } }], ['machine', { machine: null }],
    ['machine', { machine: { allowLive: false, signatureValid: true } }], ['machine', { machine: { allowLive: true, signatureValid: false } }]];
  const all = liveAllowed('s', open, now); assert.equal(all.allowed, true); assert.equal(pickBroker(all, 'paper', () => 'live'), 'live');
  assert.equal(pickBroker(all, 'paper', null), 'paper');                               // no live adapter exists in this repo
  for (const [firstClosed, patch] of variants) {
    const r = liveAllowed('s', { ...open, ...patch }, now);
    assert.equal(r.allowed, false, JSON.stringify(patch)); assert.equal(r.locks.find(l => !l.open)!.id, firstClosed);
    assert.equal(pickBroker(r, 'paper', () => 'live'), 'paper');
  }
  assert.equal(liveAllowed('s', { ...open, slotStatus: 'paper' }, now).locks.every(l => !l.open), true);   // a later lock never opens before an earlier one
});

test('lock 4: the signature needs the real key', () => {
  const key = 'k'.repeat(40), sig = signApproval(key, 'approval-hash');
  assert.equal(verifyApproval(key, 'approval-hash', sig), true);
  assert.equal(verifyApproval(key, 'other-approval', sig), false);
  assert.equal(verifyApproval('x'.repeat(40), 'approval-hash', sig), false);
  assert.equal(verifyApproval('', 'approval-hash', sig), false); assert.equal(verifyApproval('short', 'approval-hash', signApproval('short', 'approval-hash')), false);
  assert.equal(verifyApproval(key, 'approval-hash', 'zz'), false);
});

test('config fails closed and refuses trading keys or the sign-off key in the wrong place (S4)', () => {
  const prod = loadConfig({ NODE_ENV: 'production' }, 'web'); assert.equal(prod.problems.length, 3); assert.equal(prod.warnings.length, 1);
  assert.ok(loadConfig({ APEX_ALLOW_LIVE: 'yes', ALPACA_SECRET_KEY: 'x' }, 'web').problems.length >= 2);
  assert.ok(loadConfig({ APEX_SIGNOFF_KEY: 'x' }, 'cli').problems.some(p => p.includes('APEX_SIGNOFF_KEY')));
  assert.deepEqual(loadConfig({ APEX_SIGNOFF_KEY: 'x' }, 'executor').problems, []);
  const c = loadConfig({ APEX_PAPER_CAPITAL: 'lots', APEX_TRIALS_PER_WEEK: '7.9', APEX_LEDGER_ANCHOR: 'weird' }); assert.equal(c.paperCapital, 10000); assert.equal(c.trialsPerWeek, 7); assert.equal(c.ledgerAnchor, 'git');
});

test('P0.6: a door with no secret set is open only in local development', async () => {
  const { openWithoutSecret, loadConfig } = await import('../src/config');
  assert.equal(openWithoutSecret(true), false); assert.equal(openWithoutSecret(false), true);
  const c = loadConfig({ NODE_ENV: 'production' }, 'web'); assert.ok(c.problems.some(p => /APEX_ADMIN_PASSWORD/.test(p)) && c.problems.some(p => /APEX_INGEST_TOKEN/.test(p)) && c.problems.some(p => /CRON_SECRET/.test(p)));
});
