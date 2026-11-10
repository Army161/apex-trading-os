// Agent team for new strategies (ideas from archive/chat/38, chat/40 and chat/41; no code from those projects).
// A lead that only assigns work, then: intake (purpose check and risk level), writer (the strategy builder), a deterministic
// gate (validation and a backtest with enough trades), and a read-only checker (the review chain plus the goldfish reviewer)
// that sends serious fixes straight back to the writer, at most twice. The result is a saved paper draft: deploying it,
// and anything live, stays Jeremy's call. One step runs per call so no request hits the serverless time limit.
import { createJob, advance, getJob } from './jobs';
import { buildSpec } from './builder';
import { purpose, logDecision } from './gateway';
import { saveStrategy } from './strategies';
import { secondOpinion } from './review';
import { validate } from './engine/spec';

const MAX_ROUNDS = 2, MIN_TRADES = 10;
const HIGH = /\b(live|real money|leverage|margin|futures|short|all[- ]in|martingale)\b/i;

export async function startTeam(idea: string) {
  const j = await createJob(`Strategy: ${idea}`, 'team', { idea }, HIGH.test(idea) ? 'high' : 'medium');
  return j;
}

/** Run the job's next step. Returns the updated job. */
export async function teamStep(id: string) {
  const j = await getJob(id); if (!j) throw new Error('job not found');
  if (j.stage === 'done' || j.stage === 'failed' || j.stage === 'needs_you') return j;
  const t0 = Date.now(), fixes = j.notes.filter(n => n.by === 'checker' || n.by === 'gate' || n.by === 'you').slice(-3).map(n => n.text).join('\n');
  const spec = (j.outputs.find(o => o.kind === 'spec')?.data ?? null) as any;
  try {
    if (j.step === 'intake') {
      await advance(id, { stage: 'working', agent: 'intake' });
      const p = await purpose(j.input.idea, 'strategy team');
      if (!p.ok) return advance(id, { stage: 'failed', by: 'intake', note: `Rejected: not a trading strategy (${p.why}).`, spentMs: Date.now() - t0 });
      return advance(id, { step: 'write', agent: 'writer', by: 'intake', note: `Accepted. Risk ${j.risk}${j.risk === 'high' ? ' (mentions live money, leverage or shorts: extra care, still paper only)' : ''}.`, spentMs: Date.now() - t0 });
    }
    if (j.step === 'write') {
      await advance(id, { stage: 'working', agent: 'writer' });
      const prompt = spec ? `Fix these review findings and keep everything else:\n${fixes}` : j.input.idea;
      const r = await buildSpec(prompt, spec ?? undefined);
      if (!r.spec || r.errors.length) return advance(id, { stage: 'needs_you', by: 'writer', note: `The builder could not produce valid rules: ${r.errors.join('; ')}. Reword the idea?`, spentMs: Date.now() - t0 });
      await advance(id, { output: { kind: 'spec', label: 'Strategy rules', data: r.spec } });
      await advance(id, { output: { kind: 'backtest', label: 'Backtest preview', data: r.preview } });
      return advance(id, { step: 'gate', agent: 'gate', by: 'writer', note: spec ? `Revised the rules (round ${j.round}).` : 'Wrote the first version.', spentMs: Date.now() - t0 });
    }
    if (j.step === 'gate') {
      const preview = j.outputs.find(o => o.kind === 'backtest')?.data as any, problems = [...validate(spec)];
      if (!preview || preview.error) problems.push(`backtest failed: ${preview?.error ?? 'no result'}`);
      else if ((preview.trades ?? 0) < MIN_TRADES) problems.push(`only ${preview.trades ?? 0} trades in the backtest (need ${MIN_TRADES} to judge it)`);
      if (problems.length) {
        if (j.round >= MAX_ROUNDS) return advance(id, { stage: 'needs_you', by: 'gate', note: `Still failing the gate after ${MAX_ROUNDS} fixes: ${problems.join('; ')}.` });
        return advance(id, { step: 'write', agent: 'writer', round: j.round + 1, by: 'gate', note: `Gate failed: ${problems.join('; ')}.` });
      }
      return advance(id, { step: 'check', agent: 'checker', by: 'gate', note: 'Gate passed: rules valid, backtest has enough trades.' });
    }
    if (j.step === 'check') {
      await advance(id, { stage: 'working', agent: 'checker' });
      const saved = await saveStrategy(spec, 'ai', j.input.idea, j.outputs.find(o => o.kind === 'strategy')?.ref);
      await advance(id, { output: { kind: 'strategy', label: 'Saved paper draft', ref: saved.id } });
      const rv: any = await secondOpinion(saved.id);
      await advance(id, { output: { kind: 'review', label: 'Review', data: { verdict: rv.verdict, summary: rv.summary, serious: rv.triage.serious, optional: rv.triage.optional } } });
      const serious = rv.triage.serious as { issue: string; fix: string }[];
      if (serious.length && j.round < MAX_ROUNDS) {
        // The checker never edits: it sends its fixes straight back to the writer.
        return advance(id, { step: 'write', agent: 'writer', round: j.round + 1, by: 'checker', spentMs: Date.now() - t0, note: serious.map(s => `${s.issue} -> ${s.fix}`).join('\n') });
      }
      await logDecision('team-lead', `${spec.name}: ${serious.length ? 'needs you' : 'done'}`, rv.summary, saved.id);
      if (serious.length) return advance(id, { stage: 'needs_you', by: 'checker', spentMs: Date.now() - t0, note: `Serious issues remain after ${MAX_ROUNDS} fixes. Saved as a draft for you to judge.` });
      return advance(id, { stage: 'done', step: 'done', by: 'lead', spentMs: Date.now() - t0, note: `Saved "${spec.name}" as a paper draft (review: ${rv.verdict}). Deploying it is your call.` });
    }
    return j;
  } catch (e: any) {
    return advance(id, { stage: 'needs_you', by: j.agent, note: `Stopped on an error: ${e.message}`, spentMs: Date.now() - t0 });
  }
}
