import { isAdmin } from '@/lib/auth';
import { list, setJSON, getJSON, push } from '@/lib/store';
export const dynamic = 'force-dynamic';
export async function GET() {
  const decided = await getJSON<Record<string, string>>('proposal_decisions', {});
  return Response.json({ proposals: (await list<any>('proposals', 100)).map(p => ({ ...p, status: decided[`${p.ts}:${p.symbol}`] ?? p.status })) });
}
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'login required' }, { status: 401 });
  const { key, decision } = await req.json(); const d = await getJSON<Record<string, string>>('proposal_decisions', {});
  d[key] = decision; await setJSON('proposal_decisions', d);
  await push('events', { ts: Date.now(), bot: 'research-council', level: 'control', message: `proposal ${key} ${decision} (execution stays manual in the bot that owns the account)` });
  return Response.json({ ok: true });
}
