// Investor lenses: POST { symbol } -> four investor styles side by side with sources. Admin only, counts toward the AI budget.
import { investorLenses } from '@/lib/assistants';
import { isAdmin } from '@/lib/auth';
export const maxDuration = 120;
export async function POST(req: Request) {
  if (!(await isAdmin())) return Response.json({ error: 'log in first' }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'needs ANTHROPIC_API_KEY' }, { status: 400 });
  const { symbol } = await req.json();
  if (!symbol || !/^[A-Za-z.\-]{1,15}$/.test(symbol)) return Response.json({ error: 'give a ticker like AAPL or BTCUSDT' }, { status: 400 });
  try { return Response.json(await investorLenses(symbol)); } catch (e: any) { return Response.json({ error: e.message }, { status: 500 }); }
}
