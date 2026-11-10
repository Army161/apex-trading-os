// Our own rule versions of three ICT setups (archive/chat/50) and the golden cross (chat/48), plus two wrappers:
// a golden-cross trend filter ("simple idea first, AI second") and an adaptive bias flip. Written from the rules
// described in the videos; no third-party indicator code. The videos' win rates came from 8 to 62 trades: unproven.
import { Bar, Sig, sma, swings, shift, rollMax, rollMin } from './core';

const empty = (n: number): Sig => ({ le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(NaN), target: Array(n).fill(NaN) });
const tgt = (entry: number, stop: number, r = 2) => entry + r * (entry - stop);

/** Golden cross: long when SMA(fast) crosses above SMA(slow), flat when it crosses back below. No stop, no target, full size. */
export const goldenCross = (fast = 50, slow = 200) => (b: Bar[]): Sig => {
  const s = empty(b.length), c = b.map(x => x.c), f = sma(c, fast), sl = sma(c, slow);
  for (let i = 1; i < b.length; i++) {
    s.le[i] = f[i] > sl[i] && f[i - 1] <= sl[i - 1];
    s.lx[i] = f[i] < sl[i] && f[i - 1] >= sl[i - 1];
    s.stop[i] = b[i].c * 1e-4; // effectively no stop: the cross is the exit
  }
  s.fullSize = true; return s;
};

/** Trend filter: longs only while SMA50 > SMA200, shorts only while below. Wrap any strategy or AI signal with it. */
export const withTrend = (build: (b: Bar[]) => Sig, fast = 50, slow = 200) => (b: Bar[]): Sig => {
  const s = build(b), c = b.map(x => x.c), f = sma(c, fast), sl = sma(c, slow);
  return { ...s, le: s.le.map((v, i) => v && f[i] > sl[i]), se: s.se.map((v, i) => v && f[i] < sl[i]) };
};

/** Hour and minute in New York for a bar time (ms). */
const nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
export const nyHM = (t: number) => { const p = nyFmt.formatToParts(new Date(t)); const g = (k: string) => +(p.find(x => x.type === k)?.value ?? 0); return g('hour') * 60 + g('minute'); };

/** Turtle soup: a higher-timeframe high/low (`htf` bars back, default 40) is swept and price closes back inside;
 *  within `wait` bars the entry timeframe shifts structure (close beyond the last confirmed swing). Stop beyond the sweep, 1:2. */
export const turtleSoup = (htf = 40, wait = 6, r = 2) => (b: Bar[]): Sig => {
  const s = empty(b.length), w = swings(b, 2, 2), lo = shift(rollMin(b.map(x => x.l), htf)), hi = shift(rollMax(b.map(x => x.h), htf));
  let bull: { i: number; ext: number } | null = null, bear: { i: number; ext: number } | null = null;
  for (let i = 1; i < b.length; i++) {
    const x = b[i];
    if (x.l < lo[i] && x.c > lo[i]) bull = { i, ext: x.l }; else if (bull && x.l < bull.ext) bull.ext = x.l;
    if (x.h > hi[i] && x.c < hi[i]) bear = { i, ext: x.h }; else if (bear && x.h > bear.ext) bear.ext = x.h;
    if (bull && i - bull.i > wait) bull = null;
    if (bear && i - bear.i > wait) bear = null;
    if (bull && i > bull.i && x.c > w.lastSH[i - 1] && b[i - 1].c <= w.lastSH[i - 1]) { s.le[i] = true; s.stop[i] = bull.ext * 0.999; s.target[i] = tgt(x.c, s.stop[i], r); bull = null; }
    else if (bear && i > bear.i && x.c < w.lastSL[i - 1] && b[i - 1].c >= w.lastSL[i - 1]) { s.se[i] = true; s.stop[i] = bear.ext * 1.001; s.target[i] = tgt(x.c, s.stop[i], r); bear = null; }
  }
  return s;
};

/** Silver bullet windows in New York minutes: 03:00-04:00, 10:00-11:00, 14:00-15:00. */
export const SB_WINDOWS: [number, number][] = [[180, 240], [600, 660], [840, 900]];
const inWin = (m: number) => SB_WINDOWS.findIndex(([a, z]) => m >= a && m < z);

/** Silver bullet (5-minute or lower): inside a window, price sweeps the pre-window high/low (last `look` bars before it),
 *  structure shifts, then a fair value gap forms in the new direction: enter at the gap, stop beyond the sweep, 1:2.
 *  Any open trade is closed when the window ends. Fills are at the next bar's open (the engine has no limit orders). */
export const silverBullet = (look = 24, r = 2) => (b: Bar[]): Sig => {
  const s = empty(b.length), w = swings(b, 2, 2);
  let win = -1, refH = NaN, refL = NaN, swept: 1 | -1 | 0 = 0, ext = NaN, mss = false;
  for (let i = 2; i < b.length; i++) {
    const m = nyHM(b[i].t), k = inWin(m), x = b[i];
    if (k !== win) { win = k; swept = 0; mss = false; if (k >= 0) { const pre = b.slice(Math.max(0, i - look), i); refH = Math.max(...pre.map(p => p.h)); refL = Math.min(...pre.map(p => p.l)); } }
    if (k < 0) { s.lx[i] = s.sx[i] = true; continue; }
    const last = m + 5 >= SB_WINDOWS[k][1]; // last bar of the window: close, don't open
    if (last) { s.lx[i] = s.sx[i] = true; continue; }
    if (!swept) { if (x.l < refL) { swept = 1; ext = x.l; } else if (x.h > refH) { swept = -1; ext = x.h; } continue; }
    if (swept === 1) ext = Math.min(ext, x.l); else ext = Math.max(ext, x.h);
    if (!mss) mss = swept === 1 ? x.c > w.lastSH[i - 1] : x.c < w.lastSL[i - 1];
    if (!mss) continue;
    const bullGap = x.l > b[i - 2].h && b[i - 1].c > b[i - 1].o, bearGap = x.h < b[i - 2].l && b[i - 1].c < b[i - 1].o;
    if (swept === 1 && bullGap) { s.le[i] = true; s.stop[i] = ext * 0.9995; s.target[i] = tgt(x.c, s.stop[i], r); swept = 0; refL = -Infinity; refH = Infinity; }
    else if (swept === -1 && bearGap) { s.se[i] = true; s.stop[i] = ext * 1.0005; s.target[i] = tgt(x.c, s.stop[i], r); swept = 0; refL = -Infinity; refH = Infinity; }
  }
  return s;
};

/** Unicorn: a fair value gap that overlaps a breaker block of the same direction.
 *  Our breaker rule: the last up candle before a confirmed swing high is a supply zone; a close above that zone flips it
 *  into a bullish breaker (mirror for bearish). A bullish gap whose range overlaps a live bullish breaker = long. Stop beyond the zone, 1:2. */
export const unicorn = (left = 3, right = 3, maxAge = 60, r = 2) => (b: Bar[]): Sig => {
  const s = empty(b.length);
  type Z = { lo: number; hi: number; at: number; dir: 1 | -1; live: boolean };
  const supply: Z[] = [], demand: Z[] = [], breakers: Z[] = [];
  for (let i = 2; i < b.length; i++) {
    const k = i - right;
    if (k - left >= 0) {
      const win = b.slice(k - left, k + right + 1);
      if (b[k].h === Math.max(...win.map(x => x.h))) { for (let j = k; j >= Math.max(0, k - 5); j--) if (b[j].c > b[j].o) { supply.push({ lo: b[j].l, hi: b[j].h, at: i, dir: -1, live: true }); break; } }
      if (b[k].l === Math.min(...win.map(x => x.l))) { for (let j = k; j >= Math.max(0, k - 5); j--) if (b[j].c < b[j].o) { demand.push({ lo: b[j].l, hi: b[j].h, at: i, dir: 1, live: true }); break; } }
    }
    const x = b[i];
    for (const z of supply) if (z.live && x.c > z.hi) { z.live = false; breakers.push({ ...z, dir: 1, at: i, live: true }); }
    for (const z of demand) if (z.live && x.c < z.lo) { z.live = false; breakers.push({ ...z, dir: -1, at: i, live: true }); }
    for (const z of breakers) if (z.live && (i - z.at > maxAge || (z.dir === 1 && x.c < z.lo) || (z.dir === -1 && x.c > z.hi))) z.live = false;
    const bullGap = x.l > b[i - 2].h, bearGap = x.h < b[i - 2].l;
    if (bullGap) { const z = breakers.find(z => z.live && z.dir === 1 && b[i - 2].h <= z.hi && x.l >= z.lo); if (z) { s.le[i] = true; s.stop[i] = z.lo * 0.999; s.target[i] = tgt(x.c, s.stop[i], r); z.live = false; } }
    if (!s.le[i] && bearGap) { const z = breakers.find(z => z.live && z.dir === -1 && b[i - 2].l >= z.lo && x.h <= z.hi); if (z) { s.se[i] = true; s.stop[i] = z.hi * 1.001; s.target[i] = tgt(x.c, s.stop[i], r); z.live = false; } }
  }
  return s;
};

/** Adaptive bias: if the setup's last `n` resolved signals won less than `minWin` of the time, take the next signal the other way
 *  (stop and target mirrored around entry). Only outcomes already resolved before a signal's bar count: no lookahead. */
export const adaptive = (build: (b: Bar[]) => Sig, n = 6, minWin = 0.3) => (b: Bar[]): Sig => {
  const s = build(b), out = empty(b.length); out.maxBars = s.maxBars; out.fullSize = s.fullSize; out.lx = [...s.lx]; out.sx = [...s.sx];
  const done: { at: number; win: boolean }[] = [];
  const resolve = (i: number, side: 1 | -1, stop: number, target: number) => {
    for (let j = i + 1; j < b.length; j++) {
      if (side === 1 ? b[j].l <= stop : b[j].h >= stop) return { at: j, win: false };
      if (!isNaN(target) && (side === 1 ? b[j].h >= target : b[j].l <= target)) return { at: j, win: true };
    }
    return null;
  };
  for (let i = 0; i < b.length; i++) {
    const side: 0 | 1 | -1 = s.le[i] ? 1 : s.se[i] ? -1 : 0; if (!side) continue;
    const known = done.filter(d => d.at < i).slice(-n), flip = known.length >= n && known.filter(d => d.win).length / n < minWin;
    const st = s.stop[i], tg = s.target[i], e = b[i].c;
    const fside = (flip ? -side : side) as 1 | -1, fst = flip && !isNaN(tg) ? tg : flip ? 2 * e - st : st, ftg = flip ? 2 * e - st : tg;
    if (fside === 1) out.le[i] = true; else out.se[i] = true; out.stop[i] = fst; out.target[i] = flip ? ftg : tg;
    const r = resolve(i, side, st, tg); if (r) done.push(r);
  }
  return out;
};

/** ICT points for the confluence score: [long, short] per bar, 0 to 20. */
export function ictPoints(b: Bar[]) {
  const ts = turtleSoup()(b), un = unicorn()(b);
  return b.map((_, i) => [(ts.le[i] ? 10 : 0) + (un.le[i] ? 10 : 0), (ts.se[i] ? 10 : 0) + (un.se[i] ? 10 : 0)] as [number, number]);
}
