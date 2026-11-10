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

export async function pollCommand(): Promise<string | null> {
  if (!config.dashboardUrl) return null;
  try {
    const r = await axios.get(`${config.dashboardUrl}/api/bots/${bot.id}/command`, { headers: { 'x-apex-token': config.ingestToken }, timeout: 8000 });
    return r.data?.command ?? null;
  } catch { return null; }
}
