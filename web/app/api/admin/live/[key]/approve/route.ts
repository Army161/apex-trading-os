// Record Jeremy's approval for a slot's first live stage (lock 3, docs/design/02 s6 and 09 s5). Red path.
// It needs the signed-in session, a call from the dashboard itself, the password typed again, the slot's name typed out and
// every line of the checklist. Locks 1 and 2 are worked out again here from the ledger, never taken from the form.
// What it writes is one ledger entry. It cannot open lock 4, place an order, or change a slot's status.
// No agent, bot, Telegram command, MCP tool or API key can call it.
import { Ledger } from '@apex/kernel/ledger';
import { isAdmin } from '@/lib/auth';
import { ledgerStore, loadLedger, shellStatus } from '@/lib/ledger';
import { slotDetail } from '@/lib/queries';
import { decideApproval } from '../../approval';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: 'Log in first, under You, Setup.' }, { status: 401 });
  if (new URL(req.url).origin !== req.headers.get('origin')) return Response.json({ error: 'This can only be done from the dashboard itself.' }, { status: 403 });
  let slotKey = (await params).key; try { slotKey = decodeURIComponent(slotKey); } catch { /* keep it as sent */ }
  const b = await req.json().catch(() => ({})), l = await loadLedger();
  if (!l.ok) return Response.json({ error: 'The ledger could not be read, so nothing was recorded.' }, { status: 409 });
  const d = slotDetail(l.view, l.entries, slotKey, l.now); if (!d) return Response.json({ error: 'There is no slot with that name.' }, { status: 404 });
  const st = await shellStatus();
  const r = decideApproval({ slotKey, slotStatus: d.slot.status, locks: d.locks, halted: st.halted, adminPassword: process.env.APEX_ADMIN_PASSWORD || '', now: l.now }, b ?? {});
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  try {
    const o = await ledgerStore(); if (!o) return Response.json({ error: 'No ledger is connected here.' }, { status: 409 });
    const e = await new Ledger(o.store).append('live_approval', 'dashboard', r.payload);
    return Response.json({ ok: true, seq: e.seq, expiresAt: r.payload.expiresAt });
  } catch { return Response.json({ error: 'The approval could not be written to the ledger. Nothing was recorded.' }, { status: 500 }); }
}
