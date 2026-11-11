// What the CLI and the nightly job share: open the ledger, load data, build the run input, run, append, write the report.
// The pipeline itself is pure (packages/autopilot). Everything that touches disk, clock, network or environment is here.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STRATEGIES } from '@apex/engine/strategies';
import { computeFingerprints, diffFingerprints, type Fingerprints } from '@apex/engine/fingerprint';
import { GATE_V1, Ledger, buildView, loadConfig, type LedgerStore, type LedgerEntry, type Halts } from '@apex/kernel';
import { checkData } from '@apex/data/firewall';
import { cachePath, loadCsvDataset, loadRegistry, pullDataset } from '@apex/data/registry';
import { massiveAdapter } from '@apex/data/adapters';
import type { DataHealth, LoadedDataset } from '@apex/data/types';
import { FileLedgerStore, fileLock } from '@apex/store';
import { PRIOR_COSTS, renderReport, renderShort, runAutopilot, type RunInput, type RunOutput } from '@apex/autopilot';

export type Env = Record<string, string | undefined>;
export type Ctx = { root: string; env: Env; stateDir: string; now: () => number };
export const makeCtx = (root: string, env: Env = process.env, now: () => number = Date.now): Ctx => ({ root, env, stateDir: env.APEX_STATE_DIR || join(root, '.apex'), now });

export type Opened = { store: LedgerStore; kind: 'postgres' | 'file'; where: string; lock: () => Promise<(() => Promise<void>) | null>; saveReport: (id: string, at: number, md: string, summary: unknown) => Promise<string>; close: () => Promise<void> };
/** Postgres when DATABASE_URL is set, otherwise the file ledger in the state directory. Both are durable. */
export async function openStore(ctx: Ctx): Promise<Opened> {
  const reports = join(ctx.stateDir, 'reports'); mkdirSync(reports, { recursive: true });
  const toFile = (id: string, at: number, md: string) => { const p = join(reports, `${new Date(at).toISOString().slice(0, 10)}-${id}.md`); writeFileSync(p, md); writeFileSync(join(reports, 'latest.md'), md); return p; };
  if (ctx.env.DATABASE_URL) {
    const { PgLedgerStore } = await import('@apex/store/pg'), pg = (await import('pg')).default, pool = new pg.Pool({ connectionString: ctx.env.DATABASE_URL, max: 3 }), store = new PgLedgerStore(pool);
    return { store, kind: 'postgres', where: 'DATABASE_URL', lock: () => store.runLock(), close: () => store.close(),
      saveReport: async (id, at, md, summary) => { await store.saveReport(id, 'daily', at, md, summary); return toFile(id, at, md); } };
  }
  const path = ctx.env.APEX_LEDGER_FILE || join(ctx.stateDir, 'ledger.jsonl'), store = new FileLedgerStore(path);
  return { store, kind: 'file', where: path, close: async () => {}, saveReport: async (id, at, md) => toFile(id, at, md),
    lock: async () => { const rel = fileLock(join(ctx.stateDir, 'run.lock')); return rel ? async () => rel() : null; } };
}

export function loadData(ctx: Ctx, only?: (id: string) => boolean): { datasets: LoadedDataset[]; health: DataHealth[]; problems: string[] } {
  const now = ctx.now(), datasets: LoadedDataset[] = [], health: DataHealth[] = [], problems: string[] = [];
  for (const spec of loadRegistry(ctx.root).datasets) {
    if (only && !only(spec.id)) continue;
    if (spec.source !== 'csv') { problems.push(`${spec.id}: live source ${spec.source} is pulled by \`apex data pull\`, which needs its key and accepted terms`); continue; }
    try { const d = loadCsvDataset(ctx.root, spec, now, join(ctx.stateDir, 'data')); datasets.push(d); health.push(checkData(d.bars, spec, d.version, GATE_V1.firewall, { now, fetchedAt: d.fetchedAt, termsRef: 'data/SOURCES.md#csv' })); }
    catch (e) { problems.push(`${spec.id}: ${(e as Error).message}`); }
  }
  return { datasets, health, problems };
}

/**
 * Refresh the bars. Each committed file is copied into the state directory once and then only appended to, so history stays the
 * same and the same pair stays the same trial. Needs MASSIVE_API_KEY (a data key: it cannot trade) and an accepted terms entry.
 */
export async function pullData(ctx: Ctx, fetchFn: typeof fetch = fetch, sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))): Promise<{ pulled: string[]; problems: string[] }> {
  const key = ctx.env.MASSIVE_API_KEY, pulled: string[] = [], problems: string[] = [];
  if (!key) return { pulled, problems: ['MASSIVE_API_KEY is not set: the committed files are used as they are, and stale data cannot open paper orders'] };
  const cacheDir = join(ctx.stateDir, 'data'), sourcesMd = readFileSync(join(ctx.root, 'data/SOURCES.md'), 'utf8'), adapter = massiveAdapter(key, fetchFn as any), done = new Set<string>(); mkdirSync(cacheDir, { recursive: true });
  for (const spec of loadRegistry(ctx.root).datasets) {
    const path = cachePath(cacheDir, spec), file = spec.from?.file ?? spec.file; if (spec.source !== 'csv' || !file || done.has(path)) continue; done.add(path);
    try { if (!existsSync(path)) copyFileSync(join(ctx.root, 'data', file), path);
      if (done.size > 1) await sleep(Math.ceil(60000 / adapter.rateLimit.perMinute) + 500);
      const r = await pullDataset({ ...spec, tf: spec.from?.tf ?? spec.tf, from: undefined }, adapter, { cacheDir, now: ctx.now(), sourcesMd });
      pulled.push(`${spec.symbol} ${spec.from?.tf ?? spec.tf}: ${r.added} new bars${r.restated.length ? `, ${r.restated.length} restated by the provider` : ''}`); }
    catch (e) { problems.push(`${spec.symbol}: ${(e as Error).message.replace(key, '[key]')}`); }
  }
  return { pulled, problems };
}

export function fingerprints(ctx: Ctx): { now: Fingerprints; committed: Fingerprints | null; diffs: string[] } {
  const p = join(ctx.root, 'packages/engine/fingerprints.json'), now = computeFingerprints(), committed: Fingerprints | null = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
  return { now, committed, diffs: committed ? diffFingerprints(committed, now) : ['fingerprints.json is missing'] };
}

export function commitOf(ctx: Ctx): string {
  if (ctx.env.GITHUB_SHA) return ctx.env.GITHUB_SHA;
  try { return execSync('git rev-parse HEAD', { cwd: ctx.root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'unknown'; }
}
/** Halts as the ledger records them. An andon or kill entry stays in force until a resume entry for the same level. */
export function haltsFrom(entries: LedgerEntry[], capital: number): Halts {
  try { const v = buildView(entries, capital); return { readable: true, kill: v.halts.some(h => h.level === 'kill'), andon: v.halts.some(h => h.level === 'andon') }; }
  catch { return { readable: false, kill: false, andon: false }; }
}

export type RunOpts = { mode: 'tick' | 'full' | 'validator'; budget?: number; dryRun?: boolean; seedSource?: string; seedIfEmpty?: string; level?: 'L1' | 'L2' | 'L3'; only?: (id: string) => boolean; extraHalts?: Partial<Halts> };
export type RunResult = { out: RunOutput; markdown: string; short: string; reportPath: string | null; head: { seq: number; hash: string } | null; store: string; skipped?: string };
export async function execute(ctx: Ctx, o: RunOpts): Promise<RunResult> {
  const cfg = loadConfig(ctx.env, 'cli'), opened = await openStore(ctx), release = o.dryRun ? async () => {} : await opened.lock();
  if (!release) { await opened.close(); throw new Error('another run holds the lock; nothing was done'); }
  try {
    const now = ctx.now(), entries = await opened.store.read(), data = loadData(ctx, o.only), fp = fingerprints(ctx);
    const registry = STRATEGIES.map(def => ({ def, fingerprint: fp.now.strategies[def.id] }));
    // A ledger with no trial yet gets the plan-approved seed batch: every pair once, exempt from the weekly budget.
    if (o.seedIfEmpty && o.mode !== 'validator' && !entries.some(e => e.kind === 'prereg')) o = { ...o, mode: 'full', seedSource: o.seedIfEmpty };
    const runId = `${new Date(now).toISOString().replace(/[-:]/g, '').slice(0, 15)}-${o.mode}`, base = haltsFrom(entries, cfg.paperCapital);
    const inp: RunInput = { now, runId, commit: commitOf(ctx), mode: o.mode, datasets: data.datasets, health: data.health, registry, engineFingerprint: fp.now.engine, entries, durable: opened.store.durable,
      requestedLimits: cfg.limits, halts: { readable: base.readable && o.extraHalts?.readable !== false, kill: base.kill || !!o.extraHalts?.kill, andon: base.andon || !!o.extraHalts?.andon },
      costModel: PRIOR_COSTS, gate: GATE_V1, capital: cfg.paperCapital, budget: o.budget, trialsPerWeek: cfg.trialsPerWeek, seedSource: o.seedSource,
      secondSourceExists: !!cfg.validatorSource, validator: o.mode === 'validator' ? { level: o.level ?? 'L1', source: o.level && o.level !== 'L1' ? cfg.validatorSource ?? 'same' : 'same' } : undefined };
    const out = runAutopilot(inp);
    out.report.status.problems.push(...data.problems, ...cfg.problems, ...fp.diffs.map(d => `fingerprint: ${d}`));
    let head = await opened.store.head(), reportPath: string | null = null;
    if (!o.dryRun) { const ledger = new Ledger(opened.store, () => now); await ledger.appendAll(o.mode === 'validator' ? 'validator' : 'autopilot', out.appends); head = await opened.store.head(); }
    const markdown = renderReport(out.report, o.dryRun ? null : head), short = renderShort(out.report);
    if (!o.dryRun && o.mode !== 'validator') reportPath = await opened.saveReport(runId, now, markdown, { funnel: out.report.funnel, book: out.report.book, status: out.report.status });
    return { out, markdown, short, reportPath, head, store: `${opened.kind} (${opened.where})` };
  } finally { await release(); await opened.close(); }
}

/** Telegram delivery of the short report. Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID; without them it says so and sends nothing. */
export async function sendTelegram(env: Env, text: string, fetchFn: typeof fetch = fetch): Promise<{ sent: boolean; why?: string }> {
  const token = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_CHAT_ID; if (!token || !chat) return { sent: false, why: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set' };
  try { const r = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }) });
    return r.ok ? { sent: true } : { sent: false, why: `Telegram answered ${r.status}` }; }
  catch (e) { return { sent: false, why: `Telegram could not be reached (${(e as Error).name})` }; }      // never echo the URL: it holds the token
}
