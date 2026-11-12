// Halt from the header: pulls the andon cord (every bot is told to pause) and records the halt in the ledger, which is what the
// autopilot run reads. Halting is always allowed for a signed-in session. There is no resume here: resuming needs a typed
// confirmation on the Risk screen.
import { isAdmin } from '@/lib/auth';
import { pullCord } from '@/lib/andon';
import { ledgerHalt, shellStatus } from '@/lib/ledger';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'login required' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const reason = String(b?.reason || 'Halt pressed in the dashboard header').slice(0, 300);
  await pullCord('you', reason);
  const ledger = await ledgerHalt('you', reason);
  return Response.json({ ok: true, ledger, status: await shellStatus() });
}
