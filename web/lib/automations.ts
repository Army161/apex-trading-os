// The schedules (docs/design/06 s4) and what the dashboard knows about each. A job that runs here has a switch and a record of
// its last run. A job that runs in GitHub Actions is switched there, and the dashboard says so instead of showing a switch
// that would do nothing. A job that is not built yet is listed as not built.
import { afterRun, MAX_FAILS, type Routine } from './policy';
import { getJSON, setJSON } from './store';
import { sendTelegram } from './telegram';

export type Automation = { id: string; does: string; schedule: string; where: 'vercel' | 'github'; built: boolean; cron?: string; path?: string; note?: string };
export const AUTOMATIONS: Automation[] = [
  { id: 'autopilot-full', does: 'Refresh bars, re-check what earlier runs found, then the paper run and its report.', schedule: '22:30 UTC, Monday to Friday', where: 'github', built: true, cron: '30 22 * * 1-5', note: 'The nightly workflow. It also does the validator step and sends the daily report.' },
  { id: 'risk-officer', does: 'Read the paper book against its limits and halt when a reading crosses its line.', schedule: '23:15 UTC, Monday to Friday', where: 'vercel', built: true, cron: '15 23 * * 1-5', path: '/api/cron/officer' },
  { id: 'brief', does: 'The morning brief.', schedule: '12:45 UTC daily', where: 'vercel', built: true, cron: '45 12 * * *', path: '/api/cron/brief' },
  { id: 'deals', does: 'The weekly deals digest.', schedule: 'Friday 21:00 UTC', where: 'vercel', built: true, cron: '0 21 * * 5', path: '/api/cron/deals' },
  { id: 'strategies', does: 'Check each running saved strategy for a new signal and alert once.', schedule: '00:00 UTC daily', where: 'vercel', built: true, cron: '0 0 * * *', path: '/api/cron/strategies' },
  { id: 'dream', does: 'Summarise the day into dated memory notes.', schedule: '06:30 UTC daily', where: 'vercel', built: true, cron: '30 6 * * *', path: '/api/cron/dream' },
  { id: 'data-health', does: 'Pull new bars for active slots, run the data checks, alert on a blocked dataset.', schedule: 'Hourly at :05', where: 'vercel', built: false, note: 'Today the nightly workflow refreshes bars once a day.' },
  { id: 'autopilot-tick', does: 'A budgeted run during the day: active slots first, then new intents, fills and the book.', schedule: 'Every 30 minutes in US market hours, hourly otherwise', where: 'vercel', built: false },
  { id: 'daily-report', does: 'Render and send the report on its own schedule.', schedule: '21:30 UTC Monday to Friday, 00:45 at weekends', where: 'vercel', built: false, note: 'Today the report is sent by the nightly workflow.' },
  { id: 'validator', does: 'Independent re-runs of every active slot.', schedule: '02:00 UTC on the 1st of each month', where: 'github', built: false, note: 'The nightly workflow re-checks new passes. The monthly sweep is not built.' },
  { id: 'graduation-check', does: 'The monthly forward checks.', schedule: '03:00 UTC on the 1st of each month', where: 'github', built: false },
  { id: 'cost-model', does: 'Update the cost model from what was observed.', schedule: '04:00 UTC on the 1st of each month', where: 'github', built: false },
  { id: 'ledger-anchor', does: 'Commit the ledger\'s head hash.', schedule: '23:55 UTC daily', where: 'github', built: false, note: 'Today the nightly workflow commits the ledger to the apex-state branch.' },
  { id: 'weekly-digest', does: 'Scout proposals, the week\'s funnel and near misses, queue status.', schedule: 'Sunday 18:00 UTC', where: 'vercel', built: false },
  { id: 'data-long-pull', does: 'Long daily history and the pooled intraday refresh.', schedule: '06:00 UTC daily', where: 'github', built: false },
  { id: 'canary', does: 'A fixture run against each production deploy, compared with the golden report.', schedule: 'On every production deploy', where: 'github', built: false },
  { id: 'health-ping', does: 'Check each worker bot\'s heartbeat age and alert when stale.', schedule: 'Every 2 hours', where: 'vercel', built: false },
];
export type RunState = Routine & { lastOk?: boolean; lastNote?: string; started?: number };
const K = 'automations';
const fresh = (id: string): RunState => ({ id, agent: id, everyMin: 15, on: true, fails: 0 });
export const states = () => getJSON<Record<string, RunState>>(K, {});
/** Only a job that runs on the dashboard has a switch here. */
export const switchable = (a: Automation) => a.built && a.where === 'vercel';

export async function setSwitch(id: string, on: boolean): Promise<RunState> {
  const a = AUTOMATIONS.find(x => x.id === id); if (!a || !switchable(a)) throw new Error('this job has no switch here');
  const all = await states(), s = { ...(all[id] ?? fresh(id)), on, ...(on ? { fails: 0 } : {}) }; all[id] = s; await setJSON(K, all); return s;
}
/** Run a scheduled job under its switch. Off means skipped. Ten failures in a row switch it off and alert (policy.afterRun). A person's "run now" ignores the switch and is still recorded. */
export async function scheduled<T>(id: string, run: () => Promise<T>, o: { byPerson?: boolean; now?: () => number } = {}): Promise<T | { skipped: string }> {
  const now = o.now ?? Date.now, all = await states(), s = all[id] ?? fresh(id);
  if (!o.byPerson && !s.on) return { skipped: 'This job is switched off on the Automations screen.' };
  if (s.running && now() - (s.started ?? 0) < 10 * 60e3) return { skipped: 'The last run of this job is still going.' };
  const save = async (x: RunState) => { const cur = await states(); cur[id] = x; await setJSON(K, cur); };
  await save({ ...s, running: true, started: now() });
  let ok = true, note = '';
  try { const r = await run(); const err = (r as any)?.error; if (typeof err === 'string') { ok = false; note = err; } return r; }
  catch (e) { ok = false; note = (e as Error).message; throw e; }
  finally {
    const cur = (await states())[id] ?? s, next = { ...afterRun({ ...cur, running: false }, ok), lastRun: now(), running: false, started: undefined, lastOk: ok, lastNote: note.slice(0, 200) };
    await save(next);
    if (cur.on && !next.on) await sendTelegram(`Apex switched off the scheduled job "${id}" after ${MAX_FAILS} failures in a row. Last problem: ${note.slice(0, 200)}`);
  }
}

// ---- when a schedule next fires (five-field cron, UTC) ----
function field(f: string, lo: number, hi: number): Set<number> {
  const out = new Set<number>();
  for (const part of f.split(',')) { const [range, stepS] = part.split('/'), step = stepS ? Number(stepS) : 1; let [a, b] = range === '*' ? [lo, hi] : range.split('-').map(Number); if (b === undefined) b = stepS ? hi : a;
    if (![a, b, step].every(Number.isInteger) || step < 1 || a < lo || b > hi || a > b) throw new Error(`bad schedule part "${part}"`);
    for (let x = a; x <= b; x += step) out.add(x); }
  return out;
}
/** The first minute after `from` that the schedule matches, or null when none comes within 40 days. */
export function nextRun(cron: string, from: number): number | null {
  const p = cron.trim().split(/\s+/); if (p.length !== 5) throw new Error('a schedule has five parts');
  const [mi, ho, dom, mo, dow] = [field(p[0], 0, 59), field(p[1], 0, 23), field(p[2], 1, 31), field(p[3], 1, 12), field(p[4].replace(/7/g, '0'), 0, 6)], domAny = p[2] === '*', dowAny = p[4] === '*';
  let t = Math.floor(from / 60e3) * 60e3 + 60e3;
  for (let i = 0; i < 40 * 1440; i++, t += 60e3) { const d = new Date(t), inDom = dom.has(d.getUTCDate()), inDow = dow.has(d.getUTCDay());
    if (mi.has(d.getUTCMinutes()) && ho.has(d.getUTCHours()) && mo.has(d.getUTCMonth() + 1) && (domAny || dowAny ? inDom && inDow : inDom || inDow)) return t; }
  return null;
}
