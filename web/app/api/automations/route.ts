// The switch of a scheduled job (docs/design/06 s6). Switching off is always allowed, like the halt: it only stops something.
// Switching on needs the signed-in session.
import { isAdmin } from '@/lib/auth';
import { setSwitch } from '@/lib/automations';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})), on = b?.on === true;
  if (on && !(await isAdmin())) return Response.json({ error: 'Switching a job on needs you to be signed in. Switching off does not.' }, { status: 401 });
  try { const s = await setSwitch(String(b?.id ?? ''), on); return Response.json({ id: s.id, on: s.on }); } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}
