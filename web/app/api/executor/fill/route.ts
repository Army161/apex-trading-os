// The executor posts a live fill back here (docs/design/02 s6, step 7). Red path.
// Only the executor can call it: an HMAC-SHA256 signature over "<timestamp>.<raw body>" with APEX_EXECUTOR_KEY, checked in
// constant time, and a timestamp within five minutes. With no key set it refuses everything, in every environment.
// The slot must have locks 1 to 3 open as worked out from the ledger (lock 4 lives on Jeremy's machine and is not known here).
// It writes one live_fill entry and nothing else: never the paper book, a slot's status, an approval or an order.
import { Ledger, LiveFillDuplicate, liveFillKey } from '@apex/kernel/ledger';
import { lockFactsOf, serverLocksOpen } from '@apex/kernel/locks';
import { liveFillProblems } from '@apex/kernel/view';
import { EXECUTOR_SIG_HEADER, EXECUTOR_TS_HEADER, verifyExecutor } from '@apex/kernel/executor-auth';
import { ledgerStore, loadLedger } from '@/lib/ledger';
export const dynamic = 'force-dynamic';
const MAX_BODY = 4096;
const FIELDS = ['intent', 'slotKey', 'symbol', 'side', 'kind', 't', 'price', 'qty', 'fee', 'brokerOrderId', 'stage'] as const;

export async function POST(req: Request) {
  const raw = await req.text().catch(() => null);
  if (raw === null || raw.length > MAX_BODY) return Response.json({ error: 'The body could not be read or is too large.' }, { status: 413 });
  const auth = verifyExecutor(process.env.APEX_EXECUTOR_KEY, req.headers.get(EXECUTOR_TS_HEADER), req.headers.get(EXECUTOR_SIG_HEADER), raw, Date.now());
  if (!auth.ok) return Response.json({ error: `Refused: ${auth.why}.` }, { status: 401 });
  let body: any; try { body = JSON.parse(raw); } catch { return Response.json({ error: 'The body is not JSON.' }, { status: 422 }); }
  const bad = liveFillProblems(body); if (bad.length) return Response.json({ error: `The fill is not valid: ${bad.join('; ')}.` }, { status: 422 });
  const fill = Object.fromEntries(FIELDS.map(k => [k, body[k]]));            // only the known fields reach the ledger
  const l = await loadLedger(); if (!l.ok) return Response.json({ error: 'The ledger could not be read, so nothing was recorded.' }, { status: 503 });
  // The executor retries until it hears back, so a fill it already sent is answered as done and written once.
  if (l.entries.some(e => e.kind === 'live_fill' && liveFillKey(e.payload) === liveFillKey(fill))) return Response.json({ ok: true, duplicate: true });
  // An entry needs locks 1 to 3 open and the approved stage. An exit of a position the live book already holds is always
  // recorded, even after the approval expired or a lock closed: the money has moved, and the book must say so.
  const held = l.view.live.positions.get(fill.slotKey), closesHeld = fill.kind !== 'entry' && !!held && held.side === fill.side && held.symbol === fill.symbol;
  if (!closesHeld) {
    if (fill.kind !== 'entry') return Response.json({ error: 'An exit for a position the live book does not hold. Nothing was recorded; reconcile with the broker.' }, { status: 409 });
    const facts = lockFactsOf(l.view, l.entries, fill.slotKey);
    if (!serverLocksOpen(fill.slotKey, facts, l.now)) return Response.json({ error: 'Locks 1 to 3 are not all open for this slot. Nothing was recorded.' }, { status: 409 });
    if (facts.approval?.stage !== fill.stage) return Response.json({ error: 'The fill names a stage that is not the one approved. Nothing was recorded.' }, { status: 409 });
  }
  try {
    const o = await ledgerStore(); if (!o) return Response.json({ error: 'No ledger is connected here.' }, { status: 503 });
    const e = await new Ledger(o.store).append('live_fill', 'executor', fill);
    return Response.json({ ok: true, seq: e.seq });
  } catch (e) {
    if (e instanceof LiveFillDuplicate) return Response.json({ ok: true, duplicate: true });
    return Response.json({ error: 'The fill could not be written to the ledger. Nothing was recorded.' }, { status: 500 });
  }
}
