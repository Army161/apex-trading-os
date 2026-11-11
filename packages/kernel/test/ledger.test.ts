import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, hashOf, roundSig, Ledger, MemoryLedgerStore, verifyChain, makeEntry, GENESIS, buildView, trialsEver, type LedgerEntry } from '../src/index';

test('canonical JSON: sorted keys, shortest numbers, stable across key order', () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, 'x"y'], c: { z: 1.5, y: -0 } }), '{"a":[true,null,"x\\"y"],"b":1,"c":{"y":0,"z":1.5}}');
  assert.equal(hashOf({ a: 1, b: 2 }), hashOf({ b: 2, a: 1 }));
  assert.equal(canonicalJson({ x: undefined, y: NaN, z: 1e21 }), '{"y":null,"z":1e+21}');
  assert.equal(canonicalJson(0.1 + 0.2), '0.3');                         // 10 significant digits: machine noise does not change a hash
  assert.equal(roundSig(123456789.123456), 123456789.1);
  assert.throws(() => canonicalJson({ d: new Date() }));
});

const prereg = (k: string, g = 'g1') => ({ trialKey: k, hypothesis: 'h', source: 'factory', strategy: { id: 's', fingerprint: 'f' }, panel: 'p', tf: '1d', gateVersion: g, passBar: 'bar' });
const result = (k: string, g = 'g1') => ({ trialKey: k, gateVersion: g, inputs: {}, inputHash: 'i', resultHash: 'r', status: 'rejected' });

test('chain verifies, and any tampering is found at the right entry', async () => {
  let t = 1000; const L = new Ledger(new MemoryLedgerStore(), () => t++);
  await L.append('prereg', 'autopilot', prereg('k1')); await L.append('trial_result', 'autopilot', result('k1')); await L.append('halt', 'jeremy', { level: 'andon', by: 'jeremy', reason: 'test' });
  assert.deepEqual((await L.verify()).ok, true);
  const rows = (await L.store.read()).map(e => JSON.parse(JSON.stringify(e)) as LedgerEntry);
  assert.equal(rows[0].prevHash, GENESIS);
  const edited = rows.map(e => ({ ...e })); edited[1] = { ...edited[1], payload: { ...edited[1].payload, status: 'passed_pending_validation' } };
  assert.deepEqual([verifyChain(edited).ok, verifyChain(edited).badSeq], [false, 2]);
  const dropped = [rows[0], rows[2]]; assert.equal(verifyChain(dropped).badSeq, 3);
  const rehashed = rows.map(e => ({ ...e })); rehashed[1] = makeEntry({ seq: 1, hash: rows[0].hash }, rows[1].ts, 'trial_result', 'autopilot', { ...rows[1].payload, status: 'watch' });
  assert.equal(verifyChain(rehashed).badSeq, 3);                          // a rewritten entry breaks the link to everything after it
});

test('S9: a result without an earlier pre-registration is refused', async () => {
  const L = new Ledger(new MemoryLedgerStore());
  await assert.rejects(L.append('trial_result', 'autopilot', result('nope')), /no pre-registration/);
  await L.append('prereg', 'autopilot', prereg('k1', 'g1'));
  await assert.rejects(L.append('trial_result', 'autopilot', result('k1', 'g2')), /gate version differs/);
  await assert.rejects(L.append('prereg', 'autopilot', prereg('k1')), /already pre-registered/);
  await assert.rejects(L.append('validator_run', 'validator', { trialKey: 'zz', level: 'L1', inputHash: 'i', resultHash: 'r', agrees: true }), /no pre-registration/);
  await L.append('trial_result', 'autopilot', result('k1'));
});

test('missing fields, unknown kinds and secrets never reach the chain (S14)', async () => {
  const L = new Ledger(new MemoryLedgerStore());
  await assert.rejects(L.append('prereg', 'a', { trialKey: 'k' }), /missing/);
  await assert.rejects(L.append('nonsense' as any, 'a', {}), /unknown kind/);
  await assert.rejects(L.append('halt', 'a', { level: 'andon', by: 'a', reason: 'key ' + 'sk-' + 'ant-' + 'a'.repeat(30) }), /secret/);
  assert.equal(await L.store.head(), null);
});

test('concurrent appends serialise into one gapless chain', async () => {
  const store = new MemoryLedgerStore(), a = new Ledger(store), b = new Ledger(store);
  await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? a : b).append('halt', `w${i % 2}`, { level: 'andon', by: 'x', reason: String(i) })));
  const rows = await store.read(); assert.equal(rows.length, 40); assert.equal(verifyChain(rows).ok, true);
  assert.deepEqual(rows.map(r => r.seq), Array.from({ length: 40 }, (_, i) => i + 1));
});

test('S10: trials are counted from the ledger; a re-run does not add one, a new key does', async () => {
  const L = new Ledger(new MemoryLedgerStore()); const N = async () => trialsEver(buildView(await L.store.read(), 10000));
  await L.append('prereg', 'a', prereg('k1')); assert.equal(await N(), 0);          // registered but not yet tested
  await L.append('trial_result', 'a', result('k1')); assert.equal(await N(), 1);
  await L.append('trial_result', 'a', { ...result('k1'), inputHash: 'newer-bars' }); assert.equal(await N(), 1);
  await L.append('validator_run', 'validator', { trialKey: 'k1', level: 'L1', inputHash: 'i', resultHash: 'r', agrees: true }); assert.equal(await N(), 1);
  await L.append('skipped_data', 'a', { dataset: 'd', reason: 'blocked' }); assert.equal(await N(), 1);
  await L.append('prereg', 'a', prereg('k2')); await L.append('trial_result', 'a', result('k2')); assert.equal(await N(), 2);
});
