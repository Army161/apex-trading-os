// Trend tools: the EMA 50 regime (archive/chat/52) and Wilder's Parabolic SAR (chat/53). Our own code from the rules described.
import { Bar, Sig, ema, sma, atr, adx, stdev } from './core';

const empty = (n: number): Sig => ({ le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(NaN), target: Array(n).fill(NaN) });

// ---------------- Parabolic SAR ----------------
/** Wilder's Parabolic SAR. AF starts at `start`, +`inc` at each new extreme point, capped at `max`. dir 1 = dots below price. */
export function psar(b: Bar[], start = 0.02, inc = 0.02, max = 0.2) {
  const n = b.length, sar = Array(n).fill(NaN), dir = Array(n).fill(0);
  if (n < 2) return { sar, dir };
  let up = b[1].c >= b[0].c, af = start, ep = up ? Math.max(b[0].h, b[1].h) : Math.min(b[0].l, b[1].l), s = up ? Math.min(b[0].l, b[1].l) : Math.max(b[0].h, b[1].h);
  sar[1] = s; dir[1] = up ? 1 : -1;
  for (let i = 2; i < n; i++) {
    s = s + af * (ep - s);
    if (up) { s = Math.min(s, b[i - 1].l, b[i - 2].l); if (b[i].l < s) { up = false; s = ep; ep = b[i].l; af = start; } else if (b[i].h > ep) { ep = b[i].h; af = Math.min(max, af + inc); } }
    else { s = Math.max(s, b[i - 1].h, b[i - 2].h); if (b[i].h > s) { up = true; s = ep; ep = b[i].h; af = start; } else if (b[i].l < ep) { ep = b[i].l; af = Math.min(max, af + inc); } }
    sar[i] = s; dir[i] = up ? 1 : -1;
  }
  return { sar, dir };
}

/** SAR stop-and-reverse: long on a flip to dots-below, short on a flip to dots-above; the SAR is the stop. */
export const sarReverse = (start = 0.02, inc = 0.02, max = 0.2) => (b: Bar[]): Sig => {
  const s = empty(b.length), p = psar(b, start, inc, max);
  for (let i = 2; i < b.length; i++) {
    if (p.dir[i] === 1 && p.dir[i - 1] === -1) { s.le[i] = true; s.stop[i] = p.sar[i]; }
    if (p.dir[i] === -1 && p.dir[i - 1] === 1) { s.se[i] = true; s.stop[i] = p.sar[i]; }
    s.lx[i] = p.dir[i] === -1; s.sx[i] = p.dir[i] === 1;
  }
  return s;
};

/** SAR as a trailing stop for any strategy: also exit a long when the dots flip above price (and the mirror). */
export const withSarTrail = (build: (b: Bar[]) => Sig) => (b: Bar[]): Sig => {
  const s = build(b), p = psar(b);
  return { ...s, lx: s.lx.map((v, i) => v || p.dir[i] === -1 && p.dir[i - 1] === 1), sx: s.sx.map((v, i) => v || p.dir[i] === 1 && p.dir[i - 1] === -1) };
};

/** Moving-average cross, stop and reverse (fast over slow = long, under = short). Stop 2 ATR for sizing only; exit is the opposite cross. */
export const maCross = (fast = 10, slow = 20, longOnly = false) => (b: Bar[]): Sig => {
  const s = empty(b.length), c = b.map(x => x.c), f = sma(c, fast), sl = sma(c, slow), a = atr(b);
  for (let i = 1; i < b.length; i++) {
    const up = f[i] > sl[i] && f[i - 1] <= sl[i - 1], dn = f[i] < sl[i] && f[i - 1] >= sl[i - 1];
    if (up) { s.le[i] = true; s.stop[i] = b[i].c - 4 * a[i]; } else if (dn && !longOnly) { s.se[i] = true; s.stop[i] = b[i].c + 4 * a[i]; }
    s.lx[i] = dn; s.sx[i] = up;
  }
  return s;
};

// ---------------- EMA 50 regime ----------------
export type Regime = { bias: 1 | -1 | 0; slope: 1 | -1 | 0; regime: 1 | -1 | 0; touched: boolean; chop: boolean; e: number };

/** Per-bar EMA 50 regime on one timeframe.
 *  bias = close above/below the EMA. slope = EMA change over 10 bars vs 0.25 ATR (flat inside that).
 *  regime changes only after a body close through the EMA (open and close both beyond it) and a retest that holds
 *  (a later bar touches the EMA and closes on the new side) within `retest` bars.
 *  touched = price has come back to the EMA since the regime began (then don't trade against the regime).
 *  chop = flat slope and at least 3 crosses in the last 20 bars. */
export function emaRegime(b: Bar[], n = 50, retest = 12): Regime[] {
  const c = b.map(x => x.c), e = ema(c, n), a = atr(b);
  let regime: 1 | -1 | 0 = 0, pend: { side: 1 | -1; i: number } | null = null, touched = false;
  const out: Regime[] = [];
  for (let i = 0; i < b.length; i++) {
    const x = b[i], ei = e[i];
    if (isNaN(ei)) { out.push({ bias: 0, slope: 0, regime: 0, touched: false, chop: false, e: ei }); continue; }
    const bias = x.c > ei ? 1 : x.c < ei ? -1 : 0, d = i >= 10 && !isNaN(e[i - 10]) ? e[i] - e[i - 10] : 0;
    const slope = Math.abs(d) < 0.25 * (a[i] || 0) ? 0 : d > 0 ? 1 : -1;
    let crosses = 0; for (let j = Math.max(1, i - 19); j <= i; j++) if (!isNaN(e[j - 1]) && Math.sign(c[j] - e[j]) !== Math.sign(c[j - 1] - e[j - 1])) crosses++;
    const chop = slope === 0 && crosses >= 3;
    const bodyUp = Math.min(x.o, x.c) > ei, bodyDn = Math.max(x.o, x.c) < ei;
    if (pend && i - pend.i > retest) pend = null;
    if (pend && i > pend.i && (pend.side === 1 ? x.l <= ei && x.c > ei : x.h >= ei && x.c < ei)) { regime = pend.side; touched = false; pend = null; }
    else if (bodyUp && regime !== 1 && (!pend || pend.side !== 1)) pend = { side: 1, i };
    else if (bodyDn && regime !== -1 && (!pend || pend.side !== -1)) pend = { side: -1, i };
    else if (regime !== 0 && (regime === 1 ? x.l <= ei : x.h >= ei)) touched = true;
    out.push({ bias, slope, regime, touched, chop, e: ei });
  }
  return out;
}

/** Group bars into higher-timeframe bars of `ms` milliseconds (UTC buckets; weekly buckets start Monday). */
export function resample(b: Bar[], ms: number): { bars: Bar[]; idx: number[] } {
  const bars: Bar[] = [], idx: number[] = [], off = ms >= 7 * 864e5 ? 4 * 864e5 : 0;   // 1970-01-01 was a Thursday
  for (let i = 0; i < b.length; i++) {
    const k = Math.floor((b[i].t - off) / ms) * ms + off, last = bars[bars.length - 1];
    if (!last || last.t !== k) bars.push({ t: k, o: b[i].o, h: b[i].h, l: b[i].l, c: b[i].c, v: b[i].v });
    else { last.h = Math.max(last.h, b[i].h); last.l = Math.min(last.l, b[i].l); last.c = b[i].c; last.v += b[i].v; }
    idx.push(bars.length - 1);
  }
  return { bars, idx };
}

export const TFS: [string, number][] = [['1h', 3600e3], ['4h', 4 * 3600e3], ['1d', 864e5], ['1w', 7 * 864e5]];

/** Multi-timeframe EMA 50 bias at each base bar, using only higher-timeframe bars that have already closed (no lookahead).
 *  agree = +n when n timeframes are bullish and none bearish (mirror for bearish); 0 with a mix = decision zone. */
export function mtfBias(b: Bar[]) {
  const spacing = b.length > 1 ? (b[b.length - 1].t - b[0].t) / (b.length - 1) : 864e5;
  const used = TFS.filter(([, ms]) => ms >= spacing * 0.99);
  const per = used.map(([name, ms]) => {
    const r = resample(b, ms), e = ema(r.bars.map(x => x.c), 50);
    return { name, at: (i: number) => { const k = r.idx[i] - (ms > spacing * 1.01 ? 1 : 0); if (k < 0 || isNaN(e[k])) return 0; const ref = r.bars[k]; return ref.c > e[k] ? 1 : ref.c < e[k] ? -1 : 0; } };
  });
  return b.map((_, i) => {
    const v = per.map(p => ({ tf: p.name, bias: p.at(i) }));
    const up = v.filter(x => x.bias === 1).length, dn = v.filter(x => x.bias === -1).length;
    return { tfs: v, up, dn, agree: dn === 0 ? up : up === 0 ? -dn : 0, decisionZone: up > 0 && dn > 0 };
  });
}

/** EMA 50 filter for any strategy (ICT, liquidity, AI): no trades in chop or in a multi-timeframe decision zone;
 *  with-regime trades allowed; counter-regime trades only while the EMA is still untouched, and never against the next timeframe up. */
export const withEmaRegime = (build: (b: Bar[]) => Sig) => (b: Bar[]): Sig => {
  const s = build(b), r = emaRegime(b), m = mtfBias(b);
  const ok = (i: number, side: 1 | -1) => {
    if (r[i].chop || m[i].decisionZone) return false;
    const up = m[i].tfs[1]?.bias ?? 0; if (up === -side) return false;   // the EMA one timeframe up
    return r[i].regime === side || (r[i].regime === -side && !r[i].touched) || r[i].regime === 0 && r[i].bias === side;
  };
  return { ...s, le: s.le.map((v, i) => v && ok(i, 1)), se: s.se.map((v, i) => v && ok(i, -1)) };
};

/** ADX chop filter: block entries when ADX(14) is under `min` (sideways market). */
export const withAdx = (build: (b: Bar[]) => Sig, min = 20) => (b: Bar[]): Sig => {
  const s = build(b), x = adx(b);
  return { ...s, le: s.le.map((v, i) => v && x[i] >= min), se: s.se.map((v, i) => v && x[i] >= min) };
};

/** Entry-timeframe confirmation (15/5/3/1m bars): last close on the trade side of the EMA 50, or a body close through it. */
export function ltfConfirm(ltf: Bar[], side: 1 | -1, n = 50) {
  if (ltf.length < n) return { ok: false, why: 'not enough lower-timeframe bars' };
  const e = ema(ltf.map(x => x.c), n), i = ltf.length - 1, x = ltf[i], ei = e[i];
  const aligned = side === 1 ? x.c > ei : x.c < ei, body = side === 1 ? x.o < ei && x.c > ei : x.o > ei && x.c < ei;
  return { ok: aligned || body, why: body ? 'body closed through the EMA' : aligned ? 'price on the trade side of the EMA' : 'price on the wrong side of the entry-timeframe EMA' };
}

/** 50-period mean with 2 standard deviation bands. */
export function bands50(b: Bar[], n = 50, k = 2) {
  const c = b.map(x => x.c), m = sma(c, n), sd = stdev(c, n);
  return { mid: m, up: m.map((v, i) => v + k * sd[i]), lo: m.map((v, i) => v - k * sd[i]) };
}

/** Band mean reversion (swing): long when price closes back inside after closing below the lower band, target the mean;
 *  short mirror. Stop 1.5 ATR beyond the extreme. Long only while the 50 mean is above the 200 (buy cheap in an uptrend). */
export const bandRevert = (n = 50, k = 2) => (b: Bar[]): Sig => {
  const s = empty(b.length), bd = bands50(b, n, k), a = atr(b), m200 = sma(b.map(x => x.c), 200);
  for (let i = 1; i < b.length; i++) {
    const x = b[i], p = b[i - 1];
    if (p.c < bd.lo[i - 1] && x.c > bd.lo[i] && bd.mid[i] > m200[i]) { s.le[i] = true; s.stop[i] = Math.min(x.l, p.l) - 1.5 * a[i]; s.target[i] = bd.mid[i]; }
    else if (p.c > bd.up[i - 1] && x.c < bd.up[i] && bd.mid[i] < m200[i]) { s.se[i] = true; s.stop[i] = Math.max(x.h, p.h) + 1.5 * a[i]; s.target[i] = bd.mid[i]; }
  }
  return s;
};

/** EMA regime points for the confluence score: [long, short], 0 to 10. */
export function regimePoints(b: Bar[]) {
  const r = emaRegime(b), m = mtfBias(b);
  return b.map((_, i) => [r[i].chop ? 0 : (r[i].regime === 1 ? 5 : 0) + (m[i].agree > 0 ? Math.min(5, 2 * m[i].agree) : 0), r[i].chop ? 0 : (r[i].regime === -1 ? 5 : 0) + (m[i].agree < 0 ? Math.min(5, -2 * m[i].agree) : 0)] as [number, number]);
}
