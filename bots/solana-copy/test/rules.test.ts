import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreWallet, pvpMuted, sizeSol, entryBlock, exitDecision, openPosition, copySellFraction, launchpadOf } from '../src/rules.js';
import { parseLadder } from '../src/config.js';
import type { SwapEvent } from '../src/types.js';

const exits = { ladder: parseLadder('2:0.8'), trailTriggerX: 2, trailLockPct: 20, trailPct: 35, stopLossPct: 50 };
const filters = { launchpads: ['pump', 'bonk'], minMcap: 10_000, maxMcap: 0, minAgeMin: 0, maxAgeMin: 0, noDuplicateBuys: true };
const ev = (mint: string, side: 'buy' | 'sell', ts: number, sol = 1): SwapEvent => ({ wallet: 'W', signature: `${mint}${side}${ts}`, ts, mint, side, sol, tokens: 1000 });

test('conviction wallet passes: long holds, more sells than buys, profitable', () => {
  const evs: SwapEvent[] = [];
  for (let i = 0; i < 12; i++) { const t = i * 3_600_000; evs.push(ev(`m${i}`, 'buy', t, 1), ev(`m${i}`, 'sell', t + 1_200_000, 0.8), ev(`m${i}`, 'sell', t + 2_400_000, 0.8)); }
  const r = scoreWallet(evs); assert.equal(r.pass, true, r.reasons.join('; ')); assert.ok(r.sells > r.buys);
});

test('farming wallet fails: flips within seconds', () => {
  const evs: SwapEvent[] = [];
  for (let i = 0; i < 12; i++) { const t = i * 600_000; evs.push(ev(`m${i}`, 'buy', t), ev(`m${i}`, 'sell', t + 20_000, 1.1)); }
  const r = scoreWallet(evs); assert.equal(r.pass, false); assert.ok(r.reasons.some(x => x.includes('flipped')));
});

test('anti-PVP mutes after 3 fast flips in the window', () => {
  const now = 10_000_000, p = { flipSeconds: 60, maxFlips: 3, windowMin: 30 };
  const evs = [0, 1, 2].flatMap(i => [ev(`m${i}`, 'buy', now - 600_000 + i * 1000), ev(`m${i}`, 'sell', now - 600_000 + i * 1000 + 30_000)]);
  assert.equal(pvpMuted(evs, now, p).muted, true);
  assert.equal(pvpMuted(evs.slice(0, 4), now, p).muted, false);
});

test('sizing: fixed, ratio, cap and cash', () => {
  const s = { mode: 'fixed' as const, fixedSol: 1, ratio: 0.5, maxSol: 0.1, };
  assert.equal(sizeSol(5, s, 10, 0), 0.1);
  assert.equal(sizeSol(0.1, { ...s, mode: 'ratio', maxSol: 10 }, 10, 0), 0.05);
  assert.equal(sizeSol(10, { ...s, mode: 'ratio', maxSol: 10 }, 2, 0.5), 1.5);
});

test('entry filters: launchpad, min market cap, duplicates', () => {
  const t = { mint: 'AbCpump', priceUsd: 0.00001, priceSol: 1e-7, mcapUsd: 25_000 };
  assert.equal(entryBlock(t, filters, Date.now(), false), null);
  assert.match(entryBlock({ ...t, mcapUsd: 5000 }, filters, Date.now(), false)!, /below/);
  assert.match(entryBlock(t, filters, Date.now(), true)!, /duplicate/);
  assert.match(entryBlock({ ...t, mint: 'Xyz', dexId: 'raydium' }, filters, Date.now(), false)!, /launchpad/);
  assert.equal(launchpadOf('Q1bonk'), 'bonk');
});

test('exits: 80% at 2x, then stop locked into profit, moon bag rides the trail', () => {
  const p = openPosition('m', 'W', 1, 1000, 0, exits); // entry 0.001 SOL per token
  assert.equal(exitDecision(p, 0.0015, exits), null);
  const tp = exitDecision(p, 0.002, exits)!; assert.equal(tp.frac, 0.8); assert.match(tp.reason, /2x/);
  assert.ok(p.trailing && p.stopPriceSol >= 0.0012, 'stop moved at least 20% into profit');
  p.tokens = 200; assert.equal(exitDecision(p, 0.004, exits), null); // peak 4x, stop trails to 0.0026
  const st = exitDecision(p, 0.0025, exits)!; assert.equal(st.frac, 1); assert.match(st.reason, /trailing/);
});

test('exits: hard stop loss before any profit', () => {
  const p = openPosition('m', 'W', 1, 1000, 0, exits);
  const a = exitDecision(p, 0.00049, exits)!; assert.equal(a.frac, 1); assert.equal(a.reason, 'stop loss');
});

test('copy sell is proportional, full exit when target dumps nearly everything', () => {
  assert.equal(copySellFraction(400, 1000), 0.4);
  assert.equal(copySellFraction(980, 1000), 1);
  assert.equal(copySellFraction(10, 0), 1);
});
