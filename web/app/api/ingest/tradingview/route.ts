import { ingestOk } from '@/lib/auth';
import { ingest } from '@/lib/ingest';
// TradingView alert webhook (Pine scripts in bots/tradingview-bridge send JSON alert_message bodies).
export async function POST(req: Request) {
  if (!(await ingestOk(req))) return Response.json({ error: 'bad token' }, { status: 401 });
  const txt = await req.text(); let a: any; try { a = JSON.parse(txt); } catch { a = { message: txt }; }
  await ingest({ bot: { id: 'tv-signals', kind: 'tradingview', name: 'TradingView Signals', mode: 'alerts' }, type: 'event', level: 'signal', message: `${a.bot ?? 'tv'} ${a.side ?? ''} ${a.symbol ?? ''} @ ${a.price ?? ''}${a.stop ? ` stop ${a.stop}` : ''}`.trim() || txt });
  return Response.json({ ok: true });
}
