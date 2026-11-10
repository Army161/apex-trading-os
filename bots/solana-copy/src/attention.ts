// Attention-trading helpers (ideas from archive/chat/43 and chat/44, two memecoin videos that pitch a paid alert group;
// their wins are hand-picked and their numbers are guesses, as the speakers admit). Pure functions for research and paper
// mode only: nothing here signs, sends or launches anything. Most memecoins go to zero, so every size here is a cap, not a goal.

/** Where a token sits on the path from launch to mainstream. Earlier = less proven, smaller size. */
export const STAGES = ['launchpad', 'migrated', 'trader-groups', 'x-crypto', 'social-wide', 'mainstream'] as const;
export type Stage = typeof STAGES[number];
export type Sighting = { source: string; group: string; ts: number };

/** Highest stage reached, from what kinds of places have mentioned it (each sighting's group is one of STAGES). */
export function discoveryStage(sightings: Sighting[]): Stage {
  let best = 0;
  for (const s of sightings) { const i = STAGES.indexOf(s.group as Stage); if (i > best) best = i; }
  return STAGES[best];
}

/** Cross-source score, 0 to 100: several separate sources inside a short window count far more than one loud one. */
export function crossSourceScore(sightings: Sighting[], now: number, windowMin = 60) {
  const recent = sightings.filter(s => now - s.ts <= windowMin * 60_000);
  const sources = new Set(recent.map(s => s.source)).size, groups = new Set(recent.map(s => s.group)).size;
  return Math.min(100, Math.round(25 * Math.log2(1 + sources) + 10 * Math.max(0, groups - 1)));
}

/** Count separate drops of at least `depth` (0.7 = 70%) from a running high, each needing a new high before the next counts. */
export function survivedDrops(prices: number[], depth = 0.7) {
  let peak = -Infinity, armed = true, n = 0;
  for (const p of prices) {
    if (p > peak) { peak = p; armed = true; }
    else if (armed && p <= peak * (1 - depth)) { n++; armed = false; peak = p; }
  }
  return n;
}

/** Copycats on one theme: prefer the oldest with real liquidity and spread-out holders, never the newest vamp. */
export type Twin = { mint: string; ageMin: number; liquidityUsd: number; top10Pct: number; mcapUsd: number };
export function pickAmongTwins(twins: Twin[], minLiquidity = 5_000, maxTop10 = 0.35) {
  const ok = twins.filter(t => t.liquidityUsd >= minLiquidity && t.top10Pct <= maxTop10);
  return ok.sort((a, b) => b.ageMin - a.ageMin || b.liquidityUsd - a.liquidityUsd)[0] ?? null;
}

/** Size by market cap: tiny at very low caps (thin, rug-prone), a little more once proven, always under the hard cap. */
export function sizeByMcap(mcapUsd: number, maxSol: number) {
  const f = mcapUsd < 50_000 ? 0.25 : mcapUsd < 500_000 ? 0.5 : mcapUsd < 5_000_000 ? 0.75 : 1;
  return +(maxSol * f).toFixed(4);
}

/** Targets move with the crypto fear and greed index (0-100): lower when fearful, higher when greedy, never above 2x base. */
export function scaleTarget(baseX: number, fearGreed: number) {
  const fg = Math.max(0, Math.min(100, fearGreed));
  return +(1 + (baseX - 1) * (0.5 + fg / 100)).toFixed(2);
}

/** Exit check: if the next, wider crowd has already arrived (or nothing new is coming), take profit. */
export function nextWaveExit(stage: Stage, daysToNextCatalyst: number | null) {
  if (stage === 'mainstream') return { exit: true, why: 'already mainstream: there is no bigger crowd left to buy from you' };
  if (daysToNextCatalyst === null || daysToNextCatalyst > 30) return { exit: true, why: 'no new attention coming for a month or more' };
  return { exit: false, why: `next crowd: ${STAGES[STAGES.indexOf(stage) + 1]}; next catalyst in ${daysToNextCatalyst} days` };
}

// ---- event calendar and event bets ----
export type Event = { name: string; date: string; theme: string };
/** Known event dates plus run-up dates (two weeks and one week before), which draw attention of their own. */
export function catalystDates(events: Event[]) {
  const out: { date: string; name: string; kind: 'event' | 'two-weeks' | 'one-week' }[] = [];
  const shift = (d: string, days: number) => new Date(Date.parse(d + 'T00:00:00Z') - days * 864e5).toISOString().slice(0, 10);
  for (const e of events) out.push({ date: shift(e.date, 14), name: e.name, kind: 'two-weeks' }, { date: shift(e.date, 7), name: e.name, kind: 'one-week' }, { date: e.date, name: e.name, kind: 'event' });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Event bet planner: split a total budget across outcomes in proportion to your own probability estimates, with a small floor
 * on long shots as a hedge. The probabilities are guesses: say so wherever this is shown. Includes a "sell the news" plan.
 */
export function planEventBet(outcomes: { name: string; p: number }[], budgetSol: number, hedgeFloor = 0.05) {
  const total = outcomes.reduce((a, o) => a + Math.max(0, o.p), 0);
  if (total <= 0) return [];
  const w = outcomes.map(o => Math.max(hedgeFloor, Math.max(0, o.p) / total)), sw = w.reduce((a, b) => a + b, 0);
  return outcomes.map((o, i) => ({ name: o.name, p: +(o.p / total).toFixed(3), sizeSol: +(budgetSol * w[i] / sw).toFixed(4),
    plan: 'take at least half off into the announcement (sell the news); keep the rest only if the next catalyst is close' }));
}

// ---- from archive/chat/45 (another pitch for the same paid group; the trader's results are not verified) ----

/** Edge check: a paper trade must say what its edge is, from a known kind plus a concrete reason, or it does not happen. */
export const EDGES = ['earlier-than-crowd', 'cross-source', 'catalyst-ahead', 'survived-drops', 'copy-proven-wallet'] as const;
export function edgeCheck(t: { edge?: string; why?: string }) {
  if (!t.edge || !(EDGES as readonly string[]).includes(t.edge)) return { ok: false, why: `no edge named (one of: ${EDGES.join(', ')}); without one it is gambling` };
  if (!t.why || t.why.trim().split(/\s+/).length < 6) return { ok: false, why: 'say the edge in a real sentence: what do you know that the next buyer does not?' };
  return { ok: true, why: `${t.edge}: ${t.why.trim()}` };
}

/** A copycat (derivative) token rarely passes a slice of its parent: ceiling = parent cap x share, scaled by market mood. */
export function derivativeCeiling(parentMcapUsd: number, fearGreed = 50, share = 0.15) {
  const mood = 0.5 + Math.max(0, Math.min(100, fearGreed)) / 100;   // 0.5x in deep fear, 1.5x in extreme greed
  return Math.round(parentMcapUsd * share * mood);
}

/** "Will outsiders keep coming in?": rising search interest or a dated catalyst ahead means a wider crowd may still arrive. */
export function outsidersComing(searchInterest: number[], daysToNextCatalyst: number | null) {
  const n = searchInterest.length, recent = searchInterest.slice(-Math.max(1, Math.floor(n / 4))), early = searchInterest.slice(0, Math.max(1, Math.floor(n / 4)));
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const rising = n >= 4 && avg(recent) > 1.2 * avg(early);
  const soon = daysToNextCatalyst !== null && daysToNextCatalyst <= 30;
  return { yes: rising || soon, rising, catalystSoon: soon, why: rising ? 'search interest is rising' : soon ? `a catalyst in ${daysToNextCatalyst} days` : 'flat interest and nothing coming: likely to drift sideways' };
}
