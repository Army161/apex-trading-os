// One model gateway (archive/chat/37): every Claude call in Apex goes through ask(), which applies the daily spend guard,
// turns on server-side fallbacks, records cost, and logs the call (feature, model, time, cost, stop reason) for review.
// Switching models or providers later is a one-file change. Agents log the reasoning behind their decisions with
// logDecision(), so a person or another agent can check why something happened. purpose() rejects requests that are
// outside what Apex is for (the "math robot on the burrito menu" problem).
import Anthropic from '@anthropic-ai/sdk';
import { record, guard, cost } from './usage';
import { push, list } from './store';

let _client: Anthropic | null = null;
const client = () => (_client ??= new Anthropic());

export type Call = { ts: number; feature: string; model: string; ms: number; usd: number; stop: string | null; inTok: number; outTok: number; error?: string };

/** The only place Apex calls the Messages API. */
export async function ask(feature: string, params: Record<string, any>): Promise<Anthropic.Beta.BetaMessage> {
  await guard();
  const t0 = Date.now();
  try {
    const r = await client().beta.messages.create({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', ...params } as any) as Anthropic.Beta.BetaMessage;
    await record(feature, params.model, r.usage);
    await push('ai_calls', { ts: t0, feature, model: params.model, ms: Date.now() - t0, usd: +cost(params.model, r.usage).toFixed(5), stop: r.stop_reason,
      inTok: r.usage?.input_tokens ?? 0, outTok: r.usage?.output_tokens ?? 0 } as Call, 500);
    return r;
  } catch (e: any) {
    await push('ai_calls', { ts: t0, feature, model: params.model, ms: Date.now() - t0, usd: 0, stop: null, inTok: 0, outTok: 0, error: String(e?.message ?? e).slice(0, 200) } as Call, 500);
    throw e;
  }
}

export const textOf = (r: Anthropic.Beta.BetaMessage) => r.content.filter(b => b.type === 'text').map((b: any) => b.text).join('');
export const recentCalls = (n = 100) => list<Call>('ai_calls', n);

// ---- decision log ----
export type Decision = { ts: number; agent: string; decision: string; why: string; ref?: string };
/** Record what an agent decided and why. Keep `why` to the real reason in a sentence or two. */
export async function logDecision(agent: string, decision: string, why: string, ref?: string) {
  await push('decisions', { ts: Date.now(), agent, decision: decision.slice(0, 200), why: why.slice(0, 1200), ref } as Decision, 1000);
}
export const decisions = (n = 100) => list<Decision>('decisions', n);

// ---- purpose check ----
export const PURPOSE = 'Apex is a personal trading research and risk system: market data, charts, backtests, trading strategies and bots ' +
  '(paper first), risk rules, the trade journal, trading education from the source library, and the tools that build and run Apex itself.';
const ON = /\b(trad\w*|bot|bots|strateg\w*|backtest\w*|stock|stocks|crypto|btc|eth|sol|coin|token|market|price|chart|candle|indicator|rsi|macd|ema|sma|atr|bollinger|risk|stop|target|position|portfolio|pnl|profit|loss|drawdown|journal|signal|entry|exit|long|short|breakout|setup|alpaca|exchange|broker|wallet|futures|options|forex|apex|dashboard|telegram|alert|review|deploy|paper|watchlist|earnings|macro|fred|volume|trend|support|resistance)\b/i;

/** Cheap rule first; only unclear requests go to a small model. Returns {ok, why}. Fails open (ok) if the model errors. */
export async function purpose(request: string, where: string): Promise<{ ok: boolean; why: string; by: 'rule' | 'model' }> {
  if (ON.test(request)) return { ok: true, why: 'mentions trading or Apex', by: 'rule' };
  try {
    const r = await ask('purpose', { model: 'claude-haiku-5-5', max_tokens: 300,
      system: `${PURPOSE}\nDecide if a request sent to Apex's ${where} fits that purpose. Off-purpose means a feature or task with nothing to do with trading or running Apex (for example "make it solve my homework" or "add a recipe planner"). Be generous with anything a trader could reasonably want.`,
      output_config: { format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['on_purpose', 'why'], properties: { on_purpose: { type: 'boolean' }, why: { type: 'string' } } } } },
      messages: [{ role: 'user', content: request.slice(0, 4000) }] });
    const v = JSON.parse(textOf(r));
    if (!v.on_purpose) await logDecision('purpose-check', `rejected a ${where} request`, v.why, request.slice(0, 120));
    return { ok: Boolean(v.on_purpose), why: String(v.why), by: 'model' };
  } catch { return { ok: true, why: 'check unavailable, allowed', by: 'model' }; }
}
