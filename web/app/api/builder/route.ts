// AI strategy builder API (archive/chat/24). The work lives in lib/builder.ts; this route adds the purpose check (archive/chat/37).
import { EXAMPLE } from '@/lib/engine/spec';
import { guard } from '@/lib/usage';
import { buildSpec } from '@/lib/builder';
import { purpose } from '@/lib/gateway';
export const maxDuration = 120;

export async function POST(req: Request) {
  const { prompt, current, history } = await req.json();
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ spec: EXAMPLE, demo: true, note: 'No ANTHROPIC_API_KEY set, so this is the prebuilt Supertrend example from the video. Add the key in Vercel env vars to build from your own words.' });
  }
  try { await guard(); } catch (e: any) { return Response.json({ error: e.message }, { status: 429 }); }
  const p = await purpose(String(prompt ?? ''), 'strategy builder');
  if (!p.ok) return Response.json({ error: `That doesn't look like a trading strategy, so Apex won't build it (${p.why}).` }, { status: 422 });
  try { return Response.json(await buildSpec(String(prompt), current, history)); }
  catch (e: any) { return Response.json({ error: e.message }, { status: 502 }); }
}
