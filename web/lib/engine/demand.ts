// Demand and the second leg (archive/chat/56). Our own rules from the video: spot an unusually fast, large move (demand), don't
// chase leg one, let the pullback trap the chasers, and enter leg two only after a new pullback low is followed by a break back
// above the pullback's last swing high ("the crazies are back"). The stop goes where the idea is wrong (beyond the pullback
// extreme), and reward/risk is looked at only after that. Moving averages are a guide, not a rule.
import { Bar, Sig, atr, sma, ema } from './core';
import { resample } from './trend';
import { blackout, Event } from './options';

const empty = (n: number): Sig => ({ le: Array(n).fill(false), se: Array(n).fill(false), lx: Array(n).fill(false), sx: Array(n).fill(false), stop: Array(n).fill(NaN), target: Array(n).fill(NaN) });

/** Impulse (demand) per bar: +1 / -1 when the last `k` bars moved at least `mult` x ATR, else 0. */
export function impulses(b: Bar[], k = 5, mult = 3) {
  const a = atr(b);
  return b.map((x, i) => i < k || isNaN(a[i - k]) ? 0 : x.c - b[i - k].c >= mult * a[i - k] ? 1 : b[i - k].c - x.c >= mult * a[i - k] ? -1 : 0) as (0 | 1 | -1)[];
}

/** Second-leg entry. `ma` = [fast, mid, slow] guide: longs only when fast > mid and price > slow (mirror for shorts); pass null to skip.
 *  Pullback must retrace between `minDepth` and `maxDepth` of the impulse (too deep = "dirty demand"). Setup expires after `life` bars.
 *  Target: leg two equal to leg one, measured from the pullback extreme. */
export const secondLeg = (o: { k?: number; mult?: number; minDepth?: number; maxDepth?: number; life?: number; ma?: [number, number, number] | null } = {}) => (b: Bar[]): Sig => {
  const k = o.k ?? 5, mult = o.mult ?? 3, minD = o.minDepth ?? 0.3, maxD = o.maxDepth ?? 0.786, life = o.life ?? 60, ma = o.ma === undefined ? [20, 50, 200] : o.ma;
  const s = empty(b.length), a = atr(b), imp = impulses(b, k, mult), c = b.map(x => x.c);
  const [f, m, sl] = ma ? [sma(c, ma[0]), sma(c, ma[1]), sma(c, ma[2])] : [[], [], []];
  type St = { dir: 0 | 1 | -1; start: number; ext: number; born: number; pbExt: number; pbSwing: number; newExt: boolean; base: number };
  let st: St | null = null;
  for (let i = 1; i < b.length; i++) {
    const x = b[i];
    if (imp[i] && (!st || st.dir !== imp[i] || i - st.born > 3)) {
      // a fresh impulse: leg one. Start = where the move began (lowest low / highest high of the last k bars)
      const win = b.slice(i - k, i + 1), d = imp[i];
      st = { dir: d, start: d === 1 ? Math.min(...win.map(y => y.l)) : Math.max(...win.map(y => y.h)), ext: d === 1 ? x.h : x.l, born: i, pbExt: NaN, pbSwing: NaN, newExt: false, base: i };
      continue;
    }
    if (!st) continue;
    if (i - st.born > life) { st = null; continue; }
    const d = st.dir;
    if (isNaN(st.pbExt)) {                                    // still in leg one: extend the impulse extreme
      if (d === 1 ? x.h > st.ext : x.l < st.ext) { st.ext = d === 1 ? x.h : x.l; continue; }
      st.pbExt = d === 1 ? x.l : x.h; st.pbSwing = d === 1 ? x.h : x.l; continue;   // pullback starts: this bar is the guy who started it
    }
    const leg = Math.abs(st.ext - st.start), depth = Math.abs(st.ext - (d === 1 ? Math.min(st.pbExt, x.l) : Math.max(st.pbExt, x.h))) / leg;
    if (depth > maxD) { st = null; continue; }                // too much discount: dirty demand, forget it
    if (d === 1 ? x.l < st.pbExt : x.h > st.pbExt) {         // new pullback extreme: the swing to beat is the high since the last one
      st.pbExt = d === 1 ? x.l : x.h; st.newExt = true; st.pbSwing = d === 1 ? x.h : x.l; continue;
    }
    if (d === 1 ? x.h > st.pbSwing && x.c <= st.pbSwing : x.l < st.pbSwing && x.c >= st.pbSwing) { st.pbSwing = d === 1 ? x.h : x.l; }
    const back = st.newExt && depth >= minD && (d === 1 ? x.c > st.pbSwing : x.c < st.pbSwing);
    const guide = !ma || (d === 1 ? f[i] > m[i] && x.c > sl[i] : f[i] < m[i] && x.c < sl[i]);
    if (back && guide) {
      const stop = st.pbExt - d * 0.25 * a[i];
      if (d === 1) s.le[i] = true; else s.se[i] = true;
      s.stop[i] = stop; s.target[i] = st.pbExt + d * leg;
      st = null;
    } else if (back) st = null;
  }
  return s;
};

/** Related-markets check: does `other` show a demand impulse in the same direction within `within` bars (aligned by time)? */
export function relatedDemand(b: Bar[], other: Bar[], o: { k?: number; mult?: number; within?: number } = {}) {
  const imp = impulses(other, o.k ?? 5, o.mult ?? 2.5), w = (o.within ?? 20) * (b.length > 1 ? b[1].t - b[0].t : 3600e3);
  const ev = other.map((x, i) => ({ t: x.t, d: imp[i] })).filter(e => e.d);
  return b.map(x => { const hit = ev.filter(e => e.t <= x.t && x.t - e.t <= w); return hit.length ? hit[hit.length - 1].d : 0; });
}
/** Keep only signals whose direction is confirmed by a related market's recent demand. */
export const withRelated = (build: (b: Bar[]) => Sig, other: Bar[]) => (b: Bar[]): Sig => {
  const s = build(b), r = relatedDemand(b, other);
  return { ...s, le: s.le.map((v, i) => v && r[i] === 1), se: s.se.map((v, i) => v && r[i] === -1) };
};

// ---------------- sharp reversal, then buy the flag buyers' stops (archive/chat/57) ----------------
/** Long only, uptrends only (EMA50 > EMA200 at the top). Steps:
 *  1. Parabolic: close at least `farAtr` ATR above the EMA20, and the last 5 bodies average 1.5x the 20 before (candles growing at the end).
 *  2. Sharp reversal: within `fast` bars of the top, price falls `dropAtr` ATR or more. Don't buy that dip.
 *  3. Lower highs until the first higher low (2-bar pivots); a close above the highest high since the reversal low = the flag breakout.
 *  4. Area of interest = the flag buyers' stops: the higher-low pivot (below the flag). Wait up to `life` bars for price to trade
 *     below it and close back above (the sweep). Enter then. Stop a quarter ATR under the sweep low; target 2R. Expect a delay. */
export const sharpReversal = (o: { farAtr?: number; dropAtr?: number; fast?: number; life?: number; r?: number } = {}) => (b: Bar[]): Sig => {
  const far = o.farAtr ?? 3, drop = o.dropAtr ?? 3, fast = o.fast ?? 8, life = o.life ?? 80, r = o.r ?? 2;
  const s = empty(b.length), c = b.map(x => x.c), a = atr(b), e20 = ema(c, 20), e50 = ema(c, 50), e200 = ema(c, 200), body = b.map(x => Math.abs(x.c - x.o));
  type St = { phase: 'top' | 'down' | 'flag' | 'aoi'; top: number; topI: number; low: number; lowI: number; piv: number[]; aoi: number; resist: number; since: number };
  let st: St | null = null;
  const avg = (i: number, n: number, back = 0) => { let t = 0; for (let j = i - back - n + 1; j <= i - back; j++) t += body[j]; return t / n; };
  for (let i = 30; i < b.length; i++) {
    const x = b[i];
    const para = x.c - e20[i] >= far * a[i] && avg(i, 5) >= 1.5 * avg(i, 20, 5) && e50[i] > e200[i];
    if (para && (!st || st.phase === 'top')) { if (!st || x.h > st.top) st = { phase: 'top', top: x.h, topI: i, low: Infinity, lowI: i, piv: [], aoi: NaN, resist: -Infinity, since: i }; continue; }
    if (!st) continue;
    if (i - st.since > life + fast) { st = null; continue; }
    if (st.phase === 'top') {
      if (x.h > st.top) { st.top = x.h; st.topI = i; }
      if (st.top - x.l >= drop * a[st.topI]) { st.phase = 'down'; st.low = x.l; st.lowI = i; st.since = i; }
      else if (i - st.topI > fast) st = null;
      continue;
    }
    if (x.l < st.low && st.phase === 'down') { st.low = x.l; st.lowI = i; }
    const k = i - 2; // 2-bar pivot low confirmed at i
    if (k - 2 > 0 && b[k].l < b[k - 1].l && b[k].l < b[k - 2].l && b[k].l < b[k + 1].l && b[k].l < b[k + 2].l) st.piv.push(b[k].l);
    if (st.phase === 'down') {
      const n = st.piv.length;
      if (n >= 2 && st.piv[n - 1] > st.piv[n - 2]) { st.phase = 'flag'; st.aoi = st.piv[n - 1]; st.resist = Math.max(...b.slice(st.lowI, i + 1).map(y => y.h)); }
      continue;
    }
    if (st.phase === 'flag') {
      if (x.l < st.aoi) { st.phase = 'down'; st.piv = []; continue; }              // the higher low failed before a breakout: start again
      if (x.c > st.resist) { st.phase = 'aoi'; st.since = i; }                    // breakout buyers are in; their stops sit under the flag
      continue;
    }
    if (st.phase === 'aoi') {
      if (i - st.since > life) { st = null; continue; }
      if (x.l < st.aoi && x.c > st.aoi && x.c > e200[i]) {
        const stop = x.l - 0.25 * a[i]; s.le[i] = true; s.stop[i] = stop; s.target[i] = x.c + r * (x.c - stop); st = null;
      } else if (x.c < st.aoi - 2 * a[i]) st = null;                              // it broke down hard instead: no trade
    }
  }
  return s;
};

// ---------------- rubber band + "guy who started it" (archive/chat/59) and discount from the anchor (chat/58) ----------------

/** Rubber band and GWS tracker for a falling market (`dir` -1; mirror for +1). For each new record low it stores how far the
 *  record was extended and how deep the bounce before it was (as a share of the previous leg). GWS = the highest high between the
 *  previous record and the new one: the swing that started the move that broke the record. */
export function gwsTrack(b: Bar[], dir: 1 | -1) {
  const a = atr(b), out: { gws: number; tests: number; legs: number; fading: boolean }[] = [];
  let rec = NaN, recI = -1, gws = NaN, tests = 0, ext: number[] = [], pb: number[] = [], legHi = NaN, prevRec = NaN;
  for (let i = 0; i < b.length; i++) {
    const x = b[i], lo = dir === -1 ? x.l : -x.h, hi = dir === -1 ? x.h : -x.l, ai = a[i] || 0;
    if (isNaN(rec)) { rec = lo; recI = i; legHi = hi; out.push({ gws: NaN, tests: 0, legs: 0, fading: false }); continue; }
    if (lo < rec) {
      const bounce = isNaN(legHi) ? 0 : legHi - rec, prevLeg = isNaN(prevRec) ? NaN : Math.abs(prevRec - rec);
      // GWS = highest high since the last record (before this bar): who started the break
      let g = -Infinity; for (let j = recI + 1; j < i; j++) g = Math.max(g, dir === -1 ? b[j].h : -b[j].l);
      if (isFinite(g)) { gws = g; tests = 0; }
      ext.push(rec - lo); if (!isNaN(prevLeg) && prevLeg > 0) pb.push(bounce / prevLeg);
      prevRec = rec; rec = lo; recI = i; legHi = -Infinity;
    } else { legHi = Math.max(legHi, hi); if (!isNaN(gws) && hi >= gws - 0.25 * ai && (dir === -1 ? x.c <= gws : -x.c <= gws)) tests++; }
    const n = ext.length, m = pb.length;
    const fading = n >= 2 && m >= 2 && ext[n - 1] <= ext[n - 2] && pb[m - 1] >= pb[m - 2] && pb[m - 1] >= 0.5;
    out.push({ gws: isNaN(gws) ? NaN : dir === -1 ? gws : -gws, tests, legs: n, fading });
  }
  return out;
}

/** Higher-timeframe veto: the timeframe `mult` x up is still moving against the trade with full energy
 *  (its last closed bar is beyond its EMA20 by more than 1 ATR and the EMA20 slopes that way). */
export function htfVeto(b: Bar[], side: 1 | -1, mult = 4) {
  const spacing = b.length > 1 ? (b[b.length - 1].t - b[0].t) / (b.length - 1) : 864e5, r = resample(b, spacing * mult);
  const c = r.bars.map(x => x.c), e = ema(c, 20), ha = atr(r.bars);
  return b.map((_, i) => { const k = r.idx[i] - 1; if (k < 5 || isNaN(e[k])) return false;
    const against = -side; return against * (c[k] - e[k]) > ha[k] && against * (e[k] - e[k - 5]) > 0; });
}

/** GWS reversal: after a run of record lows where the rubber band is fading (extensions shrinking, bounces deepening to 50%+),
 *  the latest GWS level is tested at least `minTests` times and then closed above: buy (mirror: sell). Vetoed when the higher
 *  timeframe is still running against the trade. Stop beyond the last record; target 2R. */
export const gwsReversal = (o: { minTests?: number; r?: number; mult?: number } = {}) => (b: Bar[]): Sig => {
  const s = empty(b.length), a = atr(b), dn = gwsTrack(b, -1), up = gwsTrack(b, 1), vL = htfVeto(b, 1, o.mult ?? 4), vS = htfVeto(b, -1, o.mult ?? 4), r = o.r ?? 2;
  for (let i = 1; i < b.length; i++) {
    const x = b[i], d = dn[i - 1], u = up[i - 1];
    if (d.fading && d.tests >= (o.minTests ?? 1) && x.c > d.gws && b[i - 1].c <= d.gws && !vL[i]) {
      const low = Math.min(...b.slice(Math.max(0, i - 30), i + 1).map(y => y.l)), stop = low - 0.25 * a[i];
      s.le[i] = true; s.stop[i] = stop; s.target[i] = x.c + r * (x.c - stop);
    } else if (u.fading && u.tests >= (o.minTests ?? 1) && x.c < u.gws && b[i - 1].c >= u.gws && !vS[i]) {
      const high = Math.max(...b.slice(Math.max(0, i - 30), i + 1).map(y => y.h)), stop = high + 0.25 * a[i];
      s.se[i] = true; s.stop[i] = stop; s.target[i] = x.c - r * (stop - x.c);
    }
  }
  return s;
};

/** Discount from the anchor (chat/58) timed with the GWS trigger (chat/59). Long only:
 *  1. Trend: close above EMA 20, 50 and 200, all three rising (5-bar slope). Spikes while the EMAs point down are skipped.
 *  2. Impulse score = move in ATRs / bars taken; needs at least `minMove` ATRs at `minSpeed` ATR per bar.
 *  3. Anchor = the high where the impulse stalled. A discount of at least `minDisc` of the impulse is required first.
 *  4. Timing: after the discount, the pullback's latest GWS (the swing high that started the last lower low) is closed above.
 *  Stop under the pullback low (Apex never averages down: the video calls a falling price "a better deal", which without a stop is
 *  open-ended risk). Target: back to the anchor. Optional event blackout (news days) from a free calendar you load into `events`. */
export const anchorDiscount = (o: { lens?: [number, number, number]; minMove?: number; minSpeed?: number; minDisc?: number; maxDisc?: number; life?: number; events?: Event[] } = {}) => (b: Bar[]): Sig => {
  const [l1, l2, l3] = o.lens ?? [20, 50, 200], minMove = o.minMove ?? 4, minSpeed = o.minSpeed ?? 0.4, minDisc = o.minDisc ?? 0.3, maxDisc = o.maxDisc ?? 0.8, life = o.life ?? 60;
  const s = empty(b.length), c = b.map(x => x.c), a = atr(b), e1 = ema(c, l1), e2 = ema(c, l2), e3 = ema(c, l3);
  const trend = (i: number) => i >= 5 && c[i] > e1[i] && c[i] > e2[i] && c[i] > e3[i] && e1[i] > e1[i - 5] && e2[i] > e2[i - 5] && e3[i] > e3[i - 5];
  let st: { start: number; anchor: number; aI: number; low: number; gws: number; lastLowI: number; disc: boolean } | null = null;
  for (let i = 25; i < b.length; i++) {
    const x = b[i];
    if (!st || i - st.aI > life) {
      st = null;
      if (!trend(i)) continue;
      for (const n of [3, 5, 8, 13]) {                      // impulse over the last n bars
        const lo = Math.min(...b.slice(i - n, i + 1).map(y => y.l)), mv = (x.h - lo) / (a[i - n] || Infinity);
        if (mv >= minMove && mv / n >= minSpeed) { st = { start: lo, anchor: x.h, aI: i, low: Infinity, gws: NaN, lastLowI: i, disc: false }; break; }
      }
      continue;
    }
    if (!st.disc && x.h > st.anchor) { st.anchor = x.h; st.aI = i; continue; }   // still running: the anchor moves up
    const leg = st.anchor - st.start, depth = (st.anchor - Math.min(st.low, x.l)) / leg;
    if (depth > maxDisc) { st = null; continue; }
    if (x.l < st.low) {                                     // new pullback low: GWS = highest high since the previous pullback low
      let g = -Infinity; for (let j = st.lastLowI; j < i; j++) g = Math.max(g, b[j].h);
      st.gws = isFinite(g) ? g : st.gws; st.low = x.l; st.lastLowI = i;
    }
    if (depth >= minDisc) st.disc = true;
    if (st.disc && !isNaN(st.gws) && x.c > st.gws && x.c < st.anchor && c[i] > e3[i]) {
      const day = new Date(x.t).toISOString().slice(0, 10);
      if (o.events && blackout(day, o.events, 0, 0).blocked) continue;
      const stop = st.low - 0.25 * a[i];
      s.le[i] = true; s.stop[i] = stop; s.target[i] = st.anchor; st = null;
    }
  }
  return s;
};
