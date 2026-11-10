// Agent policy gateway and roster (ideas from archive/chat/62-65: agent office videos and the OpenBot co-worker template; our own
// code, nothing installed or copied). Every agent action goes through decide(): deny rules first, then allow rules, and no
// matching allow means no. A broken rule refuses instead of opening up. The audit row is written BEFORE the action runs, and every
// refusal names the rule that blocked it. Secrets never reach the log. Agents have no order, transfer or withdraw tools at all:
// those verbs are refused by a built-in rule that no config can remove.
import { push, list, getJSON, setJSON } from './store';

export type Trigger = 'person' | 'routine' | 'agent';
export type Verb = 'read' | 'analyze' | 'write_file' | 'notify' | 'send' | 'pay' | 'sign' | 'delete' | 'order' | 'withdraw' | 'transfer' | 'shell' | 'browse';
export type Action = { agent: string; verb: Verb; target?: string; trigger: Trigger; detail?: Record<string, unknown> };
export type Rule = { id: string; effect: 'allow' | 'deny'; when: (a: Action) => boolean; why?: string };
export type Verdict = { allow: boolean; needsApproval: boolean; rule: string; why: string };

/** Built-in rules. They run before any configured rule and cannot be removed. */
export const HARD_RULES: Rule[] = [
  { id: 'no-money-tools', effect: 'deny', when: a => ['order', 'withdraw', 'transfer', 'pay'].includes(a.verb), why: 'agents have no order, transfer, pay or withdraw tools' },
  { id: 'no-shell-from-routine', effect: 'deny', when: a => a.verb === 'shell' && a.trigger !== 'person', why: 'scheduled routines and agents may not run shell commands' },
];
/** Verbs that wait for Jeremy's yes even when allowed (sending, signing, deleting; paying is never allowed at all). */
export const NEEDS_APPROVAL: Verb[] = ['send', 'sign', 'delete'];

/** Pure decision. Deny first; default deny; a rule that throws counts as a deny with its id. */
export function decide(a: Action, rules: Rule[]): Verdict {
  const all = [...HARD_RULES, ...rules];
  for (const r of all.filter(r => r.effect === 'deny')) {
    let hit = true; try { hit = r.when(a); } catch { return { allow: false, needsApproval: false, rule: r.id, why: `rule ${r.id} failed to evaluate: refused` }; }
    if (hit) return { allow: false, needsApproval: false, rule: r.id, why: r.why ?? `denied by ${r.id}` };
  }
  for (const r of all.filter(r => r.effect === 'allow')) {
    let hit = false; try { hit = r.when(a); } catch { return { allow: false, needsApproval: false, rule: r.id, why: `rule ${r.id} failed to evaluate: refused` }; }
    if (hit) return { allow: true, needsApproval: NEEDS_APPROVAL.includes(a.verb), rule: r.id, why: r.why ?? `allowed by ${r.id}` };
  }
  return { allow: false, needsApproval: false, rule: 'default-deny', why: 'no rule allows this' };
}

const SECRET = /(sk-[A-Za-z0-9_-]{8,}|xox[abp]-[A-Za-z0-9-]+|AKIA[0-9A-Z]{16}|\b\d{6,}:[A-Za-z0-9_-]{30,}\b|(?:key|token|secret|password|passwd)\s*[:=]\s*\S+)/gi;
/** Replace anything that looks like a secret with its length only. */
export const redact = (s: string) => s.replace(SECRET, m => `[secret, ${m.length} chars]`);
const clean = (d?: Record<string, unknown>) => d ? JSON.parse(redact(JSON.stringify(d))) : undefined;

// ---------------- roster: one role, one project, autonomy that is earned ----------------
export type Approval = 'ask' | 'auto_edits' | 'full';
export type Agent = { id: string; role: string; project: string; purpose: string; tools: Verb[]; jobsPerDay: number; tokenBudget: number; approval: Approval;
  purposeFor?: string; updated: number };
/** New agents start on a short leash: one small job a day, read and analyze only (chat/64), and on "ask" approval, never full
 *  access (chat/70). Raise it as the agent earns trust. Reading and analyzing never ask. */
export const newAgent = (id: string, role: string, project: string, purpose: string): Agent =>
  ({ id, role, project, purpose, tools: ['read', 'analyze'], jobsPerDay: 1, tokenBudget: 20000, approval: 'ask', purposeFor: 'analyze,read', updated: Date.now() });
/** chat/63: the purpose must match the tools the agent has right now. Stale when tools changed after the purpose was written. */
export const purposeStale = (a: Agent) => (a.purposeFor ?? '') !== [...a.tools].sort().join(',');
/** Rules generated from the roster: an agent may use only its own tools, and only within its daily job budget. */
export function rosterRules(roster: Agent[], usedToday: Record<string, number>): Rule[] {
  return [
    { id: 'over-daily-budget', effect: 'deny', when: a => (usedToday[a.agent] ?? 0) >= (roster.find(r => r.id === a.agent)?.jobsPerDay ?? 0), why: 'daily job budget used up' },
    { id: 'own-tools', effect: 'allow', when: a => Boolean(roster.find(r => r.id === a.agent)?.tools.includes(a.verb)), why: 'tool is on the agent card' },
  ];
}
/** Does this allowed action still wait for a yes? Money verbs never get here (always denied). */
export function asks(agent: Agent | undefined, verb: Verb) {
  if (NEEDS_APPROVAL.includes(verb)) return true;
  if (verb === 'read' || verb === 'analyze') return false;
  const lvl = agent?.approval ?? 'ask';
  return lvl === 'ask' || (lvl === 'auto_edits' && verb !== 'write_file');
}

// ---------------- routines switch themselves off after 10 failures in a row (chat/65) ----------------
export type Routine = { id: string; agent: string; everyMin: number; on: boolean; fails: number; lastRun?: number; running?: boolean };
/** chat/70: a run is skipped while the last one is still going, so a slow job can't pile up a queue. Imported routines arrive paused. */
export const shouldRun = (r: Routine, now = Date.now()) => r.on && !r.running && (!r.lastRun || now - r.lastRun >= Math.max(MIN_GAP_MIN, r.everyMin) * 6e4);
export const imported = (r: Routine): Routine => ({ ...r, on: false, running: false, fails: 0 });
export const MAX_FAILS = 10, MIN_GAP_MIN = 15;
export function afterRun(r: Routine, ok: boolean): Routine {
  const fails = ok ? 0 : r.fails + 1;
  return { ...r, fails, on: r.on && fails < MAX_FAILS, everyMin: Math.max(MIN_GAP_MIN, r.everyMin), lastRun: Date.now() };
}

// ---------------- store-backed gateway ----------------
export type AuditRow = { ts: number; agent: string; verb: Verb; target?: string; trigger: Trigger; allow: boolean; needsApproval: boolean; rule: string; why: string; detail?: unknown };
export const roster = () => getJSON<Agent[]>('agents:roster', []);
export const saveRoster = (r: Agent[]) => setJSON('agents:roster', r);
const day = () => new Date().toISOString().slice(0, 10);

/** Check, write the audit row, and only then return the verdict for the caller to act on. */
export async function gate(a: Action, extra: Rule[] = []) {
  const r = await roster(), used = await getJSON<Record<string, number>>(`agents:used:${day()}`, {});
  const d = decide(a, [...rosterRules(r, used), ...extra]);
  const v = d.allow ? { ...d, needsApproval: d.needsApproval || asks(r.find(x => x.id === a.agent), a.verb) } : d;
  const row: AuditRow = { ts: Date.now(), agent: a.agent, verb: a.verb, target: a.target ? redact(a.target) : undefined, trigger: a.trigger, ...v, detail: clean(a.detail) };
  await push('agents:audit', row, 2000);                                        // the record exists before the action happens
  if (v.allow && !v.needsApproval) { used[a.agent] = (used[a.agent] ?? 0) + 1; await setJSON(`agents:used:${day()}`, used); }
  return v;
}
export const audit = (n = 200) => list<AuditRow>('agents:audit', n);
