// AI decision layer (archive/chat/46). Rules find the setup first; only then does a model choose from fixed options
// (long, short or wait) given a structured snapshot, with a confidence score and a fake-out risk. The model can only confirm the
// setup's side or wait: it can never flip it or size it. Apex's risk check (checkTrade) still runs after, and every decision is
// logged with its reason. Paper only. Three-way comparison: plain rules vs hand-written filters vs AI-assisted.
import { ask, textOf, logDecision } from './gateway';
import { checkTrade } from './assistants';
import { Bar, Sig, backtest, atr, ema, rsi, adx, sma } from './engine/core';
import { emaRegime } from './engine/trend';

export const DECIDE_MODEL = process.env.APEX_DECIDE_MODEL || 'claude-haiku-5-5';
export type Snapshot = { strategy: string; side: 'long' | 'short'; price: number; stop: number; target: number; rr: number;
  atrPct: number; rsi14: number; adx14: number; ema50DistAtr: number; ema50Slope: 'up' | 'down' | 'flat'; emaRegime: 'bull' | 'bear' | 'none';
  volVsAvg: number; ret5: number; ret20: number; last5: { o: number; h: number; l: number; c: number }[] };
export type AiCall = { action: 'long' | 'short' | 'wait'; confidence: number; fakeoutRisk: number; why: string };

/** Structured snapshot of the market at a setup bar. Only data at or before bar i. */
export function snapshot(b: Bar[], i: number, strategy: string, side: 1 | -1, stop: number, target: number): Snapshot {
  const c = b.map(x => x.c), a = atr(b)[i], e = ema(c, 50), r = emaRegime(b.slice(0, i + 1))[i], vm = sma(b.map(x => x.v), 20)[i];
  const px = c[i], round = (x: number, d = 4) => +x.toFixed(d);
  return { strategy, side: side === 1 ? 'long' : 'short', price: px, stop, target, rr: round(Math.abs(target - px) / Math.max(1e-9, Math.abs(px - stop)), 2),
    atrPct: round(a / px * 100, 2), rsi14: round(rsi(c)[i], 1), adx14: round(adx(b)[i], 1), ema50DistAtr: round((px - e[i]) / a, 2),
    ema50Slope: r.slope === 1 ? 'up' : r.slope === -1 ? 'down' : 'flat', emaRegime: r.regime === 1 ? 'bull' : r.regime === -1 ? 'bear' : 'none',
    volVsAvg: round(b[i].v / (vm || 1), 2), ret5: round((px / c[Math.max(0, i - 5)] - 1) * 100, 2), ret20: round((px / c[Math.max(0, i - 20)] - 1) * 100, 2),
    last5: b.slice(Math.max(0, i - 4), i + 1).map(x => ({ o: x.o, h: x.h, l: x.l, c: x.c })) };
}

const SCHEMA = { type: 'object', additionalProperties: false, required: ['action', 'confidence', 'fakeoutRisk', 'why'], properties: {
  action: { type: 'string', enum: ['long', 'short', 'wait'] }, confidence: { type: 'integer' }, fakeoutRisk: { type: 'integer' }, why: { type: 'string' } } };
const SYSTEM = 'You review one trading setup that a rule already found. Choose exactly one action: the setup side, or "wait". ' +
  'Confidence 0-100 that taking it now is better than waiting. fakeoutRisk 0-100 that this is a false move. One-sentence why from the snapshot only. ' +
  'You cannot change size, stop or target. If the data is unclear, wait.';

/** Ask the model. Any answer other than the setup side becomes "wait" (the model may not flip a setup). */
export async function aiDecide(s: Snapshot, ref?: string): Promise<AiCall> {
  const r = await ask('decide', { model: DECIDE_MODEL, max_tokens: 400, system: SYSTEM, output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: JSON.stringify(s) }] });
  let out: AiCall; try { out = JSON.parse(textOf(r)); } catch { out = { action: 'wait', confidence: 0, fakeoutRisk: 100, why: 'unreadable answer' }; }
  if (out.action !== 'wait' && out.action !== s.side) out = { ...out, action: 'wait', why: `model said ${out.action} on a ${s.side} setup: not allowed, waiting` };
  await logDecision('ai-decide', out.action, `${out.why} (confidence ${out.confidence}, fake-out ${out.fakeoutRisk})`, ref ?? s.strategy);
  return out;
}

/** Gate: take the trade only if the model agreed, confidence >= min, fake-out risk <= max, and the risk check passes. */
export function gate(s: Snapshot, ai: AiCall, o: { minConf?: number; maxFake?: number; equity?: number; enforceRR?: boolean } = {}) {
  if (ai.action === 'wait') return { take: false, why: `AI: wait (${ai.why})` };
  if (ai.confidence < (o.minConf ?? 60)) return { take: false, why: `confidence ${ai.confidence} under ${o.minConf ?? 60}` };
  if (ai.fakeoutRisk > (o.maxFake ?? 50)) return { take: false, why: `fake-out risk ${ai.fakeoutRisk} over ${o.maxFake ?? 50}` };
  const risk = checkTrade({ side: s.side, entry: s.price, stop: s.stop, target: isNaN(s.target) ? s.price + (s.price - s.stop) * 2 : s.target, equity: o.equity });
  if ('problem' in risk) return { take: false, why: `risk check: ${risk.problem}` };
  if (o.enforceRR && !risk.ok) return { take: false, why: `risk check: reward/risk ${risk.rr} under ${risk.required_rr}` };
  return { take: true, why: `AI ${ai.action} ${ai.confidence}/100, fake-out ${ai.fakeoutRisk}; risk check passed` };
}

/** Hand-written filters (the middle option): ADX >= 20, not chop, volume >= average, with the EMA 50 regime or untouched. */
export function ruleFilter(s: Snapshot) {
  const ok = s.adx14 >= 20 && s.volVsAvg >= 1 && s.ema50Slope !== 'flat' && !(s.side === 'long' && s.emaRegime === 'bear') && !(s.side === 'short' && s.emaRegime === 'bull');
  return { take: ok, why: ok ? 'filters passed' : 'filtered out (ADX, volume, flat EMA or against the regime)' };
}

/** Keep only signals a decider approves. */
export async function filterSig(b: Bar[], s: Sig, name: string, decide: (snap: Snapshot, i: number) => Promise<{ take: boolean }> | { take: boolean }, maxCalls = 200) {
  const out: Sig = { ...s, le: [...s.le], se: [...s.se] }; let calls = 0;
  for (let i = 0; i < b.length; i++) {
    const side = s.le[i] ? 1 : s.se[i] ? -1 : 0; if (!side) continue;
    if (calls++ >= maxCalls) { out.le[i] = out.se[i] = false; continue; }
    const snap = snapshot(b, i, name, side as 1 | -1, isNaN(s.stop[i]) ? b[i].c - 2 * side * atr(b)[i] : s.stop[i], s.target[i]);
    const d = await decide(snap, i); if (!d.take) { out.le[i] = false; out.se[i] = false; }
  }
  return out;
}

/** Three-way comparison on the same bars and costs. The AI arm costs one model call per setup (capped by maxCalls);
 *  pass `ai: false` to skip it (no API key, or to save money). */
export async function compareModes(b: Bar[], build: (b: Bar[]) => Sig, name: string, o: { ai?: boolean; maxCalls?: number; fee?: number } = {}) {
  const base = build(b), plain = backtest(b, base, { fee: o.fee }).metrics;
  const filt = backtest(b, await filterSig(b, base, name, s => ruleFilter(s)), { fee: o.fee }).metrics;
  let ai: typeof plain | null = null;
  if (o.ai !== false && process.env.ANTHROPIC_API_KEY) ai = backtest(b, await filterSig(b, base, name, async s => gate(s, await aiDecide(s)), o.maxCalls ?? 60), { fee: o.fee }).metrics;
  return { plain, filters: filt, ai, note: ai ? 'AI arm used at most ' + (o.maxCalls ?? 60) + ' model calls' : 'AI arm skipped (no key or turned off)' };
}
