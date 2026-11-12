import { ingestOk } from '@/lib/auth';
import { ingest } from '@/lib/ingest';
import { getJSON } from '@/lib/store';
import { botCommand, cord } from '@/lib/andon';
// A report never reads a bot's queued command: that is delivered only on the bot's own poll of /api/bots/{id}/command and
// stays queued until the bot acknowledges it. The answer here carries only the global halt (kill switch or andon cord).
export async function POST(req: Request) {
  if (!(await ingestOk(req))) return Response.json({ error: 'bad token' }, { status: 401 });
  const p = await req.json();
  const id = await ingest(p);
  return Response.json({ ok: true, bot: id, command: botCommand(await getJSON('killswitch', false), await cord(), null) });
}
