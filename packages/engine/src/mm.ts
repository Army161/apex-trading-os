// Paper market-making research (archive/chat/77, a crypto HFT talk). Our own code. Nothing here can place an order: it only
// replays recorded quotes and trades. The talk's own warning applies: simple spread capture and cross-exchange arbitrage
// worked for its speakers in 2017 and stopped working once bigger firms arrived. Every result here is unproven until it beats
// holding the same balances (holdSameBalances in validate.ts) on time-ordered test data (timeSplit).

export type Quote = { t: number; bid: number; ask: number };          // t in ms
export type Print = { t: number; price: number; side: 'buy' | 'sell'; qty: number }; // side = the aggressor (taker)

export type MMOpts = {
  size?: number;          // units quoted on each side
  makerFee?: number;      // fraction per fill, e.g. 0.001 = 0.1%
  maxInventory?: number;  // stop quoting the side that would push inventory past this
  markoutMs?: number;     // how long after a fill to measure adverse selection
  improve?: number;       // fraction of the spread to step inside the best quote (0 = join the best quote)
  // chat/87: a model's predicted mid move (as a fraction of mid) shifts both quotes the same way; the spread is unchanged.
  predict?: (t: number, mid: number) => number;
  skewK?: number;         // how much of the predicted move to shift by (1 = all of it)
  // chat/87: widen to volSpreadK x recent mid volatility (std of mid changes over the last volWindow quotes), never inside the book
  volSpreadK?: number;
  volWindow?: number;
};

export type MMResult = {
  fills: number; buys: number; sells: number;
  spreadPnl: number;      // what fills earned against the mid at the time of the fill
  fees: number;
  adverse: number;        // mid move against us markoutMs after each fill (positive = cost)
  inventoryPnl: number;   // mark-to-market of what we still hold at the end
  net: number;            // spreadPnl - fees - adverse + inventory drift not already in adverse
  endInventory: number;
  spreadVsFee: { avgSpreadPct: number; roundTripFeePct: number; spreadBeatsFees: boolean };
};

const mid = (q: Quote) => (q.bid + q.ask) / 2;

/** Last quote at or before t (quotes sorted by t). */
function quoteAt(qs: Quote[], t: number) {
  let lo = 0, hi = qs.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (qs[m].t <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans < 0 ? null : qs[ans];
}

/** Standard deviation of mid-to-mid changes over the last n quotes before t. */
function volAt(qs: Quote[], t: number, n: number) {
  let lo = 0, hi = qs.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (qs[m].t <= t) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k < 2) return 0; const d: number[] = []; for (let i = Math.max(1, k - n + 1); i <= k; i++) d.push(mid(qs[i]) - mid(qs[i - 1]));
  const mu = d.reduce((a, b) => a + b, 0) / d.length; return Math.sqrt(d.reduce((a, b) => a + (b - mu) ** 2, 0) / d.length);
}

/** Naive two-sided quoting replayed against real prints. Our bid fills when a seller hits at or below it, our ask when a
 *  buyer lifts at or above it. This is optimistic (we assume we are first in the queue), so treat a loss here as a real loss
 *  and a profit here as an upper bound. */
export function simulateMM(quotes: Quote[], prints: Print[], o: MMOpts = {}): MMResult {
  const size = o.size ?? 1, fee = o.makerFee ?? 0.001, maxInv = o.maxInventory ?? 5 * size, mo = o.markoutMs ?? 5000, imp = o.improve ?? 0;
  let inv = 0, cash = 0, spreadPnl = 0, fees = 0, adverse = 0, buys = 0, sells = 0;
  for (const p of prints) {
    const q = quoteAt(quotes, p.t); if (!q || q.ask <= q.bid) continue;
    const m = mid(q), sp = q.ask - q.bid;
    let myBid = q.bid + imp * sp / 2, myAsk = q.ask - imp * sp / 2;
    if (o.volSpreadK) { const half = Math.max((myAsk - myBid) / 2, o.volSpreadK * volAt(quotes, p.t, o.volWindow ?? 50)); myBid = m - half; myAsk = m + half; }
    if (o.predict) { const shift = (o.skewK ?? 1) * o.predict(p.t, m) * m; myBid += shift; myAsk += shift; }
    let side: 1 | -1 | 0 = 0, px = 0;
    if (p.side === 'sell' && p.price <= myBid && inv + size <= maxInv) { side = 1; px = myBid; }
    else if (p.side === 'buy' && p.price >= myAsk && inv - size >= -maxInv) { side = -1; px = myAsk; }
    if (!side) continue;
    const qty = Math.min(size, p.qty);
    inv += side * qty; cash -= side * qty * px; fees += qty * px * fee;
    spreadPnl += side * qty * (m - px);
    const later = quoteAt(quotes, p.t + mo); if (later) adverse += -side * qty * (mid(later) - m);
    side === 1 ? buys++ : sells++;
  }
  const last = quotes[quotes.length - 1], lastMid = last ? mid(last) : 0;
  const total = cash + inv * lastMid - fees;
  const spreads = quotes.filter(q => q.ask > q.bid).map(q => (q.ask - q.bid) / mid(q));
  const avgSpreadPct = spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : 0;
  return {
    fills: buys + sells, buys, sells, spreadPnl, fees, adverse, inventoryPnl: total - (spreadPnl - fees),
    net: total, endInventory: inv,
    spreadVsFee: { avgSpreadPct, roundTripFeePct: 2 * fee, spreadBeatsFees: avgSpreadPct > 2 * fee },
  };
}

// ---------------- lead-lag between two venues or two quote currencies ----------------
export type Tick = { t: number; p: number };

/** Resample to a fixed step (last value carried forward), from the later start to the earlier end of the two series. */
export function align(a: Tick[], b: Tick[], stepMs = 1000) {
  const t0 = Math.max(a[0].t, b[0].t), t1 = Math.min(a[a.length - 1].t, b[b.length - 1].t), out: { t: number; a: number; b: number }[] = [];
  let i = 0, j = 0;
  for (let t = t0; t <= t1; t += stepMs) {
    while (i + 1 < a.length && a[i + 1].t <= t) i++;
    while (j + 1 < b.length && b[j + 1].t <= t) j++;
    out.push({ t, a: a[i].p, b: b[j].p });
  }
  return out;
}

/** Remove the constant gap between two venues (the talk: withdrawal fees keep one exchange a little cheaper). Uses the median
 *  of the log ratio, so a few spikes don't move it. */
export function removeOffset(rows: { a: number; b: number }[]) {
  const r = rows.map(x => Math.log(x.a / x.b)).sort((x, y) => x - y), off = r[Math.floor(r.length / 2)] ?? 0;
  return { offsetPct: Math.exp(off) - 1, rows: rows.map(x => ({ ...x, b: x.b * Math.exp(off) })) };
}

/** Cross-currency: turn a BTC/EUR series into USD with the EUR/USD rate so it can be compared with BTC/USD. */
export const convert = (pair: Tick[], fx: Tick[]) => {
  let j = 0;
  return pair.map(x => { while (j + 1 < fx.length && fx[j + 1].t <= x.t) j++; return { t: x.t, p: x.p * fx[j].p }; });
};

const corr = (x: number[], y: number[]) => {
  const n = Math.min(x.length, y.length); if (n < 3) return 0;
  const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n, my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let k = 0; k < n; k++) { const dx = x[k] - mx, dy = y[k] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
};

/** Correlation of a's returns now with b's returns `lag` steps later, for lags 0..maxLag. A clear peak at lag k > 0 means
 *  venue a tends to move first. Positive lag: a leads; the function also checks b leading a. */
export function leadLag(a: Tick[], b: Tick[], o: { stepMs?: number; maxLag?: number } = {}) {
  const step = o.stepMs ?? 1000, maxLag = o.maxLag ?? 30;
  const { rows, offsetPct } = removeOffset(align(a, b, step));
  const ra = rows.slice(1).map((x, k) => Math.log(x.a / rows[k].a)), rb = rows.slice(1).map((x, k) => Math.log(x.b / rows[k].b));
  const byLag: { lag: number; corr: number }[] = [];
  for (let L = -maxLag; L <= maxLag; L++) byLag.push({ lag: L, corr: L >= 0 ? corr(ra, rb.slice(L)) : corr(ra.slice(-L), rb) });
  const best = byLag.reduce((m, x) => (x.corr > m.corr ? x : m), byLag[0]);
  return { offsetPct, steps: rows.length, best, leader: best.lag > 0 ? 'a' : best.lag < 0 ? 'b' : 'same time', lagMs: best.lag * step, byLag };
}
