// How an agent job runs (docs/design/06 s3). One path for every agent:
//   job card -> policy gate (rule and daily budget, audit row first) -> AI budget -> run -> check the output against the job's
//   schema -> gate each thing it wants to put out -> outbox file, notification or halt -> done, needs you, or failed.
// Output that fails its schema twice fails the job, and nothing unchecked is stored. Going over a budget parks the job with one
// question. The only thing here that is not a read or a note is the halt, and there is no way here to undo one.
import { gate, redact, type Trigger } from './policy';
import { guard } from './usage';
import { advance, createJob, getJob, type Ask, type Job } from './jobs';
import { ensureRoster } from './roster';
import { shouldPull, type Reading } from './andon';
import { getJSON, list, push, setJSON } from './store';

export type OutFile = { id: string; ts: number; agent: string; job: string; kind: 'report' | 'note' | 'proposal'; title: string; text: string };
export type Out = { verb: 'write_file'; kind: OutFile['kind']; title: string; text: string } | { verb: 'notify'; text: string } | { verb: 'halt'; reason: string };
/** What the runner needs from outside. Handed in, so a test can watch every halt and message. */
export type AgentIo = { halt: (by: string, reason: string) => Promise<unknown>; notify: (text: string) => Promise<unknown>; now: () => number };
export type Spec<T> = { agent: string; kind: string; title: string; input: unknown; trigger?: Trigger;
  /** The model step, when the job has one. `problem` is what was wrong with the last answer. */
  model?: (input: unknown, problem: string | null) => Promise<{ raw: unknown; tokens: number }>;
  /** The code step, when it has no model. */
  code?: (input: unknown) => unknown | Promise<unknown>;
  /** The job's schema. Throws with what is wrong. */
  validate: (raw: unknown) => T;
  out: (value: T) => Out[] };

const day = (now: number) => new Date(now).toISOString().slice(0, 10);
const PARK = ['Run it again now', 'Drop it'];
export const outbox = (n = 100) => list<OutFile>('agents:outbox', n);
/** Job kinds that can be run again from a stored input (the Inbox's "Run it again now"). */
const KINDS = new Map<string, (input: unknown) => Spec<any>>();
export const register = (kind: string, make: (input: unknown) => Spec<any>) => { KINDS.set(kind, make); };

export async function runJob<T>(spec: Spec<T>, io: AgentIo, again?: Job): Promise<Job> {
  const roster = await ensureRoster(), me = roster.find(a => a.id === spec.agent), trigger = spec.trigger ?? 'routine', t0 = io.now();
  const j = again ?? await createJob(spec.title, spec.kind, spec.input, 'low'), by = spec.agent;
  const end = (stage: 'done' | 'failed' | 'needs_you', note: string, ask?: Ask, quiet = false) => advance(j.id, { stage, agent: by, by, note, ask, quiet, spentMs: io.now() - t0 });
  const park = (why: string) => end('needs_you', why, { question: `${why} What should happen to this job?`, options: PARK });
  await advance(j.id, { stage: 'working', step: 'run', agent: by });
  try {
    const v = await gate({ agent: by, verb: 'analyze', target: spec.kind, trigger });
    if (!v.allow && !me?.jobsPerDay) return end('failed', me ? `${by} has no job budget on this dashboard, so it runs nothing here.` : `"${by}" is not on the roster, so it was refused.`);
    if (!v.allow) return v.rule === 'over-daily-budget' ? park(`${by} has used its ${me?.jobsPerDay ?? 0} jobs for today.`) : end('failed', `Refused by the rule "${v.rule}": ${v.why}.`);
    let value: T;
    if (spec.model) {
      try { await guard(); } catch (e) { return park((e as Error).message); }
      const k = `agents:tokens:${day(io.now())}`; let problem: string | null = null, got: { v: T } | null = null;
      for (let attempt = 0; attempt < 2 && !got; attempt++) {
        const used = await getJSON<Record<string, number>>(k, {});
        if ((used[by] ?? 0) >= (me?.tokenBudget ?? 0)) return park(`${by} has used its token budget for today.`);
        const r = await spec.model(spec.input, problem); used[by] = (used[by] ?? 0) + Math.max(0, r.tokens || 0); await setJSON(k, used);
        try { got = { v: spec.validate(r.raw) }; } catch (e) { problem = (e as Error).message.slice(0, 300); }
      }
      if (!got) return end('failed', `The answer did not match the job's schema twice, so nothing was stored. Last problem: ${problem}`);
      value = got.v;
    } else {
      try { value = spec.validate(await spec.code?.(spec.input)); } catch (e) { return end('failed', `The result did not match the job's schema, so nothing was stored: ${(e as Error).message.slice(0, 300)}`); }
    }
    const did: string[] = [];
    for (const o of spec.out(value)) {
      const g = await gate({ agent: by, verb: o.verb, target: o.verb === 'write_file' ? `outbox/${o.kind}` : o.verb, trigger, step: true });
      if (!g.allow) return end('failed', `Refused by the rule "${g.rule}": ${g.why}. Done before that: ${did.join(', ') || 'nothing'}.`);
      if (g.needsApproval) return park(`${by} wants to ${o.verb.replace('_', ' a ')} and that waits for you.`);
      if (o.verb === 'write_file') { await push('agents:outbox', { id: `${j.id}-${did.length}`, ts: io.now(), agent: by, job: j.id, kind: o.kind, title: redact(o.title).slice(0, 160), text: redact(o.text).slice(0, 20_000) } satisfies OutFile, 500); did.push(`wrote a ${o.kind}`); }
      else if (o.verb === 'notify') { await io.notify(redact(o.text).slice(0, 3500)); did.push('sent a notification'); }
      else { await io.halt(by, o.reason.slice(0, 500)); did.push(`halted (${o.reason.slice(0, 200)})`); }
    }
    return end('done', did.length ? `Finished: ${did.join(', ')}.` : 'Finished. Nothing needed to be put out.', undefined, !did.length);   // a check that found nothing does not ping
  } catch (e) { return end('failed', `It stopped on an error: ${redact((e as Error).message).slice(0, 300)}`); }
}

/** Jeremy's answer to a parked agent job. Dropping needs nothing else. Running again goes through every check again. */
export async function settle(id: string, option: string, io: AgentIo): Promise<Job> {
  const j = await getJob(id); if (!j) throw new Error('job not found');
  if (j.stage !== 'needs_you' || !j.ask) throw new Error('this job is not waiting on a question');
  if (!j.ask.options.includes(option)) throw new Error(`the answer must be one of: ${j.ask.options.join(', ')}`);
  if (option === 'Drop it') return advance(id, { stage: 'failed', by: 'you', note: 'Dropped by you.' });
  const make = KINDS.get(j.kind); if (!make) throw new Error('this kind of job cannot be run again from here');
  await advance(id, { stage: 'queued', by: 'you', note: `Your answer: ${option}` });
  return runJob(make(j.input), io, (await getJob(id))!);
}

// ---- the risk officer ----
const KIND = ['drawdown', 'daily_loss', 'errors'];
const words = (r: Reading) => r.kind === 'errors' ? `errors ${r.value} against a limit of ${r.limit}` : `${r.kind.replace('_', ' ')} ${(r.value * 100).toFixed(1)}% past its line of ${(r.limit * 100).toFixed(1)}%`;
function readings(raw: unknown): Reading[] {
  if (!Array.isArray(raw)) throw new Error('readings must be a list');
  return raw.map((r, i) => { if (!r || !KIND.includes(r.kind) || !Number.isFinite(r.value) || !Number.isFinite(r.limit)) throw new Error(`reading ${i + 1} is not a known kind with two finite numbers`); return { kind: r.kind, value: r.value, limit: r.limit }; });
}
/** The officer's whole decision: a fixed rule (andon.shouldPull) over readings it is given. No model. It halts or it does nothing. */
export const riskSpec = (input: unknown, trigger: Trigger = 'routine'): Spec<Reading[]> => ({ agent: 'risk-officer', kind: 'risk-check', title: 'Risk check after a run', input, trigger, code: x => x, validate: readings,
  out: rs => { const hit = rs.filter(shouldPull); return hit.length ? [{ verb: 'halt', reason: hit.map(words).join('; ') }] : []; } });
register('risk-check', input => riskSpec(input, 'person'));
/** Drawdown from the peak and today's loss, each against the limit in force. Both are negative when money is down. */
export function bookReadings(b: { equity: number; peak: number; dayPnl: number; dayStartEquity: number }, limits: { maxDrawdownPct: number; dailyLossPct: number }): Reading[] {
  return [{ kind: 'drawdown', value: b.peak > 0 ? b.equity / b.peak - 1 : 0, limit: -limits.maxDrawdownPct }, { kind: 'daily_loss', value: b.dayStartEquity > 0 ? b.dayPnl / b.dayStartEquity : 0, limit: -limits.dailyLossPct }];
}
