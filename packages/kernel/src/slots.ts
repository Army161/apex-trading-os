// Slot statuses and the two moves Jeremy may make by hand (docs/design/04 s1 and s12, 02 s1 and s4). Red path.
// The run pauses a slot by itself. Only Jeremy brings a paused slot back, and only to paper, so the forward record and the
// graduation are earned again; live_eligible and the live stages are never set by hand. Retiring is final.
// Pure: it is handed the facts and answers with the move, or the reason it will not make it. Unknown facts refuse.
import type { LedgerEntry } from './ledger';
import { STAGES } from './stages';

export const LIVE_STAGE_STATUSES: readonly string[] = STAGES.map(s => s.id);
export const PAUSED_STATUSES: readonly string[] = ['paused_drift', 'paused_data'];
export const SLOT_STATUSES: readonly string[] = ['paper', ...PAUSED_STATUSES, 'live_eligible', ...LIVE_STAGE_STATUSES, 'retired'];
/** What an automatic pause (drift, a changed strategy, a failed re-validation) acts on: paper, live eligible and every live stage.
 *  A paused slot stays as it is, so one cause is never counted twice, and a retired slot is never touched again. */
export const AUTO_PAUSABLE: readonly string[] = ['paper', 'live_eligible', ...LIVE_STAGE_STATUSES];
export const autoPausable = (status: string) => AUTO_PAUSABLE.includes(status);

export type Rerun = 'agrees' | 'disagrees' | 'none';
/** The validator's word on a slot since its last status change: the latest run for that slot after it, or none. */
export function rerunSince(entries: LedgerEntry[], slotKey: string): { verdict: Rerun; seq: number | null } {
  let since = 0, last: LedgerEntry | null = null;
  for (const e of entries) {
    if (e.kind === 'slot_status' && e.payload?.slotKey === slotKey) { since = e.seq; last = null; }
    else if (e.kind === 'validator_run' && e.payload?.slotKey === slotKey && e.seq > since) last = e;
  }
  return last ? { verdict: last.payload.agrees === true ? 'agrees' : 'disagrees', seq: last.seq } : { verdict: 'none', seq: null };
}

export type SlotMoveFacts = {
  status: string | null;                   // the slot's status as the ledger has it
  fingerprintMatches: boolean | null;      // the strategy's fingerprint now, against the one in the lock (null: could not be checked)
  datasetReadable: boolean | null;         // the slot's dataset is in the registry and its bars load (null: could not be checked)
  rerun: Rerun | null;                     // rerunSince(...).verdict
};
export type SlotMove = { ok: true; from: string; to: 'paper' | 'retired' } | { ok: false; why: string };

/** Whether a slot may be moved by hand to `to`. Only two moves exist: a paused slot back to paper, and any slot to retired. */
export function slotMove(f: SlotMoveFacts, to: unknown): SlotMove {
  const no = (why: string): SlotMove => ({ ok: false, why });
  if (to !== 'paper' && to !== 'retired') return no('A slot can be moved by hand only back to paper or to retired. Live eligible and the live stages are earned, never set.');
  if (!f.status || !SLOT_STATUSES.includes(f.status)) return no(`Its status (${f.status ?? 'unknown'}) is not one this knows, so nothing is changed.`);
  if (f.status === 'retired') return no('It is retired, and that is final. A retired idea comes back only as a new pre-registration.');
  if (to === 'retired') return { ok: true, from: f.status, to: 'retired' };
  if (!PAUSED_STATUSES.includes(f.status)) return no(`It is ${f.status}, not paused. Only a paused slot goes back to paper.`);
  if (f.fingerprintMatches !== true) return no(f.fingerprintMatches === false ? 'Its strategy no longer matches the one in its lock, so the next run would pause it again. A changed strategy is registered under a new id.' : 'Its strategy fingerprint could not be checked here.');
  if (f.datasetReadable !== true) return no(f.datasetReadable === false ? 'Its dataset is missing or cannot be read, so the next run could not step it.' : 'Its dataset could not be checked here.');
  if (f.rerun !== 'agrees') return no(f.rerun === 'disagrees' ? 'The validator re-ran it after the pause and does not agree with the locked result.' : 'The validator has not re-run it since the pause. Wait for the next validator run.');
  return { ok: true, from: f.status, to: 'paper' };
}
