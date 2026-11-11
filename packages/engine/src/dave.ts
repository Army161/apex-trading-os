// Fractal market-structure scalper rules (archive/chat/78, an interview with a short-term trader). Our own code, paper only.
// The "$700 to $89,000 in three weeks" and "publicly verified" claims are UNPROVEN here: we have not seen a track record.
// He says "back test it", so these rules go through the same validate.ts checks as everything else. Sizing is the engine's
// fixed fraction (1% default), never his 5-8%.
//  1. Swing-count reversal: no counter-trend entry at a higher-timeframe point of interest until the move into it has made at
//     least 4 lower lows and 4 lower highs (mirror for shorts). Then a sweep of the last low and a close above the high of the
//     last down candle.
//  2. Previous-range pullback: after a break of structure, the leg from the last swing low to the new high is the previous
//     range. Wait for a 30/50/70% retrace into it, a sweep of the prior bar's low, then a close above the last down candle's high.
//     Target: back to the high it retraced from.
// Exits compared: fixed target, trail under bullish candle lows, trail under swing lows, and the 21 EMA close-below trail.
// Filters compared: skip the first hour of the New York open, and higher-timeframe alignment (4x and 16x the bar size).
import { Bar, Sig, atr, ema, macd, rollMax } from './core';
import { resample } from './trend';
import { nyHM } from './ict';

export type Exit = 'target' | 'candle' | 'swing' | 'ema21';
export type DaveOpts = { exit?: Exit; skipNyOpen?: boolean; align?: boolean; minSwings?: number; depth?: number; rr?: number;
  // Research-queue test 1 (docs/study-and-plan.md, Phase 3). Each is off by default, so dave_prev_range itself is unchanged.
  measuredMove?: boolean;   // target = the pullback low plus the height of the range, instead of the high it retraced from
  closeBreak?: boolean;     // the break must close 0.25 ATR beyond the swing, and pullback depth is measured on candle bodies, not wicks
  macdImpulse?: boolean;    // the break only counts if the MACD 3-10 line is at its 20-bar extreme on that bar (a real impulse)
  weakStop?: boolean };     // stop under the pullback low (the weak level) instead of under the range low (the strong level)

const N = NaN;
const empty = (n: number): Sig => ({ le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(N), target: Array(n).fill(N) });
const flip = (b: Bar[]): Bar[] => b.map(x => ({ t: x.t, o: -x.o, h: -x.l, l: -x.h, c: -x.c, v: x.v }));

/** Long-only core and its mirror, merged with exits kept (the urban.ts helper drops exits, which trailing needs). */
const twoSided = (core: (b: Bar[]) => Sig) => (b: Bar[]): Sig => {
  const s = empty(b.length), L = core(b), S = core(flip(b));
  for (let i = 0; i < b.length; i++) {
    if (L.le[i]) { s.le[i] = true; s.stop[i] = L.stop[i]; s.target[i] = L.target[i]; }
    else if (S.le[i]) { s.se[i] = true; s.stop[i] = -S.stop[i]; s.target[i] = -S.target[i]; }
    s.lx[i] = L.lx[i]; s.sx[i] = S.lx[i];
  }
  return s;
};

/** First hour of the New York cash open (9:30 to 10:30). Only means something on intraday bars. */
export const inNyOpen = (t: number) => { const m = nyHM(t); return m >= 570 && m < 630; };

/** Higher-timeframe trend at each bar: +1 when the HTF close is above a rising EMA 20, -1 for the mirror. Uses only closed HTF bars. */
function htfTrend(b: Bar[], mult: number) {
  const step = b.length > 1 ? b[1].t - b[0].t : 864e5, r = resample(b, step * mult), e = ema(r.bars.map(x => x.c), 20);
  return b.map((_, i) => { const k = r.idx[i] - 1; if (k < 1) return 0; const c = r.bars[k].c; return c > e[k] && e[k] > e[k - 1] ? 1 : c < e[k] && e[k] < e[k - 1] ? -1 : 0; });
}

/** Trailing exit, decided on the bar close. Sets lx while a simulated long is open. */
function trailExits(b: Bar[], s: Sig, exit: Exit) {
  if (exit === 'target') return;
  const e21 = ema(b.map(x => x.c), 21);
  let inPos = false, trail = N, entryBar = -1, lastPL = N;
  for (let i = 0; i < b.length; i++) {
    if (i >= 4 && b[i - 2].l < b[i - 3].l && b[i - 2].l < b[i - 4].l && b[i - 2].l < b[i - 1].l && b[i - 2].l < b[i].l) lastPL = b[i - 2].l;
    if (inPos) {
      if (b[i].l <= s.stop[entryBar] || (!isNaN(s.target[entryBar]) && b[i].h >= s.target[entryBar])) { inPos = false; continue; }
      if (exit === 'candle' && b[i].c > b[i].o) trail = Math.max(trail, b[i].l);
      if (exit === 'swing' && lastPL > trail) trail = lastPL;
      if (exit === 'ema21' && b[i].c < e21[i]) trail = Math.max(trail, b[i].l);
      if (b[i].c < trail && !(exit === 'ema21' && b[i].c < e21[i] && trail === b[i].l)) { s.lx[i] = true; inPos = false; }
    } else if (i > 0 && s.le[i - 1]) {
      inPos = true; entryBar = i - 1; trail = s.stop[entryBar];
      s.target[entryBar] = N;   // trailing replaces the fixed target
    }
  }
}

/** Shared trigger: the bar sweeps the prior bar's low and closes above the high of the most recent down candle. */
const trigger = (b: Bar[], i: number, lastDownHigh: number) => b[i].l < b[i - 1].l && b[i].c > lastDownHigh && b[i].c > b[i].o;

// ---------------- 1. swing-count reversal ----------------
export function swingCountCore(o: DaveOpts = {}) {
  const need = o.minSwings ?? 4, rr = o.rr ?? 2;
  return (b: Bar[]): Sig => {
    const s = empty(b.length), a = atr(b, 14), htfLow = poiLows(b, 4);
    let lows: number[] = [], highs: number[] = [], lastDownHigh = N, ll = 0, lh = 0;
    for (let i = 4; i < b.length; i++) {
      const k = i - 2;
      if (b[k].l < b[k - 1].l && b[k].l < b[k - 2].l && b[k].l <= b[k + 1].l && b[k].l <= b[k + 2].l) { ll = lows.length && b[k].l < lows[lows.length - 1] ? ll + 1 : 0; lows.push(b[k].l); }
      if (b[k].h > b[k - 1].h && b[k].h > b[k - 2].h && b[k].h >= b[k + 1].h && b[k].h >= b[k + 2].h) { lh = highs.length && b[k].h < highs[highs.length - 1] ? lh + 1 : 0; highs.push(b[k].h); }
      if (b[i - 1].c < b[i - 1].o) lastDownHigh = b[i - 1].h;
      const atPoi = !isNaN(htfLow[i]) && b[i].l <= htfLow[i] + 0.25 * a[i];
      if (atPoi && Math.min(ll, lh) >= need && trigger(b, i, lastDownHigh)) {
        const stop = b[i].l - 0.1 * a[i]; s.le[i] = true; s.stop[i] = stop; s.target[i] = b[i].c + rr * (b[i].c - stop); ll = lh = 0;
      }
    }
    trailExits(b, s, o.exit ?? 'target');
    return s;
  };
}

/** Higher-timeframe point of interest: the last confirmed swing low of bars `mult` times larger (a demand area). */
function poiLows(b: Bar[], mult: number) {
  const step = b.length > 1 ? b[1].t - b[0].t : 864e5, r = resample(b, step * mult), R = r.bars, pl: number[] = Array(R.length).fill(N);
  let last = N;
  for (let k = 0; k < R.length; k++) { const j = k - 2; if (j >= 2 && R[j].l < R[j - 1].l && R[j].l < R[j - 2].l && R[j].l <= R[j + 1].l && R[j].l <= R[j + 2].l) last = R[j].l; pl[k] = last; }
  return b.map((_, i) => (r.idx[i] >= 1 ? pl[r.idx[i] - 1] : N));
}

// ---------------- 2. previous-range pullback ----------------
export function prevRangeCore(o: DaveOpts = {}) {
  const depth = o.depth ?? 0.5;
  return (b: Bar[]): Sig => {
    const s = empty(b.length), a = atr(b, 14);
    const m = o.macdImpulse ? macd(b.map(x => x.c), 3, 10, 16).macd : null, mHi = m ? rollMax(m, 20) : null;
    let ph = N, pl = N, rangeLo = N, rangeHi = N, armed = false, lastDownHigh = N, pbLo = N;
    for (let i = 4; i < b.length; i++) {
      const k = i - 2;
      if (b[k].h > b[k - 1].h && b[k].h > b[k - 2].h && b[k].h >= b[k + 1].h && b[k].h >= b[k + 2].h) ph = b[k].h;
      if (b[k].l < b[k - 1].l && b[k].l < b[k - 2].l && b[k].l <= b[k + 1].l && b[k].l <= b[k + 2].l) pl = b[k].l;
      if (b[i - 1].c < b[i - 1].o) lastDownHigh = b[i - 1].h;
      const broke = b[i].c > ph + (o.closeBreak ? 0.25 * a[i] : 0) && (!m || m[i] >= mHi![i]);
      if (!isNaN(ph) && !isNaN(pl) && pl < ph && broke && !armed) { armed = true; rangeLo = pl; rangeHi = b[i].h; pbLo = N; ph = N; continue; }  // break of structure
      if (!armed) continue;
      if (b[i].h > rangeHi) { rangeHi = b[i].h; pbLo = N; }
      pbLo = isNaN(pbLo) ? b[i].l : Math.min(pbLo, b[i].l);                                                // lowest low since the range high
      if (b[i].c < rangeLo) { armed = false; continue; }                                                  // the range failed
      const deep = (rangeHi - (o.closeBreak ? Math.min(b[i].o, b[i].c) : b[i].l)) / (rangeHi - rangeLo);
      if (deep >= depth && trigger(b, i, lastDownHigh) && b[i].c < rangeHi - 0.5 * a[i]) {
        const stop = (o.weakStop ? b[i].l : Math.min(b[i].l, rangeLo)) - 0.1 * a[i];
        s.le[i] = true; s.stop[i] = stop; s.target[i] = o.measuredMove ? Math.max(rangeHi, pbLo + (rangeHi - rangeLo)) : rangeHi; armed = false;
      }
    }
    trailExits(b, s, o.exit ?? 'target');
    return s;
  };
}

/** Wraps a core with the two filters, applied to entries only. */
export function dave(core: (b: Bar[]) => Sig, o: DaveOpts = {}) {
  return (b: Bar[]): Sig => {
    const s = twoSided(core)(b);
    const t4 = o.align ? htfTrend(b, 4) : null, t16 = o.align ? htfTrend(b, 16) : null;
    for (let i = 0; i < b.length; i++) {
      const block = (o.skipNyOpen && i + 1 < b.length && inNyOpen(b[i + 1].t));
      if (s.le[i] && (block || (t4 && !(t4[i] === 1 && t16![i] === 1)))) s.le[i] = false;
      if (s.se[i] && (block || (t4 && !(t4[i] === -1 && t16![i] === -1)))) s.se[i] = false;
    }
    return s;
  };
}

export const swingCount = (o: DaveOpts = {}) => dave(swingCountCore(o), o);
export const prevRange = (o: DaveOpts = {}) => dave(prevRangeCore(o), o);
