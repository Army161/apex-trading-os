// Second opinion (idea from archive/chat/31, "one model drafts, another looks for weak spots") run as a review chain
// (archive/chat/32, owner -> engineer -> QA, each step reading the one before). A different Claude model than the one
// that built the strategy does the reviewing. Ideas only, no code from either video's repos. The worst verdict wins:
// "block" stops the live flag, "concerns" only warns.
import { getStrategy, evaluate, putStrategy, specKey } from './strategies';
import { guard } from './usage';
import { ask, textOf, logDecision } from './gateway';

// Fable 5.2 by default (archive/chat/33): the review runs rarely and matters most. Different from the builder model (Opus).
export const REVIEW_MODEL = process.env.APEX_REVIEW_MODEL || 'claude-fable-5-2';
const SCHEMA = { type: 'object', additionalProperties: false, required: ['verdict', 'summary', 'issues'], properties: {
  verdict: { type: 'string', enum: ['ok', 'concerns', 'block'] }, summary: { type: 'string' },
  issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'issue', 'fix'],
    properties: { severity: { type: 'string', enum: ['high', 'medium', 'low'] }, issue: { type: 'string' }, fix: { type: 'string' } } } } } };

const RULES = `Be specific and short. Never promise profit. Verdict "block" only for a real flaw that would likely lose money or a rule that cannot work as written; "concerns" for fixable doubts; "ok" when sound for a small, paper-proven size.`;
const STEPS = [
  ['owner', `You are the strategy owner reviewing whether this is worth running at all. Is there a plain reason this edge should exist? Does the risk per trade, drawdown and trade frequency suit a cautious retail trader with 1% risk per trade? Is it just a copy of buy-and-hold with extra steps? ${RULES}`],
  ['engineer', `You are the engineer checking the rules are correct. Look for look-ahead or impossible fills, stops and targets that make no sense for the timeframe, missing exits, fees and slippage, and rules that differ from what the name promises. Read the owner's notes first and do not repeat them. ${RULES}`],
  ['qa', `You are QA trying to break it. Too few trades to trust (under 30 is thin), one trade carrying the result, overfit signs (very high win rate, tiny drawdown), the opposite market regime, gaps, and the Monte Carlo worst case versus stated risk. Read the earlier notes first and add only what they missed. Do not invent unlikely edge cases to have something to say. ${RULES}`],
] as const;
// Goldfish review (archive/chat/40): a fresh reviewer that sees only the written rules, none of the numbers or the other
// notes, and reads them like a stranger who has to run this bot tomorrow. It catches what everyone who knows the plan fills in.
const GOLDFISH = `You have never seen this project. You get only a trading strategy's written rules and must run it as a bot tomorrow.
List what is missing or ambiguous for running it safely: what happens on a data gap, exchange outage or halted market; can it place a
second order while one is open or pending; how it is switched off and what happens to an open position then; any rule a beginner would
read two ways; anything that only works with information not in the rules. ${RULES}`;

const RANK = { ok: 0, concerns: 1, block: 2 } as const;
type Verdict = keyof typeof RANK;
type Note = { step: string; verdict: Verdict; summary: string; issues: { severity: 'high' | 'medium' | 'low'; issue: string; fix: string }[] };

/** "Stop overthinking" (archive/chat/36): only serious issues block. A block with no high-severity issue becomes a concern. */
export function finalVerdict(notes: Note[]): Verdict {
  return notes.reduce<Verdict>((a, n) => {
    const v: Verdict = n.verdict === 'block' && !n.issues.some(i => i.severity === 'high') ? 'concerns' : n.verdict;
    return RANK[v] > RANK[a] ? v : a;
  }, 'ok');
}
/** Sort findings into what must be fixed, what is worth a look, and what can be ignored. */
export function triage(issues: Note['issues']) {
  return { serious: issues.filter(i => i.severity === 'high'), optional: issues.filter(i => i.severity === 'medium'), ignore: issues.filter(i => i.severity === 'low') };
}

export async function secondOpinion(id: string) {
  await guard();
  const s = await getStrategy(id); if (!s) throw new Error('strategy not found');
  const e = await evaluate(s, 1500);
  const h = e.history, payload = { spec: s.spec, metrics: h.metrics, monteCarlo: h.monteCarlo, lastTrades: h.trades.slice(-15), paper: e.paper ? { net: e.paper.net, closed: e.paper.closed } : null };
  const notes: Note[] = [];
  const fresh = ask('review', { model: REVIEW_MODEL, max_tokens: 2000, system: GOLDFISH, output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `Strategy rules:\n${JSON.stringify(s.spec)}` }] });
  for (const [step, system] of STEPS) {
    const r = await ask('review', { model: REVIEW_MODEL, max_tokens: 2500, system, output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } } as any,
      messages: [{ role: 'user', content: `Strategy and backtest:\n${JSON.stringify(payload)}\n\nEarlier review notes:\n${notes.length ? JSON.stringify(notes) : 'none, you are first'}` }],
    });
    if (r.stop_reason === 'refusal') throw new Error(`the ${step} reviewer declined`);
    const v = JSON.parse(textOf(r));
    notes.push({ step, verdict: v.verdict, summary: v.summary, issues: (v.issues ?? []).map((x: any) => ({ ...x, issue: `[${step}] ${x.issue}` })) });
  }
  const g = await fresh;
  if (g.stop_reason !== 'refusal') { const v = JSON.parse(textOf(g)); notes.push({ step: 'goldfish', verdict: v.verdict, summary: v.summary, issues: (v.issues ?? []).map((x: any) => ({ ...x, issue: `[goldfish] ${x.issue}` })) }); }
  const worst = finalVerdict(notes);
  s.review = { ts: Date.now(), model: REVIEW_MODEL, specKey: specKey(s.spec), verdict: worst,
    summary: notes.map(n => `${n.step === 'qa' ? 'QA' : n.step[0].toUpperCase() + n.step.slice(1)} (${n.verdict}): ${n.summary}`).join('\n'), issues: notes.flatMap(n => n.issues) };
  await putStrategy(s);
  await logDecision('review-chain', `${s.spec.name}: ${worst}`, s.review.summary, id);
  return { ...s.review, triage: triage(s.review.issues as Note["issues"]) };
}
