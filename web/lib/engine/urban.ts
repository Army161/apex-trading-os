// Urban Forex rules, written as our own code (archive/chat/60 consistency + deal flow, chat/61 S/R day trading). Paper only.
// chat/60: trade only a currency that is strong or weak across the board (a free, hand-rolled version of the scanner the video
//   sells; nothing is installed), "no deal, no trade" (never buy an extended high; the discount must be big enough), wait while
//   the pullback accelerates, then enter on a fast return through the "last seen" level as price leaves. Fib, S/R and trendlines
//   are context only and are never a trigger here.
// chat/61: S/R are memory zones (where price once left fast), not lines. A push into a zone that is too aggressive means ignore
//   the level for now; wait for the slowdown. The second attempt must be choppier than the first (the "DNA" test, measured bar by
//   bar inside each leg, i.e. one timeframe down) and fail to make a new extreme; then a failed retest triggers an entry in the
//   main direction, which comes from the higher timeframe (top-down).
// The webinars' CADJPY / EURJPY P&L screens (20 standard lots, $2,250 and $1,400 open P&L, "300-400k a trade" in the community)
// are UNPROVEN: screenshots of open trades are not a track record. Our results are whatever the backtest says.
import { Bar, Sig, atr, ema } from './core';
import { resample } from './trend';

const empty = (n: number): Sig => ({ le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(NaN), target: Array(n).fill(NaN) });
/** Mirror bars through zero so a long-only rule can find shorts. */
const flip = (b: Bar[]): Bar[] => b.map(x => ({ t: x.t, o: -x.o, h: -x.l, l: -x.h, c: -x.c, v: x.v }));
/** Run a long-only core on the bars and on their mirror; merge into one two-sided Sig. */
const twoSided = (core: (b: Bar[], side: 1 | -1) => Sig, sides: 'both' | 'long' | 'short' = 'both') => (b: Bar[]): Sig => {
  const s = empty(b.length);
  if (sides !== 'short') { const L = core(b, 1); for (let i = 0; i < b.length; i++) if (L.le[i]) { s.le[i] = true; s.stop[i] = L.stop[i]; s.target[i] = L.target[i]; } }
  if (sides !== 'long') { const S = core(flip(b), -1); for (let i = 0; i < b.length; i++) if (S.le[i] && !s.le[i]) { s.se[i] = true; s.stop[i] = -S.stop[i]; s.target[i] = -S.target[i]; } }
  return s;
};

// ---------------- currency strength (chat/60) ----------------
export const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'] as const;
export type Ccy = typeof CCYS[number];
type Px = { t: number; o: number; h: number; l: number; c: number };

/** Value of each currency in USD from its USD pair (EURUSD as is, USDJPY inverted), aligned on dates every leg has. */
export function usdValues(pairs: Record<string, Bar[]>) {
  const legs: Partial<Record<Ccy, Map<number, Px>>> = { USD: undefined };
  for (const [sym, bars] of Object.entries(pairs)) {
    const base = sym.slice(0, 3) as Ccy, quote = sym.slice(3, 6) as Ccy, m = new Map<number, Px>();
    if (quote === 'USD') for (const x of bars) m.set(x.t, { t: x.t, o: x.o, h: x.h, l: x.l, c: x.c });
    else if (base === 'USD') for (const x of bars) m.set(x.t, { t: x.t, o: 1 / x.o, h: 1 / x.l, l: 1 / x.h, c: 1 / x.c });
    else continue;
    legs[base === 'USD' ? quote : base] = m;
  }
  const have = (Object.keys(legs) as Ccy[]).filter(c => c !== 'USD' && legs[c]);
  const dates = [...(legs[have[0]]?.keys() ?? [])].filter(t => have.every(c => legs[c]!.has(t))).sort((a, b) => a - b);
  const val: Partial<Record<Ccy, Px[]>> = { USD: dates.map(t => ({ t, o: 1, h: 1, l: 1, c: 1 })) };
  for (const c of have) val[c] = dates.map(t => legs[c]!.get(t)!);
  return { ccys: ['USD', ...have] as Ccy[], dates, val: val as Record<Ccy, Px[]> };
}

/** Cross A/B from USD values. Open and close are exact; high and low are estimates (the true intraday path is unknown), kept
 *  inside the widest bound and never inside the open/close. */
export function cross(v: ReturnType<typeof usdValues>, a: Ccy, q: Ccy): Bar[] {
  const A = v.val[a], B = v.val[q];
  return v.dates.map((t, i) => {
    const o = A[i].o / B[i].o, c = A[i].c / B[i].c, hiB = A[i].h / B[i].l, loB = A[i].l / B[i].h;
    const top = Math.max(o, c), bot = Math.min(o, c);
    return { t, o, c, h: Math.min(hiB, top + (A[i].h / B[i].c - top > 0 ? A[i].h / B[i].c - top : 0) + (A[i].c / B[i].l - A[i].c / B[i].c)), l: Math.max(loB, bot - (bot - A[i].l / B[i].c > 0 ? bot - A[i].l / B[i].c : 0) - (A[i].c / B[i].c - A[i].c / B[i].h)), v: 0 };
  }).map(x => ({ ...x, h: Math.max(x.h, x.o, x.c), l: Math.min(x.l, x.o, x.c) }));
}

/** Every cross of the available currencies, named BASEQUOTE in the usual order (EUR > GBP > AUD > NZD > USD > CAD > CHF > JPY). */
const ORDER: Ccy[] = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
export function allCrosses(v: ReturnType<typeof usdValues>) {
  const out: Record<string, Bar[]> = {}, cs = ORDER.filter(c => v.ccys.includes(c));
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) out[cs[i] + cs[j]] = cross(v, cs[i], cs[j]);
  return out;
}

export type Strength = { t: number; score: Record<string, number>; label: Record<string, 'strong' | 'weak' | 'mixed'> };
/** Score each currency on every pair it is in, daily closes only. Per pair: +1 if the currency's side is above its EMA(n) and
 *  the EMA rose over `slope` bars, -1 for the mirror, 0 otherwise. Score = average over its pairs (-1..1). "Across the board"
 *  = |score| >= `board` (0.7 means at least about 6 of 7 pairs agree). Bar i uses only closes up to and including bar i. */
export function currencyStrength(v: ReturnType<typeof usdValues>, o: { n?: number; slope?: number; board?: number } = {}): Strength[] {
  const n = o.n ?? 20, sl = o.slope ?? 5, board = o.board ?? 0.7, cs = v.ccys, T = v.dates.length;
  const vote: Record<string, number[]> = Object.fromEntries(cs.map(c => [c, Array(T).fill(0)]));
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const c = v.dates.map((_, k) => v.val[cs[i]][k].c / v.val[cs[j]][k].c), e = ema(c, n);
    for (let k = sl; k < T; k++) {
      if (isNaN(e[k - sl])) continue;
      const s = c[k] > e[k] && e[k] > e[k - sl] ? 1 : c[k] < e[k] && e[k] < e[k - sl] ? -1 : 0;
      vote[cs[i]][k] += s; vote[cs[j]][k] -= s;
    }
  }
  return v.dates.map((t, k) => {
    const score: Record<string, number> = {}, label: Strength['label'] = {};
    for (const c of cs) { score[c] = vote[c][k] / (cs.length - 1); label[c] = score[c] >= board ? 'strong' : score[c] <= -board ? 'weak' : 'mixed'; }
    return { t, score, label };
  });
}

/** Side the strength scan allows on BASE/QUOTE at each date: +1 long, -1 short, 0 stand aside. Needs one side across the board
 *  and the other not on the same side. */
export function strengthSide(st: Strength[], pair: string) {
  const a = pair.slice(0, 3), q = pair.slice(3, 6), m = new Map<number, 1 | -1 | 0>();
  for (const s of st) {
    const A = s.label[a], Q = s.label[q];
    m.set(s.t, (A === 'strong' && Q !== 'strong') || (Q === 'weak' && A !== 'weak') ? 1 : (A === 'weak' && Q !== 'weak') || (Q === 'strong' && A !== 'strong') ? -1 : 0);
  }
  return m;
}

/** Keep only the signals the strength scan agrees with (looked up by bar time). */
export const withStrength = (build: (b: Bar[]) => Sig, side: Map<number, 1 | -1 | 0>) => (b: Bar[]): Sig => {
  const s = build(b), out: Sig = { ...s, le: [...s.le], se: [...s.se] };
  for (let i = 0; i < b.length; i++) { const d = side.get(b[i].t) ?? 0; if (d !== 1) out.le[i] = false; if (d !== -1) out.se[i] = false; }
  return out;
};

/** Latest strength table for the dashboard: strongest first. */
export function strengthTable(st: Strength[]) {
  const s = st[st.length - 1]; if (!s) return [];
  return Object.keys(s.score).map(c => ({ ccy: c, score: +s.score[c].toFixed(2), label: s.label[c] })).sort((x, y) => y.score - x.score);
}

// ---------------- no deal, no trade + pullback speed (chat/60) ----------------
type Leg = { size: number; bars: number };
const speed = (l: Leg) => l.size / Math.max(1, l.bars);

/** Long core. 1) A fast impulse of at least `minMove` ATR inside `look` bars tops out at X. 2) "No deal, no trade": nothing is
 *  bought until the pullback has given back at least `minDisc` of the impulse (a 5% dip is not a deal); past `maxDisc` the idea
 *  is dead. 3) Pullback legs run pivot high to pivot low (2-bar pivots). While the latest leg is faster than the one before,
 *  the deal is still getting better: wait. 4) Entry: the leg slowed, and price closes back above the "last seen" level (the top
 *  of the latest leg) within `fast` bars of the low, still under X. Stop a quarter ATR under the pullback low. Target X, or 2R
 *  when X is closer than 1.5R. */
function dealCore(o: { minMove?: number; look?: number; minDisc?: number; maxDisc?: number; fast?: number; life?: number }) {
  const minMove = o.minMove ?? 3, look = o.look ?? 20, minDisc = o.minDisc ?? 0.382, maxDisc = o.maxDisc ?? 0.886, fast = o.fast ?? 6, life = o.life ?? 60;
  return (b: Bar[]): Sig => {
    const s = empty(b.length), a = atr(b);
    type St = { X: number; xI: number; base: number; low: number; lowI: number; legs: Leg[]; seen: number; seenI: number };
    let st: St | null = null;
    for (let i = look + 2; i < b.length; i++) {
      const x = b[i];
      if (!st || i - st.xI > life) {
        st = null;
        const base = Math.min(...b.slice(i - look, i + 1).map(y => y.l));
        if ((x.h - base) / (a[i] || Infinity) >= minMove && x.h >= Math.max(...b.slice(i - look, i + 1).map(y => y.h))) st = { X: x.h, xI: i, base, low: Infinity, lowI: i, legs: [], seen: x.h, seenI: i };
        continue;
      }
      if (x.h > st.X && st.low === Infinity) { st.X = x.h; st.xI = i; st.seen = x.h; st.seenI = i; continue; }   // still running
      if (x.h > st.X) { st = null; continue; }                                                                     // new high: the deal is gone
      if (x.l < st.low) { st.low = x.l; st.lowI = i; }
      const imp = st.X - st.base, depth = (st.X - st.low) / imp;
      if (depth > maxDisc) { st = null; continue; }
      const k = i - 2;                                                                                             // 2-bar pivots confirmed now
      if (k - 2 > st.xI - 1) {
        const ph = b[k].h > b[k - 1].h && b[k].h > b[k - 2].h && b[k].h >= b[k + 1].h && b[k].h >= b[k + 2].h;
        const pl = b[k].l < b[k - 1].l && b[k].l < b[k - 2].l && b[k].l <= b[k + 1].l && b[k].l <= b[k + 2].l;
        if (ph) { st.seen = b[k].h; st.seenI = k; }
        if (pl && b[k].l < st.seen) st.legs.push({ size: st.seen - b[k].l, bars: k - st.seenI });
      }
      if (depth < minDisc || !st.legs.length) continue;                                                           // no deal, no trade
      const n = st.legs.length, accelerating = n >= 2 && speed(st.legs[n - 1]) > speed(st.legs[n - 2]);
      if (accelerating) continue;                                                                                  // a better deal may come
      if (x.c > st.seen && b[i - 1].c <= st.seen && i - st.lowI <= fast && x.c < st.X) {
        const stop = st.low - 0.25 * a[i], R = x.c - stop;
        s.le[i] = true; s.stop[i] = stop; s.target[i] = st.X - x.c >= 1.5 * R ? st.X : x.c + 2 * R; st = null;
      }
    }
    return s;
  };
}
export const dealFlow = (o: Parameters<typeof dealCore>[0] & { sides?: 'both' | 'long' | 'short' } = {}) => twoSided(dealCore(o), o.sides);

// ---------------- S/R memory zones + DNA test (chat/61) ----------------
/** Memory zones: bars that price left fast (moved `depart` ATR or more within `m` bars, either way). Zone = that bar's range
 *  padded by a quarter ATR. `known` = the bar at which the zone could first be seen (no lookahead). */
export function memoryZones(b: Bar[], o: { depart?: number; m?: number } = {}) {
  const d = o.depart ?? 2.5, m = o.m ?? 3, a = atr(b), z: { lo: number; hi: number; i: number; known: number }[] = [];
  for (let j = 14; j + m < b.length; j++) {
    const mv = b[j + m].c - b[j].c;
    if (Math.abs(mv) >= d * a[j]) z.push({ lo: b[j].l - 0.25 * a[j], hi: b[j].h + 0.25 * a[j], i: j, known: j + m });
  }
  return z;
}
/** Efficiency of a leg: net move / sum of bar-to-bar moves. 1 = one clean push; low = choppy and broken. */
const eff = (b: Bar[], from: number, to: number) => {
  let path = 0; for (let k = from + 1; k <= to; k++) path += Math.abs(b[k].c - b[k - 1].c);
  return path > 0 ? Math.abs(b[to].c - b[from].c) / path : 0;
};

/** Long core (main direction up, sellers push down into a memory zone):
 *  1. Top-down: the `mult`x higher timeframe must be up (close over a rising EMA50 on closed higher bars).
 *  2. Attempt 1: a down leg (pivot high H0 to pivot low L1) reaches a memory zone known before it started.
 *     Nothing is ever traded off the first touch: a push in that is aggressive means the level is ignored for now (chat/61).
 *  3. Attempt 2 (H1 to L2) is the DNA test: it must fail to make a new low (L2 > L1) and be choppier (lower efficiency and
 *     slower) than attempt 1. Then the setup is armed.
 *  4. Failed retest: within `life` bars, price tests back near L2 (within half an ATR), holds above L1, and closes up through the
 *     prior bar's high. Enter. Stop a quarter ATR under the lowest of L1, L2 and the bar; target `r`R. */
function srCore(o: { mult?: number; life?: number; r?: number; depart?: number }) {
  const mult = o.mult ?? 4, life = o.life ?? 10, r = o.r ?? 2;
  return (b: Bar[]): Sig => {
    const s = empty(b.length), a = atr(b), zones = memoryZones(b, { depart: o.depart });
    const spacing = b.length > 1 ? (b[b.length - 1].t - b[0].t) / (b.length - 1) : 864e5, R = resample(b, spacing * mult);
    const hc = R.bars.map(x => x.c), he = ema(hc, 50);
    const htfUp = (i: number) => { const k = R.idx[i] - 1; return k >= 5 && !isNaN(he[k - 5]) && hc[k] > he[k] && he[k] > he[k - 5]; };
    const piv: { type: 'H' | 'L'; i: number; p: number }[] = [];
    let armed: { L1: number; L2: number; at: number } | null = null;
    for (let i = 20; i < b.length; i++) {
      const x = b[i], k = i - 2;
      if (k >= 2) {
        if (b[k].h > b[k - 1].h && b[k].h > b[k - 2].h && b[k].h >= b[k + 1].h && b[k].h >= b[k + 2].h) {
          if (piv.length && piv[piv.length - 1].type === 'H') { if (b[k].h > piv[piv.length - 1].p) piv[piv.length - 1] = { type: 'H', i: k, p: b[k].h }; }
          else piv.push({ type: 'H', i: k, p: b[k].h });
        }
        if (b[k].l < b[k - 1].l && b[k].l < b[k - 2].l && b[k].l <= b[k + 1].l && b[k].l <= b[k + 2].l) {
          let fresh = true;
          if (piv.length && piv[piv.length - 1].type === 'L') { if (b[k].l < piv[piv.length - 1].p) piv[piv.length - 1] = { type: 'L', i: k, p: b[k].l }; else fresh = false; }
          else piv.push({ type: 'L', i: k, p: b[k].l });
          const n = piv.length;
          if (fresh && n >= 4 && piv[n - 1].type === 'L' && htfUp(i)) {
            const [H0, L1, H1, L2] = piv.slice(n - 4);
            const inZone = zones.some(z => z.known < H0.i && L1.p <= z.hi && L1.p >= z.lo - 0.5 * a[L1.i]);
            const sp1 = (H0.p - L1.p) / Math.max(1, L1.i - H0.i) / (a[L1.i] || Infinity), sp2 = (H1.p - L2.p) / Math.max(1, L2.i - H1.i) / (a[L2.i] || Infinity);
            const dna = L2.p > L1.p && eff(b, H1.i, L2.i) < eff(b, H0.i, L1.i) && sp2 < sp1;
            if (inZone && dna) armed = { L1: L1.p, L2: L2.p, at: i };
          }
        }
      }
      if (!armed) continue;
      if (i - armed.at > life || x.l < armed.L1) { armed = null; continue; }
      if (x.l <= armed.L2 + 0.5 * a[i] && x.c > x.o && x.c > b[i - 1].h && htfUp(i)) {
        const stop = Math.min(armed.L1, armed.L2, x.l) - 0.25 * a[i];
        s.le[i] = true; s.stop[i] = stop; s.target[i] = x.c + r * (x.c - stop); armed = null;
      }
    }
    return s;
  };
}
export const srMemory = (o: Parameters<typeof srCore>[0] & { sides?: 'both' | 'long' | 'short' } = {}) => twoSided(srCore(o), o.sides);
