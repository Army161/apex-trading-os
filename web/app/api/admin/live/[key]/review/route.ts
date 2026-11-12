// Run the promotion review for a live-eligible slot (lock 2's review record, docs/design/02 s6). Red path.
// It needs the signed-in session and a call from the dashboard itself. It runs the owner, engineer and QA chain and writes
// one promotion_review entry. It cannot approve, change a slot's status, open lock 3 or 4, or place an order.
// No agent, bot, Telegram command, MCP tool, CLI command or API key can call it.
import { isAdmin } from '@/lib/auth';
import { promotionReview } from '@/lib/promotion';
export const dynamic = 'force-dynamic';
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  // A session that cannot be read is no session.
  if (!(await isAdmin().catch(() => false))) return Response.json({ error: 'Log in first, under You, Setup.' }, { status: 401 });
  if (new URL(req.url).origin !== req.headers.get('origin')) return Response.json({ error: 'This can only be done from the dashboard itself.' }, { status: 403 });
  let slotKey = (await params).key; try { slotKey = decodeURIComponent(slotKey); } catch { /* keep it as sent */ }
  const r = await promotionReview(slotKey);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ ok: true, seq: r.seq, verdict: r.verdict });
}
