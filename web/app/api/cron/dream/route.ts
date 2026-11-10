// Nightly "dream" (archive/chat/35): summarises the day's chats, journal and trades into dated memory facts and may
// suggest (never apply) a rules-file edit. Vercel Cron (Bearer CRON_SECRET) or a logged-in "Run dream now".
import { dream } from '@/lib/memory';
import { isAdmin } from '@/lib/auth';
import { getJSON } from '@/lib/store';
import { trades } from '@/lib/bots';
import { getRules } from '@/lib/rules';
export const maxDuration = 120;
export async function GET(req: Request) {
  const cron = process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  if (!cron && !(process.env.APEX_ADMIN_PASSWORD && (await isAdmin()))) return new Response('forbidden', { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY is not set' }, { status: 400 });
  const day = Date.now() - 864e5;
  const journal = (await getJSON<any[]>('journal', [])).filter(j => (j.ts ?? 0) >= day);
  const t = (await trades(200)).filter((x: any) => x.ts >= day);
  try { return Response.json(await dream({ journal, trades: t, rules: (await getRules())?.text })); } catch (e: any) { return Response.json({ error: e.message }, { status: 502 }); }
}
