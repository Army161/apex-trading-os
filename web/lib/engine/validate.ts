// Honest-validation suite (archive/chat/48 golden cross vs AI, chat/49 Kronos on gold, chat/46 three AI bots).
// A backtest only counts as "has an edge" when it survives these checks. Pure functions: no network, no keys.
import { Bar, Sig, Trade, backtest } from './core';

export const MIN_TRADES = 50;
type Opts = { capital?: number; risk?: number; fee?: number; slip?: number };

/** Deterministic PRNG so every run of a check gives the same answer (Park-Miller). */
export const rng = (seed = 7) => { let s = Math.max(1, Math.floor(seed) % 2147483647); return () => (s = (s * 16807) % 2147483647) / 2147483647; };

/** "Too few trades to conclude" flag: under 50 trades a backtest is a story, not evidence. */
export function sampleCheck(trades: number, min = MIN_TRADES) {
  return trades >= min ? { ok: true, why: `${trades} trades: enough to read` } : { ok: false, why: `only ${trades} trades (need ${min}): too few trades to conclude` };
}

/** Price moves captured vs costs paid. Gross = what the moves were worth; costs = fees + slippage the backtest charged. */
export function costBreakdown(trades: Trade[], fee = 0.001) {
  let gross = 0, fees = 0;
  for (const t of trades) { const g = (t.exit - t.entry) * t.qty * t.side; gross += g; fees += g - t.pnl; }
  const net = gross - fees;
  return { gross, fees, net, feeShare: gross > 0 ? fees / gross : fees > 0 ? Infinity : 0, perTrade: trades.length ? fees / trades.length : 0,
    verdict: gross <= 0 ? 'the moves themselves lost money' : fees >= gross ? 'costs ate every dollar the moves made' : fees > 0.5 * gross ? 'costs ate over half the edge' : 'costs are a small share', feeRate: fee };
}

/** Monkey test: random traders with the same number of trades, the same holding times, same sides and same costs.
 *  Returns the share of monkeys the strategy beat. Below 95% it is not an edge, whatever the return says. */
export function monkeyTest(b: Bar[], trades: Trade[], o: Opts & { runs?: number; seed?: number; need?: number } = {}) {
  const runs = o.runs ?? 200, need = o.need ?? 0.95, fee = o.fee ?? 0.001, slip = o.slip ?? 0.0005, cap = o.capital ?? 10000;
  const real = trades.reduce((x, t) => x + t.pnl, 0) / cap;
  if (!trades.length || b.length < 3) return { beat: 0, pass: false, real, monkeys: [] as number[], why: 'no trades to compare' };
  const r = rng(o.seed ?? 11), holds = trades.map(t => Math.max(1, t.bars)), sides = trades.map(t => t.side), out: number[] = [];
  for (let k = 0; k < runs; k++) {
    let eq = cap;
    for (let j = 0; j < holds.length; j++) {
      const h = Math.min(holds[j], b.length - 2), i = 1 + Math.floor(r() * (b.length - 1 - h)), e = i + h - 1;
      const en = b[i].o * (1 + slip * sides[j]), ex = b[Math.min(e + 1, b.length - 1)].o * (1 - slip * sides[j]);
      const ret = sides[j] * (ex / en - 1) - fee * (1 + ex / en);
      eq *= 1 + ret * (trades[j].qty * trades[j].entry / cap > 1 ? 1 : trades[j].qty * trades[j].entry / cap);
    }
    out.push(eq / cap - 1);
  }
  const beat = out.filter(x => real > x).length / runs;
  return { beat, pass: beat >= need, real, monkeys: out, why: `beat ${Math.round(beat * 100)} of 100 random traders (need ${Math.round(need * 100)})` };
}

/** Lock away the last `months` as untouched test data. Tune only on `tune`; look at `test` once. */
export function holdout(b: Bar[], months = 18) {
  if (!b.length) return { tune: b, test: b, cut: 0 };
  const cut = b[b.length - 1].t - months * 30.44 * 864e5;
  const k = b.findIndex(x => x.t >= cut);
  return k <= 0 ? { tune: [] as Bar[], test: b, cut } : { tune: b.slice(0, k), test: b.slice(k), cut };
}

/** Neighbour-settings robustness: if nudging the numbers a little breaks it, it was fitted to the past. */
export function neighbors<P>(b: Bar[], build: (p: P) => (b: Bar[]) => Sig, grid: P[], o: Opts = {}) {
  const rows = grid.map(p => ({ p, m: backtest(b, build(p)(b), o).metrics }));
  const pos = rows.filter(r => r.m.totalReturn > 0).length;
  return { rows, positive: pos, of: rows.length, pass: rows.length > 0 && pos / rows.length >= 0.8, why: `${pos} of ${rows.length} nearby settings made money` };
}

/** Seed stability for any model with randomness: same data, same rule, only the seed changes. A wide spread = luck. */
export function seedSpread(returns: number[], maxSpread = 0.15) {
  if (!returns.length) return { pass: false, lo: 0, hi: 0, spread: 0, why: 'no runs' };
  const lo = Math.min(...returns), hi = Math.max(...returns), spread = hi - lo, signFlip = lo < 0 && hi > 0;
  const pass = spread <= maxSpread && !signFlip;
  return { pass, lo, hi, spread, why: pass ? `seeds agree (${(lo * 100).toFixed(1)}% to ${(hi * 100).toFixed(1)}%)` : `results swing ${(lo * 100).toFixed(1)}% to ${(hi * 100).toFixed(1)}% on the seed alone: treat the best run as luck` };
}

/** Baseline every forecaster must beat: "next price = last price". Returns error ratio (model / lazy); above 1 = worse than lazy. */
export function lazyForecastCheck(actual: number[], forecast: number[], last: number[]) {
  const n = Math.min(actual.length, forecast.length, last.length);
  if (!n) return { ratio: NaN, pass: false, why: 'no forecasts' };
  let m = 0, z = 0, hit = 0, up = 0;
  for (let i = 0; i < n; i++) { m += Math.abs(actual[i] - forecast[i]); z += Math.abs(actual[i] - last[i]); hit += Math.sign(forecast[i] - last[i]) === Math.sign(actual[i] - last[i]) ? 1 : 0; up += actual[i] > last[i] ? 1 : 0; }
  const ratio = z > 0 ? m / z : m > 0 ? Infinity : 1, dir = hit / n, alwaysUp = up / n;
  return { ratio, direction: dir, alwaysUp, pass: ratio < 1 && dir > Math.max(alwaysUp, 1 - alwaysUp),
    why: `errors ${ratio < 1 ? (1 - ratio) * 100 | 0 : (ratio - 1) * 100 | 0}% ${ratio < 1 ? 'smaller' : 'bigger'} than the lazy forecast; direction right ${(dir * 100).toFixed(0)}% vs ${(Math.max(alwaysUp, 1 - alwaysUp) * 100).toFixed(0)}% for always guessing the common side` };
}

/** Shift every signal by k bars (decision-time stress): a real edge should not vanish when you act one bar later. */
export function shiftSig(s: Sig, k = 1): Sig {
  const sh = <T,>(a: T[], fill: T) => a.map((_, i) => (i - k >= 0 ? a[i - k] : fill));
  return { ...s, le: sh(s.le, false), se: sh(s.se, false), lx: sh(s.lx, false), sx: sh(s.sx, false), stop: sh(s.stop, NaN), target: sh(s.target, NaN) };
}

export type Check = { name: string; pass: boolean; why: string };
/**
 * Stress suite: up to 8 checks. `nudged` = the same strategy with its threshold moved slightly (caller builds it).
 * `seeds` = returns from re-running a random model with other seeds (omit for rule-based strategies: it passes by construction).
 */
export function stressSuite(b: Bar[], build: (b: Bar[]) => Sig, o: Opts & { nudged?: ((b: Bar[]) => Sig)[]; seeds?: number[]; holdoutMonths?: number } = {}) {
  const fee = o.fee ?? 0.001, base = backtest(b, build(b), o), m = base.metrics, checks: Check[] = [];
  const sc = sampleCheck(m.trades); checks.push({ name: 'enough trades', pass: sc.ok, why: sc.why });
  const mk = monkeyTest(b, base.trades, o); checks.push({ name: 'monkey test', pass: mk.pass, why: mk.why });
  const h = holdout(b, o.holdoutMonths ?? 18);
  if (h.test.length > 50) { const t = backtest(h.test, build(h.test), o).metrics; checks.push({ name: 'locked test window', pass: t.totalReturn > 0, why: `last ${o.holdoutMonths ?? 18} months: ${(t.totalReturn * 100).toFixed(1)}%` }); }
  const s1 = backtest(b, shiftSig(build(b), 1), o).metrics; checks.push({ name: 'act one bar later', pass: s1.totalReturn > 0, why: `${(s1.totalReturn * 100).toFixed(1)}% when every decision is one bar late` });
  const c2 = backtest(b, build(b), { ...o, fee: fee * 2 }).metrics; checks.push({ name: 'double costs', pass: c2.totalReturn > 0, why: `${(c2.totalReturn * 100).toFixed(1)}% with fees doubled` });
  const cb = costBreakdown(base.trades, fee); checks.push({ name: 'costs under half the moves', pass: cb.gross > 0 && cb.fees < 0.5 * cb.gross, why: cb.verdict });
  for (const [i, n] of (o.nudged ?? []).entries()) { const r = backtest(b, n(b), o).metrics; checks.push({ name: `nudged threshold ${i + 1}`, pass: r.totalReturn > 0, why: `${(r.totalReturn * 100).toFixed(1)}%` }); }
  if (o.seeds) { const s = seedSpread(o.seeds); checks.push({ name: 'random seed', pass: s.pass, why: s.why }); }
  const passed = checks.filter(c => c.pass).length;
  return { metrics: m, costs: cb, monkey: { beat: mk.beat }, checks, passed, of: checks.length, edge: passed === checks.length,
    verdict: passed === checks.length ? 'survived every check (past data only, still paper first)' : `passed ${passed} of ${checks.length}: not an edge yet` };
}

/** chat/77: time-ordered train / validation / test split. The test slice is always the newest data and is never shuffled,
 *  so a model can't see the future it is graded on. */
export function timeSplit<T>(rows: T[], train = 0.6, val = 0.2) {
  const a = Math.floor(rows.length * train), b = Math.floor(rows.length * (train + val));
  return { train: rows.slice(0, a), val: rows.slice(a, b), test: rows.slice(b) };
}

/** chat/77: what the same starting balances would be worth if nothing had traded. A market maker has to hold coins to quote
 *  both sides, so its result only counts if it beats simply holding those coins. Balances in units, prices in the quote currency. */
export function holdSameBalances(start: Record<string, number>, priceStart: Record<string, number>, priceEnd: Record<string, number>) {
  const value = (p: Record<string, number>) => Object.entries(start).reduce((s, [k, q]) => s + q * (k === 'USD' ? 1 : p[k] ?? NaN), 0);
  const v0 = value(priceStart), v1 = value(priceEnd);
  return { start: v0, end: v1, ret: v1 / v0 - 1 };
}
