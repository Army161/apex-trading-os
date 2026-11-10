// Persistence: Upstash Redis REST (Vercel Marketplace "Upstash for Redis" sets KV_REST_API_URL/TOKEN) when configured,
// otherwise an in-memory store that resets on cold start (the UI shows a banner in that case).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const persistent = Boolean(URL_ && TOKEN);
const mem = (globalThis as any).__apexMem ?? ((globalThis as any).__apexMem = new Map<string, any>());

async function redis(cmd: (string | number)[]) {
  const r = await fetch(URL_!, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(cmd), cache: 'no-store' });
  const j = await r.json(); if (j.error) throw new Error(j.error); return j.result;
}
export async function getJSON<T>(k: string, d: T): Promise<T> {
  if (!persistent) return mem.has(k) ? mem.get(k) : d;
  const v = await redis(['GET', `apex:${k}`]); return v ? JSON.parse(v) : d;
}
export async function setJSON(k: string, v: unknown) {
  if (!persistent) { mem.set(k, v); return; }
  await redis(['SET', `apex:${k}`, JSON.stringify(v)]);
}
export async function push(k: string, v: unknown, max = 500) {
  if (!persistent) { const a = mem.get(k) ?? []; a.unshift(v); mem.set(k, a.slice(0, max)); return; }
  await redis(['LPUSH', `apex:${k}`, JSON.stringify(v)]); await redis(['LTRIM', `apex:${k}`, 0, max - 1]);
}
export async function list<T>(k: string, n = 100): Promise<T[]> {
  if (!persistent) return (mem.get(k) ?? []).slice(0, n);
  const a: string[] = await redis(['LRANGE', `apex:${k}`, 0, n - 1]); return a.map(x => JSON.parse(x));
}
