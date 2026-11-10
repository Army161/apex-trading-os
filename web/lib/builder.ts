// Strategy builder core, shared by /api/builder and the agent team. DIA-style AI strategy builder (archive/chat/24): plain English in, a validated Spec out. Uses structured outputs so the
// reply always matches SPEC_SCHEMA, then the engine's own validator; one repair round if the rules don't check out.
import Anthropic from '@anthropic-ai/sdk';
import { SPEC_SCHEMA, Spec, validate, FIELDS, PATTERNS, EXAMPLE } from './engine/spec';
import { backtest } from './engine/core';
import { compile } from './engine/spec';
import { candles } from './market';
import { record, guard } from './usage';
import { ask } from './gateway';

const SYSTEM = `You turn a trader's plain-English strategy into Apex's JSON strategy format. Rules of the format:
- Conditions compare two operands with crosses_above, crosses_below, >, <, >=, <=. Operands: close, open, high, low, volume;
  an indicator id (its main value) or id.field; pattern:<name>; or a number written as a string ("70").
- Indicator fields: ${Object.entries(FIELDS).map(([k, v]) => `${k}: ${v.join('/')}`).join('; ')}. supertrend.dir is +1 or -1.
  For "length" fields: supertrend = ATR length, macd = fast (length2 slow, length3 signal), bbands mult = std devs. Unused numbers = 0.
- Patterns (use op ">" with right "0"): ${PATTERNS.join(', ')}.
- long_entry/short_entry: every condition must hold on the closed candle. exit_long/exit_short: any one closes the trade.
- Decisions happen on candle close and fill at the next open. Stop as a fraction (0.1 = 10%) or ATR multiple; a stop is required.
  If the user gives none, use 2x ATR and say so in description. Target as fraction, R multiple, or none.
- Symbols are exchange spot pairs like BTCUSDT. Only these timeframes exist: 15m, 1h, 4h, 1d, 1w.
- Anything the format cannot express (options strikes/expiries/greeks, multi-leg spreads, time-of-day rules, order books,
  news, other assets as filters) goes in "unsupported" in plain words, and you map the rest as closely as honest.
  Options strategies trade the underlying direction here; say so.
- Never promise returns. description is 1-3 plain sentences a trader can check against their idea.
If a current strategy is given, apply the user's change to it and keep everything else.`;

export async function buildSpec(prompt: string, current?: unknown, history?: { role: 'user' | 'assistant'; content: string }[]) {
  const model = process.env.APEX_BUILDER_MODEL || 'claude-opus-5-5';
  const msgs: Anthropic.Beta.BetaMessageParam[] = [];
  for (const h of (history ?? []).slice(-6)) msgs.push({ role: h.role, content: String(h.content) });
  msgs.push({ role: 'user', content: current ? `Current strategy:\n${JSON.stringify(current)}\n\nChange requested: ${prompt}` : String(prompt) });
  let spec: Spec | null = null, errors: string[] = [], fallback = false;
  for (let round = 0; round < 2; round++) {
    const r = await ask('builder', {
      model, max_tokens: 8000, system: SYSTEM, messages: msgs,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SPEC_SCHEMA as any } },
    });
    if ((r.usage as any)?.iterations?.some((x: any) => x.type === 'fallback_message')) fallback = true;
    if (r.stop_reason === 'refusal') throw new Error('The model declined this request.');
    if (r.stop_reason === 'max_tokens') throw new Error('Reply was cut off. Try a shorter description.');
    const text = r.content.filter(b => b.type === 'text').map((b: any) => b.text).join('');
    try { spec = JSON.parse(text); } catch { throw new Error('Could not read the model reply.'); }
    errors = validate(spec!);
    if (!errors.length) break;
    msgs.push({ role: 'assistant', content: text }, { role: 'user', content: `That strategy fails validation: ${errors.join('; ')}. Fix it.` });
  }
  // Quick honesty check: backtest on recent history so the user sees results before saving.
  let preview: any = null;
  if (spec && !errors.length) {
    try { const { bars, source } = await candles(spec.symbol, spec.tf, 1000); const r = backtest(bars, compile(spec)(bars)); preview = { source, ...r.metrics }; }
    catch (e: any) { preview = { error: e.message }; }
  }
  return { spec, errors, preview, fallback };
}
