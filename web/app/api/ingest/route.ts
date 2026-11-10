import { ingestOk } from '@/lib/auth';
import { ingest } from '@/lib/ingest';
import { takeCommand } from '@/lib/bots';
export async function POST(req: Request) {
  if (!(await ingestOk(req))) return Response.json({ error: 'bad token' }, { status: 401 });
  const p = await req.json();
  const id = await ingest(p);
  return Response.json({ ok: true, bot: id, command: await takeCommand(id) });
}
