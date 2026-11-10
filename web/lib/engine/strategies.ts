import { Bar, Sig, atr, sma, ema, rsi, adx, rollMax, rollMin, shift, stdev, candles, swings, supertrend } from './core';

export type StratDef = { id: string; name: string; source: string; direction: 'long' | 'both'; tf: string; desc: string; build: (b: Bar[]) => Sig };

const empty = (n: number): Sig => ({ le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(NaN), target: Array(n).fill(NaN) });
const C = (b: Bar[]) => b.map(x => x.c), H = (b: Bar[]) => b.map(x => x.h), L = (b: Bar[]) => b.map(x => x.l), V = (b: Bar[]) => b.map(x => x.v);
const rr = (s: Sig, b: Bar[], i: number, side: 1 | -1, stop: number, r = 2) => { s.stop[i] = stop; s.target[i] = b[i].c + side * r * Math.abs(b[i].c - stop); };

export const STRATEGIES: StratDef[] = [
  { id: 'turtle_55_20', name: 'Turtle Breakout 55/20', source: 'chat/03', direction: 'long', tf: '1d', desc: 'Close > prior 55-day high; fixed stop 2x ATR(20); exit on close < prior 20-day low.',
    build: b => { const s = empty(b.length), c = C(b), up = shift(rollMax(H(b), 55)), lo = shift(rollMin(L(b), 20)), a = atr(b, 20);
      c.forEach((x, i) => { s.le[i] = x > up[i]; s.stop[i] = x - 2 * a[i]; s.lx[i] = x < lo[i]; }); return s; } },
  { id: 'sma50_trend', name: 'SMA 50 Trend', source: 'chat/05', direction: 'long', tf: '1d', desc: 'Long on close crossing above SMA50, flat on close below it.',
    build: b => { const s = empty(b.length), c = C(b), m = sma(c, 50), a = atr(b);
      c.forEach((x, i) => { s.le[i] = i > 0 && x > m[i] && c[i - 1] <= m[i - 1]; s.lx[i] = x < m[i]; s.stop[i] = x - 3 * a[i]; }); return s; } },
  { id: 'rsi2_dip', name: 'RSI(2) Dip above 200d', source: 'uploads/01', direction: 'long', tf: '1d', desc: 'RSI(2) < 10 above SMA200; exit close > SMA5 or 10 bars; 8% stop.',
    build: b => { const s = empty(b.length), c = C(b), r = rsi(c, 2), t = sma(c, 200), m5 = sma(c, 5);
      c.forEach((x, i) => { s.le[i] = r[i] < 10 && x > t[i]; s.lx[i] = x > m5[i]; s.stop[i] = x * 0.92; }); s.maxBars = 10; return s; } },
  { id: 'breakout_50_20', name: '50-day Breakout above 200d', source: 'uploads/01', direction: 'long', tf: '1d', desc: 'New 50-day high above SMA200; exit at 20-day low or close below SMA200.',
    build: b => { const s = empty(b.length), c = C(b), hh = rollMax(H(b), 50), ll = rollMin(L(b), 20), t = sma(c, 200);
      c.forEach((x, i) => { s.le[i] = x >= hh[i] && x > t[i]; s.lx[i] = x <= ll[i] || x < t[i]; s.stop[i] = x * 0.9; }); return s; } },
  { id: 'bb_squeeze', name: 'Bollinger Squeeze Breakout', source: 'chat/18', direction: 'both', tf: '1d', desc: 'Tightest bands in 120 bars, then a strong close beyond the band on volume. Stop mid band, 2R.',
    build: b => { const s = empty(b.length), c = C(b), mid = sma(c, 20), sd = stdev(c, 20), w = mid.map((m, i) => (4 * sd[i]) / m), vm = sma(V(b), 20);
      for (let i = 130; i < b.length; i++) { const win = w.slice(i - 120, i).filter(x => !isNaN(x)).sort((x, y) => x - y); const q = win[Math.floor(win.length * 0.15)];
        const sq = w.slice(i - 10, i).some(x => x <= q), up = mid[i] + 2 * sd[i], dn = mid[i] - 2 * sd[i], body = Math.abs(b[i].c - b[i].o), rg = b[i].h - b[i].l;
        if (sq && b[i].v > vm[i] && body > 0.5 * rg) { if (c[i] > up) { s.le[i] = true; rr(s, b, i, 1, mid[i]); } else if (c[i] < dn) { s.se[i] = true; rr(s, b, i, -1, mid[i]); } } } return s; } },
  { id: 'rsi_regime', name: 'RSI Regime', source: 'chat/15', direction: 'both', tf: '1d', desc: 'ADX>=25: buy RSI reclaiming 50 in uptrend. Range: 30/70 reversion only with a reversal candle. 2R.',
    build: b => { const s = empty(b.length), c = C(b), r = rsi(c), ax = adx(b), e = ema(c, 50), cd = candles(b);
      for (let i = 6; i < b.length; i++) { const trend = ax[i] >= 25, lo = Math.min(...L(b).slice(i - 2, i + 1)), hi = Math.max(...H(b).slice(i - 2, i + 1));
        const minR = Math.min(...r.slice(i - 4, i + 1)), maxR = Math.max(...r.slice(i - 4, i + 1));
        if ((trend && c[i] > e[i] && r[i] > 50 && r[i - 1] <= 50 && minR >= 38) || (!trend && r[i - 1] < 30 && cd[i].bullRev)) { s.le[i] = true; rr(s, b, i, 1, lo * 0.998); }
        else if ((trend && c[i] < e[i] && r[i] < 50 && r[i - 1] >= 50 && maxR <= 62) || (!trend && r[i - 1] > 70 && cd[i].bearRev)) { s.se[i] = true; rr(s, b, i, -1, hi * 1.002); }
        s.lx[i] = trend && r[i] < 40; s.sx[i] = trend && r[i] > 60; } return s; } },
  { id: 'failure_test_2b', name: 'Failure Test (2B)', source: 'chat/06, uploads/12', direction: 'both', tf: '1d', desc: 'Trade beyond the last swing, close back inside. Stop beyond the extreme, 2R.',
    build: b => { const s = empty(b.length), w = swings(b);
      for (let i = 1; i < b.length; i++) { const sl = w.lastSL[i - 1], sh = w.lastSH[i - 1];
        if (b[i].l < sl && b[i].c > sl) { s.le[i] = true; rr(s, b, i, 1, b[i].l * 0.998); } else if (b[i].h > sh && b[i].c < sh) { s.se[i] = true; rr(s, b, i, -1, b[i].h * 1.002); } } return s; } },
  { id: 'smc_sweep_lite', name: 'SMC Liquidity Grab (lite)', source: 'chat/09, uploads/08', direction: 'both', tf: '4h', desc: 'Wick sweeps the 20-bar low and closes back above, with price above EMA200. Stop beyond the wick, 2R.',
    build: b => { const s = empty(b.length), c = C(b), e = ema(c, 200), pl = shift(rollMin(L(b), 20)), ph = shift(rollMax(H(b), 20));
      for (let i = 1; i < b.length; i++) {
        if (b[i].l < pl[i] && c[i] > pl[i] && c[i] > e[i] && c[i] > b[i].o) { s.le[i] = true; rr(s, b, i, 1, b[i].l * 0.998); }
        else if (b[i].h > ph[i] && c[i] < ph[i] && c[i] < e[i] && c[i] < b[i].o) { s.se[i] = true; rr(s, b, i, -1, b[i].h * 1.002); } } return s; } },
  { id: 'wyckoff_spring', name: 'Wyckoff Spring / Upthrust', source: 'chat/19', direction: 'both', tf: '1d', desc: 'False break of a 40-bar range that closes back inside on volume. Target range edge or 2R.',
    build: b => { const s = empty(b.length), a = atr(b), top = shift(rollMax(H(b), 40)), bot = shift(rollMin(L(b), 40)), vm = sma(V(b), 20);
      for (let i = 1; i < b.length; i++) { if (top[i] - bot[i] > 8 * a[i] || b[i].v < 1.2 * vm[i]) continue;
        if (b[i].l < bot[i] && b[i].c > bot[i] && b[i].c > b[i].o) { s.le[i] = true; s.stop[i] = b[i].l * 0.998; s.target[i] = Math.min(top[i], b[i].c + 2 * (b[i].c - s.stop[i])); }
        else if (b[i].h > top[i] && b[i].c < top[i] && b[i].c < b[i].o) { s.se[i] = true; s.stop[i] = b[i].h * 1.002; s.target[i] = Math.max(bot[i], b[i].c - 2 * (s.stop[i] - b[i].c)); } } return s; } },
  { id: 'confluence', name: 'Confluence Score', source: 'chat/17 + 06, 14, 15, 19', direction: 'both', tf: '1d', desc: 'Structure + location + trigger candle + momentum/volume + context must score >= 60/100.',
    build: b => { const s = empty(b.length), sc = confluence(b), a = atr(b);
      sc.forEach((x, i) => { if (x.long >= 60 && x.L.trigger > 0 && x.long > x.short) { s.le[i] = true; rr(s, b, i, 1, Math.min(b[i].l, b[i].c - 1.5 * a[i])); }
        else if (x.short >= 60 && x.S.trigger > 0 && x.short > x.long) { s.se[i] = true; rr(s, b, i, -1, Math.max(b[i].h, b[i].c + 1.5 * a[i])); } }); return s; } },
  { id: 'supertrend', name: 'Supertrend Flip', source: 'chat/24', direction: 'both', tf: '1h', desc: 'Close flips above the Supertrend(10, 3) line: long; flips below: short. 2% stop, 6% target, exit on the opposite flip. (The video buys ATM options; this trades the underlying.)',
    build: b => { const s = empty(b.length), c = C(b), st = supertrend(b, 10, 3);
      c.forEach((x, i) => { if (!i) return; const up = st.dir[i] === 1 && st.dir[i - 1] === -1, dn = st.dir[i] === -1 && st.dir[i - 1] === 1;
        if (up) { s.le[i] = true; s.stop[i] = x * 0.98; s.target[i] = x * 1.06; } else if (dn) { s.se[i] = true; s.stop[i] = x * 1.02; s.target[i] = x * 0.94; }
        s.lx[i] = st.dir[i] === -1; s.sx[i] = st.dir[i] === 1; }); return s; } },
  { id: 'buy_hold', name: 'Buy & Hold (benchmark)', source: 'benchmark', direction: 'long', tf: 'any', desc: 'Buys the first bar and holds.',
    build: b => { const s = empty(b.length); s.le[0] = true; s.stop[0] = b[0].c * 1e-4; s.fullSize = true; return s; } },
];

export type Score = { long: number; short: number; L: Record<string, number>; S: Record<string, number> };
export function confluence(b: Bar[]): Score[] {
  const c = C(b), a = atr(b), w = swings(b), e50 = ema(c, 50), e200 = ema(c, 200), cd = candles(b), r = rsi(c), vm = sma(V(b), 20);
  const pl = shift(rollMin(L(b), 20)), ph = shift(rollMax(H(b), 20));
  return b.map((x, i) => {
    const spike = x.v > 1.5 * vm[i];
    const L_ = { structure: Math.min(25, (w.trend[i] === 1 ? 15 : 0) + (c[i] > e50[i] ? 5 : 0) + (e50[i] > e200[i] ? 5 : 0)),
      location: Math.min(20, (Math.abs(x.l - w.lastSL[i - 1]) <= 0.5 * a[i] ? 12 : 0) + (x.l < pl[i] && x.c > pl[i] ? 8 : 0)),
      trigger: Math.min(20, (cd[i].bullEng ? 10 : 0) + (cd[i].hammer ? 10 : 0) + (cd[i].momBull ? 6 : 0)),
      momentum: Math.min(20, (r[i] > 50 && r[i] < 75 ? 6 : 0) + (spike ? 6 : 0)),
      context: Math.min(15, (w.lastSH[i] - w.prevSL[i] > w.lastSH[i] - w.lastSL[i] ? 7 : 0) + (e50[i] > shift(e50, 10)[i] ? 8 : 0)) };
    const S_ = { structure: Math.min(25, (w.trend[i] === -1 ? 15 : 0) + (c[i] < e50[i] ? 5 : 0) + (e50[i] < e200[i] ? 5 : 0)),
      location: Math.min(20, (Math.abs(x.h - w.lastSH[i - 1]) <= 0.5 * a[i] ? 12 : 0) + (x.h > ph[i] && x.c < ph[i] ? 8 : 0)),
      trigger: Math.min(20, (cd[i].bearEng ? 10 : 0) + (cd[i].star ? 10 : 0) + (cd[i].momBear ? 6 : 0)),
      momentum: Math.min(20, (r[i] < 50 && r[i] > 25 ? 6 : 0) + (spike ? 6 : 0)),
      context: Math.min(15, (w.prevSH[i] - w.lastSL[i] > w.lastSH[i] - w.lastSL[i] ? 7 : 0) + (e50[i] < shift(e50, 10)[i] ? 8 : 0)) };
    const sum = (o: Record<string, number>) => Object.values(o).reduce((p, q) => p + (isNaN(q) ? 0 : q), 0);
    return { long: sum(L_), short: sum(S_), L: L_, S: S_ };
  });
}

export const byId = (id: string) => STRATEGIES.find(s => s.id === id)!;
