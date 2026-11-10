import type { Bar } from './engine/core';
// Public candle sources with automatic fallback (some exchanges geo-block US cloud regions).
const TF_MS: Record<string, number> = { '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 };
export const TIMEFRAMES = Object.keys(TF_MS);
const j = async (u: string) => { const r = await fetch(u, { headers: { 'user-agent': 'apex-dashboard' }, next: { revalidate: 60 } }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };

async function binance(sym: string, tf: string, limit: number, base = 'https://api.binance.com') {
  const out: Bar[] = []; let end: number | undefined;
  while (out.length < limit) {
    const n = Math.min(1000, limit - out.length);
    const rows: any[] = await j(`${base}/api/v3/klines?symbol=${sym}&interval=${tf}&limit=${n}${end ? `&endTime=${end}` : ''}`);
    if (!rows.length) break; out.unshift(...rows.map(r => ({ t: r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }))); end = rows[0][0] - 1; if (rows.length < n) break;
  }
  return out;
}
async function bybit(sym: string, tf: string, limit: number) {
  const iv: Record<string, string> = { '15m': '15', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' };
  const d = await j(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}&interval=${iv[tf]}&limit=${Math.min(limit, 1000)}`);
  return (d.result.list as any[]).map(r => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] })).reverse();
}
async function okx(sym: string, tf: string, limit: number) {
  const inst = sym.replace(/USDT$/, '-USDT'); const bar: Record<string, string> = { '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1Dutc', '1w': '1Wutc' };
  const out: Bar[] = []; let after = '';
  while (out.length < limit) {
    const d = await j(`https://www.okx.com/api/v5/market/history-candles?instId=${inst}&bar=${bar[tf]}&limit=100${after ? `&after=${after}` : ''}`);
    const rows: any[] = d.data; if (!rows?.length) break;
    out.unshift(...rows.map(r => ({ t: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] })).reverse()); after = rows[rows.length - 1][0];
  }
  return out;
}
async function coinbase(sym: string, tf: string, limit: number) {
  const g = TF_MS[tf] / 1000; if (![900, 3600, 86400].includes(g)) throw new Error('coinbase tf');
  const prod = sym.replace(/USDT$/, '-USD'); const out: Bar[] = []; let end = Date.now();
  while (out.length < limit) {
    const start = end - 300 * g * 1000;
    const rows: any[] = await j(`https://api.exchange.coinbase.com/products/${prod}/candles?granularity=${g}&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`);
    if (!rows.length) break; out.unshift(...rows.map(r => ({ t: r[0] * 1000, o: r[3], h: r[2], l: r[1], c: r[4], v: r[5] })).reverse()); end = start;
  }
  return out;
}
// Shared data hub (idea from archive/chat/30): every screen, cron and AI tool asks for candles through here, so the same
// symbol/timeframe is fetched once per warm server instance and shared. Entries live a quarter of a bar (30s to 10 min),
// and calls that arrive while a fetch is in flight wait for that same fetch instead of starting another.
const HUB = new Map<string, { at: number; p: Promise<{ bars: Bar[]; source: string }> }>();
export function hubStats() { return { entries: HUB.size, keys: [...HUB.keys()].slice(0, 30) }; }
export async function candles(sym = 'BTCUSDT', tf = '1d', limit = 1000): Promise<{ bars: Bar[]; source: string }> {
  const key = `${sym}|${tf}|${limit}`, ttl = Math.min(6e5, Math.max(3e4, (TF_MS[tf] ?? 864e5) / 4)), hit = HUB.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.p;
  const p = fetchCandles(sym, tf, limit); HUB.set(key, { at: Date.now(), p });
  p.catch(() => HUB.delete(key)); if (HUB.size > 200) HUB.delete(HUB.keys().next().value!);
  return p;
}
async function fetchCandles(sym: string, tf: string, limit: number): Promise<{ bars: Bar[]; source: string }> {
  const errs: string[] = [];
  for (const [name, fn] of [['binance', (s: string, t: string, l: number) => binance(s, t, l)], ['binance.us', (s: string, t: string, l: number) => binance(s, t, l, 'https://api.binance.us')],
    ['okx', okx], ['bybit', bybit], ['coinbase', coinbase]] as const) {
    try { const b = await (fn as any)(sym, tf, limit); if (b.length > 50) { const dedup = b.filter((x: Bar, i: number) => i === 0 || x.t > b[i - 1].t); return { bars: dedup.slice(0, -1), source: name }; } }
    catch (e: any) { errs.push(`${name}: ${e.message}`); }
  }
  throw new Error(`all candle sources failed: ${errs.join(' | ')}`);
}
