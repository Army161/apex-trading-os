// Trader rules: GET -> questions + saved rules; POST { answers } drafts with Claude (not saved); POST { text } saves.
import { QUESTIONS, getRules, saveRules, draftRules } from '@/lib/rules';
import { isAdmin } from '@/lib/auth';
export const maxDuration = 60;
export async function GET() { return Response.json({ questions: QUESTIONS, rules: await getRules() }); }
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'log in first' }, { status: 401 });
  const b = await req.json();
  try {
    if (typeof b.text === 'string') return Response.json({ rules: await saveRules(b.text) });
    if (Array.isArray(b.answers)) { if (!process.env.ANTHROPIC_API_KEY) throw new Error('needs ANTHROPIC_API_KEY'); return Response.json({ draft: await draftRules(b.answers) }); }
    return Response.json({ error: 'send answers or text' }, { status: 400 });
  } catch (e: any) { return Response.json({ error: e.message }, { status: 500 }); }
}
