// Checks every running strategy for a signal on the latest closed candle and sends a Telegram alert once per new signal.
// Vercel Cron calls this with Authorization: Bearer $CRON_SECRET. Hobby plans allow one cron run a day, so for 15m/1h
// strategies use a Pro schedule or any free pinger (e.g. cron-job.org) hitting this URL with the same header.
import { allStrategies, latestSignal } from '@/lib/strategies';
import { getJSON, setJSON, push } from '@/lib/store';
import { candles } from '@/lib/market';
import { sendTelegram } from '@/lib/telegram';
export const maxDuration = 60;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('forbidden', { status: 403 });
  const out: any[] = []; const seen: Record<string, number> = {};
  for (const s of await allStrategies()) {
    const d = s.deployment; if (!d || d.status !== 'running') continue;
    try {
      const { bars } = await candles(s.spec.symbol, s.spec.tf, 400); const g = latestSignal(bars, s.spec);
      if (g.t <= (d.lastSignalT ?? 0) || g.t < d.since) { out.push({ id: s.id, skip: 'already checked' }); continue; }
      seen[s.id] = g.t;
      if (g.side) {
        const msg = `${s.spec.name}: ${g.side === 1 ? 'BUY' : 'SELL'} ${s.spec.symbol} ${s.spec.tf} at ${g.close}, stop ${g.stop.toFixed(2)}${Number.isFinite(g.target) ? `, target ${g.target.toFixed(2)}` : ''} (${d.mode}, fills next open)`;
        await push('events', { ts: Date.now(), bot: `strategy:${s.id}`, level: 'signal', message: msg }); await sendTelegram(msg);
      }
      out.push({ id: s.id, side: g.side });
    } catch (e: any) { out.push({ id: s.id, error: e.message }); }
  }
  // re-read before writing so a save made during the checks isn't lost
  const all = await getJSON<Record<string, any>>('strategies', {});
  for (const [id, t] of Object.entries(seen)) if (all[id]?.deployment) all[id].deployment.lastSignalT = t;
  await setJSON('strategies', all);
  return Response.json({ checked: out });
}
