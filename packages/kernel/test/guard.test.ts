import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkIntent, clampLimits, limitsFromEnv, effectiveLimits, DEFAULT_LIMITS, CEILINGS, MAX_NOTIONAL, LOOSEN_DELAY_MS,
  type Intent, type BookView, type GuardCtx, type Limits } from '../src/index';

const intent = (o: Partial<Intent> = {}): Intent => ({ id: 'i1', slotKey: 'slotA', symbol: 'SPY', assetClass: 'etf', side: 1, barT: 1, refPrice: 100, stop: 96, target: 110, riskFraction: 0.01, ...o });
const book = (o: Partial<BookView> = {}): BookView => ({ equity: 10000, peak: 10000, positions: [], pendingSlots: [], dayPnl: 0, dayStartEquity: 10000, weekPnl: 0, weekStartEquity: 10000, drawdownPaused: false, ...o });
const ctx = (o: Partial<GuardCtx> = {}): GuardCtx => ({ halts: { readable: true, kill: false, andon: false }, slot: { status: 'paper', role: 'primary', weight: 0.25, barsSinceStop: null },
  dataStatus: 'ok', correlatedSymbols: [], lotStep: 1, minQty: 1, minRiskShareAfterCap: 0.5, ...o });
const pos = (o: any = {}) => ({ slotKey: 'slotB', symbol: 'QQQ', assetClass: 'etf' as const, side: 1 as const, qty: 10, entry: 100, stop: 90, riskUsd: 100, ...o });
const failed = (r: ReturnType<typeof checkIntent>) => r.rules.filter(x => !x.pass).map(x => x.id);
const L = DEFAULT_LIMITS;

test('a clean intent passes every rule and is sized by risk: equity x risk / stop distance', () => {
  const r = checkIntent(intent(), book(), L, ctx());
  assert.deepEqual(failed(r), []); assert.equal(r.ok, true);
  assert.equal(r.qty, 25); assert.equal(r.riskUsd, 100);                    // 10000 * 1% / 4 = 25 shares, 2500 notional = the 25% weight cap exactly
  assert.equal(r.intent!.qty, 25); assert.equal(r.rules.length, 13);         // every rule is evaluated every time
  const s = checkIntent(intent({ side: -1, stop: 104 }), book(), L, ctx()); assert.equal(s.ok, true); assert.equal(s.qty, 25);
});

test('halted: kill switch, andon cord, or unreadable halt state', () => {
  for (const halts of [{ readable: true, kill: true, andon: false }, { readable: true, kill: false, andon: true }, { readable: false, kill: false, andon: false }]) {
    const r = checkIntent(intent(), book(), L, ctx({ halts })); assert.deepEqual(failed(r), ['halted']); assert.equal(r.qty, 0); assert.equal(r.intent, null);
  }
});

test('book-paused: daily loss, weekly loss, drawdown, and the boundaries', () => {
  assert.deepEqual(failed(checkIntent(intent(), book({ dayPnl: -200 }), L, ctx())), ['book-paused']);      // exactly -2% pauses
  assert.deepEqual(failed(checkIntent(intent(), book({ dayPnl: -199.99 }), L, ctx())), []);
  assert.deepEqual(failed(checkIntent(intent(), book({ weekPnl: -500 }), L, ctx())), ['book-paused']);
  assert.deepEqual(failed(checkIntent(intent(), book({ weekPnl: -499 }), L, ctx())), []);
  assert.deepEqual(failed(checkIntent(intent(), book({ equity: 8500, peak: 10000 }), L, ctx())), ['book-paused']);
  assert.deepEqual(failed(checkIntent(intent(), book({ equity: 8501, peak: 10000 }), L, ctx())), []);
  assert.deepEqual(failed(checkIntent(intent(), book({ drawdownPaused: true }), L, ctx())), ['book-paused']);
  assert.deepEqual(failed(checkIntent(intent(), book({ dayPnl: 500, weekPnl: 900 }), L, ctx())), []);       // gains never pause
});

test('slot-paused: paused, retired or shadow slots create no orders', () => {
  for (const status of ['paused_drift', 'paused_data', 'retired']) assert.deepEqual(failed(checkIntent(intent(), book(), L, ctx({ slot: { status, role: 'primary', weight: 0.25, barsSinceStop: null } }))), ['slot-paused']);
  const sh = checkIntent(intent(), book(), L, ctx({ slot: { status: 'paper', role: 'shadow', weight: 0, barsSinceStop: null } }));
  assert.ok(failed(sh).includes('slot-paused'));
});

test('data-blocked: only a blocked verdict stops entries (S12)', () => {
  assert.deepEqual(failed(checkIntent(intent(), book(), L, ctx({ dataStatus: 'blocked' }))), ['data-blocked']);
  assert.deepEqual(failed(checkIntent(intent(), book(), L, ctx({ dataStatus: 'warn' }))), []);
});

test('stop-required: missing, zero distance or wrong side (S6). The guard never invents a stop', () => {
  for (const o of [{ stop: NaN }, { stop: 100 }, { stop: 101 }, { stop: 0 }, { stop: -5 }, { side: -1 as const, stop: 96 }, { side: -1 as const, stop: 100 }, { refPrice: NaN }]) {
    const r = checkIntent(intent(o), book(), L, ctx()); assert.ok(failed(r).includes('stop-required'), JSON.stringify(o)); assert.equal(r.qty, 0);
  }
});

test('max-open, max-per-symbol, one-per-slot', () => {
  const five = Array.from({ length: 5 }, (_, i) => pos({ slotKey: `s${i}`, symbol: `X${i}`, assetClass: 'stock', riskUsd: 10 }));
  assert.deepEqual(failed(checkIntent(intent(), book({ positions: five }), L, ctx())), ['max-open']);
  assert.deepEqual(failed(checkIntent(intent(), book({ positions: five.slice(0, 4) }), L, ctx())), []);
  assert.deepEqual(failed(checkIntent(intent(), book({ positions: [pos({ symbol: 'SPY', riskUsd: 10 })] }), L, ctx())), ['max-per-symbol']);
  assert.deepEqual(failed(checkIntent(intent(), book({ positions: [pos({ slotKey: 'slotA', symbol: 'IWM', riskUsd: 10 })] }), L, ctx())), ['one-per-slot']);
  assert.deepEqual(failed(checkIntent(intent(), book({ pendingSlots: ['slotA'] }), L, ctx())), ['one-per-slot']);
});

test('cooldown: no re-entry within the cool-down after a stop-out', () => {
  const c = (b: number | null) => ctx({ slot: { status: 'paper', role: 'primary', weight: 0.25, barsSinceStop: b } });
  assert.deepEqual(failed(checkIntent(intent(), book(), L, c(0))), ['cooldown']);
  assert.deepEqual(failed(checkIntent(intent(), book(), L, c(1))), []);
  assert.deepEqual(failed(checkIntent(intent(), book(), { ...L, cooldownBars: 3 }, c(2))), ['cooldown']);
});

test('class-exposure and correlated-risk caps', () => {
  // class cap = 60% x 5 positions x 1% x 10000 = 300 of open risk in one asset class
  const two = [pos({ slotKey: 's1', symbol: 'A', riskUsd: 100 }), pos({ slotKey: 's2', symbol: 'B', riskUsd: 100 })];
  assert.deepEqual(failed(checkIntent(intent(), book({ positions: two }), L, ctx())), []);                    // 200 + 100 = 300: at the cap
  assert.deepEqual(failed(checkIntent(intent(), book({ positions: [...two, pos({ slotKey: 's3', symbol: 'C', riskUsd: 1 })] }), L, ctx())), ['class-exposure']);
  assert.deepEqual(failed(checkIntent(intent(), book({ positions: [...two, pos({ slotKey: 's3', symbol: 'C', riskUsd: 100, assetClass: 'crypto' })] }), L, ctx())), []);
  // correlated cap = 2% of equity = 200 across this symbol's correlated group
  assert.deepEqual(failed(checkIntent(intent(), book({ positions: [pos({ riskUsd: 100 })] }), L, ctx({ correlatedSymbols: ['QQQ'] }))), []);
  assert.deepEqual(failed(checkIntent(intent(), book({ positions: [pos({ riskUsd: 101 })] }), L, ctx({ correlatedSymbols: ['QQQ'] }))), ['correlated-risk']);
  assert.deepEqual(failed(checkIntent(intent(), book({ positions: [pos({ riskUsd: 101 })] }), L, ctx({ correlatedSymbols: [] }))), []);
});

test('min-size, lot rounding (down), and the no-leverage notional cap (S7)', () => {
  assert.equal(MAX_NOTIONAL, 1);
  const tiny = checkIntent(intent({ refPrice: 5000, stop: 4000 }), book({ equity: 500 }), L, ctx());            // want 0.005 shares, lot 1
  assert.ok(failed(tiny).includes('min-size')); assert.equal(tiny.qty, 0);
  const frac = checkIntent(intent({ refPrice: 100, stop: 97 }), book(), L, ctx());                              // 33.33 -> 25 by the cap
  assert.equal(frac.qty, 25); assert.equal(frac.riskUsd, 75); assert.equal(frac.ok, true);
  const rounded = checkIntent(intent({ refPrice: 100, stop: 93 }), book(), L, ctx()); assert.equal(rounded.qty, 14); // 14.28 rounds down, never up
  const tight = checkIntent(intent({ refPrice: 100, stop: 99.5 }), book(), L, ctx());                           // want 200 shares = 2x equity
  assert.deepEqual(failed(tight), ['notional']);                                                                // cap leaves 12.5% of the intended risk: blocked
  const half = checkIntent(intent({ refPrice: 100, stop: 98 }), book(), L, ctx());                              // cap leaves exactly half: allowed
  assert.equal(half.ok, true); assert.equal(half.qty, 25); assert.ok(half.qty * 100 <= 10000 * 0.25);
  for (const stop of [99.9, 99, 95, 80, 50]) { const r = checkIntent(intent({ stop }), book(), L, ctx({ slot: { status: 'paper', role: 'primary', weight: 5, barsSinceStop: null } })); assert.ok(r.qty * 100 <= 10000 * CEILINGS.maxWeightPct + 1e-9); }
});

test('reconcile is only checked for live stages', () => {
  assert.deepEqual(failed(checkIntent(intent(), book(), L, ctx({ live: { reconciled: false } }))), ['reconcile']);
  assert.equal(checkIntent(intent(), book(), L, ctx({ live: { reconciled: true } })).rules.length, 14);
});

test('risk fraction can be scaled down but never above the limit', () => {
  assert.equal(checkIntent(intent({ riskFraction: 0.005, stop: 90 }), book(), L, ctx()).riskUsd, 50);
  assert.equal(checkIntent(intent({ riskFraction: 0.5, stop: 90 }), book(), L, ctx()).riskUsd, 100);
  assert.equal(checkIntent(intent({ riskFraction: -1, stop: 90 }), book(), L, ctx()).ok, false);
});

test('S8: ceilings cannot be raised by configuration; malformed values fall back to defaults', () => {
  const wild = clampLimits({ riskPct: 0.5, maxOpen: 999, maxPerSymbol: 50, dailyLossPct: 0.9, weeklyLossPct: 0.9, maxDrawdownPct: 0.9, maxWeightPct: 1, maxClassPct: 5, maxCorrRiskPct: 1, cooldownBars: 0 });
  for (const k of Object.keys(CEILINGS) as (keyof Limits)[]) if (k !== 'cooldownBars') assert.equal(wild[k], CEILINGS[k], k);
  assert.deepEqual(clampLimits({ riskPct: 'abc' as any, maxOpen: NaN }), DEFAULT_LIMITS);
  assert.deepEqual(limitsFromEnv({}), DEFAULT_LIMITS);
  const env = limitsFromEnv({ APEX_RISK_PCT: '0.5', APEX_DAILY_LOSS_PCT: '-1', APEX_MAX_OPEN: '3.9', APEX_MAX_WEIGHT_PCT: '90' });
  assert.equal(env.riskPct, 0.005); assert.equal(env.dailyLossPct, 0.01); assert.equal(env.maxOpen, 3); assert.equal(env.maxWeightPct, 0.4);
  assert.equal(checkIntent(intent({ riskFraction: 1, stop: 50 }), book(), { ...L, riskPct: 0.9 }, ctx()).riskUsd, 200);   // 2% ceiling even if a caller passes 90%
});

test('K4: tighter applies at once, looser waits 24 hours and must be requested unchanged', () => {
  const t0 = 1_000_000_000, first = effectiveLimits(L, null, t0); assert.deepEqual(first.limits, L);
  const tight = effectiveLimits({ ...L, riskPct: 0.005, cooldownBars: 3 }, first, t0 + 1); assert.equal(tight.limits.riskPct, 0.005); assert.equal(tight.limits.cooldownBars, 3); assert.deepEqual(tight.pending, {});
  const loose1 = effectiveLimits({ ...L, riskPct: 0.02, cooldownBars: 3 }, tight, t0 + 2); assert.equal(loose1.limits.riskPct, 0.005); assert.deepEqual(loose1.pending.riskPct, { value: 0.02, since: t0 + 2 });
  const loose2 = effectiveLimits({ ...L, riskPct: 0.02, cooldownBars: 3 }, loose1, t0 + 2 + LOOSEN_DELAY_MS - 1); assert.equal(loose2.limits.riskPct, 0.005);
  const loose3 = effectiveLimits({ ...L, riskPct: 0.02, cooldownBars: 3 }, loose2, t0 + 2 + LOOSEN_DELAY_MS); assert.equal(loose3.limits.riskPct, 0.02); assert.deepEqual(loose3.pending, {});
  const changed = effectiveLimits({ ...L, riskPct: 0.015, cooldownBars: 3 }, loose2, t0 + 2 + LOOSEN_DELAY_MS); assert.equal(changed.limits.riskPct, 0.005);   // a different looser value restarts the clock
  const cool = effectiveLimits({ ...L, cooldownBars: 0 }, tight, t0 + 5); assert.equal(cool.limits.cooldownBars, 3); assert.ok(cool.pending.cooldownBars);     // a shorter cool-down is looser
});

test('shared vectors: the same cases the Python paper-exchange guard is checked against', () => {
  const vectors = JSON.parse(readFileSync(join(__dirname, 'guard-vectors.json'), 'utf8')) as { name: string; intent: any; book: any; ctx: any; ok: boolean; qty: number; failed: string[] }[];
  assert.ok(vectors.length >= 8);
  for (const v of vectors) { const r = checkIntent(intent(v.intent), book(v.book), L, ctx(v.ctx)); assert.equal(r.ok, v.ok, v.name); assert.equal(r.qty, v.qty, v.name); assert.deepEqual(failed(r), v.failed, v.name); }
});
