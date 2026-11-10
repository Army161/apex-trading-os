import { upsertBot } from './bots';
import { push, getJSON, setJSON } from './store';
import { sendTelegram } from './telegram';
import { pullCord, check, type Reading } from './andon';
import { events } from './bots';
const ERR_LIMIT = Number(process.env.APEX_ANDON_ERRORS || 5);
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
    // Any bot can pull the andon cord by sending level "halt" (archive/chat/37).
    if (p.level === 'halt') await pullCord(id, String(p.message).slice(0, 300));
    if (p.level === 'error') {
      const hr = Date.now() - 36e5, n = (await events(200)).filter((e: any) => e.bot === id && e.level === 'error' && e.ts >= hr).length;
      await check(id, [{ kind: 'errors', value: n, limit: ERR_LIMIT }]);
    }
    if (p.level === 'proposal') { try { await push('proposals', { ts, bot: id, status: 'pending', ...JSON.parse(p.message) }, 100); } catch { /* not json */ } }
  }
  // Heartbeats that report drawdown or today's return against their limits pull the cord when a line is crossed.
  if (p.type === 'heartbeat' && p.status) {
    const st = p.status, r: Reading[] = [];
    if (typeof st.drawdown === 'number' && typeof st.backtest_max_dd === 'number') r.push({ kind: 'drawdown', value: st.drawdown, limit: st.backtest_max_dd });
    if (typeof st.day_return === 'number' && typeof st.daily_loss_limit === 'number') r.push({ kind: 'daily_loss', value: st.day_return, limit: -Math.abs(st.daily_loss_limit) });
    if (r.length) await check(id, r);
  }
  if (p.type === 'trade' && p.trade?.status === 'closed' && typeof p.trade.pnl === 'number') {
    const s = await getJSON<any>('risk', { lastLossAt: 0, lossesInRow: 0 });
    if (p.trade.pnl < 0) { s.lastLossAt = Date.now(); s.lossesInRow++; } else s.lossesInRow = 0;
    await setJSON('risk', s);
  }
  return id;
}
