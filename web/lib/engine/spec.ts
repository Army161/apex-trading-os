// Strategy spec: the JSON rules format the AI builder writes and the editor changes. Compiled to the same Sig the engine backtests,
// so a built strategy is tested with the same fills as every built-in one (decide on close, fill next open, stop before target).
import { Bar, Sig, sma, ema, rsi, atr, adx, rollMax, rollMin, shift, stdev, supertrend, macd, candles } from './core';

export const TFS = ['15m', '1h', '4h', '1d', '1w'] as const;
export const IND_TYPES = ['sma', 'ema', 'rsi', 'atr', 'adx', 'supertrend', 'bbands', 'macd', 'donchian', 'volume_sma'] as const;
export const OPS = ['crosses_above', 'crosses_below', '>', '<', '>=', '<='] as const;
export const PATTERNS = ['bull_engulfing', 'bear_engulfing', 'hammer', 'shooting_star', 'bull_reversal', 'bear_reversal', 'momentum_bull', 'momentum_bear'] as const;

export type Indicator = { id: string; type: typeof IND_TYPES[number]; length: number; length2: number; length3: number; mult: number };
export type Cond = { left: string; op: typeof OPS[number]; right: string };
export type Spec = {
  name: string; description: string; symbol: string; tf: typeof TFS[number]; direction: 'long' | 'short' | 'both';
  indicators: Indicator[]; long_entry: Cond[]; short_entry: Cond[]; exit_long: Cond[]; exit_short: Cond[];
  stop: { type: 'pct' | 'atr' | 'none'; value: number }; target: { type: 'pct' | 'r' | 'none'; value: number };
  max_bars: number; unsupported: string[];
};

/** Fields each indicator exposes as operands, e.g. "st.line", "bb.upper". The first one is the default for a bare "st". */
export const FIELDS: Record<Indicator['type'], string[]> = {
  sma: ['value'], ema: ['value'], rsi: ['value'], atr: ['value'], adx: ['value'], volume_sma: ['value'],
  supertrend: ['line', 'dir'], bbands: ['mid', 'upper', 'lower'], macd: ['macd', 'signal', 'hist'], donchian: ['upper', 'lower', 'mid'],
};

/** JSON schema for structured outputs (strict: every property required, no extra keys). */
const condSchema = { type: 'object', additionalProperties: false, required: ['left', 'op', 'right'], properties: {
  left: { type: 'string', description: 'Operand: close|open|high|low|volume, an indicator id or id.field, pattern:<name>, or a number as a string' },
  op: { type: 'string', enum: [...OPS] }, right: { type: 'string', description: 'Operand, same grammar as left. For pattern operands use op ">" and right "0".' } } };
export const SPEC_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['name', 'description', 'symbol', 'tf', 'direction', 'indicators', 'long_entry', 'short_entry', 'exit_long', 'exit_short', 'stop', 'target', 'max_bars', 'unsupported'],
  properties: {
    name: { type: 'string' }, description: { type: 'string', description: 'Plain English rules, 1-3 sentences' },
    symbol: { type: 'string', description: 'Exchange spot symbol like BTCUSDT' }, tf: { type: 'string', enum: [...TFS] },
    direction: { type: 'string', enum: ['long', 'short', 'both'] },
    indicators: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'type', 'length', 'length2', 'length3', 'mult'], properties: {
      id: { type: 'string', description: 'Short lowercase id used in conditions, e.g. st, ema50' }, type: { type: 'string', enum: [...IND_TYPES] },
      length: { type: 'number', description: 'Main length (ATR length for supertrend, fast for macd)' }, length2: { type: 'number', description: 'macd slow, else 0' },
      length3: { type: 'number', description: 'macd signal, else 0' }, mult: { type: 'number', description: 'supertrend/bbands multiplier, else 0' } } } },
    long_entry: { type: 'array', items: condSchema, description: 'All must be true on the closed bar. Empty if no longs.' },
    short_entry: { type: 'array', items: condSchema, description: 'All must be true. Empty if no shorts.' },
    exit_long: { type: 'array', items: condSchema, description: 'Any one true closes a long. May be empty.' },
    exit_short: { type: 'array', items: condSchema, description: 'Any one true closes a short. May be empty.' },
    stop: { type: 'object', additionalProperties: false, required: ['type', 'value'], properties: { type: { type: 'string', enum: ['pct', 'atr', 'none'] }, value: { type: 'number', description: 'pct as a fraction (0.1 = 10%) or ATR multiple' } } },
    target: { type: 'object', additionalProperties: false, required: ['type', 'value'], properties: { type: { type: 'string', enum: ['pct', 'r', 'none'] }, value: { type: 'number', description: 'pct as a fraction or an R multiple' } } },
    max_bars: { type: 'number', description: 'Time exit in bars, 0 for none' },
    unsupported: { type: 'array', items: { type: 'string' }, description: 'Parts of the request this format cannot express (e.g. options strikes, expiries, time-of-day rules), said plainly' },
  },
} as const;

const PRICE = ['close', 'open', 'high', 'low', 'volume'];

export function validate(s: Spec): string[] {
  const e: string[] = []; const ids = new Set<string>();
  if (!s.name?.trim()) e.push('name is empty');
  if (!TFS.includes(s.tf)) e.push(`timeframe ${s.tf} not supported`);
  if (!/^[A-Z0-9]{5,20}$/.test(s.symbol ?? '')) e.push(`symbol ${s.symbol} should look like BTCUSDT`);
  for (const i of s.indicators ?? []) {
    if (!/^[a-z][a-z0-9_]{0,15}$/.test(i.id)) e.push(`indicator id "${i.id}" must be short lowercase`);
    if (ids.has(i.id) || PRICE.includes(i.id)) e.push(`indicator id "${i.id}" is reused`); ids.add(i.id);
    if (!IND_TYPES.includes(i.type)) e.push(`indicator type ${i.type} unknown`);
    if (!(i.length >= 1 && i.length <= 500)) e.push(`${i.id}: length ${i.length} out of range`);
    if (i.type === 'macd' && !(i.length2 > i.length && i.length3 >= 1)) e.push(`${i.id}: macd needs fast < slow and a signal length`);
    if ((i.type === 'supertrend' || i.type === 'bbands') && !(i.mult > 0 && i.mult <= 10)) e.push(`${i.id}: multiplier ${i.mult} out of range`);
  }
  const all = [...(s.long_entry ?? []), ...(s.short_entry ?? []), ...(s.exit_long ?? []), ...(s.exit_short ?? [])];
  for (const c of all) {
    if (!OPS.includes(c.op)) e.push(`operator ${c.op} unknown`);
    for (const o of [c.left, c.right]) { const err = operandError(o, s.indicators ?? []); if (err) e.push(err); }
  }
  if (!s.long_entry?.length && !s.short_entry?.length) e.push('no entry rules');
  if (s.direction === 'long' && s.short_entry?.length) e.push('direction is long but short rules exist');
  if (s.direction === 'short' && s.long_entry?.length) e.push('direction is short but long rules exist');
  if (s.stop?.type === 'none') e.push('a stop is required (house rule: entry, stop and target before any order)');
  if (s.stop?.type === 'pct' && !(s.stop.value > 0 && s.stop.value < 0.5)) e.push('stop % should be between 0 and 50% (as a fraction)');
  if (s.stop?.type === 'atr' && !(s.stop.value > 0 && s.stop.value <= 10)) e.push('ATR stop multiple out of range');
  if (s.target?.type === 'pct' && !(s.target.value > 0 && s.target.value < 5)) e.push('target % out of range');
  if (s.target?.type === 'r' && !(s.target.value >= 0.5 && s.target.value <= 10)) e.push('target R out of range');
  return e;
}

function operandError(o: string, inds: Indicator[]): string | null {
  if (o == null || o === '') return 'empty operand';
  if (PRICE.includes(o) || Number.isFinite(Number(o))) return null;
  if (o.startsWith('pattern:')) return PATTERNS.includes(o.slice(8) as any) ? null : `unknown pattern ${o}`;
  const [id, f] = o.split('.'); const ind = inds.find(i => i.id === id);
  if (!ind) return `operand "${o}" is not a price, number, pattern or defined indicator`;
  if (f && !FIELDS[ind.type].includes(f)) return `${ind.type} has no field "${f}" (use ${FIELDS[ind.type].join(', ')})`;
  return null;
}

function series(b: Bar[], s: Spec) {
  const c = b.map(x => x.c), out: Record<string, number[]> = {
    close: c, open: b.map(x => x.o), high: b.map(x => x.h), low: b.map(x => x.l), volume: b.map(x => x.v) };
  for (const i of s.indicators) {
    const k = i.id;
    switch (i.type) {
      case 'sma': out[k] = sma(c, i.length); break;
      case 'ema': out[k] = ema(c, i.length); break;
      case 'rsi': out[k] = rsi(c, i.length); break;
      case 'atr': out[k] = atr(b, i.length); break;
      case 'adx': out[k] = adx(b, i.length); break;
      case 'volume_sma': out[k] = sma(out.volume, i.length); break;
      case 'supertrend': { const t = supertrend(b, i.length, i.mult); out[k] = out[`${k}.line`] = t.line; out[`${k}.dir`] = t.dir; break; }
      case 'bbands': { const m = sma(c, i.length), sd = stdev(c, i.length); out[k] = out[`${k}.mid`] = m; out[`${k}.upper`] = m.map((x, j) => x + i.mult * sd[j]); out[`${k}.lower`] = m.map((x, j) => x - i.mult * sd[j]); break; }
      case 'macd': { const m = macd(c, i.length, i.length2, i.length3); out[k] = out[`${k}.macd`] = m.macd; out[`${k}.signal`] = m.signal; out[`${k}.hist`] = m.hist; break; }
      case 'donchian': { const u = shift(rollMax(out.high, i.length)), l = shift(rollMin(out.low, i.length)); out[k] = out[`${k}.upper`] = u; out[`${k}.lower`] = l; out[`${k}.mid`] = u.map((x, j) => (x + l[j]) / 2); break; }
    }
  }
  const cd = candles(b);
  const pat: Record<string, (x: ReturnType<typeof candles>[number]) => boolean> = { bull_engulfing: x => x.bullEng, bear_engulfing: x => x.bearEng, hammer: x => x.hammer, shooting_star: x => x.star,
    bull_reversal: x => x.bullRev, bear_reversal: x => x.bearRev, momentum_bull: x => x.momBull, momentum_bear: x => x.momBear };
  for (const p of PATTERNS) out[`pattern:${p}`] = cd.map(x => (pat[p](x) ? 1 : 0));
  return out;
}

const val = (S: Record<string, number[]>, o: string, i: number) => (S[o] ? S[o][i] : Number(o));
function test(S: Record<string, number[]>, c: Cond, i: number) {
  const a = val(S, c.left, i), b = val(S, c.right, i);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  switch (c.op) {
    case '>': return a > b; case '<': return a < b; case '>=': return a >= b; case '<=': return a <= b;
    case 'crosses_above': case 'crosses_below': {
      if (!i) return false; const pa = val(S, c.left, i - 1), pb = val(S, c.right, i - 1);
      if (!Number.isFinite(pa) || !Number.isFinite(pb)) return false;
      return c.op === 'crosses_above' ? a > b && pa <= pb : a < b && pa >= pb;
    }
  }
}

export function compile(s: Spec) {
  return (b: Bar[]): Sig => {
    const n = b.length, S = series(b, s), a = atr(b, 14);
    const sig: Sig = { le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(NaN), target: Array(n).fill(NaN) };
    if (s.max_bars > 0) sig.maxBars = Math.round(s.max_bars);
    for (let i = 0; i < n; i++) {
      const c = b[i].c;
      const le = s.direction !== 'short' && s.long_entry.length > 0 && s.long_entry.every(x => test(S, x, i));
      const se = !le && s.direction !== 'long' && s.short_entry.length > 0 && s.short_entry.every(x => test(S, x, i));
      sig.le[i] = le; sig.se[i] = se;
      sig.lx[i] = s.exit_long.some(x => test(S, x, i)); sig.sx[i] = s.exit_short.some(x => test(S, x, i));
      if (le || se) {
        const side = le ? 1 : -1;
        const dist = s.stop.type === 'pct' ? c * s.stop.value : s.stop.type === 'atr' ? s.stop.value * a[i] : NaN;
        sig.stop[i] = Number.isFinite(dist) ? c - side * dist : NaN; // NaN falls back to the engine's 2x ATR stop
        const d = Math.abs(c - sig.stop[i]);
        sig.target[i] = s.target.type === 'pct' ? c * (1 + side * s.target.value) : s.target.type === 'r' && Number.isFinite(d) ? c + side * s.target.value * d : NaN;
      }
    }
    return sig;
  };
}

/** Editable numeric knobs shown in the editor (the Delta demo's "ATR length 10 -> 20, multiplier 3 -> 2, SL 15%, TP 45%"). */
export function knobs(s: Spec) {
  const k: { path: string; label: string; value: number }[] = [];
  s.indicators.forEach((i, j) => {
    k.push({ path: `indicators.${j}.length`, label: `${i.id} ${i.type === 'supertrend' ? 'ATR length' : i.type === 'macd' ? 'fast' : 'length'}`, value: i.length });
    if (i.type === 'macd') { k.push({ path: `indicators.${j}.length2`, label: `${i.id} slow`, value: i.length2 }, { path: `indicators.${j}.length3`, label: `${i.id} signal`, value: i.length3 }); }
    if (i.type === 'supertrend' || i.type === 'bbands') k.push({ path: `indicators.${j}.mult`, label: `${i.id} multiplier`, value: i.mult });
  });
  if (s.stop.type !== 'none') k.push({ path: 'stop.value', label: s.stop.type === 'pct' ? 'stop loss (fraction, 0.1 = 10%)' : 'stop (x ATR)', value: s.stop.value });
  if (s.target.type !== 'none') k.push({ path: 'target.value', label: s.target.type === 'pct' ? 'target (fraction)' : 'target (R)', value: s.target.value });
  return k;
}
export function setPath<T>(o: T, path: string, v: number): T {
  const c = structuredClone(o) as any; const ks = path.split('.'); let x = c;
  for (const k of ks.slice(0, -1)) x = x[k]; x[ks[ks.length - 1]] = v; return c;
}

/** The video's example, prebuilt so the builder works (and can be tested) without an API key. */
export const EXAMPLE: Spec = {
  name: 'BTC Supertrend Flip', description: 'Long when a 15m candle closes above the Supertrend(10, 3) line, short when it closes below. 10% stop, 30% target, exit on the opposite flip.',
  symbol: 'BTCUSDT', tf: '15m', direction: 'both',
  indicators: [{ id: 'st', type: 'supertrend', length: 10, length2: 0, length3: 0, mult: 3 }],
  long_entry: [{ left: 'close', op: 'crosses_above', right: 'st.line' }], short_entry: [{ left: 'close', op: 'crosses_below', right: 'st.line' }],
  exit_long: [{ left: 'close', op: '<', right: 'st.line' }], exit_short: [{ left: 'close', op: '>', right: 'st.line' }],
  stop: { type: 'pct', value: 0.1 }, target: { type: 'pct', value: 0.3 }, max_bars: 0,
  unsupported: ['The video buys at-the-money weekly BTC call/put options. Apex has no options venue connected, so this trades BTC itself; a 10%/30% stop/target on the coin is far wider than on an option premium.'],
};
