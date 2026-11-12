import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GATE_V1, gateVersion, trialKey, evaluate, resultHash, passBar } from '../src/index';
import { plantedBars, markerStrategy, lookahead, coinFlip, COST } from './helpers';

test('gate version is the hash of the frozen config; any change is a new version', () => {
  assert.match(gateVersion(GATE_V1), /^[0-9a-f]{64}$/);
  assert.notEqual(gateVersion({ ...GATE_V1, minTrades: 49 }), gateVersion(GATE_V1));
  assert.notEqual(gateVersion({ ...GATE_V1, firewall: { ...GATE_V1.firewall, gapBlock: 0.06 } }), gateVersion(GATE_V1));
  assert.throws(() => { (GATE_V1 as any).minTrades = 1; });
  assert.ok(passBar(GATE_V1).includes('50+ trades'));
});

test('what counts as a trial (04 s3.3)', () => {
  const base = { strategyId: 's', fingerprint: 'f1', panel: 'csv:SPY:1h:split', tf: '1h', gateVersion: 'g1' }, k = trialKey(base);
  assert.equal(trialKey({ ...base }), k);                                             // same pair on newer bars: same trial
  assert.notEqual(trialKey({ ...base, fingerprint: 'f2' }), k);                       // a rule or parameter changed
  assert.notEqual(trialKey({ ...base, strategyId: 's__variant' }), k);                // a variant
  assert.notEqual(trialKey({ ...base, gateVersion: 'g2' }), k);                       // re-judged under a new gate
  assert.notEqual(trialKey({ ...base, panel: 'csv:QQQ:1h:split' }), k);               // another market
  assert.notEqual(trialKey({ ...base, tf: '4h' }), k);
});

test('a planted edge passes all seven checks; the result is deterministic', () => {
  const bars = plantedBars(), a = evaluate(bars, markerStrategy(), COST, GATE_V1), b = evaluate(bars, markerStrategy(), COST, GATE_V1, 500);
  assert.equal(a.checks.length, 7); assert.deepEqual(a.checks.filter(c => !c.pass).map(c => c.name), []);
  assert.equal(a.status, 'passed_pending_validation');
  assert.equal(resultHash(a), resultHash(b));                                         // the trial count is a readout, not part of the receipt
  assert.ok(b.readouts.dsrN <= a.readouts.dsrN);
});

test('the same rule with no edge in the data does not pass', () => {
  const r = evaluate(plantedBars(2200, { drift: 0 }), markerStrategy(), COST, GATE_V1);
  assert.notEqual(r.status, 'passed_pending_validation'); assert.ok(r.why.includes('check'));
});

test('a look-ahead strategy fails the one-bar-late check', () => {
  const r = evaluate(plantedBars(2200, { drift: 0 }), lookahead, COST, GATE_V1);
  assert.ok(r.metrics.ret > 0.5, 'cheating looks great in sample');
  assert.equal(r.checks.find(c => c.n === 4)!.pass, false);
  assert.notEqual(r.status, 'passed_pending_validation');
});

test('status set: needs_data when only the trade count fails, rejected on errors', () => {
  const few = evaluate(plantedBars(2200, { every: 60, len: 6, drift: 0.01 }), markerStrategy(6), COST, GATE_V1);
  assert.ok(few.metrics.trades < 50); assert.equal(few.checks[0].pass, false);
  if (few.checks.slice(1).every(c => c.pass)) assert.equal(few.status, 'needs_data');
  const err = evaluate(plantedBars(), () => { throw new Error('boom'); }, COST, GATE_V1);
  assert.equal(err.status, 'rejected'); assert.match(err.why, /boom/);
});

test('80 no-edge strategies give zero passes', () => {
  const bars = plantedBars(1500, { drift: 0, seed: 9 }); let passes = 0;
  for (let i = 1; i <= 80; i++) if (evaluate(bars, coinFlip(i * 13), COST, GATE_V1).status === 'passed_pending_validation') passes++;
  assert.equal(passes, 0);
});
