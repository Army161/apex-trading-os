// Andon cord (archive/chat/37): GET shows the cord and the pull count; POST {pull, reason} or {release}. Login required.
import { isAdmin } from '@/lib/auth';
import { andonStatus, pullCord, releaseCord } from '@/lib/andon';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(await andonStatus()); }
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'login required' }, { status: 401 });
  const b = await req.json();
  if (b.release) return Response.json(await releaseCord('you'));
  return Response.json(await pullCord('you', String(b.reason || 'pulled from the dashboard').slice(0, 300)));
}
