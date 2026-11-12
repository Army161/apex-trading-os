// apex-executor's commands: status reads only, sign needs the key, a terminal and the slot key typed, run rehearses by default
// and refuses live without an adapter. A temporary ledger file and folder stand in for Jeremy's machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyApproval } from '@apex/kernel/locks';
import type { LedgerEntry } from '@apex/kernel/ledger';
import { FileLedgerStore } from '@apex/store/file';
import { main, type Ctx } from '../src/main';
import { readSignature, signaturePath } from '../src/signature';
import { FakeLiveBroker } from './fake';
import { ALLOW, KEY, NOW, SIGNOFF, SLOT, approvalOf, baseEnv, fakeFetch, tmp, world } from './fixture';

function machine(entries: LedgerEntry[] = world(), o: Partial<Ctx> & { typed?: string | null } = {}) {
  const root = tmp(), ledger = join(root, 'ledger.jsonl'), dir = join(root, 'executor'), out: string[] = [], f = fakeFetch();
  writeFileSync(ledger, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  const typed = o.typed === undefined ? SLOT : o.typed;
  const ctx: Ctx = { env: { ...baseEnv(), APEX_LEDGER_FILE: ledger, APEX_EXECUTOR_DIR: dir }, now: () => NOW, cwd: root, print: s => out.push(s), fetch: f.fetch,
    confirm: typed === null ? undefined : async (_q, expect) => typed === expect, adapter: () => null, sleep: async () => {}, ...o };
  return { ctx, out, dir, ledger, f, text: () => out.join('\n') };
}

test('sign: refuses without the key, with a short key, without a terminal and on a mistyped slot key', async () => {
  const cases: [string, ReturnType<typeof machine>, RegExp][] = [];
  { const m = machine(); delete m.ctx.env[SIGNOFF]; cases.push(['no key', m, /APEX_SIGNOFF_KEY is not set/]); }
  { const m = machine(); m.ctx.env[SIGNOFF] = KEY.slice(0, 31); cases.push(['short key', m, /shorter than 32/]); }
  cases.push(['no terminal', machine(world(), { typed: null }), /real terminal/]);
  cases.push(['mistyped', machine(world(), { typed: 'alpha@spy-1d' }), /did not match/]);
  cases.push(['no approval', machine(world({ approval: null, intent: null })), /no live approval/]);
  cases.push(['locks 1 to 3 not open', machine(world({ review: false })), /locks 1 to 3 are not all open/]);
  cases.push(['a later stage', machine(world({ approval: { stage: 'live_100', sizeCap: 1 } })), /stage live_100 with size cap 1\. Only micro_live/]);
  cases.push(['a cap over 1%', machine(world({ approval: { sizeCap: 0.02 } })), /size cap 0\.02\. Only micro_live/]);
  for (const [name, m, re] of cases) {
    assert.equal(await main(['sign', SLOT], m.ctx), 2, name); assert.match(m.text(), re, name);
    assert.equal(existsSync(signaturePath(m.dir, SLOT)), false, `${name}: nothing written`);
  }
});

test('sign: writes one signature file outside the repo, for this approval only, and never prints the key', async () => {
  const w = world(), m = machine(w);
  assert.equal(await main(['sign', SLOT], m.ctx), 0, m.text()); assert.match(m.text(), /Signed/);
  assert.ok(!m.text().includes(KEY), 'the key is never printed');
  const s = readSignature(m.dir, SLOT)!, a = approvalOf(w);
  assert.deepEqual([s.approvalSeq, s.approvalHash, s.stage, s.expiresAt], [a.seq, a.hash, 'micro_live', a.payload.expiresAt]);
  assert.equal(verifyApproval(KEY, a.hash, s.signature), true); assert.ok(!readFileSync(signaturePath(m.dir, SLOT), 'utf8').includes(KEY));
  assert.equal(statSync(signaturePath(m.dir, SLOT)).mode & 0o077, 0, 'readable by Jeremy\'s user only');
  // A folder inside a git checkout is refused.
  const inRepo = machine(w, {}); inRepo.ctx.env.APEX_EXECUTOR_DIR = join(__dirname, '..', 'state');
  assert.equal(await main(['sign', SLOT], inRepo.ctx), 2); assert.match(inRepo.text(), /inside a git checkout/);
});

test('status: every slot\'s four locks and what is missing, and it writes nothing', async () => {
  const m = machine(); const before = readFileSync(m.ledger, 'utf8');
  assert.equal(await main(['status'], m.ctx), 0);
  assert.match(m.text(), new RegExp(`${SLOT} \\(live_eligible\\)`)); assert.match(m.text(), /open {3}1 evidence/); assert.match(m.text(), /open {3}3 approved/); assert.match(m.text(), /closed 4 machine/);
  assert.match(m.text(), /missing: no signature: apex-executor sign/); assert.match(m.text(), /no adapter installed/);
  assert.equal(readFileSync(m.ledger, 'utf8'), before); assert.equal(existsSync(m.dir), false, 'no folder was made');
  await main(['sign', SLOT], m.ctx); m.out.length = 0; await main(['status'], m.ctx);
  assert.doesNotMatch(m.text(), /no signature/); assert.match(m.text(), /closed 4 machine/, 'signed, but still no adapter');
});

test('run: rehearsal is the default, writes what it would send to the journal, sends nothing, and moves its cursor', async () => {
  const m = machine(), inner = new FakeLiveBroker(); m.ctx.adapter = () => inner;
  delete m.ctx.env[ALLOW];
  await main(['sign', SLOT], m.ctx); m.out.length = 0;
  assert.equal(await main(['run', '--once'], m.ctx), 0, m.text()); assert.match(m.text(), /Rehearsal/); assert.match(m.text(), /rehearsed/);
  assert.deepEqual(inner.calls, { submit: 0, bracket: 0, cancel: 0 });
  const rows = readFileSync(join(m.dir, 'journal.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(rows.map(r => [r.type, r.mode]), [['rehearsal', 'rehearsal'], ['cursor', 'rehearsal']]);
  assert.equal(m.f.calls.filter(c => c.method === 'POST').length, 0, 'a rehearsal posts no fill');
  m.out.length = 0; await main(['run', '--once'], m.ctx); assert.match(m.text(), /Nothing to do/);
});

test('run --live: refused without an adapter, without the flags, and sends once with them all', async () => {
  const none = machine(); assert.equal(await main(['run', '--live', '--once'], none.ctx), 2); assert.match(none.text(), /no live broker adapter is installed/);
  const noFlag = machine(world(), { adapter: () => new FakeLiveBroker() }); delete noFlag.ctx.env[ALLOW];
  assert.equal(await main(['run', '--live', '--once'], noFlag.ctx), 2); assert.match(noFlag.text(), /APEX_ALLOW_LIVE is not yes/);
  assert.equal(await main(['run', '--live', '--once'], machine(world(), { adapter: () => new FakeLiveBroker({ live: false }) }).ctx), 2);
  // Unsigned: the steps refuse at lock 4 and nothing reaches the broker.
  const b = new FakeLiveBroker({ fillT: NOW }), m = machine(world(), { adapter: () => b });
  assert.equal(await main(['run', '--live', '--once'], m.ctx), 0); assert.match(m.text(), /refused\. Step 1/); assert.equal(b.calls.bracket, 0);
  await main(['sign', SLOT], m.ctx); m.out.length = 0;
  assert.equal(await main(['run', '--live', '--once'], m.ctx), 0, m.text()); assert.match(m.text(), /: sent\. Step 7 post/); assert.equal(b.calls.bracket, 1);
  assert.equal(m.f.calls.filter(c => c.method === 'POST').length, 1);
  await main(['run', '--live', '--once'], m.ctx); assert.equal(b.calls.bracket, 1, 'never twice');
});

test('run --live: a reconcile mismatch writes an andon halt to the ledger and stops', async () => {
  const b = new FakeLiveBroker({ positions: [{ slotKey: 'x@y', symbol: 'Y', assetClass: 'stock', side: 1, qty: 1, entry: 1, stop: 0.9, riskUsd: 0.1 }] }), m = machine(world(), { adapter: () => b });
  await main(['sign', SLOT], m.ctx); m.out.length = 0;
  assert.equal(await main(['run', '--live', '--once'], m.ctx), 4); assert.match(m.text(), /andon cord is pulled/);
  const last = JSON.parse(readFileSync(m.ledger, 'utf8').trim().split('\n').pop()!);
  assert.deepEqual([last.kind, last.actor, last.payload.level, last.payload.by], ['halt', 'executor', 'andon', 'executor']); assert.equal(b.calls.bracket, 0);
});

test('run: a second run at once is refused by the run lock, and the lock is released when a run ends', async () => {
  const m = machine(); await main(['sign', SLOT], m.ctx); mkdirSync(m.dir, { recursive: true });
  writeFileSync(join(m.dir, 'run.lock'), '12345'); m.out.length = 0;
  assert.equal(await main(['run', '--once'], m.ctx), 2); assert.match(m.text(), /another apex-executor run holds/); assert.equal(existsSync(join(m.dir, 'journal.jsonl')), false, 'nothing was rehearsed');
  const b = new FakeLiveBroker(); m.ctx.adapter = () => b;
  assert.equal(await main(['run', '--live', '--once'], m.ctx), 2, 'live too'); assert.equal(b.calls.bracket, 0);
  // An old lock is never taken over by age.
  const old = new Date(NOW - 30 * 864e5); utimesSync(join(m.dir, 'run.lock'), old, old);
  assert.equal(await main(['run', '--once'], m.ctx), 2);
  unlinkSync(join(m.dir, 'run.lock'));
  assert.equal(await main(['run', '--once'], m.ctx), 0, m.text()); assert.equal(existsSync(join(m.dir, 'run.lock')), false, 'released');
});

test('run --live: when the ledger cannot be written, the andon alert still goes to Telegram and says so', async () => {
  const TOKEN = ['TELEGRAM', 'BOT', 'TOKEN'].join('_'), CHAT = ['TELEGRAM', 'CHAT', 'ID'].join('_');
  const b = new FakeLiveBroker({ positions: [{ slotKey: 'x@y', symbol: 'Y', assetClass: 'stock', side: 1, qty: 1, entry: 1, stop: 0.9, riskUsd: 0.1 }] }), m = machine(world(), { adapter: () => b });
  m.ctx.env[TOKEN] = 'test-token'; m.ctx.env[CHAT] = '42';
  await main(['sign', SLOT], m.ctx); m.out.length = 0;
  const real = new FileLedgerStore(m.ctx.env.APEX_LEDGER_FILE!);
  m.ctx.openLedger = async () => ({ store: { durable: true, head: () => real.head(), read: (a?: number, z?: number) => real.read(a, z), append: async () => { throw new Error('database unreachable'); } }, close: async () => {} });
  assert.equal(await main(['run', '--live', '--once'], m.ctx), 4); assert.match(m.text(), /pulling the andon cord FAILED as well/);
  const tg = m.f.calls.filter(c => c.url.includes('api.telegram.org'));
  assert.equal(tg.length, 1); assert.match(JSON.parse(tg[0].body!).text, /could NOT be written to the ledger/); assert.equal(b.calls.bracket, 0);
  assert.ok(!m.text().includes('test-token'), 'the token is never printed');
});

test('usage: unknown commands and no command are refused', async () => {
  const m = machine(); assert.equal(await main([], m.ctx), 2); assert.equal(await main(['order'], m.ctx), 2); assert.match(m.text(), /Unknown command: order/);
});
