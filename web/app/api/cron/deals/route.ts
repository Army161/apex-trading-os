import { dealSeeker } from '@/lib/assistants';
import { isAdmin } from '@/lib/auth';
export const maxDuration = 300;
// Vercel Cron (Bearer CRON_SECRET) or a logged-in "run now" from the Assistants tab.
export async function GET(req: Request) {
  const cron = process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  if (!cron && !(process.env.APEX_ADMIN_PASSWORD && (await isAdmin()))) return new Response('forbidden', { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY is not set' }, { status: 400 });
  try { return Response.json(await dealSeeker()); } catch (e: any) { return Response.json({ error: e.message }, { status: 502 }); }
}
