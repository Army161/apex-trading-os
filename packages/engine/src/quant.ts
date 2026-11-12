// Quant research kit (archive/chat/87, an intro to quant trading: models, expected value, making and taking). Our own code,
// paper only. The video's examples are toy series; nothing here is an edge until it passes the usual checks on real data.
//  - AR(1) linear model on log returns, fit by ordinary least squares or by stochastic gradient descent. A negative weight
//    means mean reversion, a positive one means momentum.
//  - Expected value per trade net of fees, next to win rate (a high win rate can still lose money), plus a Sharpe readout.
//  - Mid price instead of last trade (no bid-ask bounce), and slippage by walking the book.
//  - Taking strategy with time-based entries and frequency scaling: forecast H bars ahead, open a slice every bar, hold each
//    slice H bars, so up to H slices overlap and the total is capped. Optional predicate (|prediction| >= threshold).
//  - Sizing: constant (the baseline), hardtanh and tanh of the scaled prediction, each capped at maxSize.
import { Bar } from './core';

export const logReturns = (p: number[]) => p.map((x, i) => (i ? Math.log(x / p[i - 1]) : 0)).slice(1);
export const midPrice = (bid: number, ask: number) => (bid + ask) / 2;

export type Lin = { w: number; b: number };
export const behaviour = (m: Lin) => (m.w < 0 ? 'mean_reversion' : m.w > 0 ? 'momentum' : 'none');

/** Closed-form least squares for y = w x + b. */
export function olsFit(x: number[], y: number[]): Lin {
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const w = sxx > 0 ? sxy / sxx : 0; return { w, b: my - w * mx };
}

/** Mini-batch gradient descent on mean squared error, inputs standardised internally so one learning rate works. */
export function sgdFit(x: number[], y: number[], o: { lr?: number; epochs?: number; batch?: number; seed?: number } = {}): Lin {
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, sx = Math.sqrt(x.reduce((a, b) => a + (b - mx) ** 2, 0) / n) || 1;
  const my = y.reduce((a, b) => a + b, 0) / n, sy = Math.sqrt(y.reduce((a, b) => a + (b - my) ** 2, 0) / n) || 1;
  const lr = o.lr ?? 0.05, ep = o.epochs ?? 50, bs = o.batch ?? 32; let w = 0, b = 0, seed = o.seed ?? 1;
  const idx = Array.from({ length: n }, (_, i) => i), rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let e = 0; e < ep; e++) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let s = 0; s < n; s += bs) {
      let gw = 0, gb = 0; const end = Math.min(n, s + bs);
      for (let k = s; k < end; k++) { const xi = (x[idx[k]] - mx) / sx, yi = (y[idx[k]] - my) / sy, err = w * xi + b - yi; gw += err * xi; gb += err; }
      w -= lr * 2 * gw / (end - s); b -= lr * 2 * gb / (end - s);
    }
  }
  const W = w * sy / sx; return { w: W, b: my + b * sy - W * mx };   // back to raw units
}

/** AR(1)-style pairs: feature = log return over the last h bars, target = log return over the next h bars. */
export function arPairs(close: number[], h = 1) {
  const x: number[] = [], y: number[] = [], at: number[] = [];
  for (let i = h; i + h < close.length; i++) { x.push(Math.log(close[i] / close[i - h])); y.push(Math.log(close[i + h] / close[i])); at.push(i); }
  return { x, y, at };
}

/** Expected value per trade net of fees, with the win rate next to it so the two can't be confused. */
export function expectedValue(pnls: number[]) {
  const n = pnls.length, w = pnls.filter(p => p > 0), l = pnls.filter(p => p <= 0);
  const avgW = w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0, avgL = l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0;
  const winRate = n ? w.length / n : 0;
  return { n, ev: n ? pnls.reduce((a, b) => a + b, 0) / n : 0, winRate, avgWin: avgW, avgLoss: avgL, check: winRate * avgW + (1 - winRate) * avgL };
}
export const sharpe = (r: number[], periodsPerYear: number) => { const n = r.length, m = r.reduce((a, b) => a + b, 0) / n, s = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / n); return s > 0 ? (m / s) * Math.sqrt(periodsPerYear) : 0; };

/** Fill a market order by walking the book. levels = [price, qty], best first. Slippage is vs the best price. */
export function walkBook(levels: [number, number][], qty: number) {
  let left = qty, cost = 0, used = 0;
  for (const [p, q] of levels) { if (left <= 0) break; const take = Math.min(q, left); cost += take * p; left -= take; used++; }
  const filled = qty - left, avg = filled ? cost / filled : NaN;
  return { filled, avgPrice: avg, slippage: filled ? Math.abs(avg - levels[0][0]) : 0, levelsUsed: used, unfilled: left };
}

export type Sizing = 'constant' | 'hardtanh' | 'tanh';
/** Signed size from a prediction. scale turns a predicted log return into "units of conviction" (1 = full size). */
export function size(pred: number, how: Sizing, maxSize = 1, scale = 1) {
  const z = pred * scale;
  if (how === 'constant') return Math.sign(pred) * maxSize;
  if (how === 'hardtanh') return maxSize * Math.max(-1, Math.min(1, z));
  return maxSize * Math.tanh(z);
}

export type TakeOpts = { h?: number; train?: number; fit?: 'ols' | 'sgd'; sizing?: Sizing; threshold?: number; thresholdQ?: number; fee?: number; scale?: number; refitEvery?: number };
/** Time-based taking strategy with frequency scaling. Fits on the first `train` share of bars (time order, never shuffled),
 *  then trades the rest: every bar opens a slice of 1/h of capital in the predicted direction, held h bars. Returns per-slice
 *  net P&L (as a fraction of capital), per-bar returns, and the model. Fees are charged on each slice's entry and exit. */
export function takeStrategy(b: Bar[], o: TakeOpts = {}) {
  const h = o.h ?? 12, fee = o.fee ?? 0.0002, c = b.map(x => x.c), split = Math.floor(b.length * (o.train ?? 0.6));
  const pr = arPairs(c.slice(0, split), h), model = o.fit === 'sgd' ? sgdFit(pr.x, pr.y) : olsFit(pr.x, pr.y);
  // scale so a typical training prediction maps to |z| = 1, which makes hardtanh/tanh comparable with constant size
  const ps = pr.x.map(x => model.w * x + model.b), sd = Math.sqrt(ps.reduce((a, v) => a + v * v, 0) / Math.max(1, ps.length));
  const scale = o.scale ?? (sd > 0 ? 1 / sd : 1);
  // thresholdQ: only trade predictions stronger than this quantile of |prediction| on the training data (0.7 = top 30%)
  let thr = o.threshold ?? 0;
  if (o.thresholdQ) { const ap = pr.x.map(x => Math.abs(model.w * x + model.b)).sort((a, b) => a - b); thr = ap[Math.floor(o.thresholdQ * (ap.length - 1))] ?? 0; }
  const slices: number[] = [], bar = Array(b.length).fill(0);
  for (let i = Math.max(split, h); i + h < b.length; i++) {
    const pred = model.w * Math.log(c[i] / c[i - h]) + model.b;
    if (thr && Math.abs(pred) < thr) continue;
    const s = size(pred, o.sizing ?? 'constant', 1, scale) / h;              // each slice is at most 1/h of capital
    if (!s) continue;
    slices.push(s * (c[i + h] / c[i] - 1) - Math.abs(s) * 2 * fee);
    for (let k = 1; k <= h; k++) bar[i + k] += s * (c[i + k] / c[i + k - 1] - 1);
    bar[i + 1] -= Math.abs(s) * fee; bar[i + h] -= Math.abs(s) * fee;
  }
  const test = bar.slice(split + 1), hold = c[c.length - 1] / c[split] - 1;
  return { model, behaviour: behaviour(model), ev: expectedValue(slices), barReturns: test, total: test.reduce((a, r) => a * (1 + r), 1) - 1, buyHold: hold };
}
