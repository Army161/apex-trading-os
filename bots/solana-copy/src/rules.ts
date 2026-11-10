// Pure trading rules from archive/chat/23 (Trade Wiz settings video). No network here, so every rule is unit tested.
import type { Config } from './config.js';
import type { SwapEvent, TokenInfo, Position, ExitAction } from './types.js';

/** Wallet quality: the video's two rules (long average hold, more sells than buys) plus a flip count that exposes copy-trader farming. */
export function scoreWallet(events: SwapEvent[], flipSeconds = 60) {
  const byMint = new Map<string, SwapEvent[]>();
  for (const e of [...events].sort((a, b) => a.ts - b.ts)) (byMint.get(e.mint) ?? byMint.set(e.mint, []).get(e.mint)!).push(e);
  let buys = 0, sells = 0, flips = 0, wins = 0, closed = 0, pnlSol = 0; const holds: number[] = [];
  for (const evs of byMint.values()) {
    const firstBuy = evs.find(e => e.side === 'buy'); const lastSell = [...evs].reverse().find(e => e.side === 'sell');
    buys += evs.filter(e => e.side === 'buy').length; sells += evs.filter(e => e.side === 'sell').length;
    if (firstBuy && lastSell && lastSell.ts > firstBuy.ts) {
      const firstSell = evs.find(e => e.side === 'sell' && e.ts >= firstBuy.ts)!;
      holds.push((lastSell.ts - firstBuy.ts) / 1000);
      if ((firstSell.ts - firstBuy.ts) / 1000 <= flipSeconds) flips++;
      const spent = evs.filter(e => e.side === 'buy').reduce((s, e) => s + e.sol, 0), got = evs.filter(e => e.side === 'sell').reduce((s, e) => s + e.sol, 0);
      closed++; pnlSol += got - spent; if (got > spent) wins++;
    }
  }
  const median = (x: number[]) => { if (!x.length) return 0; const s = [...x].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const avgHold = holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : 0;
  const flipRate = closed ? flips / closed : 0;
  const reasons: string[] = [];
  if (closed < 10) reasons.push(`only ${closed} closed tokens in the sample (want 10+)`);
  if (median(holds) < 300) reasons.push(`median hold ${Math.round(median(holds))}s is short (want 5 min+)`);
  if (sells <= buys) reasons.push(`sells (${sells}) do not exceed buys (${buys})`);
  if (flipRate > 0.25) reasons.push(`${Math.round(flipRate * 100)}% of tokens flipped within ${flipSeconds}s (copy-trader farming risk)`);
  if (closed >= 10 && pnlSol <= 0) reasons.push('net SOL P&L in the sample is not positive');
  return { tokens: byMint.size, closed, buys, sells, sellBuyRatio: buys ? sells / buys : 0, avgHoldSec: avgHold, medianHoldSec: median(holds), flips, flipRate, winRate: closed ? wins / closed : 0, pnlSol, pass: reasons.length === 0, reasons };
}

/** Anti-PVP: mute a wallet that buys and sells the same token within flipSeconds too often inside the window. */
export function pvpMuted(recent: SwapEvent[], now: number, p: Config['pvp']) {
  const since = now - p.windowMin * 60_000; const ev = recent.filter(e => e.ts >= since).sort((a, b) => a.ts - b.ts);
  const lastBuy = new Map<string, number>(); let flips = 0;
  for (const e of ev) {
    if (e.side === 'buy') lastBuy.set(e.mint, e.ts);
    else { const b = lastBuy.get(e.mint); if (b != null && (e.ts - b) / 1000 <= p.flipSeconds) { flips++; lastBuy.delete(e.mint); } }
  }
  return { muted: flips >= p.maxFlips, flips };
}

/** Fixed or ratio sizing (video), clamped to the per-trade cap and the cash left. */
export function sizeSol(targetSol: number, s: Config['sizing'], cashSol: number, reserveSol: number) {
  const raw = s.mode === 'fixed' ? s.fixedSol : targetSol * s.ratio;
  return Math.max(0, Math.min(raw, s.maxSol, cashSol - reserveSol));
}

export function launchpadOf(mint: string, dexId?: string) {
  const m = mint.toLowerCase(), d = (dexId ?? '').toLowerCase();
  if (m.endsWith('pump') || d.includes('pump')) return 'pump';
  if (m.endsWith('bonk') || d.includes('bonk') || d.includes('letsbonk') || d.includes('raydium-launchlab')) return 'bonk';
  return d || 'other';
}

/** Entry filters from the video: launchpad, market cap band, token age, no duplicate buys. Returns null when OK, else the reason. */
export function entryBlock(t: TokenInfo, f: Config['filters'], now: number, alreadyBought: boolean): string | null {
  if (f.noDuplicateBuys && alreadyBought) return 'duplicate buy on a token we already copied';
  if (f.launchpads.length && !f.launchpads.includes(launchpadOf(t.mint, t.dexId))) return `launchpad ${launchpadOf(t.mint, t.dexId)} not in ${f.launchpads.join('/')}`;
  if (!(t.mcapUsd > 0)) return 'no market cap data';
  if (t.mcapUsd < f.minMcap) return `market cap $${Math.round(t.mcapUsd)} below $${f.minMcap}`;
  if (f.maxMcap > 0 && t.mcapUsd > f.maxMcap) return `market cap $${Math.round(t.mcapUsd)} above $${f.maxMcap}`;
  if (t.createdAt) {
    const age = (now - t.createdAt) / 60_000;
    if (f.minAgeMin > 0 && age < f.minAgeMin) return `token ${age.toFixed(1)} min old, below ${f.minAgeMin}`;
    if (f.maxAgeMin > 0 && age > f.maxAgeMin) return `token ${age.toFixed(0)} min old, above ${f.maxAgeMin}`;
  }
  return null;
}

export function openPosition(mint: string, source: string, costSol: number, tokens: number, now: number, e: Config['exits'], symbol?: string): Position {
  const entry = costSol / tokens;
  return { mint, symbol, source, openedAt: now, entryPriceSol: entry, tokens, costSol, peakPriceSol: entry, stopPriceSol: e.stopLossPct > 0 ? entry * (1 - e.stopLossPct / 100) : 0, ladderDone: 0, trailing: false, realizedSol: 0 };
}

/**
 * Exit engine, checked on every price tick. Order: hard stop / trailing stop first (protect capital), then the take-profit ladder.
 * Video rules: sell 80% at 2x leaving a 20% moon bag; once up 100% the stop moves 20% into profit; copy the target's sells.
 * Mutates the position's peak/stop/trailing state and returns the fraction of the remaining bag to sell (0 = hold).
 */
export function exitDecision(p: Position, priceSol: number, e: Config['exits']): ExitAction | null {
  p.peakPriceSol = Math.max(p.peakPriceSol, priceSol);
  const x = priceSol / p.entryPriceSol;
  if (!p.trailing && e.trailTriggerX > 0 && p.peakPriceSol / p.entryPriceSol >= e.trailTriggerX) {
    p.trailing = true; p.stopPriceSol = Math.max(p.stopPriceSol, p.entryPriceSol * (1 + e.trailLockPct / 100));
  }
  if (p.trailing && e.trailPct > 0) p.stopPriceSol = Math.max(p.stopPriceSol, p.peakPriceSol * (1 - e.trailPct / 100), p.entryPriceSol * (1 + e.trailLockPct / 100));
  if (p.stopPriceSol > 0 && priceSol <= p.stopPriceSol) return { frac: 1, reason: p.trailing ? 'trailing stop (locked in profit)' : 'stop loss' };
  const next = e.ladder[p.ladderDone];
  if (next && x >= next.x) { p.ladderDone++; return { frac: next.frac, reason: `take profit ${next.x}x` }; }
  return null;
}

/** Proportional copy of a target's sell: if they sold 40% of their bag, we sell 40% of ours (all of it if they fully exited). */
export function copySellFraction(targetSoldTokens: number, targetHeldBefore: number) {
  if (!(targetHeldBefore > 0)) return 1;
  const f = targetSoldTokens / targetHeldBefore; return f >= 0.95 ? 1 : Math.max(0, Math.min(1, f));
}
