// API keys, from the dashboard only: list them and make one. Signed-in session and same origin. No API key can reach this,
// so a key can never make another key. The new key is in the answer once and is not kept anywhere in readable form.
import { isAdmin } from '@/lib/auth';
import { createKey, keysUsable, listKeys } from '@/lib/api/keys';
import { push } from '@/lib/store';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: 'Log in first, under You, Setup.' }, { status: 401 });
  return Response.json({ usable: keysUsable(), keys: await listKeys() });
}
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'Log in first, under You, Setup.' }, { status: 401 });
  if (new URL(req.url).origin !== req.headers.get('origin')) return Response.json({ error: 'This can only be done from the dashboard itself.' }, { status: 403 });
  const b = await req.json().catch(() => null), r = await createKey(b?.name, b?.scopes);
  if (!r.ok) return Response.json({ error: r.error }, { status: 422 });
  await push('events', { ts: Date.now(), bot: 'apex', level: 'control', message: `API key made: ${r.info.name} (${r.info.id}) with ${r.info.scopes.join(', ')}` });
  return Response.json({ key: r.key, info: r.info });
}
