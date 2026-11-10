// Telegram bot webhook: /positions /orders /pnl /strategies /bots. Answers only TELEGRAM_CHAT_ID; Telegram signs each call
// with TELEGRAM_WEBHOOK_SECRET in the X-Telegram-Bot-Api-Secret-Token header.
import { sendTelegram } from '@/lib/telegram';
import { bots, trades } from '@/lib/bots';
import { allStrategies, evaluate } from '@/lib/strategies';
import { runChat } from '@/lib/chat';
import { getJSON, setJSON } from '@/lib/store';
export const maxDuration = 120;

const f = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(x).toFixed(2)}`;
async function reply(cmd: string) {
  const c = cmd.split(/[\s@]/)[0].toLowerCase();
  if (c === '/positions' || c === '/pnl' || c === '/strategies') {
    const live = (await allStrategies()).filter(s => s.deployment && s.deployment.status !== 'stopped');
    const rows = await Promise.all(live.map(async s => { try { return { s, e: (await evaluate(s, 400)).paper }; } catch { return { s, e: null }; } }));
    if (c === '/strategies') return rows.length ? rows.map(({ s, e }) => `${s.spec.name} (${s.spec.symbol} ${s.spec.tf}): ${s.deployment!.status}, ${s.deployment!.mode}${e ? `, net ${f(e.net)}` : ''}`).join('\n') : 'No deployed strategies.';
    if (c === '/positions') {
      const botOpen = (await trades(200)).filter((t: any) => t.status === 'open' || t.status === 'partial');
      const a = rows.filter(r => r.e?.open).map(({ s, e }) => `${s.spec.name}: ${e.open.side === 1 ? 'LONG' : 'SHORT'} ${s.spec.symbol} @ ${e.open.entry.toFixed(2)}, mark ${e.open.mark.toFixed(2)}, stop ${e.open.stop.toFixed(2)}, unrealized ${f(e.unrealized)}`);
      const b = botOpen.slice(0, 15).map((t: any) => `${t.bot}: ${t.side} ${t.symbol} qty ${t.qty} @ ${t.price}`);
      return [...a, ...b].join('\n') || 'No open positions.';
    }
    const net = rows.reduce((x, r) => x + (r.e?.net ?? 0), 0), real = rows.reduce((x, r) => x + (r.e?.realized ?? 0), 0), fee = rows.reduce((x, r) => x + (r.e?.fees ?? 0), 0);
    const closed = (await trades(500)).filter((t: any) => typeof t.pnl === 'number');
    const day = closed.filter((t: any) => Date.now() - t.ts < 864e5).reduce((x: number, t: any) => x + t.pnl, 0);
    return `Strategies (paper): net ${f(net)}, realized ${f(real)}, fees ${f(fee)}\nBots: realized 24h ${day.toFixed(4)}, all ${closed.reduce((x: number, t: any) => x + t.pnl, 0).toFixed(4)} (each bot's own currency)`;
  }
  if (c === '/orders') {
    const t = await trades(10);
    return t.length ? t.map((x: any) => `${new Date(x.ts).toISOString().slice(5, 16)} ${x.bot} ${x.side} ${x.symbol} ${x.status ?? ''}${typeof x.pnl === 'number' ? ` pnl ${x.pnl}` : ''}`).join('\n') : 'No orders reported yet.';
  }
  if (c === '/bots') { const b = await bots(); return b.map(x => `${x.lastSeen && Date.now() - x.lastSeen < 9e5 ? 'ON ' : 'off'} ${x.name} (${x.mode})`).join('\n'); }
  return 'Apex commands: /positions /orders /pnl /strategies /bots /new\nOr just type a question ("how are my bots doing?", "backtest supertrend on ETH 4h") and Apex AI answers here.\nEverything is paper unless you switched a bot live on your own machine.';
}

export async function POST(req: Request) {
  const want = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!want || req.headers.get('x-telegram-bot-api-secret-token') !== want) return new Response('forbidden', { status: 403 });
  const u = await req.json(); const m = u.message ?? u.edited_message;
  if (!m?.text || String(m.chat?.id) !== String(process.env.TELEGRAM_CHAT_ID)) return Response.json({ ok: true });
  let text: string;
  try {
    if (m.text.trim().toLowerCase() === '/new') { await setJSON('tg:history', []); text = 'Started a fresh conversation.'; }
    else if (m.text.startsWith('/')) text = await reply(m.text);
    else if (!process.env.ANTHROPIC_API_KEY) text = 'Apex AI needs ANTHROPIC_API_KEY in Vercel. Slash commands still work: /help';
    else {
      // Free text from your phone goes to Apex AI (same tools as the dashboard chat). Your verified chat id counts as logged in.
      const hist = await getJSON<{ role: string; content: string }[]>('tg:history', []);
      const next = [...hist, { role: 'user', content: m.text }].slice(-12);
      const r = await runChat(next, true, '\nYou are replying in Telegram on a phone: plain text, no tables, under 150 words.');
      text = r.reply || '(no reply)'; await setJSON('tg:history', [...next, { role: 'assistant', content: text }].slice(-12));
    }
  } catch (e: any) { text = `Error: ${e.message}`; }
  await sendTelegram(text, String(m.chat.id));
  return Response.json({ ok: true });
}
