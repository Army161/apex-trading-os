import axios from 'axios';
import { config } from './config.js';

const bot = { id: 'polymarket-copy', kind: 'polymarket', name: 'Polymarket Copy', mode: config.mode };

export async function report(payload: Record<string, unknown>) {
  const body = { bot, ts: Date.now() / 1000, ...payload };
  console.log(JSON.stringify(body).slice(0, 300));
  if (!config.dashboardUrl) return null;
  try {
    const r = await axios.post(`${config.dashboardUrl}/api/ingest`, body, { headers: { 'x-apex-token': config.ingestToken }, timeout: 8000 });
    return r.data;
  } catch (e: any) { console.log(`[reporter] dashboard unreachable: ${e.message}`); return null; }
}

// The dashboard keeps handing out a command until this bot acknowledges it by its ref. The caller applies it in the same tick.
export async function pollCommand(): Promise<string | null> {
  if (!config.dashboardUrl) return null;
  try {
    const url = `${config.dashboardUrl}/api/bots/${bot.id}/command`, h = { 'x-apex-token': config.ingestToken };
    const r = await axios.get(url, { headers: h, timeout: 8000 });
    if (r.data?.ref) await axios.delete(url, { headers: h, params: { ref: r.data.ref }, timeout: 8000 }).catch(() => null);
    return r.data?.command ?? null;
  } catch { return null; }
}
