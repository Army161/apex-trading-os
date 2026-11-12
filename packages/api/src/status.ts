// What the header shows on every screen (docs/design/07 s2): the mode, the count of tries, whether anything is halted and
// whether the data is healthy. Pure: it is handed the ledger entries and the dashboard's own halt switches, and it reads no
// clock, file, network or environment. The terminal's `apex status` reads the same ledger view, so the two cannot disagree.
import { buildView, trialsEver, slotsEver } from '@apex/kernel/view';
import type { LedgerEntry } from '@apex/kernel/ledger';

export type LedgerKind = 'postgres' | 'file' | 'none' | 'error';
export type Halt = { level: string; by: string; reason: string; ts: number | null; from: 'ledger' | 'dashboard' };
export type ShellStatus = {
  /** "live" only when the ledger holds a slot in a live stage. Nothing in this app can put one there. */
  mode: 'paper' | 'live'; liveSlots: string[];
  ledger: LedgerKind; ledgerNote: string | null; entries: number;
  /** N, the number of distinct tries ever counted. Null when no ledger is connected: unknown is not zero. */
  trials: number | null; slots: number | null;
  halted: boolean; halts: Halt[];
  /** "stale": some datasets are too old to open new paper orders, which is normal between refreshes. "blocked": a dataset failed a health check. */
  data: 'ok' | 'stale' | 'blocked' | 'unknown'; dataBlocked: string[]; dataStale: string[];
  lastRun: { id: string; mode: string; ts: number } | null;
  /** The dashboard's own store (bots, journal, agents). In memory it resets when the server restarts. */
  persistent: boolean; signedIn: boolean; authEnabled: boolean; aiEnabled: boolean;
  at: number;
};
export type StatusInput = {
  ledger: LedgerKind; ledgerNote?: string | null; entries: LedgerEntry[]; capital: number;
  cord: { on: boolean; ts?: number; by?: string; reason?: string }; killswitch: boolean;
  persistent: boolean; signedIn: boolean; authEnabled: boolean; aiEnabled: boolean; now: number;
};
const LIVE = /^(micro_live|live_\d+)$/;

export function statusFrom(i: StatusInput): ShellStatus {
  const halts: Halt[] = [];
  if (i.cord.on) halts.push({ level: 'andon', by: i.cord.by || 'unknown', reason: i.cord.reason || 'no reason given', ts: i.cord.ts ?? null, from: 'dashboard' });
  if (i.killswitch) halts.push({ level: 'kill', by: 'you', reason: 'The kill switch is on: every bot is told to pause.', ts: null, from: 'dashboard' });
  const base = { ledgerNote: i.ledgerNote ?? null, persistent: i.persistent, signedIn: i.signedIn, authEnabled: i.authEnabled, aiEnabled: i.aiEnabled, at: i.now };
  const unknown = (ledger: LedgerKind, note: string | null): ShellStatus => ({ ...base, ledgerNote: note, mode: 'paper', liveSlots: [], ledger, entries: 0, trials: null, slots: null,
    // A ledger that cannot be read is treated as halted, the same way the run treats an unreadable halt state.
    halted: halts.length > 0 || ledger === 'error', halts: ledger === 'error' ? [...halts, { level: 'unreadable', by: 'apex', reason: `The ledger could not be read${note ? `: ${note}` : ''}.`, ts: null, from: 'ledger' }] : halts,
    data: 'unknown', dataBlocked: [], dataStale: [], lastRun: null });
  if (i.ledger === 'none' || i.ledger === 'error') return unknown(i.ledger, i.ledgerNote ?? null);
  let v; try { v = buildView(i.entries, i.capital); } catch (e) { return unknown('error', e instanceof Error ? e.message : String(e)); }
  for (const h of v.halts) halts.push({ level: h.level, by: h.by, reason: h.reason, ts: h.ts, from: 'ledger' });
  const liveSlots = [...v.slots.values()].filter(s => LIVE.test(s.status)).map(s => s.slotKey);
  const versions = [...v.dataVersions.values()], ids = (f: (d: any) => boolean) => versions.filter(f).map(d => String(d.dataset)).sort();
  const dataBlocked = ids(d => d.status === 'blocked'), dataStale = ids(d => d.status !== 'blocked' && d.tradable === false);
  const run = [...i.entries].reverse().find(e => e.kind === 'run');
  return { ...base, mode: liveSlots.length ? 'live' : 'paper', liveSlots, ledger: i.ledger, entries: i.entries.length, trials: trialsEver(v), slots: slotsEver(v),
    halted: halts.length > 0, halts, data: !versions.length ? 'unknown' : dataBlocked.length ? 'blocked' : dataStale.length ? 'stale' : 'ok', dataBlocked, dataStale,
    lastRun: run ? { id: String((run.payload as any).id), mode: String((run.payload as any).mode), ts: run.ts } : null };
}

/** The trial counter's words. Unknown is said as unknown. */
export const triesText = (s: Pick<ShellStatus, 'trials'>) => s.trials == null ? 'Tries: no ledger connected' : `${new Intl.NumberFormat('en-US').format(s.trials)} ${s.trials === 1 ? 'try' : 'tries'} counted`;
export const DATA_WORDS = { ok: 'Data ok', stale: 'Data stale', blocked: 'Data blocked', unknown: 'Data not checked yet' } as const;
/** Label, shape and tone together, so the data status reads without colour. */
export const DATA_MARK = { ok: ['●', 'acc'], stale: ['◐', 'warn'], blocked: ['✕', 'bad'], unknown: ['○', 'mute'] } as const;
