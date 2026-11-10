import Anthropic from '@anthropic-ai/sdk';
import { record, guard } from './usage';
import { bots, events, trades, setCommand } from './bots';
import { getJSON } from './store';
import { scan, runBacktest, leaderboard } from './signals';
import { STRATEGIES } from './engine/strategies';
import { SOURCES } from './sources';

import { getRules, rulesBlock } from './rules';
const SYSTEM = `You are Apex, the AI operator of Jeremy's trading system. You can see every bot, trade, event, journal entry and
the source library (the YouTube courses and guides the strategies were built from). Use tools for every number; never invent
prices, P&L or backtest results. Be plain and honest: no strategy is guaranteed, past backtests are not future returns, and
"don't trade" is often the right answer. All bots run in paper/test mode unless the owner switched them on his own machine.
You may pause or resume a bot when asked; you can never place trades, move funds or read keys. Keep answers short and concrete.`;

const tools: Anthropic.Tool[] = [
  { name: 'get_bots', description: 'All bots with status, mode, last heartbeat and latest status payload.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_trades', description: 'Recent trades reported by bots (newest first).', input_schema: { type: 'object', properties: { limit: { type: 'number' } } } },
  { name: 'get_events', description: 'Recent bot events: errors, blocked trades, alerts, proposals, control actions.', input_schema: { type: 'object', properties: { limit: { type: 'number' } } } },
  { name: 'get_journal', description: 'Trade journal entries with setup, emotions, plan adherence and R result.', input_schema: { type: 'object', properties: {} } },
  { name: 'scan_signals', description: 'Live signals and 0-100 confluence breakdown for crypto symbols like BTCUSDT.', input_schema: { type: 'object', properties: { symbols: { type: 'array', items: { type: 'string' } }, tf: { type: 'string', enum: ['15m', '1h', '4h', '1d', '1w'] } }, required: ['symbols'] } },
  { name: 'run_backtest', description: `Backtest one strategy on live exchange candles. Strategies: ${STRATEGIES.map(s => s.id).join(', ')}`, input_schema: { type: 'object', properties: { symbol: { type: 'string' }, tf: { type: 'string' }, strategy: { type: 'string' }, risk: { type: 'number' } }, required: ['symbol', 'strategy'] } },
  { name: 'leaderboard', description: 'Backtest every strategy on one symbol and rank by return per drawdown.', input_schema: { type: 'object', properties: { symbol: { type: 'string' }, tf: { type: 'string' } }, required: ['symbol'] } },
  { name: 'search_library', description: 'Search the source library (which course/guide became which component).', input_schema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } },
  { name: 'control_bot', description: 'Queue pause/resume/kill for a bot id. Only when the user explicitly asks.', input_schema: { type: 'object', properties: { id: { type: 'string' }, command: { type: 'string', enum: ['pause', 'resume', 'kill'] } }, required: ['id', 'command'] } },
];

async function call(name: string, a: any, admin: boolean) {
  switch (name) {
    case 'get_bots': return bots();
    case 'get_trades': return trades(a.limit ?? 50);
    case 'get_events': return events(a.limit ?? 50);
    case 'get_journal': return getJSON('journal', []);
    case 'scan_signals': return scan(a.symbols.slice(0, 8), a.tf ?? '1d');
    case 'run_backtest': return runBacktest(a.symbol, a.tf ?? '1d', a.strategy, a.risk ?? 0.01);
    case 'leaderboard': { const l = await leaderboard(a.symbol, a.tf ?? '1d'); return { ...l, rows: l.rows.map(r => ({ id: r.id, totalReturn: r.totalReturn, maxDrawdown: r.maxDrawdown, trades: r.trades, winRate: r.winRate, profitFactor: r.profitFactor, buyHold: r.buyHold })) }; }
    case 'search_library': { const q = String(a.q).toLowerCase(); return SOURCES.filter(s => JSON.stringify(s).toLowerCase().includes(q)); }
    case 'control_bot': if (!admin) return { error: 'login required' }; await setCommand(a.id, a.command); return { ok: true };
  }
  return { error: 'unknown tool' };
}

const MODEL = process.env.APEX_CHAT_MODEL || 'claude-opus-5-5';

/** Apex AI tool loop, shared by the dashboard chat and the Telegram bot. */
export async function runChat(messages: { role: string; content: string }[], admin: boolean, extraSystem = '') {
  await guard();
  const client = new Anthropic();
  const msgs: Anthropic.Beta.BetaMessageParam[] = messages.slice(-20).map(m => ({ role: m.role as 'user' | 'assistant', content: String(m.content) }));
  const used: string[] = [];
  for (let step = 0; step < 6; step++) {
    const r = await client.beta.messages.create({ model: MODEL, max_tokens: 2000, system: SYSTEM + rulesBlock(await getRules()) + extraSystem, tools: tools as any, messages: msgs,
      output_config: { effort: 'medium' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    await record('chat', MODEL, r.usage);
    if (r.stop_reason === 'refusal') return { reply: 'The model declined to answer that.', tools: used };
    if (r.stop_reason !== 'tool_use') return { reply: r.content.filter(b => b.type === 'text').map((b: any) => b.text).join('\n'), tools: used };
    msgs.push({ role: 'assistant', content: r.content as any });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const b of r.content) if (b.type === 'tool_use') {
      used.push(b.name);
      let out: unknown; try { out = await call(b.name, b.input, admin); } catch (e: any) { out = { error: e.message }; }
      results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out).slice(0, 30000) });
    }
    msgs.push({ role: 'user', content: results });
  }
  return { reply: 'Stopped after 6 tool steps. Ask a narrower question.', tools: used };
}
