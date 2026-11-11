// Template catalog (docs/design/05 s4.1, build plan P3.5). A template is a strategy family already in the engine with typed,
// bounded parameters. The claim checker maps a rule set to a template and its parameters when it can; a model may propose the
// numbers, but this code checks every one against its bounds and refuses anything it does not know.
//
// With its default parameters each template reproduces a registered built-in exactly (packages/engine/test/templates.test.ts
// compares fingerprints). Every distinct parameter set is its own strategy and its own try.
import { createHash } from 'node:crypto';
import { Bar, Sig, atr, sma, ema, rsi, rollMax, rollMin, shift, stdev, supertrend, swings } from './core';
import { maCross } from './trend';
import { prevRange, type Exit } from './dave';
import { openingRange, vwapPullback, vwapFade, momentumBreakout, divergencePivot } from './queue';

export type NumParam = { kind: 'number'; min: number; max: number; int?: boolean; default: number; help: string };
export type ChoiceParam = { kind: 'choice'; options: string[]; default: string; help: string };
export type ParamDef = NumParam | ChoiceParam;
export type Params = Record<string, number | string>;
export type Template = { id: string; name: string; desc: string; tf: string; direction: 'long' | 'both'; builtin: string; params: Record<string, ParamDef>;
  check?: (p: any) => string | null; build: (p: any) => (b: Bar[]) => Sig };
export type TemplateRef = { template: string; params: Params };

const num = (def: number, min: number, max: number, help: string, int = true): NumParam => ({ kind: 'number', min, max, int, default: def, help });
const empty = (n: number): Sig => ({ le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(NaN), target: Array(n).fill(NaN) });
const C = (b: Bar[]) => b.map(x => x.c), H = (b: Bar[]) => b.map(x => x.h), L = (b: Bar[]) => b.map(x => x.l), V = (b: Bar[]) => b.map(x => x.v);
const rr2 = (s: Sig, b: Bar[], i: number, side: 1 | -1, stop: number) => { s.stop[i] = stop; s.target[i] = b[i].c + side * 2 * Math.abs(b[i].c - stop); };

export const TEMPLATES: Template[] = [
  { id: 'breakout_channel', name: 'Channel breakout', builtin: 'turtle_55_20', tf: '1d', direction: 'long', desc: 'Close above the prior entryN-bar high; fixed stop atrStop x ATR(20); exit on a close below the prior exitN-bar low.',
    params: { entryN: num(55, 5, 300, 'bars in the entry channel'), exitN: num(20, 2, 200, 'bars in the exit channel'), atrStop: num(2, 0.5, 10, 'stop distance in ATR', false) },
    check: p => (p.exitN < p.entryN ? null : 'exitN must be shorter than entryN'),
    build: p => b => { const s = empty(b.length), c = C(b), up = shift(rollMax(H(b), p.entryN)), lo = shift(rollMin(L(b), p.exitN)), a = atr(b, 20);
      c.forEach((x, i) => { s.le[i] = x > up[i]; s.stop[i] = x - p.atrStop * a[i]; s.lx[i] = x < lo[i]; }); return s; } },
  { id: 'ma_trend', name: 'Moving-average trend', builtin: 'sma50_trend', tf: '1d', direction: 'long', desc: 'Long when the close crosses above its simple moving average, flat on a close below it. 3 ATR stop.',
    params: { len: num(50, 5, 400, 'moving-average length') },
    build: p => b => { const s = empty(b.length), c = C(b), m = sma(c, p.len), a = atr(b);
      c.forEach((x, i) => { s.le[i] = i > 0 && x > m[i] && c[i - 1] <= m[i - 1]; s.lx[i] = x < m[i]; s.stop[i] = x - 3 * a[i]; }); return s; } },
  { id: 'ma_cross', name: 'Moving-average cross', builtin: 'sma_10_20', tf: '1d', direction: 'both', desc: 'Stop-and-reverse on a fast/slow simple moving-average cross.',
    params: { fast: num(10, 2, 200, 'fast length'), slow: num(20, 3, 400, 'slow length') }, check: p => (p.fast < p.slow ? null : 'fast must be shorter than slow'),
    build: p => maCross(p.fast, p.slow) },
  { id: 'rsi_dip', name: 'RSI dip in an uptrend', builtin: 'rsi2_dip', tf: '1d', direction: 'long', desc: 'RSI(len) below level while the close is above its trendLen average; exit on a close above the 5-bar average or after 10 bars; 8% stop.',
    params: { len: num(2, 2, 30, 'RSI length'), level: num(10, 1, 50, 'buy below this RSI', false), trendLen: num(200, 20, 400, 'trend average length') },
    build: p => b => { const s = empty(b.length), c = C(b), r = rsi(c, p.len), t = sma(c, p.trendLen), m5 = sma(c, 5);
      c.forEach((x, i) => { s.le[i] = r[i] < p.level && x > t[i]; s.lx[i] = x > m5[i]; s.stop[i] = x * 0.92; }); s.maxBars = 10; return s; } },
  { id: 'bb_squeeze', name: 'Bollinger squeeze breakout', builtin: 'bb_squeeze', tf: '1d', direction: 'both', desc: 'Tightest bands in 120 bars, then a strong close beyond the band on volume. Stop at the middle band, 2R.',
    params: { len: num(20, 5, 100, 'band length'), mult: num(2, 0.5, 4, 'band width in standard deviations', false) },
    build: p => b => { const s = empty(b.length), c = C(b), mid = sma(c, p.len), sd = stdev(c, p.len), w = mid.map((m, i) => (2 * p.mult * sd[i]) / m), vm = sma(V(b), 20);
      for (let i = 130; i < b.length; i++) { const win = w.slice(i - 120, i).filter(x => !isNaN(x)).sort((x, y) => x - y); const q = win[Math.floor(win.length * 0.15)];
        const sq = w.slice(i - 10, i).some(x => x <= q), up = mid[i] + p.mult * sd[i], dn = mid[i] - p.mult * sd[i], body = Math.abs(b[i].c - b[i].o), rg = b[i].h - b[i].l;
        if (sq && b[i].v > vm[i] && body > 0.5 * rg) { if (c[i] > up) { s.le[i] = true; rr2(s, b, i, 1, mid[i]); } else if (c[i] < dn) { s.se[i] = true; rr2(s, b, i, -1, mid[i]); } } } return s; } },
  { id: 'supertrend', name: 'Supertrend flip', builtin: 'supertrend', tf: '1h', direction: 'both', desc: 'Long when the close flips above the Supertrend(n, mult) line, short when it flips below. 2% stop, 6% target, exit on the opposite flip.',
    params: { n: num(10, 2, 100, 'ATR length'), mult: num(3, 0.5, 10, 'ATR multiple', false) },
    build: p => b => { const s = empty(b.length), c = C(b), st = supertrend(b, p.n, p.mult);
      c.forEach((x, i) => { if (!i) return; const up = st.dir[i] === 1 && st.dir[i - 1] === -1, dn = st.dir[i] === -1 && st.dir[i - 1] === 1;
        if (up) { s.le[i] = true; s.stop[i] = x * 0.98; s.target[i] = x * 1.06; } else if (dn) { s.se[i] = true; s.stop[i] = x * 1.02; s.target[i] = x * 0.94; }
        s.lx[i] = st.dir[i] === -1; s.sx[i] = st.dir[i] === 1; }); return s; } },
  { id: 'failure_test', name: 'Failure test (2B)', builtin: 'failure_test_2b', tf: '1d', direction: 'both', desc: 'Price trades beyond the last confirmed swing and closes back inside. Stop beyond the extreme, 2R.',
    params: { lookback: num(3, 1, 20, 'bars each side that confirm a swing') },
    build: p => b => { const s = empty(b.length), w = swings(b, p.lookback, p.lookback);
      for (let i = 1; i < b.length; i++) { const sl = w.lastSL[i - 1], sh = w.lastSH[i - 1];
        if (b[i].l < sl && b[i].c > sl) { s.le[i] = true; rr2(s, b, i, 1, b[i].l * 0.998); } else if (b[i].h > sh && b[i].c < sh) { s.se[i] = true; rr2(s, b, i, -1, b[i].h * 1.002); } } return s; } },
  { id: 'liquidity_sweep', name: 'Liquidity sweep', builtin: 'smc_sweep_lite', tf: '4h', direction: 'both', desc: 'A wick takes the prior lookback-bar low and the bar closes back above it, with price above its trendLen EMA. Stop beyond the wick, 2R.',
    params: { lookback: num(20, 5, 200, 'bars in the swept range'), trendLen: num(200, 20, 400, 'trend EMA length') },
    build: p => b => { const s = empty(b.length), c = C(b), e = ema(c, p.trendLen), pl = shift(rollMin(L(b), p.lookback)), ph = shift(rollMax(H(b), p.lookback));
      for (let i = 1; i < b.length; i++) {
        if (b[i].l < pl[i] && c[i] > pl[i] && c[i] > e[i] && c[i] > b[i].o) { s.le[i] = true; rr2(s, b, i, 1, b[i].l * 0.998); }
        else if (b[i].h > ph[i] && c[i] < ph[i] && c[i] < e[i] && c[i] < b[i].o) { s.se[i] = true; rr2(s, b, i, -1, b[i].h * 1.002); } } return s; } },
  { id: 'prev_range_pullback', name: 'Previous-range pullback', builtin: 'dave_prev_range', tf: '1h', direction: 'both', desc: 'After a break of structure, a retrace of at least `depth` into the range that caused it, a sweep and a close above the last down candle. Target the high it retraced from, or a trailing exit.',
    params: { depth: num(0.5, 0.2, 0.9, 'how far into the range the pullback must reach', false), exit: { kind: 'choice', options: ['target', 'candle', 'swing', 'ema21'], default: 'target', help: 'fixed target or a trailing exit' } },
    build: p => prevRange({ depth: p.depth, exit: p.exit as Exit }) },
  { id: 'opening_range_breakout', name: 'Opening-range breakout', builtin: 'opening_range_breakout', tf: '30m', direction: 'both', desc: 'The first `minutes` of the New York session set the range; the first later close beyond it enters. Stop at the other side, rr R, one trade a day, flat before the close.',
    params: { minutes: num(30, 5, 120, 'length of the opening range in minutes'), rr: num(2, 0.5, 10, 'target in R', false) },
    build: p => openingRange(p.rr, p.minutes) },
  { id: 'vwap_pullback', name: 'Session VWAP trend pullback', builtin: 'vwap_trend_pullback', tf: '30m', direction: 'both', desc: 'VWAP rising with closes above it; a dip to within `band` standard deviations of VWAP that closes back up. 2R, one trade a day, flat before the close.',
    params: { band: num(0.5, 0, 2, 'how close to VWAP the dip must come, in bands', false) }, build: p => vwapPullback(2, p.band) },
  { id: 'vwap_fade', name: 'Flat-VWAP band fade', builtin: 'vwap_flat_fade', tf: '30m', direction: 'both', desc: 'VWAP flat; a bar trades through band `band` and closes back inside. Target VWAP, one trade a day, flat before the close.',
    params: { band: num(2, 1, 3, 'which band is faded', false) }, build: p => vwapFade(p.band) },
  { id: 'momentum_candle_breakout', name: 'Momentum-candle breakout', builtin: 'momentum_candle_breakout', tf: '30m', direction: 'both', desc: 'A candle body at least `mult` times the prior three, closing beyond the prior `lookback`-bar extreme. Stop beyond the candle, 2R, flat before the close.',
    params: { mult: num(2, 1, 5, 'body size against the prior three', false), lookback: num(20, 5, 200, 'bars in the level that must break') }, build: p => momentumBreakout(p.lookback, 2, p.mult) },
  { id: 'divergence_reversal', name: 'Divergence with a reversal candle', builtin: 'divergence_pivot', tf: '1h', direction: 'both', desc: 'A confirmed pivot beyond the last one while the indicator disagrees, then a hammer or engulfing candle. Stop beyond the pivot, 2R.',
    params: { indicator: { kind: 'choice', options: ['macd', 'rsi'], default: 'macd', help: 'MACD 3-10 line or RSI 14' }, pivot: num(3, 2, 10, 'bars each side that confirm the pivot') },
    build: p => divergencePivot(p.pivot, 6, 2, p.indicator as 'macd' | 'rsi') },
];

export const templateById = (id: string) => TEMPLATES.find(t => t.id === id);

/** Checks proposed parameters against the catalog. Missing ones take the default. Anything unknown, out of bounds, the wrong
 *  type or not a whole number where one is needed is an error: nothing is clamped or rounded silently. */
export function resolveParams(t: Template, raw: Record<string, unknown> = {}): { params: Params; errors: string[] } {
  const params: Params = {}, errors: string[] = [];
  for (const k of Object.keys(raw)) if (!(k in t.params)) errors.push(`${t.id} has no parameter "${k}"`);
  for (const [k, d] of Object.entries(t.params)) {
    const v = raw[k] === undefined || raw[k] === null ? d.default : raw[k];
    if (d.kind === 'choice') { if (typeof v === 'string' && d.options.includes(v)) params[k] = v; else errors.push(`${k} must be one of ${d.options.join(', ')}`); continue; }
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${k} must be a number`);
    else if (v < d.min || v > d.max) errors.push(`${k} = ${v} is outside ${d.min} to ${d.max}`);
    else if (d.int && !Number.isInteger(v)) errors.push(`${k} must be a whole number`);
    else params[k] = v;
  }
  if (!errors.length && t.check) { const e = t.check(params); if (e) errors.push(e); }
  return { params, errors };
}

/** One canonical text for a template and its full parameter set (defaults filled in, keys sorted). Same rules, same text. */
export const templateKey = (ref: TemplateRef) => JSON.stringify({ template: ref.template, params: Object.fromEntries(Object.keys(ref.params).sort().map(k => [k, ref.params[k]])) });

/** A runnable strategy from a template reference, or the reasons it was refused. The id carries a hash of the canonical text. */
export function instantiate(ref: { template: string; params?: Record<string, unknown> }): { ok: true; id: string; ref: TemplateRef; template: Template; build: (b: Bar[]) => Sig } | { ok: false; errors: string[] } {
  const t = templateById(ref.template); if (!t) return { ok: false, errors: [`no template called "${ref.template}"`] };
  const { params, errors } = resolveParams(t, ref.params ?? {}); if (errors.length) return { ok: false, errors };
  const full: TemplateRef = { template: t.id, params };
  return { ok: true, id: `tpl:${t.id}:${createHash('sha256').update(templateKey(full)).digest('hex').slice(0, 12)}`, ref: full, template: t, build: t.build(params) };
}

/** The catalog as plain data, for a prompt or a form: ids, descriptions, parameters and bounds. No code. */
export const catalog = () => TEMPLATES.map(t => ({ id: t.id, name: t.name, desc: t.desc, tf: t.tf, direction: t.direction, params: t.params }));
