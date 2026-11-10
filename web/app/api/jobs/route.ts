// Agent job board (archive/chat/41): list jobs; start a strategy team job; run its next step; answer a needs-you card.
import { isAdmin } from '@/lib/auth';
import { listJobs, feedback } from '@/lib/jobs';
import { startTeam, teamStep } from '@/lib/team';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function GET() { return Response.json({ jobs: await listJobs() }); }
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'login required' }, { status: 401 });
  const b = await req.json();
  try {
    if (b.action === 'start') { if (!process.env.ANTHROPIC_API_KEY) throw new Error('needs ANTHROPIC_API_KEY'); return Response.json({ job: await startTeam(String(b.idea ?? '').slice(0, 1000)) }); }
    if (b.action === 'step') return Response.json({ job: await teamStep(String(b.id)) });
    if (b.action === 'answer') return Response.json({ job: await feedback(String(b.id), String(b.text ?? '').slice(0, 1000), b.step) });
    return Response.json({ error: 'action must be start, step or answer' }, { status: 400 });
  } catch (e: any) { return Response.json({ error: e.message }, { status: 502 }); }
}
