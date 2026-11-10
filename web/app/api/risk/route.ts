// Risk Mitigator chat (archive/chat/27): talks a trade idea through like a cautious coworker. Checks every idea against the
// minimum reward:risk in code (APEX_MIN_RR, default 3:1), holds shorts to a higher bar, always states the downside,
// and can summarise the conversation into the journal.
import Anthropic from '@anthropic-ai/sdk';
import { checkTrade, MIN_RR, MODEL } from '@/lib/assistants';
import { candles } from '@/lib/market';
import { rsi, sma, atr } from '@/lib/engine/core';
import { push, list } from '@/lib/store';
import { record, guard } from '@/lib/usage';
export const maxDuration = 120;

const SYSTEM = `You are Risk Mitigator, a conservative, contrarian trading coworker. Your job is to protect capital, not to cheer.
Rules: 1) Before agreeing to any trade with numbers, call check_trade; the minimum is ${MIN_RR}:1 reward to risk (higher for shorts)
and you never round a failing ratio up. 2) Always state the downside plainly: what loses money, how much at the proposed size,
and what would prove the idea wrong. 3) Shorts: say clearly they carry more risk (unlimited loss, squeezes, borrow cost) and test
whether it is a real setup or overtrading. 4) Push back on chasing, revenge trades and trades with no stop. 5) Use get_market for
crypto numbers; for stocks say you have no live quote unless the user gives one. Never invent prices. 6) Be short and conversational.
End with one question that helps the trader decide, or "No trade is a fine answer" when it fits.`;

const tools: Anthropic.Tool[] = [
  { name: 'check_trade', description: `Computes reward:risk, % risk, and 1%-risk position size. Passes only at >= ${MIN_RR}:1 (shorts need more).`, strict: true,
    input_schema: { type: 'object', additionalProperties: false, required: ['side', 'entry', 'stop', 'target'],
      properties: { side: { type: 'string', enum: ['long', 'short'] }, entry: { type: 'number' }, stop: { type: 'number' }, target: { type: 'number' } } } },
  { name: 'get_market', description: 'Latest daily close, 1-day and 7-day change, RSI14, distance from the 20 and 200-day averages and ATR% for a crypto pair like BTCUSDT.', strict: true,
    input_schema: { type: 'object', additionalProperties: false, required: ['symbol'], properties: { symbol: { type: 'string' } } } },
];

async function market(sym: string) {
  const b = (await candles(sym.toUpperCase(), '1d', 260)).bars, c = b.map(x => x.c), i = c.length - 1;
  return { symbol: sym, close: c[i], chg1d: c[i] / c[i - 1] - 1, chg7d: c[i] / c[i - 7] - 1, rsi14: rsi(c, 14)[i], vsMA20: c[i] / sma(c, 20)[i] - 1, vsMA200: c[i] / sma(c, 200)[i] - 1, atrPct: atr(b, 14)[i] / c[i] };
}

export async function GET() { return Response.json({ summaries: await list('risk_chats', 20), minRR: MIN_RR }); }

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ reply: 'Risk Mitigator needs ANTHROPIC_API_KEY in the Vercel environment.' });
  const { messages, summarize } = await req.json();
  try { await guard(); } catch (e: any) { return Response.json({ reply: e.message }); }
  const client = new Anthropic();
  const msgs: Anthropic.Beta.BetaMessageParam[] = (messages ?? []).slice(-24).map((m: any) => ({ role: m.role, content: String(m.content) }));
  if (summarize) {
    msgs.push({ role: 'user', content: 'Summarise this conversation for my trade journal in under 120 words: the idea, the numbers and ratio, the downside you raised, and what I decided or still need to decide.' });
    const r = await client.beta.messages.create({ model: MODEL, max_tokens: 1500, system: SYSTEM, messages: msgs, output_config: { effort: 'low' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    await record('risk', MODEL, r.usage);
    const text = r.content.filter(b => b.type === 'text').map((b: any) => b.text).join('');
    await push('risk_chats', { ts: Date.now(), summary: text }, 200);
    return Response.json({ reply: text, saved: true });
  }
  const used: string[] = [];
  for (let step = 0; step < 6; step++) {
    const r = await client.beta.messages.create({ model: MODEL, max_tokens: 2000, system: SYSTEM, tools, messages: msgs, output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    await record('risk', MODEL, r.usage);
    if (r.stop_reason === 'refusal') return Response.json({ reply: 'The model declined to answer that.' });
    if (r.stop_reason !== 'tool_use') return Response.json({ reply: r.content.filter(b => b.type === 'text').map((b: any) => b.text).join('\n'), tools: used });
    msgs.push({ role: 'assistant', content: r.content as any });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const b of r.content) if (b.type === 'tool_use') {
      used.push(b.name); let out: unknown;
      try { out = b.name === 'check_trade' ? checkTrade(b.input as any) : await market((b.input as any).symbol); } catch (e: any) { out = { error: e.message }; }
      results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) });
    }
    msgs.push({ role: 'user', content: results });
  }
  return Response.json({ reply: 'Stopped after 6 steps. Try a narrower question.', tools: used });
}
