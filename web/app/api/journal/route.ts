import { isAdmin } from '@/lib/auth';
import { getJSON, setJSON } from '@/lib/store';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json({ entries: await getJSON<any[]>('journal', []) }); }
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'login required' }, { status: 401 });
  const body = await req.json(); const all = await getJSON<any[]>('journal', []);
  if (body.delete) { await setJSON('journal', all.filter(e => e.id !== body.delete)); return Response.json({ ok: true }); }
  const e = { ...body, id: body.id ?? crypto.randomUUID(), ts: body.ts ?? Date.now() };
  await setJSON('journal', [e, ...all.filter(x => x.id !== e.id)].slice(0, 2000));
  return Response.json({ ok: true, entry: e });
}
