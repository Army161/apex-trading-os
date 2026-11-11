// Resume after a halt recorded in the ledger. Jeremy only: a signed-in session and the confirmation phrase typed out, so it is
// never one tap and never something a script does by accident. This is a red path. It releases a paper halt and nothing else:
// it cannot open a live lock, approve anything or change a limit. No agent, bot, Telegram command or API key can call it.
import { isAdmin } from '@/lib/auth';
import { ledgerResume, shellStatus } from '@/lib/ledger';
import { RESUMABLE, confirmPhrase } from '@/lib/queries';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'Log in first, under You, Setup.' }, { status: 401 });
  if (new URL(req.url).origin !== req.headers.get('origin')) return Response.json({ error: 'This can only be done from the dashboard itself.' }, { status: 403 });
  const b = await req.json().catch(() => ({})), level = String(b?.level ?? ''), reason = String(b?.reason ?? '').trim();
  if (!Object.prototype.hasOwnProperty.call(RESUMABLE, level)) return Response.json({ error: 'That is not a halt that can be resumed here.' }, { status: 422 });
  if (String(b?.confirm ?? '') !== confirmPhrase(level)) return Response.json({ error: `Type "${confirmPhrase(level)}" exactly to confirm.` }, { status: 422 });
  if (reason.length < 3) return Response.json({ error: 'Say why it is safe to resume. The reason is kept in the ledger.' }, { status: 422 });
  const r = await ledgerResume(level, 'you', reason);
  if (r === 'recorded') return Response.json({ ok: true, status: await shellStatus() });
  return Response.json({ error: r === 'not_halted' ? 'The ledger holds no halt at that level.' : r === 'no_ledger' ? 'No ledger is connected here.' : 'The resume could not be written to the ledger.' }, { status: r === 'failed' ? 500 : 409 });
}
