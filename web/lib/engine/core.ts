// Browser/serverless port of the Apex engine (engine/apex_engine). Same rules, same fills:
// decide on bar close, fill at next open, stops intrabar (stop first if both touched), fees both sides,
// size = equity * risk / stop distance capped at 1x equity notional.
export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };
export type Sig = { le: boolean[]; se: boolean[]; lx: boolean[]; sx: boolean[]; stop: number[]; target: number[]; maxBars?: number; fullSize?: boolean };
export type Trade = { side: 1 | -1; entryT: number; entry: number; stop: number; target: number; qty: number; exitT: number; exit: number; reason: string; pnl: number; r: number; bars: number };

const N = NaN;
export const sma = (x: number[], n: number) => { const o = new Array(x.length).fill(N); let s = 0; for (let i = 0; i < x.length; i++) { s += x[i]; if (i >= n) s -= x[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
export const ema = (x: number[], n: number) => { const o = new Array(x.length).fill(N); const k = 2 / (n + 1); let e = N; for (let i = 0; i < x.length; i++) { e = isNaN(e) ? x[i] : x[i] * k + e * (1 - k); if (i >= n - 1) o[i] = e; } return o; };
export const rma = (x: number[], n: number) => { const o = new Array(x.length).fill(N); let e = N; for (let i = 0; i < x.length; i++) { if (isNaN(x[i])) continue; e = isNaN(e) ? x[i] : (x[i] + e * (n - 1)) / n; if (i >= n - 1) o[i] = e; } return o; };
export const tr = (b: Bar[]) => b.map((x, i) => i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c)));
export const atr = (b: Bar[], n = 14) => rma(tr(b), n);
export const rsi = (c: number[], n = 14) => {
  const up = c.map((x, i) => (i ? Math.max(x - c[i - 1], 0) : 0)), dn = c.map((x, i) => (i ? Math.max(c[i - 1] - x, 0) : 0));
  const u = rma(up, n), d = rma(dn, n); return u.map((x, i) => (d[i] === 0 ? 100 : 100 - 100 / (1 + x / d[i])));
};
export const rollMax = (x: number[], n: number) => x.map((_, i) => (i < n - 1 ? N : Math.max(...x.slice(i - n + 1, i + 1))));
export const rollMin = (x: number[], n: number) => x.map((_, i) => (i < n - 1 ? N : Math.min(...x.slice(i - n + 1, i + 1))));
export const shift = (x: number[], k = 1) => x.map((_, i) => (i - k >= 0 ? x[i - k] : N));
export const stdev = (x: number[], n: number) => x.map((_, i) => { if (i < n - 1) return N; const s = x.slice(i - n + 1, i + 1); const m = s.reduce((a, b) => a + b, 0) / n; return Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / n); });
export const adx = (b: Bar[], n = 14) => {
  const p = b.map((x, i) => { if (!i) return 0; const u = x.h - b[i - 1].h, d = b[i - 1].l - x.l; return u > d && u > 0 ? u : 0; });
  const m = b.map((x, i) => { if (!i) return 0; const u = x.h - b[i - 1].h, d = b[i - 1].l - x.l; return d > u && d > 0 ? d : 0; });
  const t = rma(tr(b), n), pp = rma(p, n), mm = rma(m, n);
  const dx = t.map((_, i) => { const pd = 100 * pp[i] / t[i], md = 100 * mm[i] / t[i]; return 100 * Math.abs(pd - md) / (pd + md || N); });
  return rma(dx, n);
};

export function candles(b: Bar[]) {
  const body = b.map(x => Math.abs(x.c - x.o));
  return b.map((x, i) => {
    const rng = x.h - x.l || N, bd = body[i], up = x.h - Math.max(x.o, x.c), lo = Math.min(x.o, x.c) - x.l;
    const prev = i >= 3 ? (body[i - 1] + body[i - 2] + body[i - 3]) / 3 : N, p = b[i - 1];
    const bull = x.c > x.o, bear = x.c < x.o;
    const bullEng = !!p && bull && p.c < p.o && x.c >= p.o && x.o <= p.c && bd > body[i - 1];
    const bearEng = !!p && bear && p.c > p.o && x.c <= p.o && x.o >= p.c && bd > body[i - 1];
    const hammer = lo >= 2 * bd && up <= Math.max(bd, rng * 0.1) && lo / rng >= 0.55;
    const star = up >= 2 * bd && lo <= Math.max(bd, rng * 0.1) && up / rng >= 0.55;
    return { momBull: bull && bd >= 2 * prev, momBear: bear && bd >= 2 * prev, bullEng, bearEng, hammer, star, bullRev: hammer || bullEng, bearRev: star || bearEng };
  });
}

/** Confirmed fractal swings, placed on the confirmation bar (no lookahead). */
export function swings(b: Bar[], left = 3, right = 3) {
  const lastSH: number[] = [], lastSL: number[] = [], prevSH: number[] = [], prevSL: number[] = [];
  let sh = N, sl = N, psh = N, psl = N;
  for (let i = 0; i < b.length; i++) {
    const k = i - right;
    if (k - left >= 0) {
      const win = b.slice(k - left, k + right + 1);
      if (b[k].h === Math.max(...win.map(x => x.h))) { psh = sh; sh = b[k].h; }
      if (b[k].l === Math.min(...win.map(x => x.l))) { psl = sl; sl = b[k].l; }
    }
    lastSH.push(sh); lastSL.push(sl); prevSH.push(psh); prevSL.push(psl);
  }
  const trend = lastSH.map((_, i) => (lastSH[i] > prevSH[i] && lastSL[i] > prevSL[i] ? 1 : lastSH[i] < prevSH[i] && lastSL[i] < prevSL[i] ? -1 : 0));
  return { lastSH, lastSL, prevSH, prevSL, trend };
}

export function backtest(b: Bar[], s: Sig, o: { capital?: number; risk?: number; fee?: number; slip?: number } = {}) {
  const capital = o.capital ?? 10000, risk = o.risk ?? 0.01, fee = o.fee ?? 0.001, slip = o.slip ?? 0.0005;
  const a = atr(b, 14);
  let cash = capital, pos: Trade | null = null, pending: [1 | -1, number, number] | null = null, pendExit = false;
  const trades: Trade[] = [], eq: number[] = [];
  const close = (i: number, px0: number, why: string) => {
    const p = pos!; const px = px0 * (1 - slip * p.side);
    const gross = (px - p.entry) * p.qty * p.side, cost = fee * px * p.qty;
    cash += gross - cost;
    Object.assign(p, { exit: px, exitT: b[i].t, reason: why, pnl: gross - cost - fee * p.entry * p.qty });
    const ra = Math.abs(p.entry - p.stop) * p.qty; p.r = ra > 0 ? p.pnl / ra : 0;
    trades.push(p); pos = null;
  };
  for (let i = 0; i < b.length; i++) {
    if (pos && pendExit) { close(i, b[i].o, 'signal'); pendExit = false; }
    if (!pos && pending) {
      const [side, st0, tg] = pending; const px = b[i].o * (1 + slip * side);
      let st = st0; if (isNaN(st) || (side === 1 && st >= px) || (side === -1 && st <= px)) st = px - 2 * (a[i - 1] || px * 0.025) * side;
      const d = Math.abs(px - st);
      let qty = d > 0 ? Math.min(cash * risk / d, cash / px) : 0; if (s.fullSize) qty = cash / px;
      if (qty > 0) { cash -= fee * px * qty; pos = { side, entryT: b[i].t, entry: px, stop: st, target: tg, qty, exitT: 0, exit: N, reason: '', pnl: 0, r: 0, bars: 0 }; }
    }
    pending = null;
    if (pos) {
      const p: Trade = pos; p.bars++;
      if (p.side === 1) { if (b[i].l <= p.stop) close(i, Math.min(b[i].o, p.stop), 'stop'); else if (!isNaN(p.target) && b[i].h >= p.target) close(i, Math.max(b[i].o, p.target), 'target'); }
      else { if (b[i].h >= p.stop) close(i, Math.max(b[i].o, p.stop), 'stop'); else if (!isNaN(p.target) && b[i].l <= p.target) close(i, Math.min(b[i].o, p.target), 'target'); }
    }
    if (pos) { const p: Trade = pos; if ((p.side === 1 && s.lx[i]) || (p.side === -1 && s.sx[i]) || (s.maxBars && p.bars >= s.maxBars)) pendExit = true; }
    else if (i < b.length - 1) { if (s.le[i]) pending = [1, s.stop[i], s.target[i]]; else if (s.se[i]) pending = [-1, s.stop[i], s.target[i]]; }
    const p2 = pos as Trade | null;
    eq.push(cash + (p2 ? (b[i].c - p2.entry) * p2.qty * p2.side : 0));
  }
  if (pos) { close(b.length - 1, b[b.length - 1].c, 'end'); eq[eq.length - 1] = cash; }
  return { trades, equity: eq, metrics: metrics(b, eq, trades, capital) };
}

export function metrics(b: Bar[], eq: number[], trades: Trade[], capital: number) {
  const years = Math.max((b[b.length - 1].t - b[0].t) / (365.25 * 864e5), 1e-9);
  const tot = eq[eq.length - 1] / capital - 1;
  let peak = -Infinity, dd = 0; for (const e of eq) { peak = Math.max(peak, e); dd = Math.min(dd, e / peak - 1); }
  const rets = eq.map((e, i) => (i ? e / eq[i - 1] - 1 : 0)); const m = rets.reduce((x, y) => x + y, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((x, y) => x + (y - m) ** 2, 0) / rets.length);
  const ppy = 365.25 * 864e5 / ((b[b.length - 1].t - b[0].t) / (b.length - 1));
  const wins = trades.filter(t => t.pnl > 0), gp = wins.reduce((x, t) => x + t.pnl, 0), gl = -trades.filter(t => t.pnl <= 0).reduce((x, t) => x + t.pnl, 0);
  let st = 0, worst = 0; for (const t of trades) { st = t.pnl <= 0 ? st + 1 : 0; worst = Math.max(worst, st); }
  let bp = -Infinity, bdd = 0; for (const x of b) { bp = Math.max(bp, x.c); bdd = Math.min(bdd, x.c / bp - 1); }
  return {
    totalReturn: tot, cagr: tot > -1 ? (1 + tot) ** (1 / years) - 1 : -1, maxDrawdown: dd, sharpe: sd > 0 ? (m / sd) * Math.sqrt(ppy) : 0,
    trades: trades.length, winRate: trades.length ? wins.length / trades.length : 0, profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0,
    avgR: trades.length ? trades.reduce((x, t) => x + t.r, 0) / trades.length : 0, maxLosingStreak: worst,
    exposure: trades.reduce((x, t) => x + t.bars, 0) / eq.length, buyHold: b[b.length - 1].c / b[0].c - 1, buyHoldDD: bdd,
  };
}

/** Resample trade R-multiples to show the range of outcomes you should expect, not just the one history produced. */
export function monteCarlo(trades: Trade[], risk = 0.01, runs = 1000) {
  if (!trades.length) return null;
  const rs = trades.map(t => t.r); const dds: number[] = [], fin: number[] = [];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < runs; k++) {
    let e = 1, p = 1, d = 0;
    for (let j = 0; j < rs.length; j++) { e *= 1 + rs[Math.floor(rnd() * rs.length)] * risk; p = Math.max(p, e); d = Math.min(d, e / p - 1); }
    dds.push(d); fin.push(e - 1);
  }
  const q = (x: number[], pct: number) => [...x].sort((a, b) => a - b)[Math.floor(pct * (x.length - 1))];
  return { ddMedian: q(dds, 0.5), ddWorst5: q(dds, 0.05), ret5: q(fin, 0.05), retMedian: q(fin, 0.5), ret95: q(fin, 0.95), probLoss: fin.filter(x => x < 0).length / runs };
}

/** TradingView ta.supertrend. dir +1 = uptrend (price above line), -1 = downtrend. Same loop as engine/indicators.py. */
export function supertrend(b: Bar[], n = 10, mult = 3) {
  const a = atr(b, n), m = b.length, up = Array(m).fill(N), dn = Array(m).fill(N), line = Array(m).fill(N), dir = Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    if (isNaN(a[i])) continue;
    const hl2 = (b[i].h + b[i].l) / 2, bu = hl2 - mult * a[i], bd = hl2 + mult * a[i];
    const pu = i ? up[i - 1] : N, pd = i ? dn[i - 1] : N;
    up[i] = isNaN(pu) || b[i - 1].c < pu ? bu : Math.max(bu, pu);
    dn[i] = isNaN(pd) || b[i - 1].c > pd ? bd : Math.min(bd, pd);
    const prev = i ? dir[i - 1] : 0;
    dir[i] = prev === 1 ? (b[i].c < up[i] ? -1 : 1) : (b[i].c > dn[i] ? 1 : -1);
    line[i] = dir[i] === 1 ? up[i] : dn[i];
  }
  return { line, dir };
}
export const macd = (c: number[], f = 12, s = 26, g = 9) => { const a = ema(c, f), b2 = ema(c, s), m = a.map((x, i) => x - b2[i]); const sig = ema(m.map(x => (isNaN(x) ? 0 : x)), g).map((x, i) => (isNaN(m[i]) ? N : x)); return { macd: m, signal: sig, hist: m.map((x, i) => x - sig[i]) }; };
