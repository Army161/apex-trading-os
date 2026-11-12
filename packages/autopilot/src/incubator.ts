// Incubator and graduation (docs/design/04 s8). A locked slot is judged only on bars after its lock (S11).
import { backtest, type Bar, type Sig } from '@apex/engine/core';
import { strictGate, type BotLog } from '@apex/engine/leaderboard';
import { deflatedSharpe, expectedMaxSharpe, phiInv } from '@apex/engine/stats/deflated';
import type { Cost, GateConfig } from '@apex/kernel/gate';
import { dailyFrom } from '@apex/kernel/gate';

const DAY = 864e5, MONTH = 30.44 * DAY;

/** The strategy's signals with every entry before the lock removed. Exits are kept (they can only close forward trades). */
export function forwardSig(bars: Bar[], sig: Sig, lockedAt: number): Sig {
  return { ...sig, le: sig.le.map((x, i) => x && bars[i].t >= lockedAt), se: sig.se.map((x, i) => x && bars[i].t >= lockedAt) };
}

export type ForwardRecord = { months: number; trades: number; ret: number; pf: number | null; dd: number; sharpeDaily: number; profitableMonths: number; daily: [number, number][]; tradeList: { t: number; pnl: number; r: number; entryT: number }[] };
/** Strategy record: the strategy alone on bars after the lock, fixed risk, cost-model costs. Used for graduation, never the book. */
export function strategyRecord(bars: Bar[], sig: Sig, lockedAt: number, cost: Cost, g: GateConfig): ForwardRecord {
  const bt = backtest(bars, forwardSig(bars, sig, lockedAt), { capital: g.capital, risk: g.risk, fee: cost.fee, slip: cost.slip });
  const k = bars.findIndex(b => b.t >= lockedAt), fb = k < 0 ? [] : bars.slice(k), feq = k < 0 ? [] : bt.equity.slice(k);
  const last = bars[bars.length - 1], months = k < 0 ? 0 : Math.max(0, (last.t - lockedAt) / MONTH);
  const tr = bt.trades, gp = tr.filter(t => t.pnl > 0).reduce((a, t) => a + t.pnl, 0), gl = -tr.filter(t => t.pnl <= 0).reduce((a, t) => a + t.pnl, 0);
  let peak = g.capital, dd = 0; for (const e of feq) { peak = Math.max(peak, e); dd = Math.min(dd, e / peak - 1); }
  const daily = fb.length ? dailyFrom(fb, feq, g.capital) : [], rs = daily.map(d => d[1]), m = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
  const sd = rs.length > 1 ? Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / (rs.length - 1)) : 0;
  const byMonth = new Map<string, number>(); for (const t of tr) { const key = new Date(t.exitT).toISOString().slice(0, 7); byMonth.set(key, (byMonth.get(key) ?? 0) + t.pnl); }
  return { months, trades: tr.length, ret: feq.length ? feq[feq.length - 1] / g.capital - 1 : 0, pf: gl > 0 ? gp / gl : gp > 0 ? null : 0, dd, sharpeDaily: sd > 0 ? m / sd : 0,
    profitableMonths: [...byMonth.values()].filter(v => v > 0).length, daily, tradeList: tr.map(t => ({ t: t.exitT, pnl: t.pnl, r: t.r, entryT: t.entryT })) };
}

export type GradState = 'too_early' | 'failed' | 'held_up' | 'strict_pass';
export type Graduation = { state: GradState; months: number; trades: number; ret: number; pf: number | null; dd: number; dsrM: number; dsrN: number; m: number; n: number; fails: string[]; clock: Clock };
/**
 * Monthly check on the strategy record. Decision K1: the forward gate deflates by M (slots ever locked), because forward bars are
 * out of sample for every trial before the lock. N (all trials ever) is reported next to it and does not decide.
 */
export function graduation(rec: ForwardRecord, hold: Map<number, number>, m: number, n: number, g: GateConfig): Graduation {
  const f = g.forward, log: BotLog = { id: 'slot', capital: g.capital, trades: rec.tradeList.map(t => ({ t: t.t, pnl: t.pnl })) };
  const strict = strictGate(log, { maxDrawdown: f.maxDrawdown, minProfitableMonths: f.minProfitableMonths, minTrades: f.minTrades, nTrials: Math.max(1, m), minDsr: f.minDsr, mustBeatBenchmark: f.mustBeatBenchmark }, hold);
  const rs = rec.daily.map(d => d[1]), dsrN = deflatedSharpe(rs, Math.max(1, n)).psr, dsrM = deflatedSharpe(rs, Math.max(1, m)).psr;
  // The record's own drawdown (from the equity curve) is what binds, not the trade-log approximation.
  const fails = strict.fails.filter(x => !x.startsWith('drawdown') && !x.startsWith('deflated'));
  if (rec.dd < -f.maxDrawdown) fails.unshift(`drawdown ${(rec.dd * 100).toFixed(1)}% is past the ${(f.maxDrawdown * 100).toFixed(0)}% limit`);
  if (dsrM < f.minDsr) fails.push(`deflated Sharpe ${(dsrM * 100).toFixed(0)}% after ${m} slots tried, need ${(f.minDsr * 100).toFixed(0)}%`);
  const early = rec.months < f.minMonths, bad = rec.ret <= 0 || (rec.pf !== null && rec.pf <= 1);
  const state: GradState = early ? 'too_early' : bad ? 'failed' : fails.length === 0 ? 'strict_pass' : 'held_up';
  return { state, months: rec.months, trades: rec.trades, ret: rec.ret, pf: rec.pf, dd: rec.dd, dsrM, dsrN, m, n, fails: early ? [`${rec.months.toFixed(1)} months of ${f.minMonths}`, ...fails] : fails, clock: graduationClock(rec, m, g) };
}

export type Clock = { tradesSoFar: number; tradesNeeded: number; monthsForTrades: number | null; monthsForDsr: number | null; earliestMonth: number | null; note: string };
/** The earliest month the slot could pass if its forward Sharpe and trade rate stay where they are. Shown, never hidden (04 s8.4). */
export function graduationClock(rec: ForwardRecord, m: number, g: GateConfig): Clock {
  const f = g.forward, perMonth = rec.months > 0.25 ? rec.trades / rec.months : null;
  const monthsForTrades = rec.trades >= f.minTrades ? rec.months : perMonth && perMonth > 0 ? f.minTrades / perMonth : null;
  let monthsForDsr: number | null = null; const sr = rec.sharpeDaily, daysPerMonth = rec.months > 0.25 ? rec.daily.length / rec.months : 21, z = phiInv(f.minDsr);
  if (sr > 0) for (let mo = 1; mo <= 240; mo++) { const T = Math.round(mo * daysPerMonth); if (T > 10 && (sr - expectedMaxSharpe(Math.max(1, m), T)) * Math.sqrt(T - 1) >= z) { monthsForDsr = mo; break; } }
  const parts = [f.minMonths, monthsForTrades, monthsForDsr], earliest = parts.some(x => x === null) ? null : Math.ceil(Math.max(...(parts as number[])));
  const note = rec.trades === 0 ? 'no forward trades yet' : earliest === null ? (sr <= 0 ? 'forward Sharpe is not positive, so no date can be given' : 'not enough forward history to project') : `could pass in month ${earliest} at the current pace`;
  return { tradesSoFar: rec.trades, tradesNeeded: f.minTrades, monthsForTrades, monthsForDsr, earliestMonth: earliest, note };
}

/** Daily buy-and-hold returns of the slot's own market, keyed by UTC day, for the alpha check. */
export function holdDaily(bars: Bar[], from: number): Map<number, number> {
  const fb = bars.filter(b => b.t >= from); if (!fb.length) return new Map();
  return new Map(dailyFrom(fb, fb.map(b => b.c), fb[0].o));
}
