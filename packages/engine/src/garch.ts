// GARCH volatility-premium + intraday momentum-extreme rule (archive/chat/82, a free online algo-trading course, project 3).
// Our own code, paper only. The course ran it on SIMULATED data, so its equity curve proves nothing; here it runs on real bars.
//  Daily: fit a GARCH on a rolling 180-day window of log returns and forecast tomorrow's variance. Prediction premium =
//    (forecast - rolling 180-day variance) / rolling variance. Signal +1 when the premium is above 1.5 rolling standard
//    deviations of itself, -1 when below -1.5. Used the NEXT day only.
//  Intraday: RSI(20) above 70 with a close above the upper Bollinger band (20, 2) is +1; RSI below 30 with a close below the
//    lower band is -1.
//  Trade: daily +1 and intraday +1 means short (fade the stretch); daily -1 and intraday -1 means long. One trade a day,
//    flat before the close.
// Differences from the course, on purpose: GARCH(1,1) instead of his brute-forced (1,3) (fewer parameters to overfit), refit
// every 5 days with a warm start, and sizing by the engine's fixed 1% risk with a 2 ATR stop rather than all-in.
import { Bar, Sig, rsi, sma, stdev } from './core';
import { resample } from './trend';
import { nyHM } from './ict';

/** Small Nelder-Mead minimiser, enough for three parameters. */
export function nelderMead(f: (x: number[]) => number, x0: number[], iters = 200, step = 0.5) {
  const n = x0.length; let s = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + step : v)))].map(x => ({ x, v: f(x) }));
  for (let k = 0; k < iters; k++) {
    s.sort((a, b) => a.v - b.v);
    const c = x0.map((_, j) => s.slice(0, n).reduce((a, p) => a + p.x[j], 0) / n), w = s[n];
    const at = (t: number) => { const x = c.map((v, j) => v + t * (w.x[j] - v)); return { x, v: f(x) }; };
    const r = at(-1);
    if (r.v < s[0].v) { const e = at(-2); s[n] = e.v < r.v ? e : r; }
    else if (r.v < s[n - 1].v) s[n] = r;
    else { const ct = at(0.5); if (ct.v < w.v) s[n] = ct; else s = s.map((p, i) => (i === 0 ? p : (() => { const x = p.x.map((v, j) => s[0].x[j] + 0.5 * (v - s[0].x[j])); return { x, v: f(x) }; })())); }
  }
  s.sort((a, b) => a.v - b.v); return s[0];
}

const sig = (z: number) => 1 / (1 + Math.exp(-z));
/** Parameters from unconstrained z: omega > 0, alpha, beta >= 0, alpha + beta < 1. */
export const garchParams = (z: number[], v0: number) => { const p = 0.999 * sig(z[2]), a = p * sig(z[1]); return { omega: v0 * (1 - p) * Math.exp(z[0]), alpha: a, beta: p - a }; };

/** GARCH(1,1) fit by Gaussian maximum likelihood. Returns the parameters, the next-step variance forecast and the z used. */
export function garchFit(r: number[], z0 = [0, -1.5, 2.5]) {
  const m = r.reduce((a, b) => a + b, 0) / r.length, e = r.map(x => x - m), v0 = e.reduce((a, b) => a + b * b, 0) / e.length || 1e-8;
  const nll = (z: number[]) => {
    const { omega, alpha, beta } = garchParams(z, v0); let h = v0, s = 0;
    for (const x of e) { s += Math.log(h) + (x * x) / h; h = omega + alpha * x * x + beta * h; }
    return isFinite(s) ? s : 1e12;
  };
  const best = nelderMead(nll, z0, 150), p = garchParams(best.x, v0);
  let h = v0; for (const x of e) h = p.omega + p.alpha * x * x + p.beta * h;
  return { ...p, forecast: h, z: best.x, v0 };
}

/** Daily signal per daily bar (already shifted: value at day k is usable during day k). */
export function garchDailySignal(d: Bar[], win = 180, refit = 5, k = 1.5) {
  const lr = d.map((x, i) => (i ? Math.log(x.c / d[i - 1].c) : 0)), n = d.length;
  const variance = Array(n).fill(NaN), pred = Array(n).fill(NaN);
  let z: number[] | undefined, p: ReturnType<typeof garchFit> | null = null;
  for (let i = win; i < n; i++) {
    const w = lr.slice(i - win + 1, i + 1), m = w.reduce((a, b) => a + b, 0) / win;
    variance[i] = w.reduce((a, b) => a + (b - m) ** 2, 0) / (win - 1);
    if (!p || (i - win) % refit === 0) { p = garchFit(w, z); z = p.z; pred[i] = p.forecast; }
    else { let h = p.v0; for (const x of w) h = p.omega + p.alpha * (x - m) ** 2 + p.beta * h; pred[i] = h; }   // same params, new data
  }
  const prem = pred.map((x, i) => (x - variance[i]) / variance[i]), sd = stdev(prem.map(x => (isNaN(x) ? 0 : x)), win);
  const raw = prem.map((x, i) => (isNaN(x) || i < 2 * win ? 0 : x > k * sd[i] ? 1 : x < -k * sd[i] ? -1 : 0));
  return { signal: raw.map((_, i) => (i ? raw[i - 1] : 0)), premium: prem, variance, pred };   // shift: today's close -> tomorrow
}

export function garchIntraday(o: { win?: number; rsiN?: number; bbN?: number; bbK?: number; k?: number } = {}) {
  return (b: Bar[]): Sig => {
    const n = b.length, s: Sig = { le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(NaN), target: Array(n).fill(NaN) };
    if (n < 50) return s;
    const day = resample(b, 864e5), ds = garchDailySignal(day.bars, o.win ?? 180, 5, o.k ?? 1.5).signal;
    const c = b.map(x => x.c), r = rsi(c, o.rsiN ?? 20), m = sma(c, o.bbN ?? 20), sd = stdev(c, o.bbN ?? 20), kk = o.bbK ?? 2;
    let traded = -1;
    const stepMin = Math.round((b[1].t - b[0].t) / 6e4);
    for (let i = 1; i < n; i++) {
      // the session end comes from the clock (16:00 New York), never from peeking at the next bar's date
      const di = day.idx[i], late = nyHM(b[i].t) + 2 * stepMin >= 960;
      if (late) { s.lx[i] = s.sx[i] = true; }                           // exit fills at the open of the day's last bar
      if (late || traded === di || isNaN(sd[i])) continue;
      const up = r[i] > 70 && c[i] > m[i] + kk * sd[i], dn = r[i] < 30 && c[i] < m[i] - kk * sd[i];
      if (ds[di] === 1 && up) { s.se[i] = true; traded = di; }
      else if (ds[di] === -1 && dn) { s.le[i] = true; traded = di; }
    }
    return s;
  };
}
