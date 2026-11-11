// A claim check as a job (docs/design/12 s4.3, s5 and s10; build plan P5.3). Two steps, each safe to run again:
//   extract: the stored text goes to the model once, and the answer is kept. Nothing is tested and nothing is counted.
//   run:     the kept answer is checked against the text again, every reading is written down in the account's ledger
//            before it runs, the gate runs, and the entries, the result and the usage are written in one transaction.
// packages/claims decides everything about a check. This file only gives it one account's ledger, plan and data.
// What counts against the month: a check that tested at least one reading. A check that could not be read, was refused,
// or failed on Proof's side is free.
import type pg from 'pg';
import { EXTRACT_FAILED, MAX_CHARS, intake, runClaimCheck, validateExtraction, type ClaimResult, type CostModel, type Extracted, type Intake } from '@apex/claims';
import type { DataHealth, LoadedDataset } from '@apex/data/types';
import type { GateConfig } from '@apex/kernel';
import { Ledger } from '@apex/kernel/ledger';
import { asUser, asWorker, isId, type Q } from './db';
import { AccountLedgerStore } from './ledger';
import { limitsOf, periodStart, triesPerWeek } from './plans';
import { MESSAGES } from './copy';

/** Where the pasted text is kept. It is the person's data: one prefix per account, and never in the database or a log. */
export type Blobs = { put(key: string, text: string): Promise<void>; get(key: string): Promise<string | null> };
export class MemoryBlobs implements Blobs {
  private m = new Map<string, string>();
  async put(key: string, text: string) { this.m.set(key, text); }
  async get(key: string) { return this.m.get(key) ?? null; }
  keys() { return [...this.m.keys()]; }
}
export const inputKey = (accountId: string, hash: string) => `inputs/${accountId}/${hash}`;

export type Deps = {
  pool: pg.Pool; blobs: Blobs; now: () => number;
  /** The one model call. It returns what the call cost, so the account's spend is counted. */
  extract: (inp: Intake) => Promise<{ extracted: Extracted; usd: number }>;
  data: (now: number) => Promise<{ datasets: LoadedDataset[]; health: DataHealth[] }>;
  gate: GateConfig; costModel: CostModel; engineFingerprint: string;
};
export const OPEN = ['queued', 'extracting', 'planned', 'running'] as const, CLOSED = ['done', 'failed', 'refused'] as const;
export type Status = typeof OPEN[number] | typeof CLOSED[number];
export type Started = { ok: true; id: string } | { ok: false; status: number; error: string };
/** The paper account size the shared ledger view asks for. The product has no paper book, so it is never shown. */
const CAPITAL = 10_000;
const short = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 200);

async function usageRow(q: Q, accountId: string, period: string, lock = false) {
  if (lock) await q.query('insert into usage (account_id, period_start) values ($1, $2) on conflict do nothing', [accountId, period]);
  const r = await q.query(`select checks_used, tries_used from usage where account_id = $1 and period_start = $2${lock ? ' for update' : ''}`, [accountId, period]);
  return { checks: Number(r.rows[0]?.checks_used ?? 0), tries: Number(r.rows[0]?.tries_used ?? 0) };
}

/** Start a check. Runs as the signed-in person, so the database itself limits it to their own rows and to the columns a person may write. */
export async function startCheck(d: Pick<Deps, 'pool' | 'blobs' | 'now'>, accountId: string, req: { text: unknown; kind?: unknown; title?: unknown }): Promise<Started> {
  const a = intake(req.text, req.kind ?? 'transcript'); if (!a.ok) return { ok: false, status: 422, error: MESSAGES.notChecked(a.error) };
  const title = typeof req.title === 'string' ? req.title.trim().slice(0, 200) : '';
  const refused = await asUser(d.pool, accountId, async q => {
    const acct = (await q.query('select plan, status from accounts where id = $1', [accountId])).rows[0];
    if (!acct) return { status: 404, error: MESSAGES.noAccount };
    if (acct.status !== 'active') return { status: 403, error: MESSAGES.notActive };
    const l = limitsOf(acct.plan), used = await usageRow(q, accountId, periodStart(d.now()));
    if (used.checks >= l.checksPerMonth) return { status: 402, error: MESSAGES.quota(used.checks, l.checksPerMonth) };
    const open = Number((await q.query('select count(*)::int n from claim_checks where status = any($1)', [OPEN as unknown as string[]])).rows[0].n);
    if (open >= l.concurrent) return { status: 429, error: MESSAGES.busy(l.concurrent) };
    return null;
  });
  if (refused) return { ok: false, ...refused };
  const key = inputKey(accountId, a.intake.hash); await d.blobs.put(key, a.intake.text);       // the text as intake left it: keys and passwords already removed
  const id = await asUser(d.pool, accountId, async q => (await q.query('insert into claim_checks (account_id, title, source_kind, input_uri, input_hash) values ($1,$2,$3,$4,$5) returning id', [accountId, title, a.intake.kind, key, a.intake.hash])).rows[0].id as string);
  return { ok: true, id };
}

export type Step = { id: string; status: Status | 'missing'; moved: boolean; busy?: boolean };
type Row = { id: string; account_id: string; status: Status; source_kind: string; input_uri: string | null; input_hash: string; extraction: any };
const SELECT = 'select id, account_id, status, source_kind, input_uri, input_hash, extraction from claim_checks where id = $1';

/** The stored text, read back and put through intake again. It must still be the text the row was started with. */
async function stored(d: Pick<Deps, 'blobs'>, r: Row): Promise<Intake> {
  const text = r.input_uri === inputKey(r.account_id, r.input_hash.trim()) ? await d.blobs.get(r.input_uri) : null;
  if (text === null) throw new Error('the stored input could not be read');
  const a = intake(text, r.source_kind); if (!a.ok || a.intake.hash !== r.input_hash.trim()) throw new Error('the stored input does not match the hash it was started with');
  return a.intake;
}
async function fail(d: Pick<Deps, 'pool'>, id: string, from: Status, e: unknown): Promise<Step> {
  const why = short(e);
  await asWorker(d.pool, async q => {
    const r = await q.query("update claim_checks set status = 'failed', result = $3 where id = $1 and status = $2 returning account_id", [id, from, JSON.stringify({ error: why, counted: false })]);
    if (r.rows[0]) await q.query("insert into events (account_id, kind, detail) values ($1, 'check_failed', $2)", [r.rows[0].account_id, JSON.stringify({ step: from })]);
  });
  return { id, status: 'failed', moved: true };
}
/** Take the row for one step. Null when another worker holds it or it has moved on. */
const take = async (q: Q, id: string, status: Status): Promise<Row | null> => (await q.query(`${SELECT} and status = $2 for update skip locked`, [id, status])).rows[0] ?? null;

async function stepExtract(d: Deps, id: string): Promise<Step> {
  await asWorker(d.pool, q => q.query("update claim_checks set status = 'extracting' where id = $1 and status = 'queued'", [id]));
  try {
    return await asWorker(d.pool, async q => {
      const r = await take(q, id, 'extracting'); if (!r) return { id, status: 'extracting' as Status, moved: false, busy: true };
      const plan = (await q.query('select plan from accounts where id = $1', [r.account_id])).rows[0]?.plan, l = limitsOf(plan);
      const inp = await stored(d, r), out = await d.extract(inp);
      // A plan tests so many readings of each set of rules. The rest are left out here, before anything is counted, and the result says so.
      let leftOut = 0;
      if (out.extracted.ok) { const seen = new Map<number, number>(), x = out.extracted.extraction;
        x.interpretations = x.interpretations.filter(it => { const n = seen.get(it.ruleSet) ?? 0; seen.set(it.ruleSet, n + 1); if (n >= l.interpretations) leftOut++; return n < l.interpretations; }); }
      await q.query("update claim_checks set status = 'planned', extraction = $2 where id = $1", [id, JSON.stringify({ ...out.extracted, leftOut })]);
      if (out.usd > 0) { const p = periodStart(d.now()); await usageRow(q, r.account_id, p, true); await q.query('update usage set ai_usd = ai_usd + $3 where account_id = $1 and period_start = $2', [r.account_id, p, out.usd]); }
      return { id, status: 'planned' as Status, moved: true };
    });
  } catch (e) { return fail(d, id, 'extracting', e); }
}

async function stepRun(d: Deps, id: string): Promise<Step> {
  await asWorker(d.pool, q => q.query("update claim_checks set status = 'running' where id = $1 and status = 'planned'", [id]));
  try {
    const now = d.now(), data = await d.data(now), t0 = performance.now();
    return await asWorker(d.pool, async q => {
      const r = await take(q, id, 'running'); if (!r) return { id, status: 'running' as Status, moved: false, busy: true };
      const store = new AccountLedgerStore(q, r.account_id); await store.lock();
      const acct = (await q.query('select plan, status from accounts where id = $1', [r.account_id])).rows[0], l = limitsOf(acct?.plan), period = periodStart(now), used = await usageRow(q, r.account_id, period, true);
      const refuse = async (why: string) => { await q.query("update claim_checks set status = 'refused', result = $2 where id = $1", [id, JSON.stringify({ reason: why, counted: false })]); return { id, status: 'refused' as Status, moved: true }; };
      if (acct?.status !== 'active') return refuse(MESSAGES.notActive);
      if (used.checks >= l.checksPerMonth) return refuse(MESSAGES.quota(used.checks, l.checksPerMonth));
      const inp = await stored(d, r), saved = r.extraction ?? {};
      let extracted: Extracted;
      if (saved.ok) { const v = validateExtraction(saved.extraction, inp); extracted = v.ok ? { ok: true, extraction: v.extraction, attempts: saved.attempts ?? 1 } : { ok: false, reason: EXTRACT_FAILED, errors: v.errors, attempts: saved.attempts ?? 1 }; }
      else extracted = { ok: false, reason: typeof saved.reason === 'string' ? saved.reason : EXTRACT_FAILED, errors: Array.isArray(saved.errors) ? saved.errors : [], attempts: saved.attempts ?? 1 };
      const out = runClaimCheck({ now, intake: inp, extracted, datasets: data.datasets, health: data.health, entries: await store.read(), gate: d.gate, costModel: d.costModel, engineFingerprint: d.engineFingerprint, capital: CAPITAL, trialsPerWeek: triesPerWeek(l) });
      if (out.result.status === 'waiting_budget') return refuse(out.result.headline);
      if (out.appends.length) await new Ledger(store, () => now).appendAll('claim-checker', out.appends);
      const res = out.result, counted = res.tries.planned > 0, seconds = Math.round(performance.now() - t0) / 1000;
      await q.query('update usage set checks_used = checks_used + $3, tries_used = tries_used + $4, compute_seconds = compute_seconds + $5 where account_id = $1 and period_start = $2', [r.account_id, period, counted ? 1 : 0, res.tries.fresh, seconds]);
      await q.query("update claim_checks set status = 'done', verdict = $2, result = $3, trials_used = $4, title = case when title = '' then $5 else title end where id = $1",
        [id, res.verdict, JSON.stringify({ ...res, counted, leftOut: Number(saved.leftOut) || 0 }), res.tries.fresh, res.title.slice(0, 200)]);
      await q.query("insert into events (account_id, kind, detail) values ($1, 'check_done', $2)", [r.account_id, JSON.stringify({ verdict: res.verdict, counted, fresh: res.tries.fresh, planned: res.tries.planned })]);
      return { id, status: 'done' as Status, moved: true };
    });
  } catch (e) { return fail(d, id, 'running', e); }
}

/** Do the next step of a check, if there is one. Safe to call twice, from two workers, or again after a crash. */
export async function advance(d: Deps, id: string): Promise<Step> {
  if (!isId(id)) return { id: String(id), status: 'missing', moved: false };
  const r: Row | undefined = (await asWorker(d.pool, q => q.query(SELECT, [id]))).rows[0];
  if (!r) return { id, status: 'missing', moved: false };
  if (r.status === 'queued' || r.status === 'extracting') return stepExtract(d, id);
  if (r.status === 'planned' || r.status === 'running') return stepRun(d, id);
  return { id, status: r.status, moved: false };
}
/** Run a check to its end. A worker that finds the check held by another stops and leaves it to that one. */
export async function finish(d: Deps, id: string): Promise<Step> {
  for (let i = 0; ; i++) { const s = await advance(d, id); if (!s.moved || i >= 4) return s; }
}

// ---- what a person sees of their own checks. Each runs as that person, so row-level security does the scoping. ----
export type HistoryRow = { id: string; createdAt: string; status: Status; title: string; sourceKind: string; verdict: string | null; newTries: number; counted: boolean; families: string[] };
export type History = { checks: HistoryRow[]; families: { family: string; tries: number }[]; usage: { period: string; checks: number; tries: number; checksPerMonth: number } };
export async function history(d: Pick<Deps, 'pool' | 'now'>, accountId: string): Promise<History> {
  return asUser(d.pool, accountId, async q => {
    const fam = new Map<string, string>((await q.query('select trial_key, family from trials')).rows.map(r => [String(r.trial_key).trim(), r.family]));
    const tally = new Map<string, number>(); for (const f of fam.values()) tally.set(f, (tally.get(f) ?? 0) + 1);
    const rows = (await q.query("select id, created_at, status, title, source_kind, verdict, trials_used, result -> 'receipt' -> 'trialKeys' as keys, coalesce((result ->> 'counted')::boolean, false) as counted from claim_checks order by created_at desc, id limit 200")).rows;
    const plan = (await q.query('select plan from accounts')).rows[0]?.plan, period = periodStart(d.now()), used = await usageRow(q, accountId, period);
    return { checks: rows.map(r => ({ id: r.id, createdAt: new Date(r.created_at).toISOString(), status: r.status, title: r.title, sourceKind: r.source_kind, verdict: r.verdict, newTries: Number(r.trials_used), counted: r.counted,
        families: [...new Set(((r.keys ?? []) as string[]).map(k => fam.get(k)).filter((f): f is string => !!f))] })),
      families: [...tally].map(([family, tries]) => ({ family, tries })).sort((a, b) => b.tries - a.tries || a.family.localeCompare(b.family)),
      usage: { period, checks: used.checks, tries: used.tries, checksPerMonth: limitsOf(plan).checksPerMonth } };
  });
}

export type Version = { trialKey: string; seq: number; strategy: string | null; panel: string | null; tf: string | null; rules: unknown; status: string | null; trades: number | null; ret: number | null; sharpe: number | null;
  /** The chance the result is more than luck after allowing for every try this account had made when this one ran. */
  afterTries: number | null; triesThen: number | null };
export type RulePage = { family: string; tries: number; versions: Version[]; best: number | null; line: string };
/** One rule family: every version this account tried, oldest first, with the count and the marked-down reading of the best one. */
export async function rulePage(d: Pick<Deps, 'pool'>, accountId: string, family: string): Promise<RulePage | null> {
  return asUser(d.pool, accountId, async q => {
    const rows = (await q.query(`select t.trial_key, t.first_seq, t.strategy, t.panel, t.tf, p.payload -> 'rules' as rules, r.payload as result
      from trials t join ledger p on p.account_id = t.account_id and p.seq = t.first_seq
      left join lateral (select l.payload from ledger l where l.account_id = t.account_id and l.kind = 'trial_result' and l.payload ->> 'trialKey' = t.trial_key order by l.seq desc limit 1) r on true
      where t.family = $1 order by t.first_seq`, [family])).rows;
    if (!rows.length) return null;
    const versions: Version[] = rows.map(r => ({ trialKey: String(r.trial_key).trim(), seq: Number(r.first_seq), strategy: r.strategy, panel: r.panel, tf: r.tf, rules: r.rules, status: r.result?.status ?? null,
      trades: r.result?.metrics?.trades ?? null, ret: r.result?.metrics?.ret ?? null, sharpe: r.result?.metrics?.sharpe ?? null, afterTries: r.result?.readouts?.dsrN ?? null, triesThen: r.result?.readouts?.nTrials ?? null }));
    const ran = versions.map((v, i) => [v, i] as const).filter(([v]) => v.sharpe !== null), best = ran.length ? ran.sort((a, b) => b[0].sharpe! - a[0].sharpe!)[0][1] : null;
    return { family, tries: versions.length, versions, best, line: MESSAGES.tried(versions.length) };
  });
}
export { MAX_CHARS };
