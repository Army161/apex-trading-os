import { ingestOk } from '@/lib/auth';
import { ingest } from '@/lib/ingest';
import { takeCommand } from '@/lib/bots';
import { getJSON } from '@/lib/store';
import { botCommand, cord } from '@/lib/andon';
export async function POST(req: Request) {
  if (!(await ingestOk(req))) return Response.json({ error: 'bad token' }, { status: 401 });
  const p = await req.json();
  const id = await ingest(p);
  return Response.json({ ok: true, bot: id, command: botCommand(await getJSON('killswitch', false), await cord(), await takeCommand(id)) });
}
