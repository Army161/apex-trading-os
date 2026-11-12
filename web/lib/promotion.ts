// The promotion review: lock 2's review record (docs/design/02 s6). Red path. It runs the owner, engineer and QA chain from
// review.ts over a slot's forward record and writes one promotion_review entry. Only the signed-in session can start it,
// through app/api/admin/live/[key]/review. It never changes a slot's status, never approves, and opens no lock by itself:
// the kernel reads the entry (lockFactsOf) and decides.
import { Ledger } from '@apex/kernel/ledger';
import { lockFactsOf } from '@apex/kernel/locks';
import { ledgerStore, loadLedger } from './ledger';
import { slotDetail } from './queries';
import { REVIEW_MODEL, finalVerdict, reviewChain, type Ask } from './review';

export type ReviewResult = { ok: true; seq: number; verdict: string } | { ok: false; status: 404 | 409 | 500 | 503; error: string };
const cut = (s: unknown, n = 1500) => String(s ?? '').slice(0, n);

/** What the reviewers read: the slot's lock, its forward record and graduation, the validator runs and drift. No keys, no free text from outside. */
function subjectOf(d: NonNullable<ReturnType<typeof slotDetail>>) {
  return `Slot under review for its first live stage (1% of the paper-sized risk):\n${JSON.stringify({ slot: d.slot, graduation: d.clock, baseline: d.baseline, inSample: d.inSample,
    forward: { n: d.forward.n, pnl: d.forward.pnl, wins: d.forward.wins, avgR: d.forward.avgR, lastTrades: d.forward.trades.slice(0, 15) }, validator: d.validator, drift: d.drift, events: d.events.slice(0, 10) })}`;
}

export async function promotionReview(slotKey: string, o: { ask?: Ask; model?: string } = {}): Promise<ReviewResult> {
  const l = await loadLedger(); if (!l.ok) return { ok: false, status: 409, error: 'The ledger could not be read, so nothing was reviewed.' };
  const d = slotDetail(l.view, l.entries, slotKey, l.now); if (!d) return { ok: false, status: 404, error: 'There is no slot with that name.' };
  if (d.slot.status !== 'live_eligible') return { ok: false, status: 409, error: 'Only a live-eligible slot can be reviewed for promotion. Nothing was reviewed.' };
  const f = lockFactsOf(l.view, l.entries, slotKey);
  if (f.graduationPassedSeq === null || f.validatorAgreeSeq === null) return { ok: false, status: 409, error: 'The slot needs a strict pass and a fresh agreeing validator run first. Nothing was reviewed.' };
  if (!o.ask && !process.env.ANTHROPIC_API_KEY) return { ok: false, status: 503, error: 'No model key is set here, so the review cannot run.' };
  const model = o.model ?? REVIEW_MODEL;
  let notes;
  try { notes = await reviewChain(subjectOf(d), { ask: o.ask, model }); }
  catch (e) { return { ok: false, status: 503, error: `The review did not finish: ${cut(e instanceof Error ? e.message : e, 200)}. Nothing was recorded.` }; }
  // The chain takes a while. If the slot or its evidence moved meanwhile, this review is about something that no longer stands.
  const again = await loadLedger(); if (!again.ok) return { ok: false, status: 409, error: 'The ledger could not be read again, so nothing was recorded.' };
  const s2 = again.view.slots.get(slotKey), f2 = lockFactsOf(again.view, again.entries, slotKey);
  if (s2?.status !== 'live_eligible' || f2.graduationPassedSeq !== f.graduationPassedSeq || f2.validatorAgreeSeq !== f.validatorAgreeSeq)
    return { ok: false, status: 409, error: 'The slot changed while it was being reviewed. Nothing was recorded; run the review again.' };
  const verdict = finalVerdict(notes);
  const payload = { slotKey, trialKey: s2.trialKey, gradSeq: f.graduationPassedSeq, validatorSeq: f.validatorAgreeSeq, verdict, by: 'you', model,
    steps: notes.map(n => ({ step: n.step, verdict: n.verdict, summary: cut(n.summary), issues: n.issues.slice(0, 20).map(i => ({ severity: i.severity, issue: cut(i.issue, 600), fix: cut(i.fix, 600) })) })) };
  try {
    const st = await ledgerStore(); if (!st) return { ok: false, status: 409, error: 'No ledger is connected here.' };
    const e = await new Ledger(st.store).append('promotion_review', 'dashboard', payload);
    return { ok: true, seq: e.seq, verdict };
  } catch { return { ok: false, status: 500, error: 'The review could not be written to the ledger. Nothing was recorded.' }; }
}
