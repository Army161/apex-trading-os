// A small ledger with one slot that has passed locks 1 to 3, an intent from the paper pipeline, and the deps the steps need.
// Environment names and keys are built here at run time, so no file in the repo gives a live flag or a key a value.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeEntry, type LedgerEntry, type LedgerKind } from '@apex/kernel/ledger';
import { signApproval } from '@apex/kernel/locks';
import { verifyExecutor } from '@apex/kernel/executor-auth';
import { intentId } from '@apex/autopilot/pipeline';
import { FileJournal } from '../src/journal';
import type { ExecDeps } from '../src/steps';
import type { LiveBroker } from '../src/broker';
import type { SignatureFile } from '../src/signature';

export const ALLOW = ['APEX', 'ALLOW', 'LIVE'].join('_'), SIGNOFF = ['APEX', 'SIGNOFF', 'KEY'].join('_'), EXEC = ['APEX', 'EXECUTOR', 'KEY'].join('_');
export const KEY = Array.from({ length: 40 }, (_, i) => 'abcdefgh'[i % 8]).join(''), EKEY = Array.from({ length: 40 }, (_, i) => 'stuvwxyz'[i % 8]).join('');
export const YES = ['y', 'e', 's'].join('');
export const HOUR = 36e5, T0 = 1_800_000_000_000, BAR_T = T0 + 100 * HOUR, NOW = BAR_T + HOUR + 60e3;
export const SLOT = 'alpha@spy-1h', TRIAL = 'a'.repeat(64), DASH = 'https://dash.example';
export const ID = intentId(SLOT, BAR_T, 1);

export type Row = [LedgerKind, object, string?];
export function chain(rows: Row[], from: LedgerEntry[] = []): LedgerEntry[] {
  const out = [...from];
  for (const [kind, payload, actor] of rows) { const p = out[out.length - 1]; out.push(makeEntry(p ? { seq: p.seq, hash: p.hash } : null, T0 + out.length * 1000, kind, actor ?? 'test', payload)); }
  return out;
}
const step = (s: string) => ({ step: s, verdict: 'ok', summary: `${s} read it`, issues: [] });
export const intentRow = (o: Record<string, unknown> = {}): Row => ['intent', { id: ID, slotKey: SLOT, symbol: 'SPY', assetClass: 'stock', side: 1, barT: BAR_T, refPrice: 100, stop: 97, target: 106,
  mode: 'paper', qty: 10, riskUsd: 30, riskFraction: 0.005, rules: [], ...o }, 'autopilot'];
export const approvalRow = (o: Record<string, unknown> = {}): Row => ['live_approval', { slotKey: SLOT, stage: 'micro_live', sizeCap: 0.01, expiresAt: NOW + 30 * 864e5, by: 'you', checklist: ['x'], ...o }];

/** Seqs: 1 prereg, 2 result, 3 slot, 4 data, 5 weights, 6 strict pass, 7 validator, 8 live_eligible, 9 review, 10 approval, 11 intent. */
export function world(o: { status?: boolean; review?: boolean; approval?: Record<string, unknown> | null; intent?: Record<string, unknown> | null; extra?: Row[]; before?: Row[] } = {}): LedgerEntry[] {
  const rows: Row[] = [
    ['prereg', { trialKey: TRIAL, hypothesis: 'h', source: 'factory', strategy: { id: 'alpha', fingerprint: 'f' }, panel: 'spy-1h', tf: '1h', gateVersion: 'g1', passBar: 'all seven' }],
    ['trial_result', { trialKey: TRIAL, gateVersion: 'g1', inputs: {}, inputHash: 'i', resultHash: 'r', status: 'passed_pending_validation' }],
    ['slot_locked', { slotKey: SLOT, trialKey: TRIAL, strategy: 'alpha', dataset: 'spy-1h', symbol: 'SPY', tf: '1h', assetClass: 'stock', inputs: {}, inputHash: 'i', lockedAt: T0, gateVersion: 'g1', role: 'primary',
      baseline: { n: 60, mu: 0.1, sigma: 1, p: 0.5, ddR95: 5 } }],
    ['data_version', { dataset: 'spy-1h', version: 'v1', rows: 100, status: 'ok', tradable: true }],
    ['weights', { weights: { [SLOT]: 0.2 }, riskFractions: { [SLOT]: 0.005 }, method: 'test' }],
    ['graduation_check', { slotKey: SLOT, state: 'strict_pass', m: 1, n: 1, month: '2027-01' }],
    ['validator_run', { trialKey: TRIAL, slotKey: SLOT, purpose: 'graduation', level: 'L1', inputHash: 'i', resultHash: 'r', agrees: true }],
    ['slot_status', { slotKey: SLOT, from: 'paper', to: o.status === false ? 'paper' : 'live_eligible', reason: 'graduated' }],
  ];
  if (o.review !== false) rows.push(['promotion_review', { slotKey: SLOT, trialKey: TRIAL, gradSeq: 6, verdict: 'ok', by: 'you', model: 'reviewer', steps: [step('owner'), step('engineer'), step('qa')] }]);
  rows.push(...(o.before ?? []));
  if (o.approval !== null) rows.push(approvalRow(o.approval ?? {}));
  rows.push(...(o.extra ?? []));
  if (o.intent !== null) rows.push(intentRow(o.intent ?? {}));
  return chain(rows);
}
export const lastIntent = (entries: LedgerEntry[]) => [...entries].reverse().find(e => e.kind === 'intent')!;
export const approvalOf = (entries: LedgerEntry[]) => [...entries].reverse().find(e => e.kind === 'live_approval')!;
export const signatureFor = (entries: LedgerEntry[], key = KEY): SignatureFile => { const a = approvalOf(entries);
  return { slotKey: SLOT, approvalSeq: a.seq, approvalHash: a.hash, stage: a.payload.stage, sizeCap: a.payload.sizeCap, expiresAt: a.payload.expiresAt, signature: signApproval(key, a.hash), signedAt: NOW }; };

export type Call = { method: string; url: string; body?: string; headers: Record<string, string> };
/** The dashboard: GET /api/status and POST /api/executor/fill, which checks the signature like the real route. */
export function fakeFetch(o: { status?: unknown | 'throw' | number; post?: 'ok' | 'fail' | 'throw' } = {}) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET', headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ method, url: String(url), body: init.body as string | undefined, headers });
    if (method === 'GET') {
      if (o.status === 'throw') throw new TypeError('fetch failed');
      if (typeof o.status === 'number') return new Response('nope', { status: o.status });
      return Response.json(o.status ?? { halted: false, halts: [] });
    }
    if (o.post === 'throw') throw new TypeError('fetch failed');
    if (o.post === 'fail') return Response.json({ error: 'The ledger could not be read, so nothing was recorded.' }, { status: 503 });
    const ok = verifyExecutor(EKEY, headers['x-apex-timestamp'] ?? null, headers['x-apex-signature'] ?? null, String(init.body), NOW);
    return ok.ok ? Response.json({ ok: true, seq: 99 }) : Response.json({ error: ok.why }, { status: 401 });
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}

export const tmp = () => mkdtempSync(join(tmpdir(), 'apex-exec-'));
export const baseEnv = (): Record<string, string> => ({ [ALLOW]: YES, [SIGNOFF]: KEY, [EXEC]: EKEY, APEX_DASHBOARD_URL: DASH });

export function deps(entries: LedgerEntry[], broker: LiveBroker, o: Partial<ExecDeps> & { andon?: string[] } = {}): ExecDeps & { andon: string[] } {
  const andon = o.andon ?? [];
  return { mode: 'live', entries, capital: 10000, env: baseEnv(), now: () => NOW, fetch: fakeFetch().fetch, broker, journal: new FileJournal(join(tmp(), 'journal.jsonl')),
    signature: () => signatureFor(entries), pullAndon: async r => { andon.push(r); }, ...o, andon };
}
