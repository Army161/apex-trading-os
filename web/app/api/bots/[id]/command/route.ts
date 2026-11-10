import { ingestOk, isAdmin } from '@/lib/auth';
import { setCommand, takeCommand } from '@/lib/bots';
import { getJSON } from '@/lib/store';
import { botCommand, cord } from '@/lib/andon';
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await ingestOk(req))) return Response.json({ error: 'bad token' }, { status: 401 });
  const { id } = await ctx.params;
  const kill = await getJSON('killswitch', false), c = await cord();
  // While halted, leave any queued command in place so it still runs after release.
  return Response.json({ command: kill || c.on ? botCommand(kill, c, null) : await takeCommand(id) });
}
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: 'login required' }, { status: 401 });
  const { id } = await ctx.params; const { command } = await req.json();
  if (!['pause', 'resume', 'kill'].includes(command)) return Response.json({ error: 'bad command' }, { status: 400 });
  await setCommand(id, command); return Response.json({ ok: true });
}
