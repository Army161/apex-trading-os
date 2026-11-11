// Revoke an API key. Signed-in session and same origin. A revoked key stops working at once and stays in the list, marked.
import { isAdmin } from '@/lib/auth';
import { revokeKey } from '@/lib/api/keys';
import { push } from '@/lib/store';
export const dynamic = 'force-dynamic';
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: 'Log in first, under You, Setup.' }, { status: 401 });
  if (new URL(req.url).origin !== req.headers.get('origin')) return Response.json({ error: 'This can only be done from the dashboard itself.' }, { status: 403 });
  const { id } = await params; if (!(await revokeKey(id))) return Response.json({ error: 'There is no key with that id.' }, { status: 404 });
  await push('events', { ts: Date.now(), bot: 'apex', level: 'control', message: `API key revoked: ${id}` });
  return Response.json({ ok: true });
}
