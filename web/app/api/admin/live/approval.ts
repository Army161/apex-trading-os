// Lock 3 of the live switch: Jeremy's approval (docs/design/02 s6). Red path. This file decides whether an approval may be
// recorded and what it says. It opens nothing by itself: an approval is one ledger entry, and no order can follow it until
// lock 4 is opened on Jeremy's own machine, which nothing in this repository can do.
// Pure: it is handed the facts and the form, and it answers with the entry to write or the reason it will not.
import { timingSafeEqual } from 'node:crypto';
import { STAGES, type Lock } from '@apex/kernel/locks';

export const DEFAULT_EXPIRY_DAYS = 90, MAX_EXPIRY_DAYS = 90;
/** What Jeremy confirms he has read. Every box has to be ticked; the ids go into the ledger entry. */
export const CHECKLIST: [string, string][] = [
  ['forward-record', 'I have read this slot\'s forward record and its last monthly check.'],
  ['validator', 'I have read the validator run made after graduation, and it agrees.'],
  ['review', 'I have read the review chain\'s notes, and nothing in them blocks this.'],
  ['size', 'I understand the first stage trades 1% of the paper-sized risk, with my own money.'],
  ['machine', 'I understand nothing trades until I open lock 4 on my own machine with my own keys.'],
];
export type ApproveForm = { typed?: unknown; password?: unknown; stage?: unknown; sizeCap?: unknown; expiryDays?: unknown; checklist?: unknown };
export type ApproveFacts = { slotKey: string; slotStatus: string; locks: Lock[]; halted: boolean; adminPassword: string; now: number };
export type ApprovalPayload = { slotKey: string; stage: string; sizeCap: number; expiresAt: number; by: 'you'; checklist: string[] };
export type Decision = { ok: true; payload: ApprovalPayload } | { ok: false; status: 401 | 409 | 422; error: string };

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
/** The one stage that can be approved for a slot in this state. Later stages need a scale check, which is not built, so they are never offered. */
export const nextStage = (slotStatus: string) => slotStatus === 'live_eligible' ? STAGES[0] : null;

export function decideApproval(f: ApproveFacts, b: ApproveForm): Decision {
  const no = (status: 401 | 409 | 422, error: string): Decision => ({ ok: false, status, error });
  // The password, again. With no password set there is nothing to re-enter, so nothing can be approved, on any machine.
  if (!f.adminPassword) return no(409, 'No admin password is set here, so an approval cannot be confirmed. Nothing was recorded.');
  if (typeof b.password !== 'string' || !same(b.password, f.adminPassword)) return no(401, 'That is not the password. Nothing was recorded.');
  const lock = (id: string) => f.locks.find(l => l.id === id);
  if (!lock('evidence')?.open) return no(409, `Lock 1 is closed: ${lock('evidence')?.why ?? 'unknown'}. Nothing was recorded.`);
  if (!lock('validated')?.open) return no(409, `Lock 2 is closed: ${lock('validated')?.why ?? 'unknown'}. Nothing was recorded.`);
  if (f.halted) return no(409, 'Apex is halted. Release the halt first. Nothing was recorded.');
  const stage = nextStage(f.slotStatus); if (!stage) return no(409, 'This slot is not at a stage that can be approved from here. Nothing was recorded.');
  if (b.stage !== stage.id) return no(422, `The only stage that can be approved now is ${stage.id}.`);
  if (b.typed !== f.slotKey) return no(422, 'Type the slot\'s name exactly as it is shown.');
  const cap = Number(b.sizeCap); if (typeof b.sizeCap !== 'number' || !Number.isFinite(cap) || cap <= 0 || cap > stage.size) return no(422, `The size cap must be more than 0 and at most ${stage.size * 100}% of the paper-sized risk.`);
  const days = Number(b.expiryDays); if (typeof b.expiryDays !== 'number' || !Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS) return no(422, `The approval must expire in 1 to ${MAX_EXPIRY_DAYS} days.`);
  const ticked = Array.isArray(b.checklist) ? b.checklist.map(String) : [];
  if (!CHECKLIST.every(([id]) => ticked.includes(id))) return no(422, 'Tick every line of the checklist.');
  return { ok: true, payload: { slotKey: f.slotKey, stage: stage.id, sizeCap: cap, expiresAt: f.now + days * 864e5, by: 'you', checklist: CHECKLIST.map(([id]) => id) } };
}
