import { dealFlow, srMemory } from './urban';
import { swingCount, prevRange } from './dave';
import { garchIntraday } from './garch';
import { Bar, Sig, atr, sma, ema, rsi, adx, rollMax, rollMin, shift, stdev, candles, swings, supertrend } from './core';
import { goldenCross, turtleSoup, silverBullet, unicorn, ictPoints } from './ict';
import { sarReverse, maCross, bandRevert, withEmaRegime, withAdx, regimePoints } from './trend';
import { secondLeg, sharpReversal, gwsReversal, anchorDiscount } from './demand';
import { trendSweepRide, liquidityReversal, fxLevelReversal, liquidityPoints } from './liquidity';

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
  { id: 'confluence', name: 'Confluence Score', source: 'chat/17 + 06, 14, 15, 19', direction: 'both', tf: '1d', desc: 'Structure + location + trigger candle + momentum/volume + context, plus up to 15 for ICT, liquidity sweeps and the EMA 50 regime, must score >= 60.',
    build: b => { const s = empty(b.length), sc = confluence(b), a = atr(b);
      sc.forEach((x, i) => { if (x.long >= 60 && x.L.trigger > 0 && x.long > x.short) { s.le[i] = true; rr(s, b, i, 1, Math.min(b[i].l, b[i].c - 1.5 * a[i])); }
        else if (x.short >= 60 && x.S.trigger > 0 && x.short > x.long) { s.se[i] = true; rr(s, b, i, -1, Math.max(b[i].h, b[i].c + 1.5 * a[i])); } }); return s; } },
  { id: 'supertrend', name: 'Supertrend Flip', source: 'chat/24', direction: 'both', tf: '1h', desc: 'Close flips above the Supertrend(10, 3) line: long; flips below: short. 2% stop, 6% target, exit on the opposite flip. (The video buys ATM options; this trades the underlying.)',
    build: b => { const s = empty(b.length), c = C(b), st = supertrend(b, 10, 3);
      c.forEach((x, i) => { if (!i) return; const up = st.dir[i] === 1 && st.dir[i - 1] === -1, dn = st.dir[i] === -1 && st.dir[i - 1] === 1;
        if (up) { s.le[i] = true; s.stop[i] = x * 0.98; s.target[i] = x * 1.06; } else if (dn) { s.se[i] = true; s.stop[i] = x * 1.02; s.target[i] = x * 0.94; }
        s.lx[i] = st.dir[i] === -1; s.sx[i] = st.dir[i] === 1; }); return s; } },
  { id: 'golden_cross', name: 'Golden Cross 50/200', source: 'chat/48', direction: 'long', tf: '1h', desc: 'Long when SMA50 crosses above SMA200, flat when it crosses back below. No stop, no target, no prediction. Slow by design.',
    build: goldenCross(50, 200) },
  { id: 'ict_turtle_soup', name: 'ICT Turtle Soup', source: 'chat/50', direction: 'both', tf: '30m', desc: '40-bar high/low swept and closed back inside, then a structure shift within 6 bars. Stop beyond the sweep, 1:2.',
    build: turtleSoup() },
  { id: 'ict_silver_bullet', name: 'ICT Silver Bullet', source: 'chat/50', direction: 'both', tf: '5m', desc: 'Inside 3-4, 10-11 or 14-15 New York: sweep, structure shift, fair value gap. Stop beyond the sweep, 1:2, closed when the window ends. 5m or lower.',
    build: silverBullet() },
  { id: 'ict_unicorn', name: 'ICT Unicorn', source: 'chat/50', direction: 'both', tf: '1h', desc: 'A fair value gap overlapping a breaker block of the same direction. Stop beyond the zone, 1:2.',
    build: unicorn() },
  { id: 'liq_trend_sweep', name: 'Liquidity Trend Sweep Ride', source: 'chat/51', direction: 'both', tf: '4h', desc: 'Strong sweep with the trend (structure + daily + volume + key level or taken inducement), confirmed by the next close. Hold until structure breaks against it.',
    build: trendSweepRide() },
  { id: 'liq_reversal', name: 'Liquidity Reversal', source: 'chat/51', direction: 'both', tf: '1h', desc: 'Key level (session, day, week, equal highs/lows) swept on volume, then an internal change of character. Hold until structure breaks against it.',
    build: liquidityReversal() },
  { id: 'liq_fx_levels', name: 'FX Day/Week Level Reversal', source: 'chat/51', direction: 'both', tf: '4h', desc: 'Previous day/week level or equal highs/lows swept against trend, in discount/premium, then a 1-ATR displacement candle. Target 2R.',
    build: fxLevelReversal() },
  { id: 'psar_reverse', name: 'Parabolic SAR Stop & Reverse', source: 'chat/53', direction: 'both', tf: '1d', desc: "Wilder's SAR (0.02 / +0.02 / 0.2). Long when dots flip below price, short when they flip above; the SAR is the stop.",
    build: sarReverse() },
  { id: 'psar_adx', name: 'Parabolic SAR + ADX chop filter', source: 'chat/53', direction: 'both', tf: '1d', desc: 'Same SAR flips, only when ADX(14) >= 20 (skips sideways markets where the SAR flips too often).',
    build: withAdx(sarReverse(), 20) },
  { id: 'sma_10_20', name: 'SMA 10/20 Cross', source: 'chat/53', direction: 'both', tf: '1d', desc: 'Stop-and-reverse on the 10/20 SMA cross. The lagging baseline the SAR is compared against.',
    build: maCross(10, 20) },
  { id: 'ema50_bands', name: 'EMA 50 Bands Mean Reversion', source: 'chat/52', direction: 'both', tf: '1d', desc: '50 mean +/- 2 standard deviations. Back inside after closing beyond a band, in the direction of the 50/200 trend; target the mean.',
    build: bandRevert() },
  { id: 'ict_turtle_soup_ema', name: 'ICT Turtle Soup + EMA 50 regime', source: 'chat/50 + 52', direction: 'both', tf: '30m', desc: 'Turtle soup, filtered: no chop, no multi-timeframe decision zone, counter-regime only toward an untouched EMA.',
    build: withEmaRegime(turtleSoup()) },
  { id: 'liq_reversal_ema', name: 'Liquidity Reversal + EMA 50 regime', source: 'chat/51 + 52', direction: 'both', tf: '1h', desc: 'Liquidity reversal with the EMA 50 regime filter.',
    build: withEmaRegime(liquidityReversal()) },
  { id: 'demand_second_leg', name: 'Demand Second Leg', source: 'chat/56', direction: 'both', tf: '1h', desc: 'Fast move of 3 ATR in 5 bars = demand. Skip leg one; after a 30-79% pullback makes a new low and breaks back above its last swing high, enter leg two. Stop beyond the pullback; target leg two = leg one. MA 20/50/200 as a guide.',
    build: secondLeg() },
  { id: 'sharp_reversal_aoi', name: 'Sharp Reversal: Flag Stop Sweep', source: 'chat/57', direction: 'long', tf: '4h', desc: 'Uptrend goes parabolic (3 ATR over EMA20, growing candles), reverses fast; wait for lower highs, the first higher low and a flag breakout; buy only when price sweeps the flag buyers stops and closes back above. Stop under the sweep, 2R.',
    build: sharpReversal() },
  { id: 'gws_reversal', name: 'Rubber Band + GWS Reversal', source: 'chat/59', direction: 'both', tf: '1d', desc: 'Record lows with fading energy (smaller extensions, bounces of 50%+), the guy who started the last low is tested then closed above. Vetoed while the 4x timeframe still runs the other way. 2R.',
    build: gwsReversal() },
  { id: 'anchor_discount', name: 'EMA 20/50/200 Anchor Discount', source: 'chat/58 + 59', direction: 'long', tf: '4h', desc: 'Above rising EMA 20/50/200, a fast impulse sets the anchor; after a 30%+ discount, buy the GWS break. Stop under the pullback (never average down), target the anchor.',
    build: anchorDiscount() },
  { id: 'urban_deal_flow', name: 'No Deal, No Trade: Pullback Speed', source: 'chat/60', direction: 'both', tf: '1d', desc: 'After a 3 ATR impulse, wait for a 38%+ discount; wait while pullback legs speed up; buy the fast return through the last-seen level. Pair with the currency-strength scan (urban.ts) on FX. Not an edge yet in our tests.',
    build: dealFlow() },
  { id: 'urban_sr_memory', name: 'S/R Memory Zones + DNA Test', source: 'chat/61', direction: 'both', tf: '1h', desc: 'Zones where price once left fast. With the higher timeframe, the second push into a zone must be choppier and fail to make a new extreme; enter on the failed retest. 2R. Not an edge yet in our tests.',
    build: srMemory() },
  { id: 'dave_swing_count', name: 'Swing-Count Reversal (4 swings)', source: 'chat/78', direction: 'both', tf: '1h', desc: 'Counter-trend only at a higher-timeframe swing point, and only after 4+ lower lows and 4+ lower highs (mirror for shorts); sweep of the prior low, close above the last down candle. 2R. His P&L claims are unproven.',
    build: swingCount() },
  { id: 'dave_prev_range', name: 'Previous-Range Pullback', source: 'chat/78', direction: 'both', tf: '1h', desc: 'After a break of structure, wait for a 50% retrace into the range that caused it, a sweep and a close above the last down candle; target the high it retraced from. Candidate: passed all 6 checks on SPY and IWM 30m/1h (mostly shorts), fails on 4h/daily; needs forward paper trading. His P&L claims are unproven.',
    build: prevRange() },
  { id: 'garch_vol_premium', name: 'GARCH Volatility Premium Fade', source: 'chat/82', direction: 'both', tf: '30m', desc: 'Daily: GARCH(1,1) forecast vs 180-day variance; when the premium is beyond 1.5 of its own standard deviations, fade an intraday RSI(20) + Bollinger extreme the next day and exit before the close. The course used simulated data. On real SPY/QQQ/IWM it made 1 to 4 trades in two years: too few to judge.',
    build: garchIntraday() },
  { id: 'buy_hold', name: 'Buy & Hold (benchmark)', source: 'benchmark', direction: 'long', tf: 'any', desc: 'Buys the first bar and holds.',
    build: b => { const s = empty(b.length); s.le[0] = true; s.stop[0] = b[0].c * 1e-4; s.fullSize = true; return s; } },
];

export type Score = { long: number; short: number; L: Record<string, number>; S: Record<string, number> };
export function confluence(b: Bar[]): Score[] {
  const c = C(b), a = atr(b), w = swings(b), e50 = ema(c, 50), e200 = ema(c, 200), cd = candles(b), r = rsi(c), vm = sma(V(b), 20);
  const pl = shift(rollMin(L(b), 20)), ph = shift(rollMax(H(b), 20)), ip = ictPoints(b), lp = liquidityPoints(b), rp = regimePoints(b);
  return b.map((x, i) => {
    const spike = x.v > 1.5 * vm[i];
    const L_ = { structure: Math.min(25, (w.trend[i] === 1 ? 15 : 0) + (c[i] > e50[i] ? 5 : 0) + (e50[i] > e200[i] ? 5 : 0)),
      location: Math.min(20, (Math.abs(x.l - w.lastSL[i - 1]) <= 0.5 * a[i] ? 12 : 0) + (x.l < pl[i] && x.c > pl[i] ? 8 : 0)),
      trigger: Math.min(20, (cd[i].bullEng ? 10 : 0) + (cd[i].hammer ? 10 : 0) + (cd[i].momBull ? 6 : 0)),
      momentum: Math.min(20, (r[i] > 50 && r[i] < 75 ? 6 : 0) + (spike ? 6 : 0)),
      context: Math.min(15, (w.lastSH[i] - w.prevSL[i] > w.lastSH[i] - w.lastSL[i] ? 7 : 0) + (e50[i] > shift(e50, 10)[i] ? 8 : 0)), smart: Math.min(15, ip[i][0] + lp[i][0] + rp[i][0]) };
    const S_ = { structure: Math.min(25, (w.trend[i] === -1 ? 15 : 0) + (c[i] < e50[i] ? 5 : 0) + (e50[i] < e200[i] ? 5 : 0)),
      location: Math.min(20, (Math.abs(x.h - w.lastSH[i - 1]) <= 0.5 * a[i] ? 12 : 0) + (x.h > ph[i] && x.c < ph[i] ? 8 : 0)),
      trigger: Math.min(20, (cd[i].bearEng ? 10 : 0) + (cd[i].star ? 10 : 0) + (cd[i].momBear ? 6 : 0)),
      momentum: Math.min(20, (r[i] < 50 && r[i] > 25 ? 6 : 0) + (spike ? 6 : 0)),
      context: Math.min(15, (w.prevSH[i] - w.lastSL[i] > w.lastSH[i] - w.lastSL[i] ? 7 : 0) + (e50[i] < shift(e50, 10)[i] ? 8 : 0)), smart: Math.min(15, ip[i][1] + lp[i][1] + rp[i][1]) };
    const sum = (o: Record<string, number>) => Object.values(o).reduce((p, q) => p + (isNaN(q) ? 0 : q), 0);
    return { long: sum(L_), short: sum(S_), L: L_, S: S_ };
  });
}

export const byId = (id: string) => STRATEGIES.find(s => s.id === id)!;
