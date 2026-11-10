import { ingestOk, isAdmin } from '@/lib/auth';
import { setCommand, takeCommand } from '@/lib/bots';
import { getJSON } from '@/lib/store';
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await ingestOk(req))) return Response.json({ error: 'bad token' }, { status: 401 });
  const { id } = await ctx.params;
  if (await getJSON('killswitch', false)) return Response.json({ command: 'pause' });
  return Response.json({ command: await takeCommand(id) });
}
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: 'login required' }, { status: 401 });
  const { id } = await ctx.params; const { command } = await req.json();
  if (!['pause', 'resume', 'kill'].includes(command)) return Response.json({ error: 'bad command' }, { status: 400 });
  await setCommand(id, command); return Response.json({ ok: true });
}
