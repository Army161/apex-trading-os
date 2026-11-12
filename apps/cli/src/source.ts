// Where a read command gets its answer (docs/design/08 s1). There are three places, and all three give the same shapes,
// the ones in the v1 contract, so one renderer serves them all and `--json` prints exactly what the API would send.
//   local:    the ledger in this checkout, through the same handlers the dashboard serves. Its one write is the halt
//   remote:   the dashboard's /api/v1, through the client in packages/sdk. Read, queue a claim check, halt
//   fixtures: a small committed ledger held in memory, for demos and tests. Nothing is written
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ApiFail, HANDLERS, statusFrom, type Ctx as ApiCtx } from '@apex/api';
import { ApexApiError, ApexClient, ROUTES, type Bodies, type Page, type ProblemCode, type Responses, type RouteDef, type RouteId } from '@apex/sdk';
import { Ledger, MemoryLedgerStore, buildView, loadConfig, type LedgerEntry } from '@apex/kernel';
import { openStore, type Ctx } from './runtime';

export type CallArgs = { params?: Record<string, string>; query?: Record<string, string | number | boolean | undefined>; body?: unknown };
export type Source = { mode: 'local' | 'remote' | 'fixtures'; where: string;
  call<K extends RouteId>(id: K, a?: CallArgs): Promise<Responses[K]>;
  reportMarkdown(id: string): Promise<string | null> };
export class SourceError extends Error { constructor(public code: ProblemCode, message: string, public retryAfterSec: number | null = null) { super(message); } }

const REPORT_ID = /^[0-9A-Za-z][0-9A-Za-z_-]{3,80}$/;
function reportFile(ctx: Ctx, id: string): string | null {
  const dir = join(ctx.stateDir, 'reports'); if (!REPORT_ID.test(id) || !existsSync(dir)) return null;
  const f = readdirSync(dir).find(n => n.endsWith(`-${id}.md`)); return f ? readFileSync(join(dir, f), 'utf8') : null;
}
export const FIXTURE_LEDGER = join(__dirname, '../fixtures/ledger.jsonl');

/** The ledger in this checkout (or the committed fixture ledger). It serves reads only: the commands that write do so themselves, under the run lock. */
export function localSource(ctx: Ctx, o: { fixtures?: boolean; actor?: string } = {}): Source {
  const cfg = loadConfig(ctx.env, 'cli');
  const read = async (): Promise<{ entries: LedgerEntry[]; kind: 'postgres' | 'file'; now: number }> => {
    if (o.fixtures) { const entries = await new MemoryLedgerStore(readFileSync(FIXTURE_LEDGER, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))).read(); return { entries, kind: 'file', now: (entries[entries.length - 1]?.ts ?? 0) + 3600e3 }; }
    const s = await openStore(ctx); try { return { entries: await s.store.read(), kind: s.kind, now: ctx.now() }; } finally { await s.close(); }
  };
  const refuse = async (): Promise<never> => { throw new ApiFail('unavailable', 'This is done by its own command in a checkout.'); };
  return { mode: o.fixtures ? 'fixtures' : 'local', where: o.fixtures ? 'the committed fixture ledger' : ctx.env.DATABASE_URL ? 'DATABASE_URL' : ctx.env.APEX_LEDGER_FILE || join(ctx.stateDir, 'ledger.jsonl'),
    reportMarkdown: async id => reportFile(ctx, id),
    async call(id, a = {}) {
      const r: RouteDef = ROUTES[id], by = o.actor ?? 'cli';
      // The one write a local source makes itself: the halt. It is always allowed, and it is one ledger entry.
      if (id === 'halt') { if (o.fixtures) throw new SourceError('unavailable', 'The fixture ledger is read-only, so nothing was halted.'); const reason = String((a.body as { reason?: unknown } | undefined)?.reason ?? '').trim(); if (reason.length < 3) throw new SourceError('validation', 'A halt needs a reason.');
        const s = await openStore(ctx); try { await new Ledger(s.store, ctx.now).append('halt', by, { level: 'andon', by, reason: reason.slice(0, 500) }); return { halted: true, already: false, ledger: 'recorded' } as Responses[typeof id]; } finally { await s.close(); } }
      if (r.method !== 'GET') throw new SourceError('unavailable', o.fixtures ? 'The fixture ledger is read-only.' : 'A claim check from here needs the dashboard, which makes the extraction. Set APEX_API_URL and APEX_API_KEY, or use: apex claim <file> --extraction <json>.');
      try {
        const { entries, kind, now } = await read(), view = buildView(entries, cfg.paperCapital), query = new URLSearchParams();
        for (const [k, v] of Object.entries(a.query ?? {})) if (v !== undefined) query.set(k, String(v));
        // The terminal has no dashboard cord or kill switch of its own: the halts it knows are the ledger's.
        const status = statusFrom({ ledger: kind, entries, capital: cfg.paperCapital, cord: { on: false }, killswitch: false, persistent: true, signedIn: false, authEnabled: false, aiEnabled: false, now });
        const c: ApiCtx = { entries, view, cfg, now, params: a.params ?? {}, query, body: undefined, status, actor: 'cli', deps: { readReport: async rid => reportFile(ctx, rid), claimCheck: refuse, halt: refuse, remember: { get: async () => null, set: async () => {} } } };
        return await HANDLERS[id](c) as Responses[typeof id];
      } catch (e) { if (e instanceof ApiFail) throw new SourceError(e.code, e.detail); throw new SourceError('unavailable', `The ledger could not be read: ${(e as Error).message.slice(0, 200)}`); }
    } };
}

/** The dashboard's API. Needs APEX_API_URL and APEX_API_KEY. The key is read from the environment only and is never printed. */
export function remoteSource(env: Record<string, string | undefined>, fetchFn?: typeof fetch): Source | { error: string } {
  const url = env.APEX_API_URL, key = env.APEX_API_KEY;
  if (!url || !key) return { error: 'Remote mode needs APEX_API_URL and APEX_API_KEY in the environment. Make a key on the dashboard under You, Setup.' };
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)) return { error: 'APEX_API_URL must be https (or localhost), so the key is never sent in the clear.' };
  const client = new ApexClient({ baseUrl: url, apiKey: key, fetch: fetchFn });
  const wrap = async <T>(f: () => Promise<T>): Promise<T> => { try { return await f(); } catch (e) {
    if (e instanceof ApexApiError) throw new SourceError(e.code, e.message, e.retryAfterSec);
    throw new SourceError('unavailable', `The dashboard could not be reached (${(e as Error).name}).`); } };     // never echo the request: it carries the key
  return { mode: 'remote', where: url.replace(/\/+$/, ''),
    call: (id, a = {}) => wrap(() => (client.call as (i: RouteId, x: unknown) => Promise<never>)(id, a)),
    reportMarkdown: id => wrap(() => client.reportMarkdown(id)) };
}

/** Every row of a paged route, up to `max`. */
export async function all<T>(s: Source, id: RouteId, a: CallArgs = {}, max = 2000): Promise<T[]> {
  const out: T[] = []; let cursor: string | undefined;
  do { const p = await s.call(id, { ...a, query: { ...a.query, limit: Math.min(200, max - out.length), cursor } }) as unknown as Page<T>; out.push(...p.items); cursor = p.next ?? undefined; } while (cursor && out.length < max);
  return out;
}
export type { Bodies };
