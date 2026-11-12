// Is the paper clock moving? A slot's forward record only grows when new bars arrive, so the nightly job ends red when the
// newest bar of a dataset that matters is too old. Pure: the clock, the bars and the slots are passed in.
// Age is counted in hours of the dataset's own trading days: weekends and US market holidays do not count for stocks and
// ETFs (XNYS), weekends do not count for currencies (FX), and every hour counts for crypto, which trades every day.
import type { DatasetSpec } from '@apex/data/types';

export type Calendar = DatasetSpec['calendar'];
const DAY = 864e5, HOUR = 36e5;

/** New York's offset from UTC in hours: -4 from the second Sunday of March to the first Sunday of November (2am local), else -5. */
export function nyOffset(t: number): number {
  const y = new Date(t).getUTCFullYear(), sunday = (m: number, n: number) => { const d = Date.UTC(y, m, 1); return d + (((7 - new Date(d).getUTCDay()) % 7) + 7 * (n - 1)) * DAY; };
  return t >= sunday(2, 2) + 7 * HOUR && t < sunday(10, 1) + 6 * HOUR ? -4 : -5;
}

const dayOf = (y: number, m: number, d: number) => Date.UTC(y, m, d) / DAY;
const weekday = (day: number) => new Date(day * DAY).getUTCDay();
const nth = (y: number, m: number, dow: number, n: number) => { const first = dayOf(y, m, 1); return first + ((dow - weekday(first) + 7) % 7) + 7 * (n - 1); };
const last = (y: number, m: number, dow: number) => { const end = dayOf(y, m + 1, 0); return end - ((weekday(end) - dow + 7) % 7); };
/** A fixed-date holiday on a Saturday is kept the Friday before, on a Sunday the Monday after. */
const observed = (day: number) => (weekday(day) === 6 ? day - 1 : weekday(day) === 0 ? day + 1 : day);
function easter(y: number): number {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), n = h + l - 7 * m + 114;
  return dayOf(y, Math.floor(n / 31) - 1, (n % 31) + 1);
}
const holidayCache = new Map<number, Set<number>>();
/** The full-day NYSE holidays of a year, as day numbers (days since 1970-01-01). Early closes are trading days. A New Year's
 *  Day on a Saturday is not moved to the Friday before (the exchange's own rule). Closures for one-off events are not listed. */
export function nyseHolidays(y: number): Set<number> {
  let s = holidayCache.get(y); if (s) return s;
  const ny = dayOf(y, 0, 1);
  s = new Set([weekday(ny) === 0 ? ny + 1 : ny, nth(y, 0, 1, 3), nth(y, 1, 1, 3), easter(y) - 2, last(y, 4, 1), ...(y >= 2022 ? [observed(dayOf(y, 5, 19))] : []),
    observed(dayOf(y, 6, 4)), nth(y, 8, 1, 1), nth(y, 10, 4, 4), observed(dayOf(y, 11, 25))].filter(d => weekday(d) !== 6 && weekday(d) !== 0));
  holidayCache.set(y, s); return s;
}

/** The trading day an instant falls on, as a day number in the calendar's own time zone (New York for XNYS, UTC otherwise). */
export const localDay = (t: number, cal: Calendar) => Math.floor((cal === 'XNYS' ? t + nyOffset(t) * HOUR : t) / DAY);
const dayStart = (day: number, cal: Calendar) => (cal === 'XNYS' ? day * DAY - nyOffset(day * DAY + 4 * HOUR) * HOUR : day * DAY);
export function isTradingDay(day: number, cal: Calendar): boolean {
  if (cal === 'CRYPTO') return true; const w = weekday(day); if (w === 0 || w === 6) return false;
  return cal !== 'XNYS' || !nyseHolidays(new Date(day * DAY).getUTCFullYear()).has(day);
}
/** Hours between two instants that fall on trading days of the calendar. */
export function tradingHoursBetween(from: number, to: number, cal: Calendar): number {
  if (!(to > from)) return 0; if (cal === 'CRYPTO') return (to - from) / HOUR;
  let ms = 0;
  for (let t = from; t < to;) { const d = localDay(t, cal), next = Math.min(to, Math.max(t + 1, dayStart(d + 1, cal))); if (isTradingDay(d, cal)) ms += next - t; t = next; }
  return ms / HOUR;
}

export type FreshInput = { dataset: string; calendar: Calendar | null; lastClose: number | null };
export type FreshRow = FreshInput & { ageHours: number | null; ok: boolean; why: string };
/** Which datasets the check covers: those behind a slot that is not retired, or, before any slot exists, the whole registry. */
export function freshScope(slots: { dataset: string; status: string }[], registry: string[]): { datasets: string[]; basis: 'slots' | 'registry' } {
  const live = [...new Set(slots.filter(s => s.status !== 'retired').map(s => s.dataset))].sort();
  return live.length ? { datasets: live, basis: 'slots' } : { datasets: [...registry].sort(), basis: 'registry' };
}
/** Fails closed: a dataset with no bars, no known calendar or a close in the future is not fresh. */
export function checkFresh(items: FreshInput[], now: number, maxAgeHours: number): { ok: boolean; rows: FreshRow[] } {
  const rows = items.map((x): FreshRow => {
    if (!x.calendar) return { ...x, ageHours: null, ok: false, why: 'not in the registry, so its calendar is unknown' };
    if (x.lastClose === null || !Number.isFinite(x.lastClose)) return { ...x, ageHours: null, ok: false, why: 'no bars could be loaded' };
    if (x.lastClose > now + HOUR) return { ...x, ageHours: null, ok: false, why: 'the newest bar closes in the future, so the clock or the file is wrong' };
    const age = tradingHoursBetween(x.lastClose, now, x.calendar), ok = age <= maxAgeHours;
    return { ...x, ageHours: age, ok, why: ok ? 'fresh' : `newest bar closed ${age.toFixed(1)} trading hours ago, more than ${maxAgeHours}` };
  });
  return { ok: rows.length > 0 && rows.every(r => r.ok), rows };
}
