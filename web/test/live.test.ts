// Lock 3, Jeremy's approval (docs/design/02 s6, build plan P4.12). What is held here: an approval is recorded only with the
// password typed again, the slot's name typed out, every checklist line, locks 1 and 2 open and no halt; the stage, cap and
// expiry cannot be widened from the form; and nothing in the dashboard, the API, the terminal or MCP can open lock 4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Ledger, MemoryLedgerStore, REQUIRED } from '@apex/kernel';
import { liveAllowed, type Lock } from '@apex/kernel/locks';
import { CHECKLIST, MAX_EXPIRY_DAYS, decideApproval, nextStage, type ApproveFacts } from '../app/api/admin/live/approval';

const web = resolve(__dirname, '..'), src = (p: string) => readFileSync(join(web, p), 'utf8'), NOW = Date.UTC(2027, 5, 1), SLOT = 'dave_prev_range|SPY|1h';
const PW = ['correct', 'horse', 'battery'].join('-');                      // put together here so no secret-looking literal sits in the file
const locks = (evidence: boolean, validated: boolean): Lock[] => liveAllowed(SLOT, { slotStatus: evidence ? 'live_eligible' : 'paper', graduationPassedSeq: evidence ? 10 : null, validatorAgreeSeq: validated ? 11 : null, reviewClean: validated, approval: null, machine: null }, NOW).locks;
const facts = (o: Partial<ApproveFacts> = {}): ApproveFacts => ({ slotKey: SLOT, slotStatus: 'live_eligible', locks: locks(true, true), halted: false, adminPassword: PW, now: NOW, ...o });
const form = (o: Record<string, unknown> = {}) => ({ typed: SLOT, password: PW, stage: 'micro_live', sizeCap: 0.01, expiryDays: 90, checklist: CHECKLIST.map(([id]) => id), ...o });

test('approval: a complete form with locks 1 and 2 open gives one entry, and it is what the ledger requires', async () => {
  const r = decideApproval(facts(), form()); assert.ok(r.ok);
  assert.deepEqual(r.payload, { slotKey: SLOT, stage: 'micro_live', sizeCap: 0.01, expiresAt: NOW + 90 * 864e5, by: 'you', checklist: CHECKLIST.map(([id]) => id) });
  for (const k of REQUIRED.live_approval!) assert.ok(k in r.payload, k);
  const ledger = new Ledger(new MemoryLedgerStore([]), () => NOW); await assert.rejects(ledger.append('live_approval', 'dashboard', { slotKey: SLOT }), /live_approval/); const e = await ledger.append('live_approval', 'dashboard', r.payload);
  // With that entry lock 3 reads open, and lock 4 stays closed because no machine facts exist here.
  const after = liveAllowed(SLOT, { slotStatus: 'live_eligible', graduationPassedSeq: 10, validatorAgreeSeq: 11, reviewClean: true, approval: { seq: 12, slotKey: SLOT, stage: 'micro_live', sizeCap: 0.01, expiresAt: r.payload.expiresAt, hash: e.hash }, machine: null }, NOW);
  assert.deepEqual(after.locks.map(l => l.open), [true, true, true, false]); assert.equal(after.allowed, false);
  // An approval made before the validator run, for another slot, or past its expiry opens nothing.
  const base = { slotStatus: 'live_eligible', graduationPassedSeq: 10, validatorAgreeSeq: 11, reviewClean: true, machine: null }, ap = { seq: 12, slotKey: SLOT, stage: 'micro_live', sizeCap: 0.01, expiresAt: NOW + 1, hash: e.hash };
  for (const approval of [{ ...ap, seq: 11 }, { ...ap, slotKey: 'other' }, { ...ap, expiresAt: NOW }]) assert.equal(liveAllowed(SLOT, { ...base, approval }, NOW).locks[2].open, false);
});

test('approval: each missing piece is refused, and nothing is taken from the form that the server can work out itself', () => {
  const refuse = (f: ApproveFacts, b: Record<string, unknown>, status: number, re: RegExp) => { const r = decideApproval(f, b); assert.equal(r.ok, false, re.source); if (!r.ok) { assert.equal(r.status, status, r.error); assert.match(r.error, re); } };
  // The password again.
  refuse(facts(), form({ password: 'wrong' }), 401, /not the password/); refuse(facts(), form({ password: undefined }), 401, /not the password/); refuse(facts(), form({ password: PW + ' ' }), 401, /not the password/);
  refuse(facts({ adminPassword: '' }), form({ password: '' }), 409, /No admin password is set/);
  // The typed name.
  for (const typed of ['', SLOT.toLowerCase(), ` ${SLOT}`, 'dave_prev_range', undefined]) refuse(facts(), form({ typed }), 422, /Type the slot's name exactly/);
  // The locks, worked out by the server. A form cannot claim them.
  refuse(facts({ locks: locks(false, false), slotStatus: 'paper' }), form({ locks: 'open', evidence: true }), 409, /Lock 1 is closed/);
  refuse(facts({ locks: locks(true, false) }), form(), 409, /Lock 2 is closed/);
  refuse(facts({ locks: [] }), form(), 409, /Lock 1 is closed/);
  refuse(facts({ halted: true }), form(), 409, /halted/);
  // Stage, cap and expiry cannot be widened.
  for (const stage of ['live_10', 'live_50', 'live_100', 'paper', undefined]) refuse(facts(), form({ stage }), 422, /only stage that can be approved now is micro_live/);
  for (const s of ['micro_live', 'live_10', 'live_50', 'live_100', 'paper', 'retired']) assert.equal(nextStage(s), null, `${s} has no stage to approve from here`);
  refuse(facts({ slotStatus: 'micro_live' }), form({ stage: 'live_10' }), 409, /not at a stage that can be approved/);
  for (const sizeCap of [0.0101, 1, 0, -0.01, NaN, '0.01', undefined]) refuse(facts(), form({ sizeCap }), 422, /size cap must be more than 0 and at most 1%/);
  for (const expiryDays of [MAX_EXPIRY_DAYS + 1, 0, -1, 1.5, '90', undefined, Infinity]) refuse(facts(), form({ expiryDays }), 422, /expire in 1 to 90 days/);
  // Every line of the checklist.
  refuse(facts(), form({ checklist: CHECKLIST.slice(1).map(([id]) => id) }), 422, /Tick every line/); refuse(facts(), form({ checklist: 'all' }), 422, /Tick every line/);
  assert.ok(decideApproval(facts(), form({ sizeCap: 0.005, expiryDays: 1 })).ok);
});

test('route: session, same origin, the password again, locks from the ledger, and one ledger entry is all it writes', () => {
  const r = src('app/api/admin/live/[key]/approve/route.ts');
  const order = ['isAdmin()', "req.headers.get('origin')", 'loadLedger()', 'slotDetail(', 'decideApproval(', "append('live_approval'"].map(x => r.indexOf(x)); assert.ok(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), `checks run in order: ${order}`);
  assert.match(r, /locks: d\.locks/); assert.match(r, /adminPassword: process\.env\.APEX_ADMIN_PASSWORD \|\| ''/);
  assert.equal(r.match(/\.append\(/g)!.length, 1); assert.doesNotMatch(r, /slot_status|live_stage|setJSON|releaseCord|ledgerResume|broker/);
  // The screen offers the form only when locks 1 and 2 are open and lock 3 is closed.
  assert.match(src('app/autopilot/slots/[key]/page.tsx'), /stage && d\.locks\[0\]\.open && d\.locks\[1\]\.open && !d\.locks\[2\]\.open \? <LiveApproval/);
  // Lock 2 cannot open yet: nothing records the review chain's result, and the query says so instead of guessing.
  assert.match(src('../packages/api/src/queries.ts'), /reviewClean: false, approval, machine: null/);
});

test('lock 4: nothing in the dashboard, the API, MCP or the terminal can sign an approval, set the live flag or claim the machine', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return /node_modules|\.next|ui-check|^test$|snapshots/.test(n) ? [] : statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mjs|js)$/.test(n) ? [p] : []; });
  const files = [...walk(join(web, 'app')), ...walk(join(web, 'lib')), ...walk(join(web, 'components')), ...walk(join(web, '../packages/api/src')), ...walk(join(web, '../packages/mcp/src')), ...walk(join(web, '../packages/sdk/src')), ...walk(join(web, '../apps/cli/src'))];
  assert.ok(files.length > 150);
  // The terminal's health check reads the live flag only to confirm that it is not set. That one reading is allowed.
  for (const f of files) { const s = readFileSync(f, 'utf8').replace(/!ctx\.env\.APEX_ALLOW_LIVE\b/g, ''), name = f.slice(web.length - 3);
    assert.doesNotMatch(s, /signApproval|verifyApproval|APEX_ALLOW_LIVE|signatureValid: true|allowLive: true/, `${name} has no part of lock 4`);
    // The terminal's `apex signoff` uses the key on Jeremy's machine to sign off red-path edits. Nothing served from the dashboard may read it.
    if (!/apps\/cli\/src\//.test(f)) assert.doesNotMatch(s, /APEX_SIGNOFF_KEY/, `${name} does not read the sign-off key`);
    if (/machine:/.test(s) && /liveAllowed\(/.test(s)) assert.match(s, /machine: null/, `${name} passes no machine facts`); }
  // Only this one route writes an approval.
  assert.deepEqual(files.filter(f => /append\('live_approval'/.test(readFileSync(f, 'utf8'))).map(f => f.slice(web.length + 1)), ['app/api/admin/live/[key]/approve/route.ts']);
});
