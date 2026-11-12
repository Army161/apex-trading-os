// The app shell's pure parts: the route list, the header status and the funnel counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_SCREENS, BOTTOM, SECTIONS, screenOf, sectionOf } from '../lib/nav';
import { statusFrom, triesText, DATA_WORDS, DATA_MARK, type StatusInput } from '../lib/status';
import { funnel } from '../lib/queries';

const web = join(import.meta.dirname, '..');
const E = (seq: number, kind: string, payload: object, ts = 1_700_000_000_000 + seq) => ({ seq, ts, kind, actor: 'test', payload, payloadHash: '', prevHash: '', hash: '' }) as any;
const base: StatusInput = { ledger: 'file', entries: [], capital: 10000, cord: { on: false }, killswitch: false, persistent: true, signedIn: false, authEnabled: true, aiEnabled: false, now: 1 };

test('routes: six sections, every screen has a page file, and no two screens share a path', () => {
  assert.deepEqual(SECTIONS.map(s => s.id), ['today', 'autopilot', 'claims', 'research', 'agents', 'you']);
  const hrefs = ALL_SCREENS.map(s => s.href); assert.equal(new Set(hrefs).size, hrefs.length);
  for (const s of SECTIONS) { assert.equal(s.screens[0].href, s.href, `${s.id} opens on its first screen`); assert.ok(s.icon && s.label && s.short); }
  for (const h of hrefs) assert.ok(existsSync(join(web, 'app', h, 'page.tsx')), `app${h}/page.tsx exists`);
  for (const id of BOTTOM) assert.ok(SECTIONS.some(s => s.id === id));
  assert.equal(BOTTOM.length, 4, 'the phone bar has four sections and More');
});

test('routes: a path maps to its section and its screen', () => {
  assert.equal(sectionOf('/').id, 'today'); assert.equal(sectionOf('/research/lab').id, 'research'); assert.equal(sectionOf('/you/setup/').id, 'you');
  assert.equal(sectionOf('/researchers').id, 'today', 'a prefix that is not a path segment does not match');
  assert.equal(screenOf('/research')?.label, 'Strategies'); assert.equal(screenOf('/research/lab')?.label, 'Lab'); assert.equal(screenOf('/you/setup')?.label, 'Setup');
  assert.equal(screenOf('/autopilot/slots/abc')?.href, '/autopilot/slots', 'a deeper path falls back to the nearest screen above it'); assert.equal(screenOf('/autopilot/pairs/abc')?.href, '/autopilot');
});

test('status: no ledger means the count of tries is unknown, not zero', () => {
  const s = statusFrom({ ...base, ledger: 'none' });
  assert.equal(s.trials, null); assert.equal(s.mode, 'paper'); assert.equal(s.halted, false); assert.equal(s.data, 'unknown');
  assert.equal(triesText(s), 'Tries: no ledger connected');
  assert.equal(triesText({ trials: 1 }), '1 try counted'); assert.equal(triesText({ trials: 1293 }), '1,293 tries counted');
});

test('status: a ledger that cannot be read is shown as halted', () => {
  const s = statusFrom({ ...base, ledger: 'error', ledgerNote: 'connection refused' });
  assert.equal(s.halted, true); assert.match(s.halts[0].reason, /could not be read: connection refused/); assert.equal(s.trials, null);
  const bad = statusFrom({ ...base, entries: [E(1, 'slot_status', null as any)] });   // a payload the view cannot replay
  assert.equal(bad.ledger, 'error'); assert.equal(bad.halted, true);
});

test('status: halts come from the ledger and from the dashboard switches, each with who and why', () => {
  assert.equal(statusFrom(base).halted, false);
  const led = statusFrom({ ...base, entries: [E(1, 'halt', { level: 'andon', by: 'cli', reason: 'checking a fill' })] });
  assert.equal(led.halted, true); assert.deepEqual(led.halts.map(h => [h.from, h.by, h.reason]), [['ledger', 'cli', 'checking a fill']]);
  const resumed = statusFrom({ ...base, entries: [E(1, 'halt', { level: 'andon', by: 'cli', reason: 'x' }), E(2, 'resume', { level: 'andon' })] });
  assert.equal(resumed.halted, false);
  const cord = statusFrom({ ...base, cord: { on: true, by: 'risk-officer', reason: 'drawdown past limit', ts: 5 } });
  assert.deepEqual([cord.halted, cord.halts[0].from, cord.halts[0].by, cord.halts[0].ts], [true, 'dashboard', 'risk-officer', 5]);
  assert.equal(statusFrom({ ...base, killswitch: true }).halts[0].level, 'kill');
  assert.equal(statusFrom({ ...base, ledger: 'none', cord: { on: true } }).halted, true, 'a dashboard halt shows even with no ledger');
});

test('status: data is ok, stale or blocked, and each has a word and a shape', () => {
  const dv = (dataset: string, status: string, tradable: boolean, seq: number) => E(seq, 'data_version', { dataset, status, tradable });
  assert.equal(statusFrom({ ...base, entries: [dv('a', 'ok', true, 1), dv('b', 'warn', true, 2)] }).data, 'ok');
  const stale = statusFrom({ ...base, entries: [dv('a', 'ok', true, 1), dv('b', 'warn', false, 2)] });
  assert.deepEqual([stale.data, stale.dataStale, stale.dataBlocked], ['stale', ['b'], []]);
  const blocked = statusFrom({ ...base, entries: [dv('a', 'blocked', false, 1), dv('b', 'warn', false, 2)] });
  assert.deepEqual([blocked.data, blocked.dataBlocked, blocked.dataStale], ['blocked', ['a'], ['b']]);
  assert.equal(statusFrom({ ...base, entries: [dv('a', 'blocked', false, 1), dv('a', 'ok', true, 2)] }).data, 'ok', 'the latest version of a dataset is the one that counts');
  for (const k of Object.keys(DATA_WORDS) as (keyof typeof DATA_WORDS)[]) { assert.ok(DATA_WORDS[k]); assert.ok(DATA_MARK[k][0]); }
  assert.equal(new Set(Object.values(DATA_MARK).map(m => m[0])).size, 4, 'four states, four different shapes');
});

test('status: the mode is paper unless the ledger holds a slot in a live stage', () => {
  const lock = E(1, 'slot_locked', { slotKey: 's1', trialKey: 't1', strategy: 'x', dataset: 'd', symbol: 'SPY', tf: '1h', assetClass: 'equity', lockedAt: 1, inputHash: 'h', gateVersion: 'g', role: 'primary', baseline: {} });
  const paper = statusFrom({ ...base, entries: [lock] });
  assert.deepEqual([paper.mode, paper.slots, paper.liveSlots], ['paper', 1, []]);
  for (const to of ['paused_drift', 'live_eligible', 'retired']) assert.equal(statusFrom({ ...base, entries: [lock, E(2, 'slot_status', { slotKey: 's1', from: 'paper', to })] }).mode, 'paper', to);
  const live = statusFrom({ ...base, entries: [lock, E(2, 'slot_status', { slotKey: 's1', from: 'live_eligible', to: 'micro_live' })] });
  assert.deepEqual([live.mode, live.liveSlots], ['live', ['s1']]);
});

test('status: tries and the last run are read from the ledger', () => {
  const s = statusFrom({ ...base, entries: [E(1, 'trial_result', { trialKey: 'a', status: 'rejected', checks: [{ pass: false }] }), E(2, 'trial_result', { trialKey: 'b', status: 'watch', checks: [{ pass: true }, { pass: false }] }),
    E(3, 'trial_result', { trialKey: 'a', status: 'rejected', checks: [{ pass: false }] }), E(4, 'run', { id: 'r1', mode: 'full' }, 99)] });
  assert.equal(s.trials, 2, 'the same trial run twice is one try'); assert.deepEqual(s.lastRun, { id: 'r1', mode: 'full', ts: 99 }); assert.equal(s.entries, 4);
});

test('funnel: tried, passed, in paper, eligible and live are counted from the ledger', () => {
  const tr = (seq: number, k: string, status: string, passes: boolean[]) => E(seq, 'trial_result', { trialKey: k, status, checks: passes.map(pass => ({ pass })) });
  const lock = (seq: number, slotKey: string, role = 'primary') => E(seq, 'slot_locked', { slotKey, trialKey: slotKey, strategy: 'x', dataset: 'd', symbol: 'SPY', tf: '1h', assetClass: 'equity', lockedAt: 1, inputHash: 'h', gateVersion: 'g', role, baseline: {} });
  const f = funnel([E(1, 'prereg', { trialKey: 'w', gateVersion: 'g' }), tr(2, 'a', 'rejected', [true, false]), tr(3, 'b', 'watch', [true, true, false]), tr(4, 'c', 'needs_data', [false]),
    tr(5, 'p', 'passed_pending_validation', [true, true]), lock(6, 'p'), lock(7, 'shadow', 'shadow'), lock(8, 'e'), E(9, 'slot_status', { slotKey: 'e', from: 'paper', to: 'live_eligible' })], 10000);
  assert.deepEqual(f, { tried: 4, waiting: 1, passed: 1, validated: 0, paper: 1, eligible: 1, live: 0, rejected: 1, nearMiss: 1, needsData: 1 });
});

test('shell: Halt and the mode badge are in the header markup, and the shell offers no resume, approve or go-live control', () => {
  const src = readFileSync(join(web, 'components/shell/Shell.tsx'), 'utf8');
  assert.match(src, /data-testid="mode-badge"/); assert.match(src, /data-testid="halt"/);
  const posts = [...src.matchAll(/fetch\('([^']+)', \{ method: 'POST'/g)].map(m => m[1]);
  assert.deepEqual(posts, ['/api/halt'], 'the only thing the shell can send is a halt');
  const halt = readFileSync(join(web, 'app/api/halt/route.ts'), 'utf8');
  assert.match(halt, /isAdmin\(\)/); assert.doesNotMatch(halt, /releaseCord|'resume'/);
});
