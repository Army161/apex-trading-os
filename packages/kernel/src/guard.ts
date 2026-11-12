// Risk guard (docs/design/04 s11, 02 s5). Red path. Pure: no clock, no network, no environment.
// Every order intent passes through checkIntent, and position size is computed nowhere else (S5).
// Every rule is evaluated every time, so a report can show every reason an intent was blocked.

export type Side = 1 | -1;
export type AssetClass = 'stock' | 'etf' | 'crypto' | 'fx' | 'commodity' | 'rate';
export type Intent = { id: string; slotKey: string; symbol: string; assetClass: AssetClass; side: Side; barT: number; refPrice: number; stop: number; target: number | null; riskFraction: number };
export type OpenPosition = { slotKey: string; symbol: string; assetClass: AssetClass; side: Side; qty: number; entry: number; stop: number; riskUsd: number };
export type BookView = {
  equity: number; peak: number; positions: OpenPosition[]; pendingSlots: string[];
  dayPnl: number; dayStartEquity: number; weekPnl: number; weekStartEquity: number;
  drawdownPaused: boolean;                         // set when the drawdown limit was hit; only Jeremy clears it
};
export type Limits = { riskPct: number; maxOpen: number; maxPerSymbol: number; dailyLossPct: number; weeklyLossPct: number; maxDrawdownPct: number;
  maxWeightPct: number; maxClassPct: number; maxCorrRiskPct: number; cooldownBars: number };
export type Halts = { readable: boolean; kill: boolean; andon: boolean };
export type SlotView = { status: string; role: 'primary' | 'shadow'; weight: number; barsSinceStop: number | null };
export type GuardCtx = { halts: Halts; slot: SlotView; dataStatus: 'ok' | 'warn' | 'blocked'; correlatedSymbols: string[]; lotStep: number; minQty: number;
  minRiskShareAfterCap: number; live?: { reconciled: boolean } };
export type RuleResult = { id: string; pass: boolean; detail: string };

declare const guarded: unique symbol;
/** Only checkIntent can make one. A broker accepts nothing else. */
export type GuardedIntent = Intent & { qty: number; riskUsd: number; readonly [guarded]: true };
export type GuardResult = { ok: boolean; qty: number; riskUsd: number; rules: RuleResult[]; intent: GuardedIntent | null };

/** S7: no leverage. A constant, not configuration. */
export const MAX_NOTIONAL = 1;
export const DEFAULT_LIMITS: Limits = Object.freeze({ riskPct: 0.01, maxOpen: 5, maxPerSymbol: 1, dailyLossPct: 0.02, weeklyLossPct: 0.05, maxDrawdownPct: 0.15,
  maxWeightPct: 0.25, maxClassPct: 0.6, maxCorrRiskPct: 0.02, cooldownBars: 1 });
/** S8: hard ceilings. Configuration is clamped to these and cannot raise them. */
export const CEILINGS: Limits = Object.freeze({ riskPct: 0.02, maxOpen: 20, maxPerSymbol: 3, dailyLossPct: 0.05, weeklyLossPct: 0.10, maxDrawdownPct: 0.25,
  maxWeightPct: 0.40, maxClassPct: 1, maxCorrRiskPct: 0.04, cooldownBars: Infinity });
const FLOORS: Limits = { riskPct: 0.0001, maxOpen: 1, maxPerSymbol: 1, dailyLossPct: 0.001, weeklyLossPct: 0.001, maxDrawdownPct: 0.01, maxWeightPct: 0.01, maxClassPct: 0.05, maxCorrRiskPct: 0.001, cooldownBars: 0 };
const INTEGER: (keyof Limits)[] = ['maxOpen', 'maxPerSymbol', 'cooldownBars'];
export const LIMIT_KEYS = Object.keys(DEFAULT_LIMITS) as (keyof Limits)[];
/** For every limit except the cool-down, a larger number is looser. A longer cool-down is tighter. */
export const looser = (k: keyof Limits, a: number, b: number) => (k === 'cooldownBars' ? a < b : a > b);

export function clampLimits(raw: Partial<Record<keyof Limits, unknown>>): Limits {
  const out = { ...DEFAULT_LIMITS };
  for (const k of LIMIT_KEYS) {
    let v = Number(raw[k]); if (raw[k] === undefined || raw[k] === null || raw[k] === '' || !Number.isFinite(v)) continue;   // malformed: keep the default
    if (INTEGER.includes(k)) v = Math.floor(v);
    out[k] = Math.min(CEILINGS[k], Math.max(FLOORS[k], v));
  }
  return out;
}
const ENV: Record<keyof Limits, [string, number]> = { riskPct: ['APEX_RISK_PCT', 100], maxOpen: ['APEX_MAX_OPEN', 1], maxPerSymbol: ['APEX_MAX_PER_SYMBOL', 1],
  dailyLossPct: ['APEX_DAILY_LOSS_PCT', 100], weeklyLossPct: ['APEX_WEEKLY_LOSS_PCT', 100], maxDrawdownPct: ['APEX_MAX_DRAWDOWN_PCT', 100],
  maxWeightPct: ['APEX_MAX_WEIGHT_PCT', 100], maxClassPct: ['APEX_MAX_CLASS_PCT', 100], maxCorrRiskPct: ['APEX_MAX_CORR_RISK_PCT', 100], cooldownBars: ['APEX_COOLDOWN_BARS', 1] };
/** Percent variables are written as percents (APEX_RISK_PCT=1 means 1%). A minus sign on a loss limit is accepted and ignored. */
export function limitsFromEnv(env: Record<string, string | undefined>): Limits {
  const raw: Partial<Record<keyof Limits, unknown>> = {};
  for (const k of LIMIT_KEYS) { const [name, div] = ENV[k], s = env[name]; if (s !== undefined && s.trim() !== '' && Number.isFinite(Number(s))) raw[k] = Math.abs(Number(s)) / div; }
  return clampLimits(raw);
}

export type LimitsSnapshot = { limits: Limits; pending: Partial<Record<keyof Limits, { value: number; since: number }>> };
export const LOOSEN_DELAY_MS = 24 * 3600e3;
/**
 * Decision K4. A tighter value applies at once. A looser one is only adopted after it has been requested, unchanged, for 24 hours.
 * `prev` is the snapshot from the last run (null on the very first run, when the requested values are simply adopted).
 */
export function effectiveLimits(requested: Limits, prev: LimitsSnapshot | null, now: number): LimitsSnapshot {
  if (!prev) return { limits: { ...requested }, pending: {} };
  const limits = { ...prev.limits }, pending: LimitsSnapshot['pending'] = {};
  for (const k of LIMIT_KEYS) {
    const want = requested[k], have = prev.limits[k];
    if (!looser(k, want, have)) { limits[k] = want; continue; }
    const p = prev.pending[k], since = p && p.value === want ? p.since : now;
    if (now - since >= LOOSEN_DELAY_MS) limits[k] = want; else pending[k] = { value: want, since };
  }
  return { limits, pending };
}

const PAUSED = ['paused_drift', 'paused_data', 'retired'];
/** Round down to the lot step, and strip binary noise so 0.659576 is not stored as 0.6595759999999999. Never rounds up. */
const floorTo = (x: number, step: number) => { if (!(step > 0) || !Number.isFinite(x)) return 0; const dec = Math.max(0, Math.ceil(-Math.log10(step))), q = +(Math.floor(x / step + 1e-9) * step).toFixed(dec); return q > x + step * 1e-6 ? +(q - step).toFixed(dec) : q; };

export function checkIntent(i: Intent, book: BookView, limits: Limits, ctx: GuardCtx): GuardResult {
  const L = clampLimits(limits), rules: RuleResult[] = [];
  const rule = (id: string, pass: boolean, detail: string) => rules.push({ id, pass, detail });

  rule('halted', ctx.halts.readable && !ctx.halts.kill && !ctx.halts.andon,
    !ctx.halts.readable ? 'halt state unreadable, treated as halted' : ctx.halts.kill ? 'kill switch is on' : ctx.halts.andon ? 'andon cord is pulled' : 'no halt');

  const dayHit = book.dayPnl <= -L.dailyLossPct * book.dayStartEquity, weekHit = book.weekPnl <= -L.weeklyLossPct * book.weekStartEquity;
  const ddHit = book.drawdownPaused || book.equity <= book.peak * (1 - L.maxDrawdownPct);
  rule('book-paused', !dayHit && !weekHit && !ddHit, dayHit ? 'daily loss limit reached' : weekHit ? 'weekly loss limit reached' : ddHit ? 'drawdown limit reached' : 'inside loss limits');

  const slotOk = !PAUSED.includes(ctx.slot.status) && ctx.slot.role === 'primary';
  rule('slot-paused', slotOk, slotOk ? 'slot is active' : ctx.slot.role !== 'primary' ? 'slot is a shadow' : `slot is ${ctx.slot.status}`);
  rule('data-blocked', ctx.dataStatus !== 'blocked', ctx.dataStatus === 'blocked' ? 'data firewall blocked this symbol' : `data is ${ctx.dataStatus}`);

  const dist = Math.abs(i.refPrice - i.stop);
  const stopOk = Number.isFinite(i.stop) && Number.isFinite(i.refPrice) && i.refPrice > 0 && i.stop > 0 && dist > 0 && (i.side === 1 ? i.stop < i.refPrice : i.stop > i.refPrice);
  rule('stop-required', stopOk, stopOk ? 'hard stop on the correct side' : 'no usable stop: missing, zero distance or on the wrong side');

  rule('max-open', book.positions.length < L.maxOpen, `${book.positions.length} open of ${L.maxOpen}`);
  const sameSym = book.positions.filter(p => p.symbol === i.symbol).length;
  rule('max-per-symbol', sameSym < L.maxPerSymbol, `${sameSym} open on ${i.symbol} of ${L.maxPerSymbol}`);
  const busy = book.positions.some(p => p.slotKey === i.slotKey) || book.pendingSlots.includes(i.slotKey);
  rule('one-per-slot', !busy, busy ? 'slot already has a position or a pending intent' : 'slot is free');
  const cool = ctx.slot.barsSinceStop !== null && ctx.slot.barsSinceStop < L.cooldownBars;
  rule('cooldown', !cool, cool ? `stopped out ${ctx.slot.barsSinceStop} bars ago, cool-down is ${L.cooldownBars}` : 'no cool-down');

  // Size. The only place a quantity is computed.
  const riskFraction = Math.min(Math.max(0, Number.isFinite(i.riskFraction) ? i.riskFraction : 0), L.riskPct);
  const weight = Math.min(Math.max(0, ctx.slot.weight), L.maxWeightPct);
  const want = stopOk && book.equity > 0 ? (book.equity * riskFraction) / dist : 0;
  const cap = stopOk && book.equity > 0 ? (book.equity * weight * MAX_NOTIONAL) / i.refPrice : 0;
  const qty = floorTo(Math.min(want, cap), ctx.lotStep), riskUsd = qty * (stopOk ? dist : 0);
  const intended = book.equity * riskFraction;

  const classRisk = book.positions.filter(p => p.assetClass === i.assetClass).reduce((s, p) => s + p.riskUsd, 0) + riskUsd;
  const classCap = L.maxClassPct * L.maxOpen * L.riskPct * book.equity;
  rule('class-exposure', classRisk <= classCap + 1e-9, `${i.assetClass} open risk ${classRisk.toFixed(2)} of ${classCap.toFixed(2)} allowed`);
  const corrRisk = book.positions.filter(p => p.symbol === i.symbol || ctx.correlatedSymbols.includes(p.symbol)).reduce((s, p) => s + p.riskUsd, 0) + riskUsd;
  const corrCap = L.maxCorrRiskPct * book.equity;
  rule('correlated-risk', corrRisk <= corrCap + 1e-9, `correlated open risk ${corrRisk.toFixed(2)} of ${corrCap.toFixed(2)} allowed`);
  rule('min-size', qty > 0 && qty >= ctx.minQty, qty > 0 && qty >= ctx.minQty ? `quantity ${qty}` : 'quantity rounds to zero or is below the venue minimum');
  const capped = want > cap, tooSmall = capped && intended > 0 && riskUsd < ctx.minRiskShareAfterCap * intended;
  rule('notional', !tooSmall, !capped ? 'inside the notional cap' : tooSmall ? `no-leverage cap leaves ${(100 * riskUsd / intended).toFixed(0)}% of the intended risk; blocked rather than taking an odd size` : `capped at equity x weight (${(100 * riskUsd / intended).toFixed(0)}% of intended risk)`);
  if (ctx.live) rule('reconcile', ctx.live.reconciled, ctx.live.reconciled ? 'broker and book agree' : 'broker and book disagree');

  const ok = rules.every(r => r.pass);
  return { ok, qty: ok ? qty : 0, riskUsd: ok ? riskUsd : 0, rules, intent: ok ? ({ ...i, riskFraction, qty, riskUsd } as GuardedIntent) : null };
}
