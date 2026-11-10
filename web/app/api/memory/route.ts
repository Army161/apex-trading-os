// Evolving memory (archive/chat/35): current facts with their history, plus remember / retire / forget and the last
// suggested rules edit. Reading needs login too: these are Jeremy's own preferences.
import { isAdmin } from '@/lib/auth';
import { allFacts, current, history, remember, retire, forget } from '@/lib/memory';
import { getJSON, setJSON, list } from '@/lib/store';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: 'login required' }, { status: 401 });
  const fs = await allFacts();
  return Response.json({ facts: current(fs).map(f => ({ ...f, history: history(fs, f.key).filter(h => h.id !== f.id) })),
    suggestion: await getJSON('rules_suggestion', null), dreams: await list('memory_dreams', 5) });
}
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'login required' }, { status: 401 });
  const { action, key, text } = await req.json();
  if (action === 'remember' && key && text) return Response.json({ facts: await remember(key, String(text).slice(0, 500), 'you') });
  if (action === 'retire' && key) return Response.json({ facts: await retire(key) });
  if (action === 'forget' && key) return Response.json({ facts: await forget(key) });
  if (action === 'dismiss_suggestion') { await setJSON('rules_suggestion', null); return Response.json({ ok: true }); }
  return Response.json({ error: 'action must be remember, retire, forget or dismiss_suggestion' }, { status: 400 });
}
