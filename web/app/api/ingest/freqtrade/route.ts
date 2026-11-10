import { ingestOk } from '@/lib/auth';
import { ingest } from '@/lib/ingest';
// Freqtrade webhook -> Apex. Configure webhook.url = https://<app>/api/ingest/freqtrade?token=<APEX_INGEST_TOKEN>
export async function POST(req: Request) {
  if (!(await ingestOk(req))) return Response.json({ error: 'bad token' }, { status: 401 });
  const w = await req.json(); const bot = { id: 'freqtrade', kind: 'crypto', name: 'Freqtrade', mode: 'dry-run' };
  if (w.type === 'status') await ingest({ bot, type: 'heartbeat', status: { message: w.status } });
  else await ingest({ bot, type: 'trade', trade: { symbol: w.pair, side: w.type === 'entry' ? 'buy' : 'sell', strategy: w.strategy, price: +(w.open_rate ?? w.close_rate), qty: +(w.amount ?? 0),
    pnl: w.profit_amount != null ? +w.profit_amount : undefined, r: undefined, reason: w.exit_reason, status: w.type === 'entry' ? 'open' : 'closed', trade_id: w.trade_id } });
  return Response.json({ ok: true });
}
