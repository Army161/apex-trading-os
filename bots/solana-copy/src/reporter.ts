import { config } from './config.js';

const bot = () => ({ id: 'solana-copy', kind: 'solana', name: 'Solana Copy Bot', mode: config.mode === 'live' && config.allowLive ? 'live' : 'paper' });
const headers = () => ({ 'content-type': 'application/json', 'x-apex-token': config.ingestToken });

export async function report(payload: Record<string, unknown>) {
  const body = { bot: bot(), ts: Date.now() / 1000, ...payload };
  console.log(JSON.stringify(body).slice(0, 300));
  if (!config.dashboardUrl) return null;
  try { const r = await fetch(`${config.dashboardUrl}/api/ingest`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(8000) }); return await r.json(); }
  catch (e: any) { console.log(`[reporter] dashboard unreachable: ${e.message}`); return null; }
}
export async function pollCommand(): Promise<string | null> {
  if (!config.dashboardUrl) return null;
  try { const r = await fetch(`${config.dashboardUrl}/api/bots/solana-copy/command`, { headers: headers(), signal: AbortSignal.timeout(8000) }); return ((await r.json()) as any).command ?? null; }
  catch { return null; }
}
export const event = (level: string, message: string) => report({ type: 'event', level, message });
