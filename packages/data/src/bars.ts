// Bar files and dataset versions. A version is the SHA-256 of the canonical CSV, so a result can always be tied to the exact bars it used.
import { sha256 } from '@apex/kernel/canonical';
import type { Bar } from '@apex/engine/core';

export const toCsv = (bars: Bar[]) => 't,o,h,l,c,v\n' + bars.map(b => `${b.t},${b.o},${b.h},${b.l},${b.c},${b.v}`).join('\n') + '\n';
export function parseCsv(text: string): Bar[] {
  const lines = text.trim().split('\n'); if (!/^t,o,h,l,c,v\s*$/.test(lines[0])) throw new Error('bars csv: expected header t,o,h,l,c,v');
  return lines.slice(1).filter(l => l.trim()).map((l, n) => { const p = l.split(',').map(Number); if (p.length !== 6 || p.some(x => !Number.isFinite(x))) throw new Error(`bars csv: bad row ${n + 2}`); return { t: p[0], o: p[1], h: p[2], l: p[3], c: p[4], v: p[5] }; });
}
export const versionOf = (bars: Bar[]) => sha256(toCsv(bars));

/** Bars are always closed bars: drop the newest one if its close time is still in the future. */
export const closedOnly = (bars: Bar[], tfMs: number, now: number) => { let n = bars.length; while (n > 0 && bars[n - 1].t + tfMs > now) n--; return n === bars.length ? bars : bars.slice(0, n); };

/**
 * Merge a fresh pull into stored bars. Overlapping rows must match exactly. If they do not, the provider restated history:
 * nothing is overwritten, the caller gets `restated` rows and keeps both versions (docs/design/03 s5).
 */
export function mergeBars(stored: Bar[], fresh: Bar[]): { bars: Bar[]; added: number; restated: number[] } {
  const byT = new Map(stored.map(b => [b.t, b])), restated: number[] = []; let added = 0;
  const same = (a: Bar, b: Bar) => a.o === b.o && a.h === b.h && a.l === b.l && a.c === b.c && a.v === b.v;
  const out = new Map(byT);
  for (const f of fresh) { const s = byT.get(f.t); if (!s) { out.set(f.t, f); added++; } else if (!same(s, f)) { restated.push(f.t); out.set(f.t, f); } }
  return { bars: [...out.values()].sort((a, b) => a.t - b.t), added, restated };
}
