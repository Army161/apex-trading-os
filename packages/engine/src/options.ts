// Paper-only options toolkit: Black-Scholes Greeks, defined-risk structures, expected value, simple model backtests
// (archive/chat/54 options podcast) and dealer gamma exposure (chat/47). Nothing here places orders.
// Model backtests price options with Black-Scholes from an IV estimate, not from real option quotes: they show the shape of a
// strategy, not its real fills. Claims in the podcast ($100k to $450k, 10-15% a month) are unproven and are not used anywhere.

// ---------------- Black-Scholes ----------------
const SQ2PI = Math.sqrt(2 * Math.PI);
export const pdf = (x: number) => Math.exp(-x * x / 2) / SQ2PI;
export function cdf(x: number) { // Abramowitz-Stegun 26.2.17, error < 7.5e-8
  const k = 1 / (1 + 0.2316419 * Math.abs(x)), p = k * (0.319381530 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + k * 1.330274429))));
  const v = 1 - pdf(x) * p; return x >= 0 ? v : 1 - v;
}
export type Right = 'C' | 'P';
/** Price and Greeks. S spot, K strike, T years, r rate, v vol (0.2 = 20%). theta per calendar day, vega per 1 vol point. */
export function bs(right: Right, S: number, K: number, T: number, v: number, r = 0.04) {
  if (T <= 0 || v <= 0) { const iv = right === 'C' ? Math.max(0, S - K) : Math.max(0, K - S); return { price: iv, delta: right === 'C' ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, theta: 0, vega: 0 }; }
  const st = v * Math.sqrt(T), d1 = (Math.log(S / K) + (r + v * v / 2) * T) / st, d2 = d1 - st, df = Math.exp(-r * T);
  const price = right === 'C' ? S * cdf(d1) - K * df * cdf(d2) : K * df * cdf(-d2) - S * cdf(-d1);
  const delta = right === 'C' ? cdf(d1) : cdf(d1) - 1, gamma = pdf(d1) / (S * st), vega = S * pdf(d1) * Math.sqrt(T) / 100;
  const theta = (-S * pdf(d1) * v / (2 * Math.sqrt(T)) - (right === 'C' ? 1 : -1) * r * K * df * cdf(right === 'C' ? d2 : -d2)) / 365;
  return { price, delta, gamma, theta, vega };
}
/** Strike with a given absolute delta (e.g. 0.25), by bisection. */
export function strikeForDelta(right: Right, S: number, T: number, v: number, delta: number, r = 0.04) {
  let lo = S * 0.2, hi = S * 3;
  for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2, d = Math.abs(bs(right, S, m, T, v, r).delta); if (right === 'C' ? d > delta : d < delta) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---------------- structures ----------------
export type Leg = { right: Right; K: number; qty: number; T: number };   // qty > 0 long, < 0 short (contracts of 100)
export const legValue = (l: Leg, S: number, v: number, dt = 0, r = 0.04) => l.qty * 100 * bs(l.right, S, l.K, Math.max(0, l.T - dt), v, r).price;
export const value = (legs: Leg[], S: number, v: number, dt = 0, r = 0.04) => legs.reduce((a, l) => a + legValue(l, S, v, dt, r), 0);
export function greeks(legs: Leg[], S: number, v: number, r = 0.04) {
  const g = { delta: 0, gamma: 0, theta: 0, vega: 0 };
  for (const l of legs) { const x = bs(l.right, S, l.K, l.T, v, r); g.delta += l.qty * 100 * x.delta; g.gamma += l.qty * 100 * x.gamma; g.theta += l.qty * 100 * x.theta; g.vega += l.qty * 100 * x.vega; }
  return g;
}
const round = (x: number, step: number) => Math.round(x / step) * step;
/** Iron condor: short call and put at `shortDelta`, long wings `wing` further out. Defined risk. */
export function ironCondor(S: number, T: number, v: number, shortDelta = 0.2, wing = S * 0.03, step = 1): Leg[] {
  const kc = round(strikeForDelta('C', S, T, v, shortDelta), step), kp = round(strikeForDelta('P', S, T, v, shortDelta), step);
  return [{ right: 'P', K: kp - round(wing, step), qty: 1, T }, { right: 'P', K: kp, qty: -1, T }, { right: 'C', K: kc, qty: -1, T }, { right: 'C', K: kc + round(wing, step), qty: 1, T }];
}
/** Iron fly: short straddle at the money, long wings `wing` away. */
export function ironFly(S: number, T: number, wing = S * 0.03, step = 1): Leg[] {
  const k = round(S, step), w = round(wing, step);
  return [{ right: 'P', K: k - w, qty: 1, T }, { right: 'P', K: k, qty: -1, T }, { right: 'C', K: k, qty: -1, T }, { right: 'C', K: k + w, qty: 1, T }];
}
/** Strangle with hedged wings: a short strangle is unlimited risk, so Apex always adds wings (which makes it a wide iron condor). */
export const hedgedStrangle = (S: number, T: number, v: number, shortDelta = 0.16, wing = S * 0.05, step = 1) => ironCondor(S, T, v, shortDelta, wing, step);
/** Calendar: sell the near expiry at `shortDelta` (call side), buy the same strike further out. */
export function calendar(S: number, Tnear: number, Tfar: number, v: number, shortDelta = 0.25, step = 1): Leg[] {
  const k = round(strikeForDelta('C', S, Tnear, v, shortDelta), step);
  return [{ right: 'C', K: k, qty: -1, T: Tnear }, { right: 'C', K: k, qty: 1, T: Tfar }];
}
/** Payoff at the first expiry (later legs valued with Black-Scholes), max gain/loss and breakevens over a price grid. */
export function profile(legs: Leg[], S: number, v: number, r = 0.04) {
  const cost = value(legs, S, v, 0, r), T0 = Math.min(...legs.map(l => l.T)), grid: { S: number; pnl: number }[] = [];
  for (let k = 0; k <= 200; k++) { const x = S * (0.6 + 0.8 * k / 200); grid.push({ S: x, pnl: value(legs, x, v, T0, r) - cost }); }
  const be: number[] = []; for (let k = 1; k < grid.length; k++) if (Math.sign(grid[k].pnl) !== Math.sign(grid[k - 1].pnl)) be.push(+((grid[k].S + grid[k - 1].S) / 2).toFixed(2));
  return { cost, credit: -cost, maxGain: Math.max(...grid.map(g => g.pnl)), maxLoss: Math.min(...grid.map(g => g.pnl)), breakevens: be, grid };
}
/** Expected value at first expiry under a lognormal with vol `v` (risk-neutral drift r; pass your own `drift` to test a view).
 *  With the same vol that priced the trade, EV is about zero before costs: an edge needs IV above what actually happens. */
export function expectedValue(legs: Leg[], S: number, v: number, o: { r?: number; drift?: number; realized?: number; feePerContract?: number } = {}) {
  const r = o.r ?? 0.04, rv = o.realized ?? v, mu = o.drift ?? r, T0 = Math.min(...legs.map(l => l.T)), cost = value(legs, S, v, 0, r);
  let ev = 0, pop = 0, wsum = 0; const n = 400;
  for (let k = 0; k < n; k++) {
    const z = -4 + 8 * (k + 0.5) / n, w = pdf(z), x = S * Math.exp((mu - rv * rv / 2) * T0 + rv * Math.sqrt(T0) * z), p = value(legs, x, v, T0, r) - cost;
    ev += w * p; pop += p > 0 ? w : 0; wsum += w;
  }
  const fees = (o.feePerContract ?? 0.65) * legs.reduce((a, l) => a + Math.abs(l.qty), 0) * 2;
  return { ev: ev / wsum - fees, probProfit: pop / wsum, fees };
}

// ---------------- event blackout ----------------
/** FOMC decision days (second day of each meeting). Check against federalreserve.gov before relying on them. */
export const FOMC = ['2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09'];
export type Event = { date: string; kind: 'fomc' | 'earnings' | 'war' | 'other'; name?: string };
/** True when `date` (YYYY-MM-DD) is within `before`/`after` days of an event. War/geopolitical events are entered by hand. */
export function blackout(date: string, events: Event[] = FOMC.map(d => ({ date: d, kind: 'fomc' as const })), before = 1, after = 1) {
  const t = Date.parse(date + 'T00:00:00Z');
  const hit = events.find(e => { const d = (Date.parse(e.date + 'T00:00:00Z') - t) / 864e5; return d <= before && d >= -after; });
  return hit ? { blocked: true, why: `${hit.kind}${hit.name ? ' ' + hit.name : ''} on ${hit.date}` } : { blocked: false, why: 'no event nearby' };
}

// ---------------- model backtests ----------------
export type OTrade = { date: string; pnl: number; ret: number; note?: string };
const summarize = (t: OTrade[]) => {
  const w = t.filter(x => x.pnl > 0), gp = w.reduce((a, x) => a + x.pnl, 0), gl = -t.filter(x => x.pnl <= 0).reduce((a, x) => a + x.pnl, 0);
  return { n: t.length, winRate: t.length ? w.length / t.length : 0, total: t.reduce((a, x) => a + x.pnl, 0), profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0, worst: Math.min(0, ...t.map(x => x.pnl)) };
};
/** Weight recent trades more: trades in the last `years` count `w` times (the podcast's "weight the last 1-2 years"). */
export function recentWeighted(t: OTrade[], years = 2, w = 2) {
  if (!t.length) return 0; const end = Date.parse(t[t.length - 1].date), cut = end - years * 365.25 * 864e5;
  let s = 0, n = 0; for (const x of t) { const k = Date.parse(x.date) >= cut ? w : 1; s += k * x.ret; n += k; } return s / n;
}

/** Overnight earnings iron fly: open 15 minutes before the close (price `pre`, IV `ivPre`), close 5-10 minutes after the next open
 *  (price `post`, IV `ivPost`, usually crushed). Rows come from your own data. Wing = `wingMult` x the implied move. */
export function earningsFlyBacktest(rows: { date: string; pre: number; post: number; ivPre: number; ivPost: number; dte?: number }[], o: { wingMult?: number; fee?: number; slip?: number; events?: Event[] } = {}) {
  const trades: OTrade[] = [], fee = o.fee ?? 0.65, slip = o.slip ?? 0.05;
  for (const r of rows) {
    const T = (r.dte ?? 7) / 365, move = r.pre * r.ivPre * Math.sqrt(T), legs = ironFly(r.pre, T, Math.max(1, (o.wingMult ?? 1.5) * move));
    const open = value(legs, r.pre, r.ivPre, 0), close = value(legs, r.post, r.ivPost, 1 / 365), width = legs[3].K - legs[2].K;
    const pnl = close - open - 4 * 2 * (fee + slip * 100 / 2), risk = width * 100 + open;   // open < 0 = credit
    trades.push({ date: r.date, pnl, ret: risk > 0 ? pnl / risk : 0, note: `move ${((r.post / r.pre - 1) * 100).toFixed(1)}% vs implied ${(move / r.pre * 100).toFixed(1)}%` });
  }
  return { trades, ...summarize(trades), unproven: true };
}

/** Calendar "theta machine" on daily closes: sell ~30 DTE at `shortDelta`, buy ~60 DTE same strike; take profit at `tp` of the debit,
 *  stop at `sl` of the debit, or close at the near expiry. IV per day from `iv` (pass realized-vol x premium if you have no IV data). */
export function calendarBacktest(days: { date: string; c: number; iv: number }[], o: { shortDelta?: number; tp?: number; sl?: number; near?: number; far?: number; fee?: number; events?: Event[] } = {}) {
  const tp = o.tp ?? 0.4, sl = o.sl ?? 0.5, near = o.near ?? 30, far = o.far ?? 60, fee = (o.fee ?? 0.65) * 4, trades: OTrade[] = [];
  let i = 0;
  while (i < days.length - near) {
    if (blackout(days[i].date, o.events).blocked) { i++; continue; }
    const S = days[i].c, v = days[i].iv, legs = calendar(S, near / 365, far / 365, v, o.shortDelta ?? 0.25), debit = value(legs, S, v);
    let j = i + 1, out = NaN;
    for (; j < days.length && j - i <= near; j++) {
      const dt = (Date.parse(days[j].date) - Date.parse(days[i].date)) / (365 * 864e5), now = value(legs, days[j].c, days[j].iv, dt), pl = now - debit;
      if (pl >= tp * debit || pl <= -sl * debit || dt * 365 >= near - 0.5) { out = pl; break; }
    }
    if (isNaN(out)) break;
    trades.push({ date: days[i].date, pnl: out - fee, ret: (out - fee) / debit }); i = j + 1;
  }
  return { trades, ...summarize(trades), model: 'Black-Scholes on daily closes, flat skew', unproven: true };
}

/** LEAP study: after QQQ closes down `drop` or more, buy a ~1 year call at `delta`; sell at +50% of premium or after `maxDays`. */
export function leapDipBacktest(days: { date: string; c: number; iv: number }[], o: { drop?: number; delta?: number; target?: number; maxDays?: number; fee?: number } = {}) {
  const drop = o.drop ?? 0.01, tgt = o.target ?? 0.5, maxD = o.maxDays ?? 250, fee = o.fee ?? 0.65, trades: OTrade[] = [];
  let i = 1;
  while (i < days.length) {
    if (days[i].c / days[i - 1].c - 1 > -drop) { i++; continue; }
    const S = days[i].c, v = days[i].iv, T = 1, K = strikeForDelta('C', S, T, v, o.delta ?? 0.6), cost = bs('C', S, K, T, v).price * 100 + fee;
    let j = i + 1, pnl = NaN;
    for (; j < days.length; j++) {
      const dt = (Date.parse(days[j].date) - Date.parse(days[i].date)) / (365 * 864e5), val = bs('C', days[j].c, K, T - dt, days[j].iv).price * 100 - fee;
      if (val >= cost * (1 + tgt) || j - i >= maxD) { pnl = val - cost; break; }
    }
    if (isNaN(pnl)) break;
    trades.push({ date: days[i].date, pnl, ret: pnl / cost }); i = j + 1;
  }
  return { trades, ...summarize(trades), unproven: true };
}

// ---------------- dealer gamma exposure (GEX) ----------------
export type Opt = { K: number; right: Right; oi: number; gamma?: number; iv?: number; T?: number };
/** Per-contract GEX in $ per 1% move: gamma x OI x 100 x spot^2 x 1%. Calls +, puts - (the usual, unproven dealer-positioning assumption). */
export const gexOf = (o: Opt, S: number, r = 0.04) => {
  const g = o.gamma ?? (o.iv && o.T ? bs(o.right, S, o.K, o.T, o.iv, r).gamma : 0);
  return (o.right === 'C' ? 1 : -1) * g * o.oi * 100 * S * S * 0.01;
};
/** Net GEX, per-strike table, the flip (where net GEX re-priced across spot crosses zero), call wall and put wall. */
export function gexProfile(chain: Opt[], S: number, o: { lo?: number; hi?: number; steps?: number; r?: number } = {}) {
  const byK = new Map<number, { call: number; put: number }>();
  for (const x of chain) { const e = byK.get(x.K) ?? { call: 0, put: 0 }; const g = gexOf(x, S, o.r); if (x.right === 'C') e.call += g; else e.put += g; byK.set(x.K, e); }
  const strikes = [...byK.entries()].map(([K, e]) => ({ K, call: e.call, put: e.put, net: e.call + e.put })).sort((a, b) => a.K - b.K);
  const net = strikes.reduce((a, s) => a + s.net, 0);
  const lo = S * (o.lo ?? 0.9), hi = S * (o.hi ?? 1.1), n = o.steps ?? 80, curve: { S: number; gex: number }[] = [];
  for (let k = 0; k <= n; k++) { const x = lo + (hi - lo) * k / n; curve.push({ S: x, gex: chain.reduce((a, c) => a + (c.iv && c.T ? gexOf({ ...c, gamma: undefined }, x, o.r) : 0), 0) }); }
  let flip = NaN; for (let k = 1; k < curve.length; k++) if (Math.sign(curve[k].gex) !== Math.sign(curve[k - 1].gex)) { flip = (curve[k].S + curve[k - 1].S) / 2; break; }
  const above = strikes.filter(s => s.K > S), below = strikes.filter(s => s.K < S);
  const callWall = above.length ? above.reduce((a, s) => s.net > a.net ? s : a).K : NaN, putWall = below.length ? below.reduce((a, s) => s.net < a.net ? s : a).K : NaN;
  return { net, regime: net < 0 ? 'short gamma' : 'long gamma', strikes, curve, flip, callWall, putWall,
    warning: 'Dealer positioning is assumed (long calls, short puts). Nobody knows it for sure; if the assumption is wrong every sign flips.' };
}

/** "Last half hour gamma" rule (Baltussen, Da, Lammers & Martens, JFE 2021; Barbon & Buraschi): gamma read once before the open;
 *  at 15:30 New York take the move since 9:30. Short gamma: trade with it. Long gamma: against it. Flat by 15:59. No trade on a flat day. */
export function lastHalfHour(gex: number, open: number, at1530: number, flat = 0.001): 1 | -1 | 0 {
  const m = at1530 / open - 1; if (Math.abs(m) < flat || !gex) return 0;
  return (gex < 0 ? 1 : -1) * Math.sign(m) as 1 | -1;
}
/** Backtest the rule on daily rows (open, 15:30 price, 15:59 price, pre-open GEX). `useGamma: false` = momentum with no filter. */
export function lastHalfHourBacktest(rows: { date: string; open: number; p1530: number; p1559: number; gex?: number }[], o: { useGamma?: boolean; costBps?: number; flat?: number } = {}) {
  const cost = (o.costBps ?? 1) / 1e4, trades: OTrade[] = [];
  for (const r of rows) {
    const side = o.useGamma === false ? (Math.abs(r.p1530 / r.open - 1) < (o.flat ?? 0.001) ? 0 : Math.sign(r.p1530 - r.open)) : r.gex === undefined ? 0 : lastHalfHour(r.gex, r.open, r.p1530, o.flat);
    if (!side) continue;
    const ret = side * (r.p1559 / r.p1530 - 1) - 2 * cost; trades.push({ date: r.date, pnl: ret, ret });
  }
  const rets = trades.map(t => t.ret), m = rets.reduce((a, x) => a + x, 0) / (rets.length || 1), sd = Math.sqrt(rets.reduce((a, x) => a + (x - m) ** 2, 0) / (rets.length || 1));
  return { trades, ...summarize(trades), avgBps: m * 1e4, sharpe: sd > 0 ? m / sd * Math.sqrt(252) : 0 };
}

// ---------------- flow + gamma playbook (archive/chat/55; free data only: Cboe chains, FINRA ATS/dark-pool data, our own GEX) ----------------
// Her $200k to $1.4M result is unproven. Holding assigned stock with no stop is open-ended downside risk: Apex flags it every time.
export type Print = { kind: 'option' | 'darkpool'; premium?: number; price: number; size: number; bid?: number; ask?: number; sweep?: boolean; right?: Right };
/** Big flow: options >= $1M premium paid at or above the ask as a sweep; dark-pool prints >= $1M notional. */
export function bigFlow(p: Print, min = 1_000_000) {
  if (p.kind === 'darkpool') { const n = p.price * p.size; return { big: n >= min, why: `dark-pool print $${(n / 1e6).toFixed(2)}M` }; }
  const prem = p.premium ?? p.price * p.size * 100, aggressive = p.ask !== undefined && p.price >= p.ask, big = prem >= min && aggressive && !!p.sweep;
  return { big, why: `${p.right ?? ''} premium $${(prem / 1e6).toFixed(2)}M${aggressive ? ' at/above ask' : ' not at the ask'}${p.sweep ? ', sweep' : ', not a sweep'}` };
}
/** GARCH(1,1) on daily returns (parameters by a coarse grid search on likelihood). rank = where today's conditional vol sits in its last `look` days. */
export function garch(closes: number[], look = 252) {
  const r = closes.slice(1).map((c, i) => Math.log(c / closes[i])), n = r.length;
  if (n < 30) return { vol: NaN, rank: NaN, params: null as null | { w: number; a: number; b: number } };
  const v0 = r.reduce((x, y) => x + y * y, 0) / n;
  const run = (a: number, b: number) => { const w = v0 * (1 - a - b), s = [v0]; let ll = 0; for (let i = 1; i < n; i++) { const v = w + a * r[i - 1] ** 2 + b * s[i - 1]; s.push(v); ll += -Math.log(v) - r[i] * r[i] / v; } return { s, ll, w }; };
  let best = { a: 0.05, b: 0.9, ll: -Infinity, s: [] as number[], w: 0 };
  for (const a of [0.02, 0.05, 0.08, 0.12, 0.16]) for (const b of [0.7, 0.8, 0.85, 0.9, 0.93, 0.96]) { if (a + b >= 0.995) continue; const x = run(a, b); if (x.ll > best.ll) best = { a, b, ...x }; }
  const vols = best.s.map(v => Math.sqrt(v * 252)), win = vols.slice(-look), now = vols[vols.length - 1];
  return { vol: now, rank: win.filter(v => v < now).length / win.length, params: { w: best.w, a: best.a, b: best.b } };
}
/** IV quadrant: IV rank (vs its own 52-week range) against IV minus realized vol. Sell premium only in "high and rich". */
export function ivQuadrant(ivHist: number[], realized: number) {
  const iv = ivHist[ivHist.length - 1], lo = Math.min(...ivHist), hi = Math.max(...ivHist), rank = hi > lo ? (iv - lo) / (hi - lo) : 0.5, rich = iv > realized;
  const q = rank >= 0.5 ? (rich ? 'high & rich: sell premium' : 'high & fair: small size') : (rich ? 'low & rich: calendars' : 'low & cheap: buy premium or wait');
  return { iv, rank, realized, rich, quadrant: q, sell: rank >= 0.5 && rich };
}
/** Pin strike: the strike near spot with the largest positive net GEX (only meaningful in positive gamma). */
export const pinStrike = (strikes: { K: number; net: number }[], S: number, within = 0.01) =>
  strikes.filter(s => Math.abs(s.K / S - 1) <= within && s.net > 0).sort((a, b) => b.net - a.net)[0]?.K ?? NaN;

/** The playbook as one decision, with every reason shown. Paper only; sizes are caps (4.5% of the portfolio per name). */
export function flowPlaybook(x: { S: number; gex: ReturnType<typeof gexProfile>; garchRank: number; iv: ReturnType<typeof ivQuadrant>; print?: Print; largeCap?: boolean; dividend?: boolean; portfolio?: number; date?: string; events?: Event[] }) {
  const why: string[] = [], pos = x.gex.net > 0, flow = x.print ? bigFlow(x.print) : null, cap = Math.round((x.portfolio ?? 100_000) * 0.045);
  const bo = x.date ? blackout(x.date, x.events) : { blocked: false, why: '' };
  why.push(`dealer gamma ${pos ? 'positive' : 'negative'} (${(x.gex.net / 1e9).toFixed(2)}B per 1%)`); if (flow) why.push(flow.why);
  const flags = ['Assigned shares have no stop: decide your max loss before selling puts.', 'Win rates and the $200k to $1.4M claim are unproven.'];
  if (bo.blocked) return { action: 'stay out', why: [...why, `event blackout: ${bo.why}`], sizeUsd: 0, flags };
  if (!pos && !(flow?.big)) return { action: 'stay out', why: [...why, 'negative gamma and no confirming print'], sizeUsd: 0, flags };
  const nearPut = !isNaN(x.gex.putWall) && x.S <= x.gex.putWall * 1.01, nearCall = !isNaN(x.gex.callWall) && x.S >= x.gex.callWall * 0.99;
  if (nearPut && x.garchRank >= 0.7) return { action: 'buy near the put wall', why: [...why, `price at the put wall ${x.gex.putWall}`, `GARCH rank ${(x.garchRank * 100) | 0}%`], sizeUsd: cap, exit: 'take profit into the call wall; stop under the put wall', flags };
  if (flow?.big && x.print?.right === 'C') return { action: 'buy call, hedged', why: [...why, 'big call print', 'sell premium against it to pay for the call'], sizeUsd: cap, exit: 'take 50-90%; close at the open if it gaps', flags };
  const pin = pinStrike(x.gex.strikes, x.S);
  if (pos && !isNaN(pin)) return { action: `0DTE iron fly at the pin ${pin}`, why: [...why, 'positive gamma tends to pin price near the largest positive-gamma strike'], sizeUsd: Math.round(cap / 3), exit: 'take 50-90% of the credit; never hold through the close', flags };
  if (pos && !nearCall && !nearPut && x.iv.sell && (x.largeCap ?? true)) return { action: 'sell premium between the walls', why: [...why, `between put wall ${x.gex.putWall} and call wall ${x.gex.callWall}`, x.iv.quadrant, x.dividend ? 'dividend payer' : 'no dividend'], sizeUsd: cap, exit: 'take 50-90%; close at the open on a gap', flags };
  if (nearCall) return { action: 'no new longs: call wall overhead', why, sizeUsd: 0, flags };
  return { action: 'wait', why: [...why, x.iv.quadrant], sizeUsd: 0, flags };
}
