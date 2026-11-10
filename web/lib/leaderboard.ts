// Daily paper-bot leaderboard and strict filter gate (archive/chat/83 and 84, a futures "bot factory" video and livestream).
// Our own code, paper only. The author generates 556 to 1,000 bots a day and says 90-99% fail; showing the best few
// (82% win rate, Sharpe 3) after that many tries is selection bias, not evidence. So the gate here charges for every bot
// tried: a deflated Sharpe ratio (Bailey and Lopez de Prado) tests the best Sharpe against what luck alone would produce
// across N trials. Nothing on this board is proven; a bot can only graduate after forward paper trading.
export type PaperTrade = { t: number; pnl: number };         // close time (ms) and net P&L in account currency
export type BotLog = { id: string; capital: number; trades: PaperTrade[] };

const DAY = 864e5;
const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const sd = (x: number[]) => { const m = mean(x); return x.length > 1 ? Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1)) : 0; };

/** Standard normal CDF and inverse (Acklam). */
export const phi = (z: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
export function phiInv(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const q = Math.min(Math.max(p, 1e-12), 1 - 1e-12), lo = 0.02425;
  if (q < lo) { const r = Math.sqrt(-2 * Math.log(q)); return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1); }
  if (q > 1 - lo) return -phiInv(1 - q);
  const r = q - 0.5, s = r * r; return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}

/** Daily returns on capital, one entry per calendar day with a trade (flat days count as zero between the first and last). */
export function dailyReturns(log: BotLog) {
  if (!log.trades.length) return [] as { day: number; r: number }[];
  const by = new Map<number, number>(); for (const t of log.trades) { const d = Math.floor(t.t / DAY); by.set(d, (by.get(d) ?? 0) + t.pnl); }
  const days = [...by.keys()].sort((a, b) => a - b), out: { day: number; r: number }[] = [];
  let eq = log.capital;
  for (let d = days[0]; d <= days[days.length - 1]; d++) { const dow = new Date(d * DAY).getUTCDay(); const p = by.get(d) ?? 0; if (!p && (dow === 0 || dow === 6)) continue; out.push({ day: d, r: p / eq }); eq += p; }
  return out;
}

export type BoardRow = {
  id: string; trades: number; wins: number; losses: number; winRate: number; profitFactor: number; netPnl: number;
  sharpe: number; maxDrawdown: number; months: number; profitableMonths: number; profitableWeeksShare: number;
  alpha?: number; beta?: number; grade: 'A' | 'B' | 'C' | 'D' | 'F';
};

/** benchmark: daily returns of the S&P 500 (or SPY) keyed by day number, for alpha and beta (chat/84: "beat the S&P"). */
export function boardRow(log: BotLog, benchmark?: Map<number, number>): BoardRow {
  const tr = log.trades, w = tr.filter(t => t.pnl > 0), l = tr.filter(t => t.pnl <= 0);
  const gp = w.reduce((a, t) => a + t.pnl, 0), gl = -l.reduce((a, t) => a + t.pnl, 0), dr = dailyReturns(log), r = dr.map(x => x.r);
  let eq = 1, peak = 1, dd = 0; for (const x of r) { eq *= 1 + x; peak = Math.max(peak, eq); dd = Math.min(dd, eq / peak - 1); }
  const bucket = (ms: number) => { const m = new Map<number, number>(); for (const t of tr) { const k = Math.floor(t.t / ms); m.set(k, (m.get(k) ?? 0) + t.pnl); } return [...m.values()]; };
  const monthKey = (t: number) => { const d = new Date(t); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
  const mm = new Map<number, number>(); for (const t of tr) mm.set(monthKey(t.t), (mm.get(monthKey(t.t)) ?? 0) + t.pnl);
  const weeks = bucket(7 * DAY), s = sd(r), sharpe = s > 0 ? (mean(r) / s) * Math.sqrt(252) : 0;
  let alpha: number | undefined, beta: number | undefined;
  if (benchmark) {
    const pairs = dr.filter(x => benchmark.has(x.day)).map(x => [x.r, benchmark.get(x.day)!] as const);
    if (pairs.length > 20) { const bx = pairs.map(p => p[1]), by = pairs.map(p => p[0]), mx = mean(bx), my = mean(by); const cov = mean(pairs.map(p => (p[1] - mx) * (p[0] - my))), vx = mean(bx.map(v => (v - mx) ** 2)); beta = vx > 0 ? cov / vx : 0; alpha = (my - beta * mx) * 252; }
  }
  const row: BoardRow = { id: log.id, trades: tr.length, wins: w.length, losses: l.length, winRate: tr.length ? w.length / tr.length : 0,
    profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0, netPnl: gp - gl, sharpe, maxDrawdown: dd, months: mm.size,
    profitableMonths: [...mm.values()].filter(v => v > 0).length, profitableWeeksShare: weeks.length ? weeks.filter(v => v > 0).length / weeks.length : 0, alpha, beta, grade: 'F' };
  row.grade = grade(row);
  return row;
}

/** A plain grade from consistency and risk, not from the best day. */
export function grade(r: BoardRow): BoardRow['grade'] {
  if (r.trades < 30) return 'D';                                      // too few trades to say anything
  let s = 0;
  if (r.profitFactor >= 1.5) s++; if (r.sharpe >= 1) s++; if (r.maxDrawdown > -0.1) s++;
  if (r.months >= 3 && r.profitableMonths / r.months >= 0.66) s++; if (r.profitableWeeksShare >= 0.55) s++;
  if (r.netPnl <= 0) return 'F';
  return s >= 5 ? 'A' : s >= 4 ? 'B' : s >= 2 ? 'C' : 'D';
}

/** Expected best Sharpe (per period) among N independent strategies with no edge, given T observations. */
export function expectedMaxSharpe(nTrials: number, T: number) {
  if (nTrials <= 1) return 0;
  const g = 0.5772156649, z = (1 - g) * phiInv(1 - 1 / nTrials) + g * phiInv(1 - 1 / (nTrials * Math.E));
  return z / Math.sqrt(Math.max(T - 1, 1));
}

/** Deflated Sharpe ratio: probability the true per-period Sharpe beats the luck benchmark of nTrials tries. */
export function deflatedSharpe(r: number[], nTrials: number) {
  const T = r.length, m = mean(r), s = sd(r); if (T < 10 || s === 0) return { psr: 0, sr: 0, sr0: 0 };
  const sr = m / s, sk = mean(r.map(x => ((x - m) / s) ** 3)), ku = mean(r.map(x => ((x - m) / s) ** 4)), sr0 = expectedMaxSharpe(nTrials, T);
  const den = Math.sqrt(Math.max(1 - sk * sr + ((ku - 1) / 4) * sr * sr, 1e-9));
  return { psr: phi(((sr - sr0) * Math.sqrt(T - 1)) / den), sr, sr0 };
}

export type GateOpts = { maxDrawdown?: number; minProfitableMonths?: number; minTrades?: number; nTrials: number; minDsr?: number; mustBeatBenchmark?: boolean };
/** The strict filter. nTrials is every bot generated or tweaked to find this one, not just the ones still running. */
export function strictGate(log: BotLog, o: GateOpts, benchmark?: Map<number, number>) {
  const row = boardRow(log, benchmark), dsr = deflatedSharpe(dailyReturns(log).map(x => x.r), o.nTrials), fails: string[] = [];
  if (row.maxDrawdown < -(o.maxDrawdown ?? 0.15)) fails.push(`drawdown ${(row.maxDrawdown * 100).toFixed(1)}% is past the ${((o.maxDrawdown ?? 0.15) * 100).toFixed(0)}% limit`);
  if (row.profitableMonths < (o.minProfitableMonths ?? 3)) fails.push(`${row.profitableMonths} profitable months, need ${o.minProfitableMonths ?? 3}`);
  if (row.trades < (o.minTrades ?? 50)) fails.push(`${row.trades} trades, need ${o.minTrades ?? 50}`);
  if (dsr.psr < (o.minDsr ?? 0.95)) fails.push(`deflated Sharpe ${(dsr.psr * 100).toFixed(0)}% after ${o.nTrials} tries, need ${((o.minDsr ?? 0.95) * 100).toFixed(0)}%`);
  if (o.mustBeatBenchmark && !(row.alpha !== undefined && row.alpha > 0)) fails.push('no positive alpha against the benchmark');
  return { row, dsr, pass: fails.length === 0, fails, verdict: fails.length ? 'not proven' : 'passed the gate on paper; forward paper trading still comes before any live money' };
}

export function rankBoard(rows: BoardRow[]) {
  const g = { A: 4, B: 3, C: 2, D: 1, F: 0 };
  return [...rows].sort((a, b) => g[b.grade] - g[a.grade] || b.profitableWeeksShare - a.profitableWeeksShare || b.sharpe - a.sharpe);
}

/** Prompt for the AI daily review in the dashboard chat. It gets only the numbers, and is told how to talk about them. */
export function dailyReviewPrompt(rows: BoardRow[], nTrials: number, day: string) {
  const fmt = (r: BoardRow) => `${r.id}: ${r.wins}W/${r.losses}L, win ${(r.winRate * 100).toFixed(0)}%, PF ${isFinite(r.profitFactor) ? r.profitFactor.toFixed(2) : 'inf'}, Sharpe ${r.sharpe.toFixed(2)}, max DD ${(r.maxDrawdown * 100).toFixed(1)}%, profitable months ${r.profitableMonths}/${r.months}, weeks up ${(r.profitableWeeksShare * 100).toFixed(0)}%${r.alpha !== undefined ? `, alpha ${(r.alpha * 100).toFixed(1)}%/yr` : ''}, grade ${r.grade}`;
  return [
    `Daily paper-bot review for ${day}. All of these are PAPER results. ${nTrials} bot variants have been tried in total.`,
    'Rank them, say which look most consistent and why, and which should be paused. Rules for your answer:',
    '- One good day is noise. Judge on weeks and months, drawdown and trade count.',
    `- With ${nTrials} tries, the best-looking numbers are expected from luck alone. Say so when it applies.`,
    '- Never call anything profitable or ready for live money. Nothing here has a proven edge.', '',
    ...rankBoard(rows).map(fmt),
  ].join('\n');
}
