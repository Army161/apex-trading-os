import { getStrategy, evaluate } from '@/lib/strategies';
export const maxDuration = 60;
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getStrategy((await ctx.params).id); if (!s) return Response.json({ error: 'not found' }, { status: 404 });
  try { return Response.json({ strategy: s, ...(await evaluate(s)) }); } catch (e: any) { return Response.json({ strategy: s, error: e.message }, { status: 502 }); }
}
