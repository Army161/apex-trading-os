// Crowd check: POST { topic } -> 30-day social sentiment sweep with sources. Admin only, counts toward the AI budget.
import { crowdCheck } from '@/lib/assistants';
import { isAdmin } from '@/lib/auth';
export const maxDuration = 120;
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'log in first' }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'needs ANTHROPIC_API_KEY' }, { status: 400 });
  const { topic } = await req.json();
  if (!topic || String(topic).trim().length < 2) return Response.json({ error: 'give a ticker or topic' }, { status: 400 });
  try { return Response.json(await crowdCheck(String(topic))); } catch (e: any) { return Response.json({ error: e.message }, { status: 500 }); }
}
