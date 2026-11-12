// Job board (archive/chat/38 and chat/41): every multi-step agent job is a card that moves queued -> working -> done, or to
// "needs you" when it is blocked on Jeremy. This file is the only writer of job state: agents call these functions,
// they never edit a job directly, which keeps the board honest and lets a stopped job resume from its last step.
// Done and needs-you transitions ping Telegram. Each job keeps its notes (who did what, why) and its outputs (the gallery).
import { getJSON, setJSON } from './store';
import { sendTelegram } from './telegram';

export type Stage = 'queued' | 'working' | 'needs_you' | 'done' | 'failed';
export type Output = { kind: 'spec' | 'backtest' | 'review' | 'strategy' | 'text'; label: string; data?: unknown; ref?: string };
export type Job = { id: string; title: string; kind: string; stage: Stage; step: string; agent: string; risk: 'low' | 'medium' | 'high';
  round: number; created: number; updated: number; ms: number; input: any; notes: { ts: number; by: string; text: string }[]; outputs: Output[];
  /** Why a job waits for Jeremy: one question and its options (docs/design/06 s1 rule 5). Cleared when the job moves on. */
  ask?: Ask; snoozedUntil?: number };
export type Ask = { question: string; options: string[] };

const K = 'jobs', MAX = 100;
export const STAGES: Stage[] = ['queued', 'working', 'needs_you', 'done', 'failed'];

const all = () => getJSON<Record<string, Job>>(K, {});
async function save(j: Job) {
  const m = await all(); m[j.id] = j;
  const keep = Object.values(m).sort((a, b) => b.updated - a.updated).slice(0, MAX);
  await setJSON(K, Object.fromEntries(keep.map(x => [x.id, x])));
  return j;
}

export async function listJobs() { return Object.values(await all()).sort((a, b) => b.updated - a.updated); }
export async function getJob(id: string) { return (await all())[id] ?? null; }

export async function createJob(title: string, kind: string, input: any, risk: Job['risk'] = 'medium') {
  const now = Date.now();
  return save({ id: `${kind}-${now.toString(36)}`, title: title.slice(0, 120), kind, stage: 'queued', step: 'intake', agent: 'lead', risk, round: 0,
    created: now, updated: now, ms: 0, input, notes: [{ ts: now, by: 'lead', text: 'Job created' }], outputs: [] });
}

/** Move a job. Pure state change plus a Telegram ping on done / needs you. */
export async function advance(id: string, p: { stage?: Stage; step?: string; agent?: string; note?: string; by?: string; output?: Output; round?: number; risk?: Job['risk']; spentMs?: number; ask?: Ask; quiet?: boolean }) {
  const j = await getJob(id); if (!j) throw new Error('job not found');
  const was = j.stage, now = Date.now();
  if (p.stage) { j.stage = p.stage; if (p.stage !== 'needs_you') { delete j.ask; delete j.snoozedUntil; } }
  if (p.ask) j.ask = { question: p.ask.question.slice(0, 300), options: p.ask.options.slice(0, 4).map(o => o.slice(0, 60)) };
  if (p.step) j.step = p.step;
  if (p.agent) j.agent = p.agent;
  if (p.round !== undefined) j.round = p.round;
  if (p.risk) j.risk = p.risk;
  if (p.spentMs) j.ms += p.spentMs;
  if (p.note) j.notes = [...j.notes, { ts: now, by: p.by ?? j.agent, text: p.note.slice(0, 1500) }].slice(-60);
  if (p.output) j.outputs = [...j.outputs.filter(o => o.label !== p.output!.label), p.output];
  j.updated = now;
  await save(j);
  if (!p.quiet && was !== j.stage && (j.stage === 'done' || j.stage === 'needs_you' || j.stage === 'failed'))
    await sendTelegram(`${j.stage === 'done' ? 'Done' : j.stage === 'failed' ? 'Failed' : 'Needs you'}: ${j.title}${p.note ? `\n${p.note.slice(0, 300)}` : ''}`);
  return j;
}

/** Record Jeremy's answer on a needs-you card and put it back in the queue at the step he chose. */
export async function feedback(id: string, text: string, step?: string) {
  return advance(id, { stage: 'queued', step, by: 'you', note: `Your answer: ${text}` });
}

/** Put a needs-you card away for some hours. It stays needs-you: the Inbox shows it again when the time is up. */
export async function snooze(id: string, hours: number, now = Date.now()) {
  const j = await getJob(id); if (!j) throw new Error('job not found'); if (j.stage !== 'needs_you') throw new Error('only a job that is waiting for you can be snoozed');
  j.snoozedUntil = now + Math.min(168, Math.max(1, Math.round(hours))) * 3600e3; return save(j);
}
