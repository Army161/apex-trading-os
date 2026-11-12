// Moving a slot by hand: a paused slot back to paper, or any slot to retired (docs/design/04 s12, 02 s1 and s4). Red path.
// Which moves exist and when is decided in kernel/src/slots.ts. This file adds what only the signed-in dashboard can give:
// the password typed again, the slot's name typed out and a reason. What it writes is one slot_status entry, by Jeremy.
// It cannot set live_eligible or a live stage, approve anything, open a lock or place an order.
// The route hands it the session, the ledger and the strategy and data checks, so every step is tested without a server.
import { timingSafeEqual } from 'node:crypto';
import { LedgerConflict, makeEntry, type LedgerEntry, type LedgerStore } from '@apex/kernel/ledger';
import { PAUSED_STATUSES, rerunSince, slotMove, type SlotMoveFacts } from '@apex/kernel/slots';
import type { LedgerView, SlotState } from '@apex/kernel/view';

export type SlotForm = { to?: unknown; typed?: unknown; password?: unknown; reason?: unknown };
export type SlotFacts = SlotMoveFacts & { slotKey: string; adminPassword: string; rerunSeq: number | null };
export type SlotPayload = { slotKey: string; from: string; to: 'paper' | 'retired'; reason: string; numbers: Record<string, never>; by: 'jeremy'; rerunSeq: number | null };
export type SlotDecision = { ok: true; payload: SlotPayload } | { ok: false; status: 401 | 409 | 422; error: string };

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Pure: the facts and the form in, the entry to write or the reason it will not be written out. */
export function decideSlotChange(f: SlotFacts, b: SlotForm): SlotDecision {
  const no = (status: 401 | 409 | 422, error: string): SlotDecision => ({ ok: false, status, error });
  // The password, again. With no password set there is nothing to re-enter, so nothing can be changed, on any machine.
  if (!f.adminPassword) return no(409, 'No admin password is set here, so this cannot be confirmed. Nothing was recorded.');
  if (typeof b.password !== 'string' || !same(b.password, f.adminPassword)) return no(401, 'That is not the password. Nothing was recorded.');
  if (b.typed !== f.slotKey) return no(422, 'Type the slot\'s name exactly as it is shown.');
  if (b.to !== 'paper' && b.to !== 'retired') return no(422, 'A slot can be moved by hand only back to paper or to retired. Nothing was recorded.');
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) return no(422, 'Say why, in 3 to 500 characters. The reason is kept in the ledger.');
  if (reason.includes(f.adminPassword)) return no(422, 'The reason must not contain the password. Nothing was recorded.');
  const m = slotMove(f, b.to); if (!m.ok) return no(409, `${m.why} Nothing was recorded.`);
  return { ok: true, payload: { slotKey: f.slotKey, from: m.from, to: m.to, reason: `by hand: ${reason}`, numbers: {}, by: 'jeremy', rerunSeq: m.to === 'paper' ? f.rerunSeq : null } };
}

export type Checked = { fingerprintMatches: boolean | null; datasetReadable: boolean | null };
export type SlotChangeDeps = {
  session: () => Promise<boolean>;                                               // the signed-in dashboard session
  adminPassword: string;
  load: () => Promise<{ ok: true; entries: LedgerEntry[]; view: LedgerView; now: number } | { ok: false }>;
  open: () => Promise<{ store: LedgerStore; lock: () => Promise<(() => Promise<void>) | null> } | null>;
  check: (s: SlotState, now: number) => Promise<Checked>;                       // the strategy against its lock, and the dataset
};
const json = (body: object, status = 200) => Response.json(body, { status });

export async function changeSlot(req: Request, rawKey: string, d: SlotChangeDeps): Promise<Response> {
  if (!(await d.session().catch(() => false))) return json({ error: 'Log in first, under You, Setup.' }, 401);
  if (new URL(req.url).origin !== req.headers.get('origin')) return json({ error: 'This can only be done from the dashboard itself.' }, 403);
  let slotKey = rawKey; try { slotKey = decodeURIComponent(rawKey); } catch { /* keep it as sent */ }
  const b: SlotForm = (await req.json().catch(() => null)) ?? {}, l = await d.load().catch(() => ({ ok: false as const }));
  if (!l.ok) return json({ error: 'The ledger could not be read, so nothing was recorded.' }, 409);
  const s = l.view.slots.get(slotKey); if (!s) return json({ error: 'There is no slot with that name.' }, 404);
  // The strategy and the data are checked only for a move back to paper from a pause. A check that cannot run counts as failed.
  const unknown: Checked = { fingerprintMatches: null, datasetReadable: null };
  const checked = b.to === 'paper' && PAUSED_STATUSES.includes(s.status) ? await d.check(s, l.now).catch(() => unknown) : unknown, rr = rerunSince(l.entries, slotKey);
  const r = decideSlotChange({ slotKey, adminPassword: d.adminPassword, status: s.status, ...checked, rerun: rr.verdict, rerunSeq: rr.seq }, b);
  if (!r.ok) return json({ error: r.error }, r.status);
  const o = await d.open().catch(() => null); if (!o) return json({ error: 'No ledger is connected here. Nothing was recorded.' }, 409);
  const release = await o.lock().catch(() => null); if (!release) return json({ error: 'A run is in progress. Nothing was recorded. Try again when it has finished.' }, 409);
  try {
    // Written only on top of the ledger exactly as it was read. If anything was appended since, nothing is written.
    const last = l.entries[l.entries.length - 1], e = makeEntry(last ? { seq: last.seq, hash: last.hash } : null, Math.max(Math.floor(l.now), 1), 'slot_status', 'dashboard', r.payload);
    await o.store.append(e);
    return json({ ok: true, seq: e.seq, from: r.payload.from, to: r.payload.to });
  } catch (err) {
    if (err instanceof LedgerConflict) return json({ error: 'The ledger moved while this was being checked. Nothing was recorded. Look at the slot again.' }, 409);
    return json({ error: 'The change could not be written to the ledger. Nothing was recorded.' }, 500);
  } finally { await release().catch(() => {}); }
}
