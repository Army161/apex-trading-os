// Liquidity engine (archive/chat/51): where stops pile up, and whether price swept them (wick through, close back) or broke
// them (close through). Our own rules from the video's description; no indicator code. All bar-close, no lookahead.
import { Bar, Sig, atr, sma, ema } from './core';
import { nyHM } from './ict';

export type Kind = 'swing' | 'eq' | 'asia' | 'london' | 'newyork' | 'pdh' | 'pdl' | 'pwh' | 'pwl';
export type Level = { px: number; side: 1 | -1; kind: Kind; key: boolean; born: number };   // side 1 = high (buy-side liquidity), -1 = low
export type Hit = { level: Level; what: 'sweep' | 'break'; wick: number };
export type LiqBar = {
  hits: Hit[]; trend: 1 | -1 | 0; bos: 0 | 1 | -1; choch: 0 | 1 | -1; ichoch: 0 | 1 | -1;
  idm: number; idmTaken: boolean; pd: number; dailyTrend: 1 | -1 | 0; sh: number; sl: number;
};

const pivots = (b: Bar[], n: number) => {
  const hi: (number | null)[] = Array(b.length).fill(null), lo: (number | null)[] = Array(b.length).fill(null);
  for (let i = 2 * n; i < b.length; i++) {
    const k = i - n; let H = true, L = true;
    for (let j = k - n; j <= k + n; j++) { if (j === k) continue; if (b[j].h >= b[k].h) H = false; if (b[j].l <= b[k].l) L = false; }
    if (H) hi[i] = b[k].h; if (L) lo[i] = b[k].l;   // known only at bar i (confirmation), never earlier
  }
  return { hi, lo };
};
// Kill zones in New York minutes. Asia 20:00-00:00, London 02:00-05:00, New York 07:00-10:00.
const SESSIONS: [Kind, number, number][] = [['asia', 1200, 1440], ['london', 120, 300], ['newyork', 420, 600]];

export function liquidity(b: Bar[], o: { swing?: number; structure?: number; internal?: number; eqAtr?: number; maxAge?: number } = {}): LiqBar[] {
  const sw = o.swing ?? 5, st = o.structure ?? 10, inn = o.internal ?? 3, eqA = o.eqAtr ?? 0.1, maxAge = o.maxAge ?? 500;
  const a = atr(b, 14), P = pivots(b, sw), S = pivots(b, st), I = pivots(b, inn);
  const spacing = b.length > 1 ? (b[b.length - 1].t - b[0].t) / (b.length - 1) : 864e5, intraday = spacing <= 3600e3 + 1;
  const perDay = Math.max(1, Math.round(864e5 / spacing)), dma = ema(b.map(x => x.c), 20 * perDay);
  let levels: Level[] = [], trend: 1 | -1 | 0 = 0, sh = NaN, sl = NaN, ish = NaN, isl = NaN, idm = NaN, idmTaken = false, sinceBos = -1;
  let day = -1, dH = -Infinity, dL = Infinity, wk = -1, wH = -Infinity, wL = Infinity, sess: { k: Kind; h: number; l: number } | null = null;
  const out: LiqBar[] = [];
  const add = (l: Level) => {
    if (l.kind === 'swing') { const m = levels.find(x => x.side === l.side && (x.kind === 'swing' || x.kind === 'eq') && Math.abs(x.px - l.px) <= eqA * (a[l.born] || 0)); if (m) { m.kind = 'eq'; m.key = true; m.px = l.side === 1 ? Math.max(m.px, l.px) : Math.min(m.px, l.px); return; } }
    levels.push(l);
  };
  for (let i = 0; i < b.length; i++) {
    const x = b[i], d = Math.floor(x.t / 864e5), w = Math.floor((d + 3) / 7);   // UTC days; weeks start Monday
    if (d !== day) { if (day >= 0 && isFinite(dH)) { add({ px: dH, side: 1, kind: 'pdh', key: true, born: i }); add({ px: dL, side: -1, kind: 'pdl', key: true, born: i }); } day = d; dH = -Infinity; dL = Infinity; }
    if (w !== wk) { if (wk >= 0 && isFinite(wH)) { add({ px: wH, side: 1, kind: 'pwh', key: true, born: i }); add({ px: wL, side: -1, kind: 'pwl', key: true, born: i }); } wk = w; wH = -Infinity; wL = Infinity; }
    if (intraday) {
      const m = nyHM(x.t), cur = SESSIONS.find(([, s0, s1]) => m >= s0 && m < s1)?.[0] ?? null;
      if (sess && sess.k !== cur) { add({ px: sess.h, side: 1, kind: sess.k, key: true, born: i }); add({ px: sess.l, side: -1, kind: sess.k, key: true, born: i }); sess = null; }
      if (cur) { if (!sess) sess = { k: cur, h: x.h, l: x.l }; else { sess.h = Math.max(sess.h, x.h); sess.l = Math.min(sess.l, x.l); } }
    }
    // 1. sweeps and breaks of levels that existed before this bar
    const hits: Hit[] = [];
    levels = levels.filter(l => {
      if (i - l.born > maxAge) return false;
      if (l.side === 1 && x.h > l.px) { hits.push({ level: l, what: x.c > l.px ? 'break' : 'sweep', wick: x.h }); return false; }
      if (l.side === -1 && x.l < l.px) { hits.push({ level: l, what: x.c < l.px ? 'break' : 'sweep', wick: x.l }); return false; }
      return true;
    });
    // 2. structure (major swings) and internal structure
    let bos: 0 | 1 | -1 = 0, choch: 0 | 1 | -1 = 0, ichoch: 0 | 1 | -1 = 0;
    if (!isNaN(sh) && x.c > sh) { if (trend === 1) bos = 1; else choch = 1; trend = 1; sh = NaN; idm = NaN; idmTaken = false; sinceBos = i; }
    else if (!isNaN(sl) && x.c < sl) { if (trend === -1) bos = -1; else choch = -1; trend = -1; sl = NaN; idm = NaN; idmTaken = false; sinceBos = i; }
    if (!isNaN(ish) && x.c > ish) { ichoch = 1; ish = NaN; } else if (!isNaN(isl) && x.c < isl) { ichoch = -1; isl = NaN; }
    // 3. inducement: the first internal pullback swing after a break; taken when price trades through it
    if (!isNaN(idm) && !idmTaken && ((trend === 1 && x.l < idm) || (trend === -1 && x.h > idm))) idmTaken = true;
    // 4. new pivots become known at this bar (after the checks above, so a level can't be hit on the bar that confirms it)
    if (P.hi[i] !== null) add({ px: P.hi[i]!, side: 1, kind: 'swing', key: false, born: i });
    if (P.lo[i] !== null) add({ px: P.lo[i]!, side: -1, kind: 'swing', key: false, born: i });
    if (S.hi[i] !== null) sh = S.hi[i]!; if (S.lo[i] !== null) sl = S.lo[i]!;
    if (I.hi[i] !== null) { ish = I.hi[i]!; if (trend === -1 && sinceBos >= 0 && isNaN(idm)) idm = ish; }
    if (I.lo[i] !== null) { isl = I.lo[i]!; if (trend === 1 && sinceBos >= 0 && isNaN(idm)) idm = isl; }
    dH = Math.max(dH, x.h); dL = Math.min(dL, x.l); wH = Math.max(wH, x.h); wL = Math.min(wL, x.l);
    const hiR = isNaN(sh) ? Math.max(...b.slice(Math.max(0, i - 50), i + 1).map(y => y.h)) : sh, loR = isNaN(sl) ? Math.min(...b.slice(Math.max(0, i - 50), i + 1).map(y => y.l)) : sl;
    const pd = hiR > loR ? (x.c - loR) / (hiR - loR) : 0.5;
    out.push({ hits, trend, bos, choch, ichoch, idm, idmTaken, pd, dailyTrend: isNaN(dma[i]) ? 0 : x.c > dma[i] ? 1 : -1, sh, sl });
  }
  return out;
}

const empty = (n: number): Sig => ({ le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(NaN), target: Array(n).fill(NaN) });
const sweepOf = (L: LiqBar, side: 1 | -1, keyOnly: boolean, kinds?: Kind[]) =>
  L.hits.find(h => h.what === 'sweep' && h.level.side === side && (!keyOnly || h.level.key) && (!kinds || kinds.includes(h.level.kind)));

/** 1. Trend sweep ride (crypto 4h): strong signals only = structure and daily trend agree, volume, and a key level or a taken
 *  inducement. Enter after a later candle closes beyond the sweep candle. No targets: hold until structure breaks against you. */
export const trendSweepRide = (volMult = 1.2, wait = 3) => (b: Bar[]): Sig => {
  const s = empty(b.length), L = liquidity(b), a = atr(b), vm = sma(b.map(x => x.v), 20);
  let pend: { side: 1 | -1; i: number; edge: number; stop: number } | null = null;
  for (let i = 1; i < b.length; i++) {
    const x = b[i], l = L[i];
    s.lx[i] = l.choch === -1 || l.bos === -1; s.sx[i] = l.choch === 1 || l.bos === 1;
    if (pend && i - pend.i > wait) pend = null;
    if (pend && i > pend.i && (pend.side === 1 ? x.c > pend.edge : x.c < pend.edge)) { if (pend.side === 1) s.le[i] = true; else s.se[i] = true; s.stop[i] = pend.stop; pend = null; continue; }
    for (const side of [1, -1] as const) {
      if (l.trend !== side || l.dailyTrend !== side || !(x.v > volMult * vm[i])) continue;
      const h = sweepOf(l, side === 1 ? -1 : 1, false); if (!h || !(h.level.key || l.idmTaken)) continue;
      pend = { side, i, edge: side === 1 ? x.h : x.l, stop: side === 1 ? h.wick - 0.25 * a[i] : h.wick + 0.25 * a[i] };
    }
  }
  return s;
};

/** 2. Liquidity reversal (crypto 1h): a key level is swept on volume, then an internal change of character the other way within
 *  `wait` bars. Stop a quarter ATR beyond the wick; exit when structure breaks against the trade. */
export const liquidityReversal = (volMult = 1.2, wait = 5) => (b: Bar[]): Sig => {
  const s = empty(b.length), L = liquidity(b), a = atr(b), vm = sma(b.map(x => x.v), 20);
  let pend: { side: 1 | -1; i: number; stop: number } | null = null;
  for (let i = 1; i < b.length; i++) {
    const l = L[i];
    s.lx[i] = l.choch === -1 || l.bos === -1; s.sx[i] = l.choch === 1 || l.bos === 1;
    if (pend && i - pend.i > wait) pend = null;
    if (pend && i > pend.i && l.ichoch === pend.side) { if (pend.side === 1) s.le[i] = true; else s.se[i] = true; s.stop[i] = pend.stop; pend = null; continue; }
    if (!(b[i].v > volMult * vm[i])) continue;
    const lo = sweepOf(l, -1, true), hi = sweepOf(l, 1, true);
    if (lo) pend = { side: 1, i, stop: lo.wick - 0.25 * a[i] }; else if (hi) pend = { side: -1, i, stop: hi.wick + 0.25 * a[i] };
  }
  return s;
};

/** 3. Forex day/week level reversal (4h): a previous day/week high or low, or equal highs/lows, is swept against the structure
 *  trend (buys only in discount, sells only in premium); a later candle closes beyond the sweep candle with a body of at least
 *  1 ATR (displacement). Target 2R. No volume filter (forex volume is tick volume). */
export const fxLevelReversal = (wait = 3, r = 2) => (b: Bar[]): Sig => {
  const s = empty(b.length), L = liquidity(b), a = atr(b), kinds: Kind[] = ['pdh', 'pdl', 'pwh', 'pwl', 'eq'];
  let pend: { side: 1 | -1; i: number; edge: number; stop: number } | null = null;
  for (let i = 1; i < b.length; i++) {
    const x = b[i], l = L[i];
    if (pend && i - pend.i > wait) pend = null;
    if (pend && i > pend.i && (pend.side === 1 ? x.c > pend.edge : x.c < pend.edge) && Math.abs(x.c - x.o) >= a[i]) {
      if (pend.side === 1) s.le[i] = true; else s.se[i] = true; s.stop[i] = pend.stop; s.target[i] = x.c + r * (x.c - pend.stop); pend = null; continue;
    }
    const lo = sweepOf(l, -1, true, kinds), hi = sweepOf(l, 1, true, kinds);
    if (lo && l.trend !== 1 && l.pd < 0.5) pend = { side: 1, i, edge: x.h, stop: lo.wick - 0.25 * a[i] };
    else if (hi && l.trend !== -1 && l.pd > 0.5) pend = { side: -1, i, edge: x.l, stop: hi.wick + 0.25 * a[i] };
  }
  return s;
};

/** Liquidity points for the confluence score: [long, short] per bar, 0 to 20. */
export function liquidityPoints(b: Bar[]) {
  const t = trendSweepRide()(b), r = liquidityReversal()(b), f = fxLevelReversal()(b);
  return b.map((_, i) => [Math.min(20, (t.le[i] ? 8 : 0) + (r.le[i] ? 8 : 0) + (f.le[i] ? 8 : 0)), Math.min(20, (t.se[i] ? 8 : 0) + (r.se[i] ? 8 : 0) + (f.se[i] ? 8 : 0))] as [number, number]);
}
