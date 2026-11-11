// The one door to /api/v1 (docs/design/09). Every call goes through the same steps, in this order:
//   find the route in the contract, check who is calling, check the scope, count the call against the key's limit,
//   check the body, read the ledger, run the handler, and answer with JSON (or a problem document) and the standing headers.
// The caller passes in the things that touch the outside (the key store, the session, the ledger, the two writes), so the
// tests drive this exact code with no server.
import { createHash } from 'node:crypto';
import { PROBLEMS, RATE, ROUTES, matchRoute, routeClass, type Problem, type ProblemCode, type RouteDef, type Responses, type RouteId, type Scope } from '@apex/sdk/contract';
import { validate } from '@apex/sdk/validate';
import type { LedgerEntry } from '@apex/kernel/ledger';
import type { ApexConfig } from '@apex/kernel/config';
import type { LedgerView } from '@apex/kernel/view';
import type { ShellStatus } from '../status';
import { ApiFail, HANDLERS, type Ctx, type Deps } from './handlers';

export type Caller = { id: string; scopes: readonly Scope[] };
export type Ledgered = { ok: true; entries: LedgerEntry[]; view: LedgerView; cfg: ApexConfig } | { ok: false; note: string };
export type ServeDeps = Deps & {
  key: (authorization: string | null) => Promise<Caller | null>;
  /** True when the request carries the dashboard's own signed-in session. Only reads accept it. */
  session: () => Promise<boolean>;
  count: (k: string, windowSec: number) => Promise<{ n: number; resetSec: number }>;
  status: () => Promise<ShellStatus>;
  ledger: () => Promise<Ledgered>;
  now?: () => number;
};

const TITLES: Record<ProblemCode, string> = { unauthorized: 'A key is needed', forbidden_scope: 'The key does not allow this', not_found: 'Not found', validation: 'The request is not valid', rate_limited: 'Too many calls',
  halted: 'Apex is halted', budget: 'The budget is used up', busy: 'A run is in progress', unavailable: 'Not available right now' };
const MAX_BODY = 600_000;

/** Call one route's handler from inside the dashboard, for a caller that was checked some other way (Telegram: the webhook
 *  secret and the one chat id). It is the same handler, body check and halt rule as an API call, with no key and no HTTP.
 *  It throws ApiFail, like a handler does. */
export function direct(d: ServeDeps, actor: string) {
  return async <K extends RouteId>(id: K, a: { params?: Record<string, string>; query?: Record<string, string | number | undefined>; body?: unknown } = {}): Promise<Responses[K]> => {
    const route: RouteDef = ROUTES[id];
    if (route.body) { const errs = validate(route.body, a.body); if (errs.length) throw new ApiFail('validation', errs.slice(0, 5).join('; ')); }
    const status = await d.status(), l = await d.ledger();
    if (!l.ok && id !== 'status' && id !== 'halt') throw new ApiFail('unavailable', `The ledger is not readable: ${l.note}`);
    const query = new URLSearchParams(); for (const [k, v] of Object.entries(a.query ?? {})) if (v !== undefined) query.set(k, String(v));
    const empty = { entries: [] as LedgerEntry[], view: null as unknown as LedgerView, cfg: null as unknown as ApexConfig };
    const ctx: Ctx = { ...(l.ok ? l : empty), now: (d.now ?? Date.now)(), params: a.params ?? {}, query, body: a.body, status, actor, deps: d };
    return await HANDLERS[id](ctx) as Responses[K];
  };
}

export async function serve(req: Request, d: ServeDeps): Promise<Response> {
  const url = new URL(req.url), path = url.pathname.replace(/^.*?\/api\/v1/, '') || '/', std: Record<string, string> = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  const problem = (code: ProblemCode, detail: string, extra: Record<string, string> = {}) => {
    const body: Problem = { type: `https://apex.local/problems/${code}`, title: TITLES[code], status: PROBLEMS[code], detail, instance: url.pathname, code };
    return new Response(JSON.stringify(body), { status: body.status, headers: { ...std, ...extra, 'content-type': 'application/problem+json' } });
  };
  try {
    const m = matchRoute(req.method, path); if (!m) return problem('not_found', `There is no ${req.method} ${path} in v1.`);
    const route: RouteDef = ROUTES[m.id], cls = routeClass(route);

    // Who is calling. A key works on every route its scopes allow. The dashboard's own session works on reads only, and only from the dashboard itself.
    const auth = req.headers.get('authorization'); let caller: Caller | null = null, viaKey = false;
    if (auth) { caller = await d.key(auth); viaKey = true; }
    else if (req.method === 'GET' && !['cross-site', 'same-site'].includes(req.headers.get('sec-fetch-site') ?? '') && await d.session()) caller = { id: 'session', scopes: [] };
    if (!caller) return problem('unauthorized', auth ? 'That key is not known or has been revoked.' : 'Send a key: Authorization: Bearer apx_<id>_<secret>.', { 'www-authenticate': 'Bearer' });
    if (viaKey && !caller.scopes.includes(route.scope)) return problem('forbidden_scope', `This route needs the scope ${route.scope}. The key does not hold it.`);

    if (viaKey) { const lim = RATE[cls], c = await d.count(`rl:${caller.id}:${cls}`, lim.windowSec);
      std['ratelimit-limit'] = String(lim.limit); std['ratelimit-remaining'] = String(Math.max(0, lim.limit - c.n)); std['ratelimit-reset'] = String(c.resetSec);
      if (c.n > lim.limit) return problem('rate_limited', `This key may make ${lim.limit} of these calls every ${lim.windowSec} seconds.`, { 'retry-after': String(c.resetSec) }); }

    let body: unknown = undefined;
    if (route.body) { const text = await req.text(); if (text.length > MAX_BODY) return problem('validation', 'The body is too large.');
      try { body = JSON.parse(text); } catch { return problem('validation', 'The body must be JSON.'); }
      const errs = validate(route.body, body); if (errs.length) return problem('validation', errs.slice(0, 5).join('; ')); }

    const status = await d.status(); std['x-apex-mode'] = status.mode; if (status.trials !== null) std['x-apex-trials'] = String(status.trials);
    const l = await d.ledger();
    // Status is the one route that answers with no ledger: it is how a client finds out there is none. A halt is also taken with no ledger, because stopping must never wait on anything.
    if (!l.ok && m.id !== 'status' && m.id !== 'halt') return problem('unavailable', `The ledger is not readable: ${l.note}`);
    const empty = { entries: [] as LedgerEntry[], view: null as unknown as LedgerView, cfg: null as unknown as ApexConfig };
    const ctx: Ctx = { ...(l.ok ? l : empty), now: (d.now ?? Date.now)(), params: m.params, query: url.searchParams, body, status, actor: viaKey ? `api:${caller.id}` : 'session', deps: d };
    const out = await HANDLERS[m.id](ctx) as unknown;

    if (out && typeof out === 'object' && 'markdown' in out && Object.keys(out).length === 1) return new Response(String((out as { markdown: string }).markdown), { status: 200, headers: { ...std, 'content-type': 'text/markdown; charset=utf-8' } });
    const text = JSON.stringify(out), headers: Record<string, string> = { ...std, 'content-type': 'application/json' };
    if (req.method === 'GET') { const etag = `"${createHash('sha256').update(text).digest('base64url').slice(0, 27)}"`; headers.etag = etag; headers['cache-control'] = 'private, no-cache';
      if ((req.headers.get('if-none-match') ?? '').split(',').map(s => s.trim().replace(/^W\//, '')).includes(etag)) return new Response(null, { status: 304, headers }); }
    return new Response(text, { status: route.status ?? 200, headers });
  } catch (e) {
    if (e instanceof ApiFail) return problem(e.code, e.detail);
    return problem('unavailable', 'The request could not be answered. Nothing was changed by it.');
  }
}
