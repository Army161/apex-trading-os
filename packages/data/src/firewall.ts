// The data firewall (docs/design/03 s6, idea 6). Pure. Runs on every pull and at the start of every autopilot run.
// `blocked` stops new entries on that symbol and makes the factory skip the pair. `warn` lets the run continue with a warning.
// Thresholds live in the gate config (GATE_V1.firewall), so changing one is visible in the ledger as a new gate version.
import type { Bar } from '@apex/engine/core';
import type { FirewallThresholds } from '@apex/kernel/gate';
import { TF_MS, type DataHealth, type DatasetSpec, type HealthStatus } from './types';

const DAY = 864e5;
const median = (x: number[]) => { if (!x.length) return 0; const s = [...x].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const worst = (a: HealthStatus, b: HealthStatus): HealthStatus => (a === 'blocked' || b === 'blocked' ? 'blocked' : a === 'warn' || b === 'warn' ? 'warn' : 'ok');
const SPLITS = [2, 3, 4, 5, 10, 20, 1.5, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 10, 1 / 20, 2 / 3];

/** Market time between two instants, in ms. Stocks: weekdays only (holidays are not modelled, so a holiday reads as one extra day of age). */
export function marketMsBetween(from: number, to: number, calendar: DatasetSpec['calendar']): number {
  if (to <= from) return 0; if (calendar === 'CRYPTO') return to - from;
  let ms = 0; for (let d = Math.floor(from / DAY); d <= Math.floor(to / DAY); d++) { const dow = new Date(d * DAY).getUTCDay(); if (dow === 0 || dow === 6) continue; ms += Math.min(to, (d + 1) * DAY) - Math.max(from, d * DAY); }
  return calendar === 'XNYS' ? ms * (6.5 / 24) : ms;      // a stock session is 6.5 of a weekday's 24 hours
}

export type FirewallOpts = { now: number; second?: { source: string; bars: Bar[] }; fetchedAt?: number; termsRef?: string; minBars?: number };

export function checkData(bars: Bar[], spec: DatasetSpec, version: string, th: FirewallThresholds, o: FirewallOpts): DataHealth {
  const checks: DataHealth['checks'] = [], n = bars.length, tfMs = TF_MS[spec.tf], intraday = tfMs < DAY;
  const add = (id: string, status: HealthStatus, detail: string, at?: number[]) => checks.push({ id, status, detail, ...(at?.length ? { bars: at.slice(0, 20) } : {}) });

  // Schema
  const badIdx: number[] = []; bars.forEach((b, i) => { if (![b.t, b.o, b.h, b.l, b.c, b.v].every(Number.isFinite) || b.h < Math.max(b.o, b.c) - 1e-9 || b.l > Math.min(b.o, b.c) + 1e-9 || b.l <= 0 || b.v < 0) badIdx.push(i); });
  const recentBad = badIdx.filter(i => i >= n - th.recentBars);
  add('schema', recentBad.length ? 'blocked' : badIdx.length ? 'warn' : 'ok', badIdx.length ? `${badIdx.length} malformed bars (${recentBad.length} in the last ${th.recentBars})` : 'all bars well formed', badIdx.map(i => bars[i].t));

  // Order and duplicates
  const ooo: number[] = []; for (let i = 1; i < n; i++) if (!(bars[i].t > bars[i - 1].t)) ooo.push(bars[i].t);
  add('order', ooo.length ? 'blocked' : 'ok', ooo.length ? `${ooo.length} bars out of order or duplicated` : 'strictly increasing', ooo);

  // Staleness: blocks trading, evaluation is still allowed
  let stale = false;
  if (n) { const age = marketMsBetween(bars[n - 1].t + tfMs, o.now, spec.calendar), limit = th.staleIntervals * Math.max(tfMs, intraday ? tfMs : DAY * (spec.calendar === 'XNYS' ? 6.5 / 24 : 1)); stale = age > limit;
    add('stale', stale ? 'blocked' : 'ok', stale ? `last closed bar is ${(age / 36e5).toFixed(1)} market hours old` : 'fresh'); }
  else add('stale', 'blocked', 'no bars');

  // Gaps against the calendar, last `gapSessions` sessions
  if (n > 2) {
    const firstDay = Math.max(Math.floor(bars[0].t / DAY), Math.floor(bars[n - 1].t / DAY) - Math.ceil(th.gapSessions * (spec.calendar === 'CRYPTO' ? 1 : 7 / 5)));
    const have = new Map<number, number>(); for (const b of bars) { const d = Math.floor(b.t / DAY); if (d >= firstDay) have.set(d, (have.get(d) ?? 0) + 1); }
    const perDay = median([...have.values()]); let expected = 0, got = 0, missingDays = 0;
    for (let d = firstDay; d <= Math.floor(bars[n - 1].t / DAY); d++) { const dow = new Date(d * DAY).getUTCDay(); if (spec.calendar !== 'CRYPTO' && (dow === 0 || dow === 6)) continue; const h = have.get(d) ?? 0;
      if (h === 0) { missingDays++; continue; } expected += perDay; got += Math.min(h, perDay); }
    // Whole missing weekdays are mostly exchange holidays (about 9 a year); only count them beyond that allowance.
    const sessions = have.size + missingDays, holidayAllowance = spec.calendar === 'XNYS' ? Math.ceil(sessions * 12 / 252) : spec.calendar === 'FX' ? Math.ceil(sessions * 6 / 260) : 0;
    const extraMissing = Math.max(0, missingDays - holidayAllowance); expected += extraMissing * perDay;
    const share = expected > 0 ? 1 - got / expected : 0;
    add('gaps', share >= th.gapBlock ? 'blocked' : share >= th.gapWarn ? 'warn' : 'ok', `${(share * 100).toFixed(2)}% of expected bars missing in the last ${Math.min(sessions, th.gapSessions)} sessions`);
  }

  // Bad prints: an extreme move that mostly reverts within 2 bars
  const prints: number[] = [];
  for (let i = th.madWindow; i < n - 0; i++) {
    const win: number[] = []; for (let j = i - th.madWindow + 1; j < i; j++) win.push(Math.abs(bars[j].c / bars[j - 1].c - 1));
    const mad = median(win) || 1e-9, move = bars[i].c / bars[i - 1].c - 1, range = (bars[i].h - bars[i].l) / bars[i - 1].c;
    if (Math.abs(move) <= th.madMult * mad && range <= th.madMult * 2 * mad) continue;
    const after = bars[Math.min(i + 2, n - 1)].c, reverted = i + 1 < n ? 1 - Math.abs(after / bars[i - 1].c - 1) / Math.max(Math.abs(move), range / 2, 1e-12) : 0;
    const wick = Math.abs(move) <= th.madMult * mad;                                           // range blew out but the close did not: a wick print
    if ((wick && range > th.madMult * 4 * mad) || reverted >= th.revertShare) prints.push(i);
  }
  const recentPrint = prints.some(i => i >= n - th.recentBadPrint);
  add('bad-prints', recentPrint ? 'blocked' : prints.length ? 'warn' : 'ok', prints.length ? `${prints.length} suspect prints${recentPrint ? ', one in the newest bars' : ''}` : 'none found', prints.map(i => bars[i].t));

  // Unadjusted split: a close-to-close ratio at a common split ratio, not confirmed by the second source
  const secondBy = new Map((o.second?.bars ?? []).map(b => [b.t, b])), splits: number[] = [];
  for (let i = 1; i < n; i++) { const ratio = bars[i - 1].c / bars[i].c; if (!SPLITS.some(s => Math.abs(ratio / s - 1) <= th.splitTol)) continue;
    const s1 = secondBy.get(bars[i].t), s0 = secondBy.get(bars[i - 1].t); if (s1 && s0 && Math.abs((s0.c / s1.c) / ratio - 1) <= th.splitTol) continue; splits.push(bars[i].t); }
  add('unadjusted-split', splits.length ? 'blocked' : 'ok', splits.length ? `${splits.length} price jumps at a split ratio${o.second ? ' that the second source does not show' : ' (no second source to confirm)'}` : 'none', splits);

  // Flat or zero volume
  let run = 0, maxRun = 0; for (const b of bars) { run = b.v === 0 ? run + 1 : 0; maxRun = Math.max(maxRun, run); }
  const anyVol = bars.some(b => b.v > 0);
  add('zero-volume', anyVol && maxRun >= th.zeroVolRun ? 'warn' : 'ok', anyVol && maxRun >= th.zeroVolRun ? `${maxRun} bars in a row with zero volume` : anyVol ? 'volume present' : 'source reports no volume for this market');

  // Second-source agreement
  if (o.second) {
    const tail = bars.slice(-th.secondOverlap).filter(b => secondBy.has(b.t)), diffs = tail.map(b => Math.abs(b.c / secondBy.get(b.t)!.c - 1) * 1e4);
    const maxBp = intraday ? th.secondMaxBpIntraday : th.secondMaxBpDaily, last5 = bars.slice(-5).filter(b => secondBy.has(b.t)).some(b => Math.abs(b.c / secondBy.get(b.t)!.c - 1) * 1e4 > maxBp);
    if (tail.length < 20) add('second-source', 'warn', `only ${tail.length} overlapping bars with ${o.second.source}`);
    else add('second-source', last5 ? 'blocked' : median(diffs) > th.secondMedianBp || Math.max(...diffs) > maxBp ? 'warn' : 'ok', `median difference ${median(diffs).toFixed(1)} bp, largest ${Math.max(...diffs).toFixed(1)} bp against ${o.second.source} over ${tail.length} bars`);
  }

  // Short history
  const need = o.minBars ?? 0; if (need) add('short-history', n < need ? 'warn' : 'ok', n < need ? `${n} bars, the gate wants about ${need}` : `${n} bars`);

  const hard = checks.filter(c => c.id !== 'stale').reduce((s, c) => worst(s, c.status), 'ok' as HealthStatus);
  const status = stale && hard !== 'blocked' ? 'warn' as HealthStatus : hard;
  return { dataset: spec.id, version, at: o.now, status: stale && hard === 'ok' ? 'warn' : status, tradable: hard !== 'blocked' && !stale, checks,
    provenance: { source: spec.source, ...(o.second ? { second: o.second.source } : {}), fetchedAt: o.fetchedAt ?? o.now, adj: spec.adj, termsRef: o.termsRef ?? `data/SOURCES.md#${spec.source}` } };
}
