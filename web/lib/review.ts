// Second opinion (idea from archive/chat/31, "one model drafts, another looks for weak spots") run as a review chain
// (archive/chat/32, owner -> engineer -> QA, each step reading the one before). A different Claude model than the one
// that built the strategy does the reviewing. Ideas only, no code from either video's repos. The worst verdict wins:
// "block" stops the live flag, "concerns" only warns.
import Anthropic from '@anthropic-ai/sdk';
import { getStrategy, evaluate, putStrategy, specKey } from './strategies';
import { record, guard } from './usage';

export const REVIEW_MODEL = process.env.APEX_REVIEW_MODEL || 'claude-sonnet-5-5';
const SCHEMA = { type: 'object', additionalProperties: false, required: ['verdict', 'summary', 'issues'], properties: {
  verdict: { type: 'string', enum: ['ok', 'concerns', 'block'] }, summary: { type: 'string' },
  issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'issue', 'fix'],
    properties: { severity: { type: 'string', enum: ['high', 'medium', 'low'] }, issue: { type: 'string' }, fix: { type: 'string' } } } } } };

const RULES = `Be specific and short. Never promise profit. Verdict "block" only for a real flaw that would likely lose money or a rule that cannot work as written; "concerns" for fixable doubts; "ok" when sound for a small, paper-proven size.`;
const STEPS = [
  ['owner', `You are the strategy owner reviewing whether this is worth running at all. Is there a plain reason this edge should exist? Does the risk per trade, drawdown and trade frequency suit a cautious retail trader with 1% risk per trade? Is it just a copy of buy-and-hold with extra steps? ${RULES}`],
  ['engineer', `You are the engineer checking the rules are correct. Look for look-ahead or impossible fills, stops and targets that make no sense for the timeframe, missing exits, fees and slippage, and rules that differ from what the name promises. Read the owner's notes first and do not repeat them. ${RULES}`],
  ['qa', `You are QA trying to break it. Too few trades to trust (under 30 is thin), one trade carrying the result, overfit signs (very high win rate, tiny drawdown), the opposite market regime, gaps, and the Monte Carlo worst case versus stated risk. Read the earlier notes first and add only what they missed. ${RULES}`],
] as const;
const RANK = { ok: 0, concerns: 1, block: 2 } as const;

export async function secondOpinion(id: string) {
  await guard();
  const s = await getStrategy(id); if (!s) throw new Error('strategy not found');
  const e = await evaluate(s, 1500);
  const h = e.history, payload = { spec: s.spec, metrics: h.metrics, monteCarlo: h.monteCarlo, lastTrades: h.trades.slice(-15), paper: e.paper ? { net: e.paper.net, closed: e.paper.closed } : null };
  const client = new Anthropic(); const notes: { step: string; verdict: 'ok' | 'concerns' | 'block'; summary: string; issues: any[] }[] = [];
  for (const [step, system] of STEPS) {
    const r = await client.beta.messages.create({ model: REVIEW_MODEL, max_tokens: 2500, system, output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } } as any,
      messages: [{ role: 'user', content: `Strategy and backtest:\n${JSON.stringify(payload)}\n\nEarlier review notes:\n${notes.length ? JSON.stringify(notes) : 'none, you are first'}` }],
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } as any);
    await record('review', REVIEW_MODEL, r.usage);
    if (r.stop_reason === 'refusal') throw new Error(`the ${step} reviewer declined`);
    const v = JSON.parse(r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''));
    notes.push({ step, verdict: v.verdict, summary: v.summary, issues: (v.issues ?? []).map((x: any) => ({ ...x, issue: `[${step}] ${x.issue}` })) });
  }
  const worst = notes.reduce((a, n) => (RANK[n.verdict] > RANK[a] ? n.verdict : a), 'ok' as 'ok' | 'concerns' | 'block');
  s.review = { ts: Date.now(), model: REVIEW_MODEL, specKey: specKey(s.spec), verdict: worst,
    summary: notes.map(n => `${n.step === 'qa' ? 'QA' : n.step[0].toUpperCase() + n.step.slice(1)} (${n.verdict}): ${n.summary}`).join('\n'), issues: notes.flatMap(n => n.issues) };
  await putStrategy(s);
  return s.review;
}
