import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore plain .mjs tool, no types
import { toRegex, redOf, readGlobs, selfCheck, approvedBy, ownersOf, selfAuthoredNote } from '../../../tools/protected_paths.mjs';

test('red paths: globs match what they should and nothing else', () => {
  const globs = readGlobs();
  assert.deepEqual(redOf(['packages/kernel/src/guard.ts', 'packages/autopilot/src/pipeline.ts', 'packages/autopilot/src/report.ts', 'bots/alpaca/broker_alpaca.py', 'bots/x/y/keeper.py', '.github/workflows/ci.yml', 'db/migrations/0009_x.sql', 'web/components/App.tsx', '.env.example', 'docs/x.md'], globs),
    ['packages/kernel/src/guard.ts', 'packages/autopilot/src/pipeline.ts', 'bots/alpaca/broker_alpaca.py', 'bots/x/y/keeper.py', '.github/workflows/ci.yml', 'db/migrations/0009_x.sql', '.env.example']);
  assert.ok(!toRegex('web/lib/auth.ts').test('web/lib/authXts')); assert.deepEqual(selfCheck(), []); assert.deepEqual(ownersOf(), ['army161']);
});

test('red paths: only the code owner\'s latest review counts, and only on the current commit', () => {
  const r = (login: string, state: string, commit_id: string) => ({ user: { login }, state, commit_id });
  assert.deepEqual(approvedBy([r('Army161', 'APPROVED', 'abc')], ['army161'], 'abc'), ['army161']);
  assert.deepEqual(approvedBy([r('Army161', 'APPROVED', 'old')], ['army161'], 'abc'), [], 'an approval of an earlier commit does not count');
  assert.deepEqual(approvedBy([r('someone', 'APPROVED', 'abc')], ['army161'], 'abc'), [], 'someone else approving does not count');
  assert.deepEqual(approvedBy([r('Army161', 'APPROVED', 'abc'), r('Army161', 'CHANGES_REQUESTED', 'abc')], ['army161'], 'abc'), []);
  assert.deepEqual(approvedBy([r('Army161', 'APPROVED', 'abc'), r('Army161', 'COMMENTED', 'abc')], ['army161'], 'abc'), ['army161']);
});

test('red paths: a pull request opened under the owner\'s account cannot be approved on GitHub, and the check says what to do', () => {
  assert.match(selfAuthoredNote('army161', ['army161']), /stays red on purpose/); assert.equal(selfAuthoredNote('someone', ['army161']), null); assert.equal(selfAuthoredNote('', ['army161']), null);
});
