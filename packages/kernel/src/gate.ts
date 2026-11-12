// The validation gate: standard bar v1 (docs/design/04 s6). Red path.
// The config is frozen. Its hash is the gate version. Changing any number here is a new version and a new set of trials,
// never an edit to old results (decision K3).
import { backtest, monteCarlo, type Bar, type Sig, type Trade } from '@apex/engine/core';
import { monkeyTest, holdout, shiftSig, costBreakdown } from '@apex/engine/validate';
import { deflatedSharpe } from '@apex/engine/stats/deflated';
import { hashOf, roundSig } from './canonical';

export type FirewallThresholds = { recentBars: number; staleIntervals: number; gapWarn: number; gapBlock: number; gapSessions: number; madMult: number; madWindow: number;
  revertShare: number; recentBadPrint: number; splitTol: number; zeroVolRun: number; secondMedianBp: number; secondMaxBpDaily: number; secondMaxBpIntraday: number; secondOverlap: number };

export type GateConfig = {
  name: string; capital: number; risk: number;
  minTrades: number; monkey: { runs: number; seed: number; need: number }; holdoutMonths: number; lateBars: number; costMultiple: number; maxCostShare: number;
  forward: { minMonths: number; maxDrawdown: number; minProfitableMonths: number; minTrades: number; minDsr: number; mustBeatBenchmark: boolean };
  validator: { tradesPct: number; retPts: number; sharpe: number };
  drift: { allowance: number; threshold: number; clip: number; minWinN: number; winP: number; ddPct: number; costMult: number; maxPauses: number; bootstrapRuns: number };
  dedupe: { corr: number; minDays: number; shadowMinMonths: number };
  weights: { cap: number; minAlignedDays: number };
  guard: { corr: number; corrDays: number; minRiskShareAfterCap: number };
  firewall: FirewallThresholds;
};

export const GATE_V1: GateConfig = Object.freeze({
  name: 'standard-bar-v1', capital: 10000, risk: 0.01,
  minTrades: 50, monkey: { runs: 1000, seed: 11, need: 0.95 }, holdoutMonths: 18, lateBars: 1, costMultiple: 2, maxCostShare: 0.5,
  forward: { minMonths: 6, maxDrawdown: 0.15, minProfitableMonths: 3, minTrades: 50, minDsr: 0.95, mustBeatBenchmark: true },
  validator: { tradesPct: 0.02, retPts: 0.01, sharpe: 0.1 },
  drift: { allowance: 0.5, threshold: 4, clip: 3, minWinN: 10, winP: 0.01, ddPct: 0.95, costMult: 2, maxPauses: 3, bootstrapRuns: 1000 },
  dedupe: { corr: 0.8, minDays: 60, shadowMinMonths: 3 },
  weights: { cap: 0.25, minAlignedDays: 30 },
  guard: { corr: 0.7, corrDays: 60, minRiskShareAfterCap: 0.5 },
  firewall: { recentBars: 500, staleIntervals: 2, gapWarn: 0.01, gapBlock: 0.05, gapSessions: 250, madMult: 10, madWindow: 100, revertShare: 0.8, recentBadPrint: 5,
    splitTol: 0.01, zeroVolRun: 20, secondMedianBp: 5, secondMaxBpDaily: 50, secondMaxBpIntraday: 30, secondOverlap: 250 },
}) as GateConfig;

export const gateVersion = (g: GateConfig) => hashOf(g);
export const passBar = (g: GateConfig) =>
  `${g.minTrades}+ trades; beats ${Math.round(g.monkey.need * 100)}% of ${g.monkey.runs} random traders; positive on the last ${g.holdoutMonths} months alone; ` +
  `positive one bar late; positive at ${g.costMultiple}x costs; costs under ${Math.round(g.maxCostShare * 100)}% of gross profit; Sharpe above buy and hold with a positive return`;

/** A trial is a distinct hypothesis: this strategy behaviour, on this panel and timeframe, judged by this gate version. */
export const trialKey = (t: { strategyId: string; fingerprint: string; panel: string; tf: string; gateVersion: string }) =>
  hashOf({ s: t.strategyId, f: t.fingerprint, p: t.panel, tf: t.tf, g: t.gateVersion });

export type Cost = { fee: number; slip: number };                    // fractions per side, as backtest() takes them
export type TrialStatus = 'passed_pending_validation' | 'needs_data' | 'watch' | 'rejected';
export type GateCheck = { n: number; name: string; pass: boolean; why: string; value: number | null };
export type GateResult = {
  status: TrialStatus; why: string; checks: GateCheck[]; passed: number;
  metrics: { trades: number; ret: number; hold: number; dd: number; holdDd: number; sharpe: number; holdSharpe: number; pf: number | null; avgR: number; winRate: number; exposure: number };
  readouts: { dsrN: number; nTrials: number; tStat: number; mcDdMedian: number | null; mcDdWorst5: number | null };
  daily: [number, number][];                                          // [UTC day number, return] of the strategy equity curve
  tradesR: number[];
  error?: string;
};

const DAY = 864e5;
const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const sd = (x: number[]) => { const m = mean(x); return x.length > 1 ? Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1)) : 0; };

/** Collapse a per-bar value series to one value per UTC day (the last bar of the day), then to daily returns. */
export function dailyFrom(bars: Bar[], values: number[], start: number): [number, number][] {
  const last = new Map<number, number>(); for (let i = 0; i < bars.length; i++) last.set(Math.floor(bars[i].t / DAY), values[i]);
  const days = [...last.keys()].sort((a, b) => a - b), out: [number, number][] = []; let prev = start;
  for (const d of days) { const v = last.get(d)!; out.push([d, prev > 0 ? v / prev - 1 : 0]); prev = v; }
  return out;
}
/** Sharpe per day, annualised by the number of trading days per year actually seen in the data. Same factor for strategy and hold. */
export function dailySharpe(daily: [number, number][]) {
  const r = daily.map(x => x[1]), s = sd(r); if (r.length < 10 || s === 0) return 0;
  const years = Math.max((daily[daily.length - 1][0] - daily[0][0]) / 365.25, 1e-9);
  return (mean(r) / s) * Math.sqrt(r.length / years);
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/**
 * Run the seven checks on all bars, net of the given costs. Pure and deterministic: the same bars, strategy, costs and gate
 * give the same result on any machine. nTrials only affects the deflated-Sharpe readout, which does not decide here.
 */
export function evaluate(bars: Bar[], build: (b: Bar[]) => Sig, cost: Cost, g: GateConfig, nTrials = 1): GateResult {
  const o = { capital: g.capital, risk: g.risk, fee: cost.fee, slip: cost.slip };
  try {
    if (bars.length < 60) throw new Error(`only ${bars.length} bars`);
    const sig = build(bars), base = backtest(bars, sig, o), m = base.metrics, checks: GateCheck[] = [];
    const add = (name: string, pass: boolean, why: string, value: number | null) => checks.push({ n: checks.length + 1, name, pass, why, value: value === null || !Number.isFinite(value) ? null : roundSig(value) });

    add('enough trades', m.trades >= g.minTrades, m.trades >= g.minTrades ? `${m.trades} trades` : `only ${m.trades} trades, need ${g.minTrades}`, m.trades);
    const mk = monkeyTest(bars, base.trades, { ...o, runs: g.monkey.runs, seed: g.monkey.seed, need: g.monkey.need });
    add('monkey test', mk.pass, mk.why, mk.beat);
    const h = holdout(bars, g.holdoutMonths);
    if (h.test.length > 50 && h.tune.length > 0) { const t = backtest(h.test, build(h.test), o).metrics; add('locked test window', t.totalReturn > 0, `last ${g.holdoutMonths} months alone: ${pct(t.totalReturn)}`, t.totalReturn); }
    else if (h.test.length > 50) { add('locked test window', m.totalReturn > 0, `history is shorter than ${g.holdoutMonths} months, so the whole of it is the window: ${pct(m.totalReturn)}`, m.totalReturn); }
    else add('locked test window', false, 'too few bars for a locked window', null);
    const late = backtest(bars, shiftSig(sig, g.lateBars), o).metrics; add('one bar late', late.totalReturn > 0, `${pct(late.totalReturn)} when every decision is ${g.lateBars} bar late`, late.totalReturn);
    const dbl = backtest(bars, sig, { ...o, fee: cost.fee * g.costMultiple, slip: cost.slip * g.costMultiple }).metrics; add('double costs', dbl.totalReturn > 0, `${pct(dbl.totalReturn)} at ${g.costMultiple}x costs`, dbl.totalReturn);
    const cb = costBreakdown(base.trades, cost.fee); add('costs under half the moves', cb.gross > 0 && cb.fees < g.maxCostShare * cb.gross, cb.verdict, cb.gross > 0 ? cb.fees / cb.gross : null);

    const daily = dailyFrom(bars, base.equity, g.capital), holdDaily = dailyFrom(bars, bars.map(b => b.c), bars[0].o);
    const sh = dailySharpe(daily), hs = dailySharpe(holdDaily);
    add('beats hold on risk', sh > hs && m.totalReturn > 0, `Sharpe ${sh.toFixed(2)} against ${hs.toFixed(2)} for buy and hold; return ${pct(m.totalReturn)} against ${pct(m.buyHold)}`, sh - hs);

    const failed = checks.filter(c => !c.pass), passed = checks.length - failed.length;
    const status: TrialStatus = failed.length === 0 ? 'passed_pending_validation' : failed.length === 1 ? (failed[0].n === 1 ? 'needs_data' : 'watch') : 'rejected';
    const why = failed.length ? failed.map(c => `check ${c.n} (${c.name}): ${c.why}`).join('; ') : 'passed all seven checks on past data; waits for the independent validator';
    const r = daily.map(x => x[1]), dsr = deflatedSharpe(r, Math.max(1, nTrials)), mc = monteCarlo(base.trades, g.risk, 1000);
    const srP = sd(r) > 0 ? mean(r) / sd(r) : 0;
    return { status, why, checks, passed,
      metrics: { trades: m.trades, ret: roundSig(m.totalReturn), hold: roundSig(m.buyHold), dd: roundSig(m.maxDrawdown), holdDd: roundSig(m.buyHoldDD), sharpe: roundSig(sh), holdSharpe: roundSig(hs),
        pf: Number.isFinite(m.profitFactor) ? roundSig(m.profitFactor) : null, avgR: roundSig(m.avgR), winRate: roundSig(m.winRate), exposure: roundSig(m.exposure) },
      readouts: { dsrN: roundSig(dsr.psr), nTrials, tStat: roundSig(srP * Math.sqrt(r.length)), mcDdMedian: mc ? roundSig(mc.ddMedian) : null, mcDdWorst5: mc ? roundSig(mc.ddWorst5) : null },
      daily: daily.map(([d, x]) => [d, roundSig(x)] as [number, number]), tradesR: base.trades.map((t: Trade) => roundSig(t.r)) };
  } catch (e: any) {
    // A strategy that cannot run on a dataset did not pass on it. Recorded, counted, never swallowed (04 s5, s17).
    return { status: 'rejected', why: `error: ${String(e?.message ?? e).slice(0, 200)}`, checks: [], passed: 0, error: String(e?.message ?? e).slice(0, 200),
      metrics: { trades: 0, ret: 0, hold: 0, dd: 0, holdDd: 0, sharpe: 0, holdSharpe: 0, pf: null, avgR: 0, winRate: 0, exposure: 0 },
      readouts: { dsrN: 0, nTrials, tStat: 0, mcDdMedian: null, mcDdWorst5: null }, daily: [], tradesR: [] };
  }
}

/** The part of a result that is hashed into the receipt. The trial count readout is left out: it changes as N grows, the result does not. */
export const resultDigest = (r: GateResult) => ({ status: r.status, checks: r.checks.map(c => [c.n, c.pass, c.value]), metrics: r.metrics, daily: hashOf(r.daily), error: r.error ?? null });
export const resultHash = (r: GateResult) => hashOf(resultDigest(r));

export type TrialInputs = { strategy: { id: string; fingerprint: string }; dataset: { id: string; version: string }[]; gateVersion: string; costModelVersion: string; engineFingerprint: string; seed: number };
export const inputHash = (i: TrialInputs) => hashOf(i);
