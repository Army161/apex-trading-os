import { ingestOk, isAdmin } from '@/lib/auth';
import { setCommand, botControl, ackedRef, ackCommand, commandReply } from '@/lib/bots';
import { getJSON } from '@/lib/store';
import { cord } from '@/lib/andon';
export const dynamic = 'force-dynamic';
// A bot polls here. Its queued command is handed out on every poll until the bot acknowledges it (DELETE with the ref) or a
// newer command replaces it. `halted` also tells the bot whether it may place orders at all.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await ingestOk(req))) return Response.json({ error: 'bad token' }, { status: 401 });
  const { id } = await ctx.params;
  return Response.json(commandReply(await getJSON('killswitch', false), await cord(), await botControl(id), await ackedRef(id)));
}
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return Response.json({ error: 'login required' }, { status: 401 });
  const { id } = await ctx.params; const { command } = await req.json();
  if (!['pause', 'resume', 'kill'].includes(command)) return Response.json({ error: 'bad command' }, { status: 400 });
  await setCommand(id, command); return Response.json({ ok: true });
}
// The bot acknowledges the command it was handed: DELETE /api/bots/{id}/command?ref=<ref>. Only the current ref counts.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await ingestOk(req))) return Response.json({ error: 'bad token' }, { status: 401 });
  const { id } = await ctx.params, ref = new URL(req.url).searchParams.get('ref') ?? '';
  if (!ref) return Response.json({ error: 'ref required' }, { status: 400 });
  return Response.json({ ok: true, ack: await ackCommand(id, ref) });
}
