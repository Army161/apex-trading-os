import { candles } from '@/lib/market';
export async function GET(req: Request) {
  const u = new URL(req.url);
  try { return Response.json(await candles(u.searchParams.get('symbol') || 'BTCUSDT', u.searchParams.get('tf') || '1d', Math.min(+(u.searchParams.get('limit') || 1000), 3000))); }
  catch (e: any) { return Response.json({ error: e.message }, { status: 502 }); }
}
