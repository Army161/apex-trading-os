import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey } from '@solana/web3.js';
import { decodeSwap, WSOL } from '../src/solana.js';

const W = '7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2', MINT = 'GgBaCs3NCBuZN12kCJgAW63ydqohFkHEdfdEXBPzpump';
const tx = (preSol: number, postSol: number, pre: number | null, post: number | null): any => ({
  blockTime: 1_700_000_000,
  transaction: { message: { accountKeys: [{ pubkey: new PublicKey(W) }] } },
  meta: { err: null, fee: 5000, preBalances: [preSol * 1e9], postBalances: [postSol * 1e9 - 5000],
    preTokenBalances: pre == null ? [] : [{ owner: W, mint: MINT, uiTokenAmount: { uiAmount: pre } }],
    postTokenBalances: post == null ? [] : [{ owner: W, mint: MINT, uiTokenAmount: { uiAmount: post } }] },
});

test('decodes a buy: SOL out, tokens in', () => {
  const e = decodeSwap(W, 'sig', tx(5, 3.5, null, 1_000_000))!;
  assert.equal(e.side, 'buy'); assert.equal(e.mint, MINT); assert.ok(Math.abs(e.sol - 1.5) < 1e-9); assert.equal(e.tokens, 1_000_000);
});
test('decodes a sell: tokens out, SOL in', () => {
  const e = decodeSwap(W, 'sig', tx(1, 3, 1_000_000, 400_000))!;
  assert.equal(e.side, 'sell'); assert.equal(e.tokens, 600_000); assert.ok(Math.abs(e.sol - 2) < 1e-9);
});
test('ignores a plain token transfer (no SOL leg)', () => {
  assert.equal(decodeSwap(W, 'sig', tx(1, 1, null, 500)), null);
});
test('wrapped SOL counts as SOL', () => {
  const t = tx(2, 2, null, 1000); t.meta.preTokenBalances.push({ owner: W, mint: WSOL, uiTokenAmount: { uiAmount: 0.7 } });
  const e = decodeSwap(W, 'sig', t)!; assert.equal(e.side, 'buy'); assert.ok(Math.abs(e.sol - 0.7) < 1e-9);
});
