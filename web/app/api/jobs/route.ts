// Agent job board (archive/chat/41): list jobs; start a strategy team job; run its next step; answer a needs-you card;
// settle a parked agent job with one of its options, or snooze it. Every change needs the signed-in session.
import { isAdmin } from '@/lib/auth';
import { listJobs, feedback, snooze } from '@/lib/jobs';
import { settle } from '@/lib/agentjobs';
import { agentIo } from '@/lib/agentio';
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
    if (b.action === 'settle') return Response.json({ job: await settle(String(b.id), String(b.option ?? ''), agentIo) });
    if (b.action === 'snooze') return Response.json({ job: await snooze(String(b.id), Number(b.hours) || 24) });
    return Response.json({ error: 'action must be start, step, answer, settle or snooze' }, { status: 400 });
  } catch (e: any) { return Response.json({ error: e.message }, { status: 502 }); }
}
