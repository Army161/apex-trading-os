// Claim checker step 1 (docs/design/05 s2): size and type checks, secret redaction, a content hash, and the flags that plain code
// can raise without a model. Nothing here reads the text as instructions. The cleaned text is what the model sees, what quotes
// are checked against and what the hash is taken over, so one hash always means one exact input.
import { sha256 } from '@apex/kernel';

export const KINDS = ['transcript', 'pine', 'page', 'rules'] as const;
export type SourceKind = typeof KINDS[number];
export const MAX_CHARS = 200_000;
export type Flag = { kind: string; detail: string; evidence?: { quote: string; offset: number } };
export type Intake = { kind: SourceKind; text: string; hash: string; chars: number; redactions: number; flags: Flag[] };

// Shapes of common credentials. A match is replaced before the text is hashed, stored or sent anywhere.
const SECRETS: [string, RegExp][] = [
  ['model key', /sk-ant-[A-Za-z0-9_-]{20,}/g], ['cloud key', /AKIA[0-9A-Z]{16}/g], ['chat token', /xox[abp]-[A-Za-z0-9-]{20,}/g],
  ['bot token', /\b\d{8,}:[A-Za-z0-9_-]{35}\b/g], ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g],
  ['key assignment', /\b(api[_-]?key|secret|password|passphrase|token)\b(\s*[:=]\s*["']?)[A-Za-z0-9_\-\/+]{24,}/gi],
];
const ZERO_WIDTH = /[​-‏⁠-⁤﻿­]/g;

// [flag kind, what the reader is told, pattern]. Kinds starting with "injection" mean the text tried to steer a reader or a model.
const PATTERNS: [string, string, RegExp][] = [
  ['injection', 'the text contains instructions aimed at an AI or at the checker; they were ignored', /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|your)\b[^.\n]{0,20}\b(instructions?|rules|prompt)/i],
  ['injection', 'the text tells the checker what result to report; it was ignored', /\b(report|mark|rate|classify|label|verdict)\b[^.\n]{0,60}\b(as|is|:)\s*["']?(profitable|holds?[_ ]up|passed|a pass|verified)/i],
  ['injection', 'the text addresses an AI system directly; it was ignored', /\b(system prompt|you are (now )?(an?|the) (ai|assistant|language model)|as an ai)\b/i],
  ['fake_json', 'the text contains what looks like a ready-made result; it was treated as text', /["'](verdict|ruleSets|holds_up|interpretations)["']\s*:/],
  ['hidden_text', 'the text contains markup that hides content from a human reader', /<!--[\s\S]*?-->|display\s*:\s*none|font-size\s*:\s*0|visibility\s*:\s*hidden|color\s*:\s*(#fff(fff)?|white)\b/i],
  ['guaranteed_returns', 'claims a guaranteed or certain result', /\b(guaranteed?|risk[- ]free|can(no|')t lose|sure[- ]fire)\b[^.\n]{0,40}\b(profit|returns?|income|win|money|gains?)|\b(profit|returns?|income|gains?)\b[^.\n]{0,20}\bguaranteed\b/i],
  ['no_losses', 'claims no losing trades or a perfect record', /\b(no|zero|never (a|had a)) (losing|loss|losses)\b|\b(100|99(\.\d+)?)\s?% (win|success|accura)/i],
  ['paid_group', 'promotes a paid group, course or signal service', /\b(join|sign up|subscribe)\b[^.\n]{0,40}\b(vip|premium|paid|private|signals?)\b[^.\n]{0,20}\b(group|channel|discord|telegram|community|course)/i],
  ['affiliate_link', 'contains an affiliate or referral link', /\b(affiliate|referral|promo) (link|code)\b|[?&](ref|aff|affiliate|referral)=/i],
  ['urgency', 'uses time pressure', /\b(limited (time|spots?)|only \d+ (spots?|seats?) left|offer ends|act now|last chance)\b/i],
];
// Pine settings that make a backtest look better than it trades (05 s4.4). Pine is never executed; these are read from the text.
const PINE: [string, string, RegExp][] = [
  ['pine_lookahead', 'request.security is called with lookahead on, which can read future bars', /lookahead\s*=\s*barmerge\.lookahead_on/],
  ['pine_every_tick', 'calc_on_every_tick is on, so backtest fills differ from live fills', /calc_on_every_tick\s*=\s*true/],
  ['pine_zero_commission', 'commission is set to zero', /commission_value\s*=\s*0(\.0+)?\s*[,)]/],
  ['pine_full_equity', 'every trade uses 100% of equity', /default_qty_type\s*=\s*strategy\.percent_of_equity[\s\S]{0,80}default_qty_value\s*=\s*100\b|default_qty_value\s*=\s*100\b[\s\S]{0,80}strategy\.percent_of_equity/],
  ['pine_pyramiding', 'pyramiding is on, so one signal can stack several entries', /pyramiding\s*=\s*[1-9]/],
  ['pine_repaint', 'uses settings that behave differently on live bars than in the backtest', /calc_on_order_fills\s*=\s*true|\bbarstate\.isrealtime\b/],
];

/** Refuses with a plain reason, or returns the cleaned text with its hash and flags. */
export function intake(raw: unknown, kind: unknown = 'transcript'): { ok: true; intake: Intake } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'the input must be text' };
  if (!KINDS.includes(kind as SourceKind)) return { ok: false, error: `kind must be one of ${KINDS.join(', ')}` };
  if (raw.length > MAX_CHARS) return { ok: false, error: `the input has ${raw.length.toLocaleString('en-US')} characters; the limit is ${MAX_CHARS.toLocaleString('en-US')}. Trim it to the part that states the rules` };
  if (raw.includes('\u0000')) return { ok: false, error: 'the input is not plain text' };
  const flags: Flag[] = []; let redactions = 0;
  let text = raw.replace(/\r\n?/g, '\n');
  const hidden = text.match(ZERO_WIDTH)?.length ?? 0;
  if (hidden) { text = text.replace(ZERO_WIDTH, ''); flags.push({ kind: 'hidden_text', detail: `${hidden} invisible characters were removed` }); }
  for (const [name, re] of SECRETS) text = text.replace(re, (m, a, b) => { redactions++; return name === 'key assignment' ? `${a}${b}[redacted]` : `[redacted ${name}]`; });
  if (redactions) flags.push({ kind: 'secret_redacted', detail: `${redactions} thing${redactions === 1 ? '' : 's'} that looked like a key or password ${redactions === 1 ? 'was' : 'were'} removed before anything else read the text` });
  if (text.trim().length < 40) return { ok: false, error: 'the input is too short to hold a rule' };
  const seen = new Set<string>();
  for (const [k, detail, re] of [...PATTERNS, ...(kind === 'pine' ? PINE : [])]) {
    const m = re.exec(text); if (!m || seen.has(k + detail)) continue; seen.add(k + detail);
    flags.push({ kind: k, detail, evidence: { quote: m[0].replace(/\s+/g, ' ').slice(0, 160), offset: m.index } });
  }
  return { ok: true, intake: { kind: kind as SourceKind, text, hash: sha256(text), chars: text.length, redactions, flags } };
}
