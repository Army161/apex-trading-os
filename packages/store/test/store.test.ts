import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger, verifyChain } from '@apex/kernel/ledger';
import { FileLedgerStore, fileLock } from '../src/file';
import { PgLedgerStore, migrate } from '../src/pg';

const prereg = (k: string) => ({ trialKey: k, hypothesis: 'h', source: 'factory', strategy: { id: 's', fingerprint: 'f' }, panel: 'p', tf: '1d', gateVersion: 'g', passBar: 'bar' });
const result = (k: string) => ({ trialKey: k, gateVersion: 'g', inputs: { strategy: { id: 's' } }, inputHash: 'i'.repeat(64), resultHash: 'r'.repeat(64), status: 'rejected', metrics: { trades: 3, ret: 0.01 }, checks: [] });

test('file ledger: survives a reopen, refuses a fork, and detects an edited file', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'apex-')), 'ledger.jsonl');
  const a = new Ledger(new FileLedgerStore(path)); await a.append('prereg', 'x', prereg('k1')); await a.append('trial_result', 'x', result('k1'));
  const b = new Ledger(new FileLedgerStore(path)); assert.equal((await b.store.head())!.seq, 2);
  await assert.rejects(b.append('trial_result', 'x', result('k9')), /no pre-registration/);          // the rule holds across restarts
  await b.append('trial_result', 'x', result('k1')); await a.append('halt', 'x', { level: 'andon', by: 'x', reason: 'r' });   // a sees b's write and follows it
  assert.equal(verifyChain(await new FileLedgerStore(path).read()).ok, true); assert.equal((await a.store.head())!.seq, 4);
  writeFileSync(path, readFileSync(path, 'utf8').replace('"rejected"', '"passed"'));
  await assert.rejects(new FileLedgerStore(path).read(), /damaged at seq 2/);
});

test('run lock: a second run is refused while the first holds it', () => {
  const p = join(mkdtempSync(join(tmpdir(), 'apex-')), 'run.lock'), a = fileLock(p); assert.ok(a); assert.equal(fileLock(p), null); a!(); const c = fileLock(p); assert.ok(c); c!();
});

const url = process.env.APEX_TEST_DATABASE_URL;
test('postgres ledger: migrations apply clean, append-only is enforced by the database, chain cannot fork', { skip: !url && 'set APEX_TEST_DATABASE_URL to run' }, async () => {
  const store = PgLedgerStore.connect(url!), pool = store.pool;
  try {
    await pool.query('drop schema public cascade; create schema public;');
    assert.deepEqual(await migrate(pool, join(__dirname, '../../../db/migrations')), ['0001_ledger.sql', '0002_core.sql', '0003_app_role.sql']);
    assert.deepEqual(await migrate(pool, join(__dirname, '../../../db/migrations')), []);                 // idempotent
    const L = new Ledger(store), L2 = new Ledger(store);
    await L.append('prereg', 'x', prereg('a'.repeat(64))); await L.append('trial_result', 'x', result('a'.repeat(64)));
    await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? L : L2).append('halt', 'x', { level: 'andon', by: 'x', reason: String(i) })));
    const rows = await store.read(); assert.equal(rows.length, 22); assert.equal(verifyChain(rows).ok, true);
    assert.deepEqual((await L.verify(5, 9)).ok, true);
    for (const sql of ["update ledger set actor = 'evil' where seq = 1", 'delete from ledger where seq = 2', 'truncate ledger', "update evaluations set status = 'passed'", 'delete from trials'])
      await assert.rejects(pool.query(sql), /append-only/, sql);
    await assert.rejects(pool.query("insert into ledger values (99, 1, 'halt', 'x', '{}', 'a', 'b', 'c')"), /does not follow the head/);
    assert.equal((await pool.query('select count(*)::int n from trials')).rows[0].n, 1);
    assert.equal((await pool.query('select status, trades from evaluations')).rows[0].trades, 3);
    // the application role can insert and read but not change history
    await pool.query("set role apex_app"); await assert.rejects(pool.query("update ledger set actor = 'evil'"), /permission denied|append-only/); await pool.query('reset role');
    const lock = await store.runLock(); assert.ok(lock); await lock!();
  } finally { await store.close(); }
});
