import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryStage, crossSourceScore, survivedDrops, pickAmongTwins, sizeByMcap, scaleTarget, nextWaveExit, catalystDates, planEventBet } from '../src/attention.js';

const now = 1_000_000_000;
test('discovery stage is the widest crowd seen', () => {
  assert.equal(discoveryStage([]), 'launchpad');
  assert.equal(discoveryStage([{ source: 'a', group: 'trader-groups', ts: now }, { source: 'b', group: 'x-crypto', ts: now }]), 'x-crypto');
});
test('several separate sources beat one loud one', () => {
  const one = Array.from({ length: 10 }, (_, i) => ({ source: 'same', group: 'trader-groups', ts: now - i * 1000 }));
  const many = Array.from({ length: 5 }, (_, i) => ({ source: `g${i}`, group: i % 2 ? 'trader-groups' : 'x-crypto', ts: now }));
  assert.ok(crossSourceScore(many, now) > crossSourceScore(one, now));
  assert.equal(crossSourceScore([{ source: 'old', group: 'x-crypto', ts: now - 2 * 3600_000 }], now), 0);
});
test('70% drops are counted once each, after a new high', () => {
  assert.equal(survivedDrops([1, 10, 3, 2.9, 2, 12, 3.5, 20, 6.1]), 2);
  assert.equal(survivedDrops([1, 2, 3, 4]), 0);
  assert.equal(survivedDrops([10, 3]), 1);  // exactly -70% counts
});
test('twins: oldest with liquidity and spread holders wins', () => {
  const t = pickAmongTwins([{ mint: 'new', ageMin: 5, liquidityUsd: 50_000, top10Pct: 0.2, mcapUsd: 1e5 },
    { mint: 'old', ageMin: 300, liquidityUsd: 20_000, top10Pct: 0.3, mcapUsd: 1e5 }, { mint: 'whale', ageMin: 900, liquidityUsd: 90_000, top10Pct: 0.6, mcapUsd: 1e5 }]);
  assert.equal(t?.mint, 'old');
  assert.equal(pickAmongTwins([{ mint: 'x', ageMin: 1, liquidityUsd: 10, top10Pct: 0.1, mcapUsd: 1 }]), null);
});
test('size grows with market cap and never passes the cap', () => {
  assert.deepEqual([10_000, 100_000, 1_000_000, 50_000_000].map(m => sizeByMcap(m, 0.1)), [0.025, 0.05, 0.075, 0.1]);
});
test('targets scale with fear and greed', () => {
  assert.equal(scaleTarget(3, 50), 3);
  assert.ok(scaleTarget(3, 10) < 3 && scaleTarget(3, 90) > 3 && scaleTarget(3, 100) <= 5);
});
test('next-wave exit', () => {
  assert.equal(nextWaveExit('mainstream', 3).exit, true);
  assert.equal(nextWaveExit('x-crypto', null).exit, true);
  assert.equal(nextWaveExit('x-crypto', 5).exit, false);
});
test('catalyst dates include run-ups', () => {
  const d = catalystDates([{ name: 'Mascot reveal', date: '2026-11-18', theme: 'mascot' }]);
  assert.deepEqual(d.map(x => x.date), ['2026-11-04', '2026-11-11', '2026-11-18']);
});
test('event bet: sized by probability, long shots get a small hedge, total is the budget', () => {
  const p = planEventBet([{ name: 'A', p: 0.7 }, { name: 'B', p: 0.25 }, { name: 'C', p: 0 }], 1);
  assert.ok(Math.abs(p.reduce((a, x) => a + x.sizeSol, 0) - 1) < 1e-3);
  assert.ok(p[0].sizeSol > p[1].sizeSol && p[1].sizeSol > p[2].sizeSol && p[2].sizeSol > 0);
});

import { edgeCheck, derivativeCeiling, outsidersComing } from '../src/attention.js';
test('edge check: named edge plus a real reason', () => {
  assert.equal(edgeCheck({}).ok, false);
  assert.equal(edgeCheck({ edge: 'vibes', why: 'it looks like a cute frog to me honestly' }).ok, false);
  assert.equal(edgeCheck({ edge: 'catalyst-ahead', why: 'cute' }).ok, false);
  assert.equal(edgeCheck({ edge: 'catalyst-ahead', why: 'mascot vote result is announced on the 18th, eight days away' }).ok, true);
});
test('derivative ceiling follows the parent and the mood', () => {
  assert.equal(derivativeCeiling(8_000_000), 1_200_000);
  assert.ok(derivativeCeiling(8_000_000, 10) < derivativeCeiling(8_000_000, 90));
});
test('outsiders: rising interest or a catalyst', () => {
  assert.equal(outsidersComing([10, 10, 10, 10, 10, 10, 10, 10], null).yes, false);
  assert.equal(outsidersComing([10, 10, 12, 15, 20, 30, 40, 60], null).yes, true);
  assert.equal(outsidersComing([10, 10, 10, 10], 7).yes, true);
});
