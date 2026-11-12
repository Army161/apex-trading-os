// Commodity algo course (archive/chat/88). Our own code, paper only. His example systems show profit factors of 1.7 to 4.2
// on single commodity markets, but they were picked from a search of about 1.5 million entry/exit/market combinations, so
// they are UNPROVEN here and must survive the same checks and the multiple-testing charge as everything else.
// Entries (decided on the close, filled at the next open):
//   extreme fade    : close is the highest close of N bars -> short; lowest -> long (mean reversion)
//   low-volume rev. : the same, but only when volume is below its 20-bar average
//   dueling momentum: close above the close 50 bars ago but below the close 100 bars ago -> long; mirror -> short
//   stop breakout   : highest high of N bars -> long; lowest low -> short (approximated on the close; we have no stop orders)
// Exit: his "greatest exit" is time based (out after 20 bars); we add a 2 ATR protective stop for sizing.
// Also here: walk-forward testing, a strategy correlation matrix and a locked-parameter incubation record.
import { Bar, Sig, atr, sma, rollMax, rollMin, backtest } from './core';

const empty = (n: number): Sig => ({ le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(NaN), target: Array(n).fill(NaN) });
const finish = (b: Bar[], s: Sig, bars: number, k = 2) => { const a = atr(b, 14); for (let i = 0; i < b.length; i++) { if (s.le[i]) s.stop[i] = b[i].c - k * a[i]; if (s.se[i]) s.stop[i] = b[i].c + k * a[i]; if ((s.le[i] || s.se[i]) && isNaN(a[i])) s.le[i] = s.se[i] = false; } s.maxBars = bars; return s; };

export const extremeFade = (n = 35, hold = 20, volFilter = false) => (b: Bar[]): Sig => {
  const s = empty(b.length), c = b.map(x => x.c), hi = rollMax(c, n), lo = rollMin(c, n), v = sma(b.map(x => x.v), 20);
  for (let i = n; i < b.length; i++) {
    if (volFilter && !(b[i].v < v[i])) continue;
    if (c[i] >= hi[i]) s.se[i] = true; else if (c[i] <= lo[i]) s.le[i] = true;
  }
  return finish(b, s, hold);
};
export const duelingMomentum = (fast = 50, slow = 100, hold = 20) => (b: Bar[]): Sig => {
  const s = empty(b.length), c = b.map(x => x.c);
  for (let i = slow; i < b.length; i++) {
    const up = c[i] > c[i - fast] && c[i] < c[i - slow], dn = c[i] < c[i - fast] && c[i] > c[i - slow];
    const upPrev = c[i - 1] > c[i - 1 - fast] && c[i - 1] < c[i - 1 - slow], dnPrev = c[i - 1] < c[i - 1 - fast] && c[i - 1] > c[i - 1 - slow];
    if (up && !upPrev) s.le[i] = true; else if (dn && !dnPrev) s.se[i] = true;
  }
  return finish(b, s, hold);
};
export const stopBreakout = (n = 45, hold = 20) => (b: Bar[]): Sig => {
  const s = empty(b.length), hh = rollMax(b.map(x => x.h), n), ll = rollMin(b.map(x => x.l), n);
  for (let i = n; i < b.length; i++) { if (b[i].h >= hh[i] && b[i - 1].h < hh[i - 1]) s.le[i] = true; else if (b[i].l <= ll[i] && b[i - 1].l > ll[i - 1]) s.se[i] = true; }
  return finish(b, s, hold);
};

/** Walk-forward: pick the best parameter on each training window by net return, trade it on the next test window, stitch
 *  the test windows together. Only the stitched out-of-sample result counts. */
export function walkForward<P>(b: Bar[], mk: (p: P) => (b: Bar[]) => Sig, grid: P[], o: { train: number; test: number; fee?: number }) {
  const windows: { from: number; to: number; pick: P; ret: number }[] = []; let eq = 1, trades = 0;
  for (let s = 0; s + o.train + o.test <= b.length; s += o.test) {
    const tr = b.slice(s, s + o.train);
    let best = grid[0], bestR = -Infinity;
    for (const p of grid) { const r = backtest(tr, mk(p)(tr), { fee: o.fee }).metrics.totalReturn; if (r > bestR) { bestR = r; best = p; } }
    // the test window gets the training bars as warm-up history, but only trades inside the window count
    const seg = b.slice(s, s + o.train + o.test), sig = mk(best)(seg);
    for (let i = 0; i < o.train; i++) { sig.le[i] = false; sig.se[i] = false; }
    const r = backtest(seg, sig, { fee: o.fee }); eq *= 1 + r.metrics.totalReturn; trades += r.metrics.trades;
    windows.push({ from: b[s + o.train].t, to: b[s + o.train + o.test - 1].t, pick: best, ret: r.metrics.totalReturn });
  }
  return { windows, oosReturn: eq - 1, trades, stablePick: new Set(windows.map(w => JSON.stringify(w.pick))).size === 1 };
}

/** Pearson correlation matrix of daily strategy returns (aligned by day). */
export function correlationMatrix(series: Record<string, Map<number, number>>) {
  const ids = Object.keys(series), m: Record<string, Record<string, number>> = {};
  for (const a of ids) { m[a] = {}; for (const b2 of ids) {
    const days = [...series[a].keys()].filter(d => series[b2].has(d)); if (days.length < 10) { m[a][b2] = NaN; continue; }
    const x = days.map(d => series[a].get(d)!), y = days.map(d => series[b2].get(d)!), mx = x.reduce((p, q) => p + q, 0) / x.length, my = y.reduce((p, q) => p + q, 0) / y.length;
    let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    m[a][b2] = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
  } }
  return m;
}
/** Daily returns of a backtest's equity curve, keyed by UTC day number. */
export function dailyEquityReturns(b: Bar[], equity: number[]) {
  const out = new Map<number, number>(); let prevEq = equity[0], prevDay = Math.floor(b[0].t / 864e5);
  for (let i = 1; i < b.length; i++) { const d = Math.floor(b[i].t / 864e5); if (d !== prevDay) { out.set(prevDay, equity[i - 1] / prevEq - 1); prevEq = equity[i - 1]; prevDay = d; } }
  out.set(prevDay, equity[equity.length - 1] / prevEq - 1); return out;
}

/** Incubation (chat/88): lock every input, then judge only on bars after the lock. */
export type Incubation = { id: string; params: unknown; hash: string; lockedAt: number };
export function lockForIncubation(id: string, params: unknown, now = Date.now()): Incubation {
  const text = id + JSON.stringify(params); let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return { id, params, hash: (h >>> 0).toString(16), lockedAt: now };
}
export function incubationReport(b: Bar[], build: (b: Bar[]) => Sig, inc: Incubation, o: { minMonths?: number; fee?: number } = {}) {
  const k = b.findIndex(x => x.t >= inc.lockedAt); if (k < 0) return { status: 'waiting', months: 0 } as const;
  const sig = build(b); for (let i = 0; i < k; i++) { sig.le[i] = false; sig.se[i] = false; }
  const before = backtest(b.slice(0, k), build(b.slice(0, k)), { fee: o.fee }).metrics, after = backtest(b, sig, { fee: o.fee }).metrics;
  const months = (b[b.length - 1].t - inc.lockedAt) / (30.44 * 864e5), need = o.minMonths ?? 6;
  return { status: months < need ? 'incubating' : after.totalReturn > 0 && after.profitFactor > 1 ? 'held up' : 'failed', months, before, after } as const;
}
