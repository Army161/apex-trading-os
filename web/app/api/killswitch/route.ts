import { isAdmin } from '@/lib/auth';
import { setJSON, push } from '@/lib/store';
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'login required' }, { status: 401 });
  const { on } = await req.json(); await setJSON('killswitch', !!on);
  await push('events', { ts: Date.now(), bot: 'apex', level: 'control', message: on ? 'GLOBAL KILL SWITCH ON: every bot is told to pause' : 'kill switch released' });
  return Response.json({ ok: true, on: !!on });
}
