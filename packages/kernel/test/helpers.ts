import type { Bar, Sig } from '@apex/engine/core';
export const rng = (seed = 7) => { let s = Math.max(1, Math.floor(seed) % 2147483647); return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());
const DAY = 864e5, T0 = Date.UTC(2015, 0, 5);

/** Daily bars. Every `every` bars a marker bar (v = 2) is followed by `len` bars that drift up by `drift` each. Set drift 0 for pure noise. */
export function plantedBars(n = 2200, o: { seed?: number; every?: number; len?: number; drift?: number; vol?: number } = {}): Bar[] {
  const r = rng(o.seed ?? 3), every = o.every ?? 12, len = o.len ?? 4, drift = o.drift ?? 0.006, vol = o.vol ?? 0.005, out: Bar[] = []; let c = 100;
  for (let i = 0; i < n; i++) {
    const k = i % every, mu = k >= 1 && k <= len ? drift : 0, open = c, ret = mu + vol * gauss(r); c = open * (1 + ret);
    const hi = Math.max(open, c) * (1 + Math.abs(vol * 0.3 * gauss(r))), lo = Math.min(open, c) * (1 - Math.abs(vol * 0.3 * gauss(r)));
    out.push({ t: T0 + i * DAY, o: open, h: hi, l: lo, c, v: k === 0 ? 2 : 1 });
  }
  return out;
}
const blank = (n: number): Sig => ({ le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(NaN), target: Array(n).fill(NaN) });
/** Buys the marker bar's close, holds `hold` bars, stop 3% below. Has a real edge on plantedBars with drift > 0. */
export const markerStrategy = (hold = 4) => (b: Bar[]): Sig => { const s = blank(b.length); b.forEach((x, i) => { if (x.v === 2) { s.le[i] = true; s.stop[i] = x.c * 0.97; } }); s.maxBars = hold; return s; };
/** Cheats: buys when the NEXT bar closes up. */
export const lookahead = (b: Bar[]): Sig => { const s = blank(b.length); for (let i = 0; i < b.length - 1; i++) if (b[i + 1].c > b[i + 1].o * 1.002) { s.le[i] = true; s.stop[i] = b[i].c * 0.97; } s.maxBars = 1; return s; };
/** No edge: buys on a coin flip that depends only on the seed. */
export const coinFlip = (seed: number, p = 0.08) => (b: Bar[]): Sig => { const s = blank(b.length), r = rng(seed); b.forEach((x, i) => { if (r() < p) { s.le[i] = true; s.stop[i] = x.c * 0.97; } }); s.maxBars = 3; return s; };
export const COST = { fee: 0.0002, slip: 0.0001 };
