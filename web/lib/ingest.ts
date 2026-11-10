import { upsertBot } from './bots';
import { push, getJSON, setJSON } from './store';
import { sendTelegram } from './telegram';
export async function ingest(p: any) {
  const id = await upsertBot({ ...(p.bot ?? { id: 'unknown' }), ...(p.type === 'heartbeat' ? { status: p.status } : {}) });
  const ts = Math.round((p.ts ?? Date.now() / 1000) * 1000);
  if (p.type === 'trade') {
    await push('trades', { ts, bot: id, ...p.trade });
    const t = p.trade ?? {};
    await sendTelegram(`${id}: ${String(t.side ?? '').toUpperCase()} ${t.symbol ?? ''} qty ${t.qty ?? ''} @ ${t.price ?? ''} (${t.status ?? ''})${typeof t.pnl === 'number' ? ` pnl ${t.pnl}` : ''}${t.reason ? ` - ${t.reason}` : ''}`);
  }
  if (p.type === 'event') {
    await push('events', { ts, bot: id, level: p.level, message: p.message });
    if (['risk', 'error', 'control'].includes(p.level)) await sendTelegram(`${id} [${p.level}] ${String(p.message).slice(0, 500)}`);
    if (p.level === 'proposal') { try { await push('proposals', { ts, bot: id, status: 'pending', ...JSON.parse(p.message) }, 100); } catch { /* not json */ } }
  }
  if (p.type === 'trade' && p.trade?.status === 'closed' && typeof p.trade.pnl === 'number') {
    const s = await getJSON<any>('risk', { lastLossAt: 0, lossesInRow: 0 });
    if (p.trade.pnl < 0) { s.lastLossAt = Date.now(); s.lossesInRow++; } else s.lossesInRow = 0;
    await setJSON('risk', s);
  }
  return id;
}
