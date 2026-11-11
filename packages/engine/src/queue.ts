// Research-queue tests 2 to 5 (docs/study-and-plan.md, Phase 3; docs/design/14 P3.2). Test 1, the dave_prev_range variants, lives
// in dave.ts. Our own code written from the rules in Jeremy's notes, paper only. Every rule here is UNPROVEN: each one is
// pre-registered and judged by the same gate as everything else, and each counts as a try.
//
// No look-ahead, by construction and by test (packages/engine/test/lookahead.test.ts): the signal on bar i uses bars 0..i only.
// A pivot is used only after the bars that confirm it have closed. Session rules key off the bar's own New York time, never
// the next bar's. Intraday rules trade the regular session (09:30 to 16:00 New York) and are flat before the close. The session
// is clock time only: on an exchange half day the exit fills on the next bar the data has.
import { Bar, Sig, atr, candles, macd, rollMax, rollMin, rsi, shift } from './core';
import { nyHM } from './ict';

const N = NaN;
const empty = (n: number): Sig => ({ le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(N), target: Array(n).fill(N) });
const flip = (b: Bar[]): Bar[] => b.map(x => ({ t: x.t, o: -x.o, h: -x.l, l: -x.h, c: -x.c, v: x.v }));
/** Runs a long-only rule on the bars and on their mirror image, so the short side is the same rule upside down. */
const mirror = (core: (b: Bar[]) => Sig) => (b: Bar[]): Sig => {
  const s = empty(b.length), L = core(b), S = core(flip(b));
  for (let i = 0; i < b.length; i++) {
    if (L.le[i]) { s.le[i] = true; s.stop[i] = L.stop[i]; s.target[i] = L.target[i]; }
    else if (S.le[i]) { s.se[i] = true; s.stop[i] = -S.stop[i]; s.target[i] = -S.target[i]; }
    s.lx[i] = L.lx[i]; s.sx[i] = S.lx[i];
  }
  return s;
};

const OPEN = 570, CLOSE = 960;   // 09:30 and 16:00 New York, in minutes
export type SessionBar = { rth: boolean; first: boolean; n: number; min: number; canEnter: boolean; flat: boolean };
/** Where each bar sits in the regular session. `n` counts regular-session bars so far today (1 = the opening bar).
 *  canEnter: the bar closes at least one bar before the last one, so an entry fills at a regular-session open.
 *  flat: decide to be out on this bar's close. True from the second-to-last bar of the session until the next open. */
export function sessionBars(b: Bar[]): SessionBar[] {
  const step = b.length > 1 ? Math.min(...b.slice(1, 50).map((x, i) => x.t - b[i].t)) / 6e4 : 30;
  let n = 0;
  return b.map((x, i) => {
    const min = nyHM(x.t), rth = min >= OPEN && min < CLOSE, newDay = i === 0 || min < nyHM(b[i - 1].t) || x.t - b[i - 1].t > 12 * 3600e3;
    if (newDay) n = 0; if (rth) n++;
    return { rth, first: rth && n === 1, n: rth ? n : 0, min, canEnter: rth && min + 2 * step < CLOSE, flat: !rth || min + 2 * step >= CLOSE };
  });
}
const flatAtClose = (s: Sig, ses: SessionBar[]) => { for (let i = 0; i < ses.length; i++) if (ses[i].flat) { s.lx[i] = true; s.sx[i] = true; } return s; };

// ---------------- 2. opening-range breakout ----------------
/** The first `minutes` of the regular session set the range. The first later bar that closes beyond it enters in that direction.
 *  Stop at the other side of the range, target `rr` R, one trade a day, flat before the close. */
export const openingRange = (rr = 2, minutes = 30) => (b: Bar[]): Sig => {
  const s = empty(b.length), ses = sessionBars(b);
  let hi = N, lo = N, done = true;
  for (let i = 0; i < b.length; i++) {
    if (!ses[i].rth) { done = true; continue; }
    if (ses[i].first) { hi = b[i].h; lo = b[i].l; done = false; continue; }
    if (done) continue;
    if (ses[i].min < OPEN + minutes) { hi = Math.max(hi, b[i].h); lo = Math.min(lo, b[i].l); continue; }
    if (!ses[i].canEnter || !(hi > lo)) continue;
    const c = b[i].c;
    if (c > hi) { s.le[i] = true; s.stop[i] = lo; s.target[i] = c + rr * (c - lo); done = true; }
    else if (c < lo) { s.se[i] = true; s.stop[i] = hi; s.target[i] = c - rr * (hi - c); done = true; }
  }
  return flatAtClose(s, ses);
};

// ---------------- 3. session VWAP with bands ----------------
/** Volume-weighted average price since the regular-session open, and the volume-weighted standard deviation around it. */
export function sessionVwap(b: Bar[], ses = sessionBars(b)) {
  const vwap: number[] = Array(b.length).fill(N), sd: number[] = Array(b.length).fill(N);
  let pv = 0, pv2 = 0, v = 0;
  for (let i = 0; i < b.length; i++) {
    if (ses[i].first) pv = pv2 = v = 0;
    if (!ses[i].rth) continue;
    const tp = (b[i].h + b[i].l + b[i].c) / 3; pv += tp * b[i].v; pv2 += tp * tp * b[i].v; v += b[i].v;
    if (v > 0) { vwap[i] = pv / v; sd[i] = Math.sqrt(Math.max(0, pv2 / v - vwap[i] ** 2)); }
  }
  return { vwap, sd };
}
/** Trend pullback: VWAP rising and the last two closes above it; a bar dips to within `band` (half a band by default) of VWAP and closes up, above it.
 *  Stop one band below VWAP (or the bar's low if lower), target 2R, one trade a day, flat before the close. */
export const vwapPullback = (rr = 2, band = 0.5) => mirror((b: Bar[]): Sig => {
  const s = empty(b.length), ses = sessionBars(b), { vwap, sd } = sessionVwap(b, ses);
  let day = -1, traded = -1;
  for (let i = 0; i < b.length; i++) {
    if (ses[i].first) day = i;
    if (i < 2 || !ses[i].canEnter || ses[i].n < 4 || traded === day || !(sd[i] > 0)) continue;
    const rising = vwap[i] > vwap[i - 1] && vwap[i - 1] > vwap[i - 2], above = b[i - 1].c > vwap[i - 1] && b[i - 2].c > vwap[i - 2];
    if (rising && above && b[i].l <= vwap[i] + band * sd[i] && b[i].c > vwap[i] && b[i].c > b[i].o) {
      const stop = Math.min(b[i].l, vwap[i] - sd[i]);
      if (stop < b[i].c) { s.le[i] = true; s.stop[i] = stop; s.target[i] = b[i].c + rr * (b[i].c - stop); traded = day; }
    }
  }
  return flatAtClose(s, ses);
});
/** Flat-VWAP fade: VWAP has moved less than a quarter band in four bars; a bar trades through band `band` (the second by default) and closes back
 *  inside it. Stop beyond the bar's extreme, target VWAP, one trade a day, flat before the close. */
export const vwapFade = (band = 2) => mirror((b: Bar[]): Sig => {
  const s = empty(b.length), ses = sessionBars(b), { vwap, sd } = sessionVwap(b, ses);
  let day = -1, traded = -1;
  for (let i = 0; i < b.length; i++) {
    if (ses[i].first) day = i;
    if (i < 4 || !ses[i].canEnter || ses[i].n < 5 || traded === day || !(sd[i] > 0)) continue;
    const edge = vwap[i] - band * sd[i];
    if (Math.abs(vwap[i] - vwap[i - 4]) <= 0.25 * sd[i] && b[i].l < edge && b[i].c > edge && b[i].c > b[i].o && b[i].c < vwap[i]) {
      s.le[i] = true; s.stop[i] = b[i].l - 0.1 * sd[i]; s.target[i] = vwap[i]; traded = day;
    }
  }
  return flatAtClose(s, ses);
});

// ---------------- 4. momentum-candle breakout ----------------
/** A candle whose body is at least `mult` times (twice by default) the average of the prior three, closing beyond the prior 20-bar high and in the top
 *  quarter of its own range. Stop under the candle, target 2R, regular session only, flat before the close. */
export const momentumBreakout = (lookback = 20, rr = 2, mult = 2) => mirror((b: Bar[]): Sig => {
  const s = empty(b.length), ses = sessionBars(b), body = b.map(x => Math.abs(x.c - x.o)), top = shift(rollMax(b.map(x => x.h), lookback));
  for (let i = lookback; i < b.length; i++) {
    const rng = b[i].h - b[i].l;
    const mom = i >= 3 && b[i].c > b[i].o && body[i] >= mult * ((body[i - 1] + body[i - 2] + body[i - 3]) / 3);
    if (!ses[i].canEnter || !mom || !(b[i].c > top[i]) || !(rng > 0) || b[i].h - b[i].c > 0.25 * rng) continue;
    s.le[i] = true; s.stop[i] = b[i].l; s.target[i] = b[i].c + rr * (b[i].c - b[i].l);
  }
  return flatAtClose(s, ses);
});

// ---------------- 5. divergence with a confirmed pivot ----------------
/** Bullish divergence on the MACD 3-10 line (or RSI 14 with `indicator` 'rsi'): a pivot low (3 bars each side, so known 3 bars late) below the previous pivot low
 *  while the line is higher than it was there. Then, within `wait` bars and with the pivot low still intact, a hammer or bullish
 *  engulfing candle enters. Stop under the pivot low, target 2R. Plain crossovers are not used (they lose, chat/16). */
export const divergencePivot = (side = 3, wait = 6, rr = 2, indicator: 'macd' | 'rsi' = 'macd') => mirror((b: Bar[]): Sig => {
  const s = empty(b.length), a = atr(b, 14), cl = b.map(x => x.c), m = indicator === 'rsi' ? rsi(cl, 14).map(x => x - 50) : macd(cl, 3, 10, 16).macd, cd = candles(b), lows = b.map(x => x.l), winLo = rollMin(lows, 2 * side + 1);
  let prev = -1, last = -1, armedUntil = -1, floor = N;
  for (let i = 2 * side; i < b.length; i++) {
    const k = i - side;
    if (b[k].l === winLo[i] && !isNaN(m[k])) {                                  // pivot low at k, confirmed on bar i
      prev = last; last = k;
      const div = prev >= 0 && k - prev >= 5 && k - prev <= 60 && b[k].l < b[prev].l && m[k] > m[prev] && m[prev] < 0;
      armedUntil = div ? i + wait : -1; floor = b[k].l;
    }
    if (i > armedUntil) continue;
    if (b[i].l < floor) { armedUntil = -1; continue; }                          // the pivot failed
    if (cd[i].bullRev && !isNaN(a[i])) {
      const stop = floor - 0.1 * a[i];
      s.le[i] = true; s.stop[i] = stop; s.target[i] = b[i].c + rr * (b[i].c - stop); armedUntil = -1;
    }
  }
  return s;
});
