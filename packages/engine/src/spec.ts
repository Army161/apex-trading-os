// Strategy spec: the JSON rules format the AI builder writes and the editor changes. Compiled to the same Sig the engine backtests,
// so a built strategy is tested with the same fills as every built-in one (decide on close, fill next open, stop before target).
//
// Version 2 (docs/design/05 s4.2) adds what the claim checker needs: sessions, session VWAP and its bands, the opening range,
// the prior day's levels, rolling highs and lows, the time of day, higher-timeframe values, swing / bar / indicator stops,
// level and measured-move targets, a trailing exit and a cooldown. Every addition is optional, so a version 1 spec means what
// it always meant. A session is clock time only: it does not know exchange half days, so on those an exit fills on the next bar
// the data has. Rule for every operand: its value on bar i uses bars 0..i only (packages/engine/test/spec.test.ts checks each one).
import { Bar, Sig, sma, ema, rsi, atr, adx, rollMax, rollMin, shift, stdev, supertrend, macd, candles, swings } from './core';
import { resample } from './trend';
import type { TrailSpec } from './trail';

export const TFS = ['5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const;
export const TF_MIN: Record<typeof TFS[number], number> = { '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080 };
export const TZS = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'] as const;
export const STOP_TYPES = ['pct', 'atr', 'none', 'swing', 'bar', 'indicator'] as const;
export const TARGET_TYPES = ['pct', 'r', 'none', 'level', 'measured_move'] as const;
export const TRAIL_TYPES = ['atr', 'swing', 'ema'] as const;
export const IND_TYPES = ['sma', 'ema', 'rsi', 'atr', 'adx', 'supertrend', 'bbands', 'macd', 'donchian', 'volume_sma'] as const;
export const OPS = ['crosses_above', 'crosses_below', '>', '<', '>=', '<='] as const;
export const PATTERNS = ['bull_engulfing', 'bear_engulfing', 'hammer', 'shooting_star', 'bull_reversal', 'bear_reversal', 'momentum_bull', 'momentum_bear'] as const;

export type Indicator = { id: string; type: typeof IND_TYPES[number]; length: number; length2: number; length3: number; mult: number };
export type Cond = { left: string; op: typeof OPS[number]; right: string };
export type Spec = {
  name: string; description: string; symbol: string; tf: typeof TFS[number]; direction: 'long' | 'short' | 'both';
  indicators: Indicator[]; long_entry: Cond[]; short_entry: Cond[]; exit_long: Cond[]; exit_short: Cond[];
  stop: Stop; target: Target;
  max_bars: number; unsupported: string[];
  // ---- version 2, all optional ----
  session?: Session;            // entries only inside it
  flat_at_close?: boolean;      // with a session: no entry on its last bar, and out before it ends
  cooldown_bars?: number;       // after an entry signal, ignore entry signals for this many bars
  trail?: Trail;                // trailing exit; it replaces the fixed target
};
/** Trading hours in one time zone. `days`: 0 is Sunday. No overnight sessions: start must be before end. */
export type Session = { tz: typeof TZS[number]; start: string; end: string; days: number[] };
/** pct: fraction of price. atr: ATR(14) multiple. swing: beyond the last confirmed swing (left/right bars each side, default 3) plus
 *  `value` ATR. bar: beyond the signal bar's low or high plus `value` ATR. indicator: at `operand` (for example "st.line"). */
export type Stop = { type: typeof STOP_TYPES[number]; value: number; left?: number; right?: number; operand?: string; operand_short?: string };
/** `operand_short` is the operand for shorts when it differs (for example the range low for longs, the range high for shorts).
 *  pct, r: as before. level: at `operand`. measured_move: the height of the last `value` bars, projected from the close. */
export type Target = { type: typeof TARGET_TYPES[number]; value: number; operand?: string; operand_short?: string };
/** atr: `value` ATR behind price once in profit. swing: the lowest low (highest high) of the last `value` bars. ema: an EMA of length `value`. */
export type Trail = { type: typeof TRAIL_TYPES[number]; value: number };

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

const OPERAND_HELP = 'Operand: close|open|high|low|volume, an indicator id or id.field, pattern:<name>, a number as a string, or one of: vwap, vwap.upper1..3, vwap.lower1..3 ' +
  '(session VWAP and its 1 to 3 standard-deviation bands), prev_day.high|low|close, open_range(N).high|low (first N minutes of the session), highest(N), lowest(N) ' +
  '(highest high / lowest low of the N bars before this one), time (minutes after midnight in the session time zone), htf(<timeframe>).<price or indicator> (last closed bar of a higher timeframe)';
const P = SPEC_SCHEMA.properties, condV2 = { ...condSchema, properties: { ...condSchema.properties, left: { type: 'string', description: OPERAND_HELP }, right: { type: 'string', description: 'Operand, same grammar as left. For pattern operands use op ">" and right "0".' } } };
const nullable = (o: object) => ({ anyOf: [o, { type: 'null' }] });
/** Version 2 schema for structured outputs. Strict like version 1: the optional parts are required but may be null. Use `fromModel` on the result. */
export const SPEC_SCHEMA_V2 = {
  type: 'object', additionalProperties: false, required: [...SPEC_SCHEMA.required, 'session', 'flat_at_close', 'cooldown_bars', 'trail'],
  properties: { ...P, symbol: { type: 'string', description: 'Ticker like SPY, EURUSD or BTCUSDT' },
    long_entry: { ...P.long_entry, items: condV2 }, short_entry: { ...P.short_entry, items: condV2 }, exit_long: { ...P.exit_long, items: condV2 }, exit_short: { ...P.exit_short, items: condV2 },
    stop: { type: 'object', additionalProperties: false, required: ['type', 'value', 'left', 'right', 'operand', 'operand_short'], properties: { type: { type: 'string', enum: [...STOP_TYPES] },
      value: { type: 'number', description: 'pct as a fraction, an ATR multiple, or for swing and bar stops the extra ATR buffer (0 for none)' },
      left: nullable({ type: 'number' }), right: nullable({ type: 'number', description: 'swing stops: bars each side that confirm the swing, else null' }), operand: nullable({ type: 'string', description: 'indicator stops: the operand, else null' }), operand_short: nullable({ type: 'string', description: 'indicator stops: the operand for shorts if it differs, else null' }) } },
    target: { type: 'object', additionalProperties: false, required: ['type', 'value', 'operand', 'operand_short'], properties: { type: { type: 'string', enum: [...TARGET_TYPES] },
      value: { type: 'number', description: 'pct as a fraction, an R multiple, or for measured_move the number of bars whose height is projected' }, operand: nullable({ type: 'string', description: 'level targets: the operand, else null' }), operand_short: nullable({ type: 'string', description: 'level targets: the operand for shorts if it differs, else null' }) } },
    session: nullable({ type: 'object', additionalProperties: false, required: ['tz', 'start', 'end', 'days'], properties: { tz: { type: 'string', enum: [...TZS] }, start: { type: 'string', description: 'HH:MM' }, end: { type: 'string', description: 'HH:MM' },
      days: { type: 'array', items: { type: 'number' }, description: '0 is Sunday. US stocks: [1,2,3,4,5]' } } }),
    flat_at_close: nullable({ type: 'boolean', description: 'true for day trades that must be out before the session ends' }),
    cooldown_bars: nullable({ type: 'number' }),
    trail: nullable({ type: 'object', additionalProperties: false, required: ['type', 'value'], properties: { type: { type: 'string', enum: [...TRAIL_TYPES] }, value: { type: 'number' } } }),
  },
} as const;
/** Turns a structured-output object (nulls for "not used") into a Spec (those keys absent). */
export function fromModel(o: any): Spec {
  const drop = (x: any) => { const y: any = {}; for (const [k, v] of Object.entries(x ?? {})) if (v !== null && v !== undefined) y[k] = v; return y; };
  return { ...drop(o), stop: drop(o?.stop), target: drop(o?.target) } as Spec;
}

const PRICE = ['close', 'open', 'high', 'low', 'volume'];
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/, mins = (x: string) => { const m = HHMM.exec(x); return m ? +m[1] * 60 + +m[2] : NaN; };

export function validate(s: Spec): string[] {
  const e: string[] = []; const ids = new Set<string>();
  if (!s.name?.trim()) e.push('name is empty');
  if (!TFS.includes(s.tf)) e.push(`timeframe ${s.tf} not supported`);
  if (!/^[A-Z0-9]{1,20}$/.test(s.symbol ?? '')) e.push(`symbol ${s.symbol} should look like SPY or BTCUSDT`);
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
    for (const o of [c.left, c.right]) { const err = operandError(o, s.indicators ?? [], s); if (err) e.push(err); }
  }
  if (s.session) {
    const a = mins(s.session.start), z = mins(s.session.end);
    if (!TZS.includes(s.session.tz)) e.push(`time zone ${s.session.tz} not supported (use ${TZS.join(', ')})`);
    if (isNaN(a) || isNaN(z)) e.push('session start and end must be HH:MM'); else if (!(a < z)) e.push('session start must be before its end (overnight sessions are not supported)');
    if (!Array.isArray(s.session.days) || !s.session.days.length || s.session.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) e.push('session days must be numbers 0 (Sunday) to 6');
    if (TF_MIN[s.tf] >= 1440) e.push('a session needs an intraday timeframe');
  }
  if (s.flat_at_close && !s.session) e.push('flat_at_close needs a session');
  if (s.cooldown_bars !== undefined && !(Number.isInteger(s.cooldown_bars) && s.cooldown_bars >= 0 && s.cooldown_bars <= 500)) e.push('cooldown_bars must be a whole number from 0 to 500');
  if (s.trail && (!TRAIL_TYPES.includes(s.trail.type) || !(s.trail.value > 0 && s.trail.value <= (s.trail.type === 'atr' ? 10 : 500)))) e.push('trail type or value out of range');
  if (s.stop && !STOP_TYPES.includes(s.stop.type)) e.push(`stop type ${s.stop.type} unknown`);
  if (s.target && !TARGET_TYPES.includes(s.target.type)) e.push(`target type ${s.target.type} unknown`);
  if (s.stop?.type === 'swing' || s.stop?.type === 'bar') {
    if (!(s.stop.value >= 0 && s.stop.value <= 5)) e.push('stop buffer should be 0 to 5 ATR');
    for (const k of ['left', 'right'] as const) if (s.stop[k] !== undefined && !(Number.isInteger(s.stop[k]) && s.stop[k]! >= 1 && s.stop[k]! <= 20)) e.push(`swing ${k} must be a whole number from 1 to 20`);
  }
  for (const [what, x, on] of [['stop', s.stop, s.stop?.type === 'indicator'], ['target', s.target, s.target?.type === 'level']] as const) {
    if (!on) continue;
    for (const o of [x.operand ?? '', ...(x.operand_short !== undefined ? [x.operand_short] : [])]) { const err = operandError(o, s.indicators ?? [], s); if (err) e.push(`${what}: ${err}`); }
  }
  if (s.target?.type === 'measured_move' && !(Number.isInteger(s.target.value) && s.target.value >= 2 && s.target.value <= 500)) e.push('measured_move needs a whole number of bars from 2 to 500');
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

const RE_VWAP = /^vwap(?:\.(upper|lower)([1-3]))?$/, RE_PREV = /^prev_day\.(high|low|close)$/, RE_OR = /^open_range\((\d+)\)\.(high|low)$/, RE_HL = /^(highest|lowest)\((\d+)\)$/, RE_HTF = /^htf\(([0-9a-z]+)\)\.(.+)$/;
function operandError(o: string, inds: Indicator[], s?: Spec): string | null {
  if (o == null || o === '') return 'empty operand';
  if (PRICE.includes(o) || Number.isFinite(Number(o))) return null;
  if (o.startsWith('pattern:')) return PATTERNS.includes(o.slice(8) as any) ? null : `unknown pattern ${o}`;
  if (RE_VWAP.test(o) || RE_PREV.test(o) || o === 'time') return s && TF_MIN[s.tf] >= 1440 && o !== 'prev_day.high' && o !== 'prev_day.low' && o !== 'prev_day.close' ? `"${o}" needs an intraday timeframe` : null;
  let m = RE_OR.exec(o);
  if (m) { if (!s?.session) return `"${o}" needs a session (the range starts at the session start)`; const n = +m[1], step = TF_MIN[s.tf];
    return n >= step && n <= 240 && n % step === 0 ? null : `open_range minutes must be a multiple of the bar size, up to 240`; }
  m = RE_HL.exec(o); if (m) return +m[2] >= 1 && +m[2] <= 500 ? null : `${m[1]} length out of range`;
  m = RE_HTF.exec(o);
  if (m) { const tf = m[1] as typeof TFS[number];
    if (!TFS.includes(tf) || (s && TF_MIN[tf] <= TF_MIN[s.tf])) return `htf(${m[1]}) must be a supported timeframe above the strategy's own`;
    if (PRICE.includes(m[2])) return null;
    const [id, f] = m[2].split('.'), ind = inds.find(i => i.id === id);
    if (!ind) return `operand "${o}": "${m[2]}" is not a price or a defined indicator`;
    return f && !FIELDS[ind.type].includes(f) ? `${ind.type} has no field "${f}" (use ${FIELDS[ind.type].join(', ')})` : null; }
  const [id, f] = o.split('.'); const ind = inds.find(i => i.id === id);
  if (!ind) return `operand "${o}" is not a price, number, pattern, built-in level or defined indicator`;
  if (f && !FIELDS[ind.type].includes(f)) return `${ind.type} has no field "${f}" (use ${FIELDS[ind.type].join(', ')})`;
  return null;
}

/** Wall-clock minute, calendar day and weekday of each bar in a time zone. */
const fmts = new Map<string, Intl.DateTimeFormat>();
export function clock(b: Bar[], tz: string) {
  let f = fmts.get(tz); if (!f) fmts.set(tz, f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23' }));
  const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const min: number[] = [], day: number[] = [], dow: number[] = [];
  for (const x of b) { const p: Record<string, string> = {}; for (const q of f.formatToParts(new Date(x.t))) p[q.type] = q.value;
    min.push(+p.hour * 60 + +p.minute); day.push(+p.year * 10000 + +p.month * 100 + +p.day); dow.push(DOW[p.weekday]); }
  return { min, day, dow };
}

function indicatorSeries(b: Bar[], s: Pick<Spec, 'indicators'>) {
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

/** Everything a condition can name. Version 2 operands are computed only when a rule uses them. */
function series(b: Bar[], s: Spec) {
  const out = indicatorSeries(b, s), n = b.length, NA = () => Array<number>(n).fill(NaN);
  const used = new Set<string>([...s.long_entry, ...s.short_entry, ...s.exit_long, ...s.exit_short].flatMap(c => [c.left, c.right]));
  for (const o of [s.stop.operand, s.stop.operand_short, s.target.operand, s.target.operand_short]) if (o) used.add(o);
  const tz = s.session?.tz ?? 'UTC', ck = clock(b, tz), start = s.session ? mins(s.session.start) : 0, end = s.session ? mins(s.session.end) : 1440;
  const inSes = ck.min.map(m => m >= start && m < end);
  const htf = new Map<string, { S: Record<string, number[]>; idx: number[] }>();
  for (const o of used) {
    if (out[o] || Number.isFinite(Number(o))) continue;
    let m: RegExpExecArray | null;
    if (o === 'time') out[o] = ck.min;
    else if (RE_VWAP.test(o)) {
      if (!out.vwap) { const v = NA(), sd = NA(); let pv = 0, pv2 = 0, vol = 0, d = -1;
        for (let i = 0; i < n; i++) { if (ck.day[i] !== d) { d = ck.day[i]; pv = pv2 = vol = 0; } if (!inSes[i]) continue;
          const tp = (b[i].h + b[i].l + b[i].c) / 3; pv += tp * b[i].v; pv2 += tp * tp * b[i].v; vol += b[i].v;
          if (vol > 0) { v[i] = pv / vol; sd[i] = Math.sqrt(Math.max(0, pv2 / vol - v[i] ** 2)); } }
        out.vwap = v; for (const k of [1, 2, 3]) { out[`vwap.upper${k}`] = v.map((x, i) => x + k * sd[i]); out[`vwap.lower${k}`] = v.map((x, i) => x - k * sd[i]); } }
    } else if (RE_PREV.test(o)) {
      if (!out['prev_day.high']) { const H = NA(), L = NA(), C = NA(); let d = -1, h = NaN, l = NaN, c = NaN, ph = NaN, pl = NaN, pc = NaN;
        for (let i = 0; i < n; i++) { if (ck.day[i] !== d) { d = ck.day[i]; ph = h; pl = l; pc = c; h = b[i].h; l = b[i].l; } else { h = Math.max(h, b[i].h); l = Math.min(l, b[i].l); } c = b[i].c; H[i] = ph; L[i] = pl; C[i] = pc; }
        out['prev_day.high'] = H; out['prev_day.low'] = L; out['prev_day.close'] = C; }
    } else if ((m = RE_OR.exec(o))) {
      const len = +m[1], hi = NA(), lo = NA(); let d = -1, h = NaN, l = NaN;
      for (let i = 0; i < n; i++) { if (ck.day[i] !== d) { d = ck.day[i]; h = l = NaN; } if (!inSes[i]) continue;
        if (ck.min[i] < start + len) { h = isNaN(h) ? b[i].h : Math.max(h, b[i].h); l = isNaN(l) ? b[i].l : Math.min(l, b[i].l); } else { hi[i] = h; lo[i] = l; } }   // known only once the range has closed
      out[`open_range(${len}).high`] = hi; out[`open_range(${len}).low`] = lo;
    } else if ((m = RE_HL.exec(o))) out[o] = shift(m[1] === 'highest' ? rollMax(out.high, +m[2]) : rollMin(out.low, +m[2]));
    else if ((m = RE_HTF.exec(o))) {
      let H = htf.get(m[1]); if (!H) { const r = resample(b, TF_MIN[m[1] as typeof TFS[number]] * 6e4); htf.set(m[1], H = { S: indicatorSeries(r.bars, s), idx: r.idx }); }
      const src = H.S[m[2]], idx = H.idx; out[o] = b.map((_, i) => (src && idx[i] >= 1 ? src[idx[i] - 1] : NaN));                                      // the last higher-timeframe bar that has closed
    }
  }
  return { S: out, ck, inSes, end };
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

const TRAILS: Record<Trail['type'], (v: number) => TrailSpec> = {
  atr: v => ({ mode: 'scalp', trigger: 0, distance: v, beyondEntry: false }), swing: v => ({ mode: 'candles', n: Math.round(v), beyondEntry: false }), ema: v => ({ mode: 'ma', maType: 'ema', period: Math.round(v), beyondEntry: false }) };

export function compile(s: Spec) {
  return (b: Bar[]): Sig => {
    const n = b.length, { S, ck, inSes, end } = series(b, s), a = atr(b, 14), step = TF_MIN[s.tf] ?? 0;
    const sig: Sig = { le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(NaN), target: Array(n).fill(NaN) };
    if (s.max_bars > 0) sig.maxBars = Math.round(s.max_bars);
    if (s.trail) sig.trail = TRAILS[s.trail.type](s.trail.value);
    const sw = s.stop.type === 'swing' ? swings(b, s.stop.left ?? 3, s.stop.right ?? 3) : null;
    const mm = s.target.type === 'measured_move' ? { hi: rollMax(S.high, s.target.value), lo: rollMin(S.low, s.target.value) } : null;
    const days = s.session ? new Set(s.session.days) : null;
    let quietUntil = -1;
    for (let i = 0; i < n; i++) {
      const c = b[i].c, last = !!s.flat_at_close && ck.min[i] + 2 * step >= end;                         // the session's last bar: too late to enter
      const open = !s.session || (inSes[i] && days!.has(ck.dow[i]) && !last), ok = open && i > quietUntil;
      const le = ok && s.direction !== 'short' && s.long_entry.length > 0 && s.long_entry.every(x => test(S, x, i));
      const se = ok && !le && s.direction !== 'long' && s.short_entry.length > 0 && s.short_entry.every(x => test(S, x, i));
      sig.le[i] = le; sig.se[i] = se;
      const flat = !!s.flat_at_close && (!inSes[i] || last);
      sig.lx[i] = flat || s.exit_long.some(x => test(S, x, i)); sig.sx[i] = flat || s.exit_short.some(x => test(S, x, i));
      if (le || se) {
        const side = le ? 1 : -1, buf = (s.stop.value || 0) * a[i];
        let stop = NaN;
        switch (s.stop.type) {
          case 'pct': stop = c - side * c * s.stop.value; break;
          case 'atr': stop = c - side * s.stop.value * a[i]; break;
          case 'swing': stop = (side === 1 ? sw!.lastSL[i] : sw!.lastSH[i]) - side * buf; break;
          case 'bar': stop = (side === 1 ? b[i].l : b[i].h) - side * buf; break;
          case 'indicator': stop = val(S, (side === -1 && s.stop.operand_short) || s.stop.operand!, i); break;
        }
        sig.stop[i] = Number.isFinite(stop) && (c - stop) * side > 0 ? stop : NaN;                       // NaN falls back to the engine's 2x ATR stop
        const d = Math.abs(c - sig.stop[i]);
        let tg = NaN;
        switch (s.target.type) {
          case 'pct': tg = c * (1 + side * s.target.value); break;
          case 'r': tg = Number.isFinite(d) ? c + side * s.target.value * d : NaN; break;
          case 'level': tg = val(S, (side === -1 && s.target.operand_short) || s.target.operand!, i); break;
          case 'measured_move': tg = c + side * (mm!.hi[i] - mm!.lo[i]); break;
        }
        sig.target[i] = Number.isFinite(tg) && (tg - c) * side > 0 ? tg : NaN;                           // a target on the wrong side of price is no target
        if (s.cooldown_bars) quietUntil = i + s.cooldown_bars;
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
  if (s.stop.type !== 'none' && s.stop.type !== 'indicator') k.push({ path: 'stop.value', label: s.stop.type === 'pct' ? 'stop loss (fraction, 0.1 = 10%)' : s.stop.type === 'atr' ? 'stop (x ATR)' : 'stop buffer (x ATR)', value: s.stop.value });
  if (s.target.type !== 'none' && s.target.type !== 'level') k.push({ path: 'target.value', label: s.target.type === 'pct' ? 'target (fraction)' : s.target.type === 'r' ? 'target (R)' : 'measured move (bars)', value: s.target.value });
  if (s.trail) k.push({ path: 'trail.value', label: s.trail.type === 'atr' ? 'trail (x ATR)' : s.trail.type === 'swing' ? 'trail (bars)' : 'trail (EMA length)', value: s.trail.value });
  if (s.cooldown_bars) k.push({ path: 'cooldown_bars', label: 'cooldown (bars)', value: s.cooldown_bars });
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
