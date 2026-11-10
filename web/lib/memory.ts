// Apex memory that changes as Jeremy changes (archive/chat/35; Apex's own version, no Honcho code since Honcho is AGPL).
// Facts have a topic key, a date and a source. A newer fact on the same key replaces the older one, which is kept in
// history with the date it was replaced. Everything lives in Apex's own store; nothing goes to a memory service.
import Anthropic from '@anthropic-ai/sdk';
import { getJSON, setJSON, push, list } from './store';
import { record, guard } from './usage';

export type Fact = { id: string; key: string; text: string; source: string; ts: number; replacedAt?: number; replacedBy?: string; retiredAt?: number };
export type Op = { op: 'add' | 'replace' | 'retire'; key: string; text?: string; why?: string };
const K = 'memory_facts';
export const DREAM_MODEL = process.env.APEX_DREAM_MODEL || 'claude-haiku-5-5';

const slug = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'note';
/** Drops anything that looks like a secret: API keys, private keys, long hex, seed-phrase-like word runs. */
export function looksSecret(t: string) {
  return /\b(sk-[a-z0-9_-]{10,}|xox[abp]-|AKIA[0-9A-Z]{12,}|0x[0-9a-fA-F]{64})\b/.test(t) || /-----BEGIN [A-Z ]*PRIVATE KEY/.test(t)
    || /\b(seed|mnemonic|recovery)\b.*\b([a-z]{3,8}\s+){11,}[a-z]{3,8}\b/i.test(t);
}
export const allFacts = () => getJSON<Fact[]>(K, []);
export const current = (fs: Fact[]) => fs.filter(f => !f.replacedAt && !f.retiredAt).sort((a, b) => b.ts - a.ts);
export const history = (fs: Fact[], key: string) => fs.filter(f => f.key === slug(key)).sort((a, b) => b.ts - a.ts);

/** Pure: applies one fact change to a list. Same key replaces the current fact; retire ends it with no replacement. */
export function applyOp(fs: Fact[], o: Op, source: string, now = Date.now()): Fact[] {
  const key = slug(o.key), cur = fs.find(f => f.key === key && !f.replacedAt && !f.retiredAt);
  if (o.op === 'retire') return cur ? fs.map(f => f === cur ? { ...f, retiredAt: now } : f) : fs;
  if (o.op !== 'add' && o.op !== 'replace') return fs;
  const text = String(o.text ?? '').trim().slice(0, 300);
  if (!text || looksSecret(text) || (cur && cur.text === text)) return fs;
  const nf: Fact = { id: `${key}-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`, key, text, source, ts: now };
  return [...fs.map(f => f === cur ? { ...f, replacedAt: now, replacedBy: nf.id } : f), nf];
}
export const applyDream = (fs: Fact[], ops: Op[], now = Date.now()) => ops.reduce((acc, o) => applyOp(acc, o, 'dream', now), fs);

export async function remember(key: string, text: string, source: string) { const fs = applyOp(await allFacts(), { op: 'replace', key, text }, source); await setJSON(K, fs); return current(fs); }
export async function retire(key: string) { const fs = applyOp(await allFacts(), { op: 'retire', key }, 'you'); await setJSON(K, fs); return current(fs); }
/** Forget removes the fact and all of its history. */
export async function forget(key: string) { const fs = (await allFacts()).filter(f => f.key !== slug(key)); await setJSON(K, fs); return current(fs); }

/** Prompt block: current facts, newest first, with dates. Empty when there is no memory, so prompts stay unchanged. */
export function memoryBlock(cur: Fact[]) {
  if (!cur.length) return '';
  return `\n\nWhat Apex has learned about Jeremy (newest first; a newer fact replaces an older one; his rules file and the house rules win on conflict):\n` +
    cur.slice(0, 40).map(f => `- [${new Date(f.ts).toISOString().slice(0, 10)}, ${f.source}] ${f.text}`).join('\n');
}
export const memoryPrompt = async () => memoryBlock(current(await allFacts()));

/** Conversation log the nightly dream reads: his own messages only, trimmed. */
export async function logTurn(source: string, text: string) {
  const t = String(text ?? '').trim(); if (!t || looksSecret(t)) return;
  await push('memory_log', { ts: Date.now(), source, text: t.slice(0, 800) }, 300);
}

const SCHEMA = { type: 'object', additionalProperties: false, required: ['ops', 'rules_suggestion'], properties: {
  ops: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['op', 'key', 'text', 'why'], properties: {
    op: { type: 'string', enum: ['add', 'replace', 'retire'] }, key: { type: 'string' }, text: { type: 'string' }, why: { type: 'string' } } } },
  rules_suggestion: { type: 'string' } } };

/** Nightly "dream": reads the day's messages, journal and trades, and updates the facts. Suggests (never applies) rules changes. */
export async function dream(extra: { journal?: unknown[]; trades?: unknown[]; rules?: string } = {}) {
  await guard();
  const since = Date.now() - 864e5, log = (await list<any>('memory_log', 300)).filter(x => x.ts >= since);
  const fs = await allFacts(), cur = current(fs);
  if (!log.length && !(extra.journal?.length)) return { ops: [], applied: 0, note: 'nothing new today' };
  const client = new Anthropic();
  const r = await client.beta.messages.create({ model: DREAM_MODEL, max_tokens: 3000, output_config: { format: { type: 'json_schema', schema: SCHEMA } } as any,
    system: 'You maintain a trader\'s memory for his trading assistant. From today\'s messages, journal and trades, record durable facts about how he trades and what he prefers: goals, risk limits, markets, setups he trusts or dropped, habits, what tilts him, how he likes answers. ' +
      'Use short stable keys (risk-per-trade, preferred-timeframe, answer-style). "replace" when a fact changed (newer wins), "add" for new topics, "retire" when he says something is no longer true. ' +
      'Only facts he stated or clearly showed; no guesses, no one-off moods, no prices, never keys, account numbers or wallet details. At most 12 ops; none is fine. ' +
      'rules_suggestion: one short suggested edit to his rules file if today clearly changed a rule, else an empty string.',
    messages: [{ role: 'user', content: `Current facts:\n${JSON.stringify(cur.map(f => ({ key: f.key, text: f.text, date: new Date(f.ts).toISOString().slice(0, 10) })))}\n\nHis rules file:\n${extra.rules ?? '(none)'}\n\nToday's messages:\n${JSON.stringify(log.map(x => ({ source: x.source, text: x.text })))}\n\nToday's journal:\n${JSON.stringify(extra.journal ?? [])}\n\nToday's bot trades:\n${JSON.stringify((extra.trades ?? []).slice(0, 40))}` }],
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } as any);
  await record('dream', DREAM_MODEL, r.usage);
  if (r.stop_reason === 'refusal') throw new Error('the model declined');
  const out = JSON.parse(r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''));
  const ops: Op[] = (out.ops ?? []).slice(0, 12), next = applyDream(fs, ops);
  await setJSON(K, next);
  if (out.rules_suggestion?.trim()) await setJSON('rules_suggestion', { ts: Date.now(), text: String(out.rules_suggestion).slice(0, 1500) });
  await push('memory_dreams', { ts: Date.now(), ops, suggestion: out.rules_suggestion ?? '' }, 60);
  return { ops, applied: current(next).length - cur.length, suggestion: out.rules_suggestion ?? '' };
}
