// The typed client for v1. The terminal's remote mode, the MCP server and the browser extension reach Apex only through this.
// It can read, start a claim check and pull the halt. It has no call that trades, approves, resumes or changes a limit,
// because the contract has no such route.
import { ROUTES, pathParams, type Bodies, type ClaimCheck, type Page, type Problem, type Receipt, type Responses, type RouteDef, type RouteId } from './contract';

export class ApexApiError extends Error {
  constructor(public problem: Problem, public retryAfterSec: number | null = null) { super(`${problem.title}${problem.detail ? `: ${problem.detail}` : ''}`); this.name = 'ApexApiError'; }
  get code() { return this.problem.code; } get status() { return this.problem.status; }
}
export type ClientOptions = { baseUrl: string; apiKey?: string; fetch?: typeof fetch };
type Args<K extends RouteId> = { params?: Record<string, string>; query?: Record<string, string | number | boolean | undefined> } & (K extends keyof Bodies ? { body: Bodies[K] } : { body?: never });

export class ApexClient {
  private base: string; private key: string; private f: typeof fetch;
  constructor(o: ClientOptions) { this.base = o.baseUrl.replace(/\/+$/, '').replace(/\/api\/v1$/, '') + '/api/v1'; this.key = o.apiKey ?? ''; this.f = o.fetch ?? fetch; }

  private async send<K extends RouteId>(id: K, a: Args<K>): Promise<{ text: string; json: unknown }> {
    const r: RouteDef = ROUTES[id]; let path: string = r.path;
    for (const p of pathParams(r.path)) { const v = a.params?.[p]; if (!v) throw new Error(`${id} needs ${p}`); path = path.replace(`{${p}}`, encodeURIComponent(v)); }
    const qs = new URLSearchParams(); for (const [k, v] of Object.entries(a.query ?? {})) if (v !== undefined) qs.set(k, String(v));
    const res = await this.f(`${this.base}${path}${qs.size ? `?${qs}` : ''}`, { method: r.method, headers: { accept: 'application/json', ...(this.key ? { authorization: `Bearer ${this.key}` } : {}), ...(a.body ? { 'content-type': 'application/json' } : {}) },
      body: a.body ? JSON.stringify(a.body) : undefined });
    const text = await res.text(); let json: unknown = null; try { json = text ? JSON.parse(text) : null; } catch { /* not JSON: a report's Markdown, or an error page handled below */ }
    if (!res.ok) { const p = json as Partial<Problem> | null, retry = Number(res.headers.get('retry-after'));
      throw new ApexApiError({ type: p?.type ?? 'about:blank', title: p?.title ?? `HTTP ${res.status}`, status: res.status, detail: p?.detail, code: p?.code ?? (res.status === 401 ? 'unauthorized' : 'unavailable') }, Number.isFinite(retry) && retry > 0 ? retry : null); }
    return { text, json };
  }

  /** Call one route by its id in the contract. Throws `ApexApiError` with the problem the server sent. */
  async call<K extends RouteId>(id: K, ...rest: K extends keyof Bodies ? [Args<K>] : [Args<K>?]): Promise<Responses[K]> {
    return (await this.send(id, (rest[0] ?? {}) as Args<K>)).json as Responses[K];
  }

  /** One run's report as the Markdown the run wrote. */
  async reportMarkdown(id: string): Promise<string> { return (await this.send('report', { params: { id }, query: { format: 'md' } })).text; }

  /** Every item of a paged route, a page at a time. Stops after `max` items. */
  async *paginate<T>(fn: (cursor: string | undefined) => Promise<Page<T>>, max = 10_000): AsyncGenerator<T> {
    let cursor: string | undefined, seen = 0;
    do { const p = await fn(cursor); for (const x of p.items) { if (seen++ >= max) return; yield x; } cursor = p.next ?? undefined; } while (cursor);
  }

  /** The recorded check, asked for until it is there. A check that was just accepted is normally recorded already. */
  async waitForClaimCheck(id: string, o: { timeoutMs?: number; everyMs?: number } = {}): Promise<ClaimCheck> {
    const until = Date.now() + (o.timeoutMs ?? 300_000);
    for (;;) {
      try { return await this.call('claimCheck', { params: { id } }); }
      catch (e) { if (!(e instanceof ApexApiError) || e.code !== 'not_found' || Date.now() >= until) throw e; }
      await new Promise(r => setTimeout(r, o.everyMs ?? 2000));
    }
  }
}

// ---- receipts ----
const roundSig = (x: number) => { if (!Number.isFinite(x)) return x; if (Number.isInteger(x) && Math.abs(x) < 1e15) return x === 0 ? 0 : x; const r = Number(x.toPrecision(10)); return r === 0 ? 0 : r; };
/** The ledger's canonical JSON: sorted keys, numbers rounded to ten significant digits. It must match `packages/kernel/src/canonical.ts`; a test holds the two together. */
export function canonicalJson(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(roundSig(v)) : 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}'; }
  throw new Error(`canonicalJson: cannot encode ${typeof v}`);
}
async function sha256(s: string) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }

/** Recompute a receipt on your own machine: the payload must hash to `payloadHash`, and the entry's fields must hash to `hash`.
 *  With `prev`, the receipt must also follow it. This does not need to trust the server that sent the receipt. */
export async function verifyReceipt(receipt: Receipt, payload?: unknown, prev?: Pick<Receipt, 'seq' | 'hash'>): Promise<{ ok: boolean; why: string | null }> {
  const ts = Date.parse(receipt.ts); if (!Number.isInteger(ts)) return { ok: false, why: 'the time is not readable' };
  if (payload !== undefined && await sha256(canonicalJson(payload)) !== receipt.payloadHash) return { ok: false, why: 'the payload does not match its hash' };
  if (await sha256(`${receipt.prevHash}|${receipt.seq}|${ts}|${receipt.kind}|${receipt.actor}|${receipt.payloadHash}`) !== receipt.hash) return { ok: false, why: 'the entry hash does not match its fields' };
  if (prev && (receipt.seq !== prev.seq + 1 || receipt.prevHash !== prev.hash)) return { ok: false, why: 'the receipt does not follow the one before it' };
  return { ok: true, why: null };
}
