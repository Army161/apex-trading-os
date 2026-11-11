// Source adapters (docs/design/03 s4). They fetch and normalise, nothing else. All market-data network access goes through here.
// An adapter refuses to fetch for a source that has no entry in data/SOURCES.md (the terms gate).
import type { Bar } from '@apex/engine/core';
import { TF_MS, type SourceAdapter, type Tf } from './types';

export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function getJson(f: Fetch, url: string, headers: Record<string, string>, tries = 3): Promise<any> {
  let last = '';
  for (let k = 0; k < tries; k++) {
    try { const r = await f(url, { headers }); if (r.ok) return await r.json(); last = `HTTP ${r.status}`; if (r.status !== 429 && r.status < 500) break; }
    catch (e: any) { last = String(e?.message ?? e); }
    if (k < tries - 1) await sleep(500 * 2 ** k);
  }
  throw new Error(`data fetch failed after ${tries} tries: ${last}`);      // never includes the URL: it may carry a key
}
const num = (x: unknown, name: string) => { const v = Number(x); if (!Number.isFinite(v)) throw new Error(`provider response changed: ${name} is not a number`); return v; };
const sorted = (bars: Bar[]) => bars.sort((a, b) => a.t - b.t).filter((b, i, a) => i === 0 || b.t > a[i - 1].t);

/** Massive (formerly Polygon.io) aggregates. Key from MASSIVE_API_KEY, sent as a header so it never appears in a URL or a log. */
export function massiveAdapter(key: string, f: Fetch, base = 'https://api.massive.com'): SourceAdapter {
  const span: Partial<Record<Tf, [number, string]>> = { '5m': [5, 'minute'], '15m': [15, 'minute'], '30m': [30, 'minute'], '1h': [1, 'hour'], '1d': [1, 'day'], '1w': [1, 'week'] };
  return { id: 'massive', rateLimit: { perMinute: 5 },
    capabilities: () => ({ tfs: ['5m', '15m', '30m', '1h', '1d', '1w'], assetClasses: ['stock', 'etf', 'fx', 'crypto'], maxHistoryYears: 2, adj: ['raw', 'split'] }),
    async fetchBars(q) {
      if (!key) throw new Error('MASSIVE_API_KEY is not set'); const s = span[q.tf]; if (!s) throw new Error(`massive: timeframe ${q.tf} not supported`);
      const out: Bar[] = []; let url: string | null = `${base}/v2/aggs/ticker/${encodeURIComponent(q.symbol)}/range/${s[0]}/${s[1]}/${q.from}/${q.to}?adjusted=${q.adj !== 'raw'}&sort=asc&limit=50000`;
      for (let page = 0; url && page < 200; page++) {
        const j: any = await getJson(f, url, { Authorization: `Bearer ${key}` });
        if (!j || typeof j !== 'object' || (j.results !== undefined && !Array.isArray(j.results))) throw new Error('provider response changed: massive results is not a list');
        for (const r of j.results ?? []) out.push({ t: num(r.t, 't'), o: num(r.o, 'o'), h: num(r.h, 'h'), l: num(r.l, 'l'), c: num(r.c, 'c'), v: num(r.v ?? 0, 'v') });
        url = typeof j.next_url === 'string' && j.next_url ? j.next_url : null;
      }
      return sorted(out);
    } };
}

/** Alpaca market data (free IEX feed). Paper keys are enough. This adapter only ever talks to the data host. */
export function alpacaAdapter(keyId: string, secret: string, f: Fetch, base = 'https://data.alpaca.markets'): SourceAdapter {
  if (!/^https:\/\/data\.(sandbox\.)?alpaca\.markets$/.test(base)) throw new Error('alpaca data adapter: refusing a non-data host');
  const tfName: Partial<Record<Tf, string>> = { '5m': '5Min', '15m': '15Min', '30m': '30Min', '1h': '1Hour', '1d': '1Day', '1w': '1Week' };
  return { id: 'alpaca', rateLimit: { perMinute: 200 },
    capabilities: () => ({ tfs: ['5m', '15m', '30m', '1h', '1d', '1w'], assetClasses: ['stock', 'etf'], maxHistoryYears: 9, adj: ['raw', 'split', 'total'] }),
    async fetchBars(q) {
      if (!keyId || !secret) throw new Error('Alpaca data keys are not set'); const tf = tfName[q.tf]; if (!tf) throw new Error(`alpaca: timeframe ${q.tf} not supported`);
      const out: Bar[] = []; let token: string | null = '';
      for (let page = 0; token !== null && page < 500; page++) {
        const url = `${base}/v2/stocks/${encodeURIComponent(q.symbol)}/bars?timeframe=${tf}&start=${new Date(q.from).toISOString()}&end=${new Date(q.to).toISOString()}` +
          `&adjustment=${q.adj === 'total' ? 'all' : q.adj}&feed=iex&limit=10000&sort=asc${token ? `&page_token=${encodeURIComponent(token)}` : ''}`;
        const j: any = await getJson(f, url, { 'APCA-API-KEY-ID': keyId, 'APCA-API-SECRET-KEY': secret });
        if (!j || typeof j !== 'object' || (j.bars !== null && j.bars !== undefined && !Array.isArray(j.bars))) throw new Error('provider response changed: alpaca bars is not a list');
        for (const r of j.bars ?? []) { const t = Date.parse(r.t); out.push({ t: num(t, 't'), o: num(r.o, 'o'), h: num(r.h, 'h'), l: num(r.l, 'l'), c: num(r.c, 'c'), v: num(r.v ?? 0, 'v') }); }
        token = typeof j.next_page_token === 'string' && j.next_page_token ? j.next_page_token : null;
      }
      return sorted(out);
    } };
}

/** The terms gate. `sourcesMd` is the text of data/SOURCES.md; a source is usable only if it has a heading there with a "Terms checked:" line. */
export function termsOk(sourcesMd: string, source: string): boolean {
  const m = new RegExp(`^##\\s+${source}\\b[\\s\\S]*?(?=^##\\s)`, 'mi').exec(sourcesMd + '\n## end');
  return !!m && /Terms checked:\s*20\d\d-\d\d-\d\d/.test(m[0]) && !/Status:\s*not accepted/i.test(m[0]);
}
export const tfMs = (tf: Tf) => TF_MS[tf];
