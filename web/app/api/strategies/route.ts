import { allStrategies, saveStrategy, control, removeStrategy } from '@/lib/strategies';
import { isAdmin, ingestOk } from '@/lib/auth';
import { secondOpinion } from '@/lib/review';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';
// GET is also what a local runner polls (with the ingest token) to pick up strategies flagged "live".
export async function GET(req: Request) {
  const all = await allStrategies();
  if (new URL(req.url).searchParams.get('deployed')) { if (!(await ingestOk(req))) return Response.json({ error: 'bad token' }, { status: 401 }); return Response.json({ strategies: all.filter(s => s.deployment && s.deployment.status !== 'stopped') }); }
  return Response.json({ strategies: all });
}
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'login required' }, { status: 401 });
  const b = await req.json();
  try {
    if (b.action === 'save') return Response.json({ strategy: await saveStrategy(b.spec, b.origin ?? 'manual', b.prompt, b.id) });
    if (b.action === 'review') { if (!process.env.ANTHROPIC_API_KEY) throw new Error('needs ANTHROPIC_API_KEY'); return Response.json({ review: await secondOpinion(b.id) }); }
    if (b.action === 'delete') { await removeStrategy(b.id); return Response.json({ ok: true }); }
    if (['deploy', 'pause', 'resume', 'stop', 'mode'].includes(b.action)) return Response.json({ strategy: await control(b.id, b.action, b.mode) });
    return Response.json({ error: 'unknown action' }, { status: 400 });
  } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
}
