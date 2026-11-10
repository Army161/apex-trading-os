import { scan, runBacktest, leaderboard } from '@/lib/signals';
export const maxDuration = 60;
export async function GET(req: Request) {
  const u = new URL(req.url); const tf = u.searchParams.get('tf') || '1d';
  try {
    if (u.searchParams.get('mode') === 'backtest') return Response.json(await runBacktest(u.searchParams.get('symbol') || 'BTCUSDT', tf, u.searchParams.get('strategy') || 'turtle_55_20', +(u.searchParams.get('risk') || 0.01)));
    if (u.searchParams.get('mode') === 'leaderboard') return Response.json(await leaderboard(u.searchParams.get('symbol') || 'BTCUSDT', tf));
    return Response.json({ results: await scan((u.searchParams.get('symbols') || 'BTCUSDT,ETHUSDT,SOLUSDT').split(',').slice(0, 12), tf) });
  } catch (e: any) { return Response.json({ error: e.message }, { status: 502 }); }
}
