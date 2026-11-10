// AI spend tracking (archive/chat/29: "set a billing alert so you don't get a surprise invoice").
// Every Claude call in the dashboard records its token usage here. Daily totals are estimated from list prices and
// a Telegram alert fires once a day when APEX_AI_DAILY_BUDGET (USD, default 5) is passed; at 2x the budget AI calls stop
// until tomorrow. This is an estimate: set a hard spend limit in the Anthropic Console too.
import { getJSON, setJSON } from './store';
import { sendTelegram } from './telegram';

// USD per million tokens [input, output, cache read]. Web search is billed separately at about $10 per 1,000 searches.
const PRICE: Record<string, [number, number, number]> = {
  'claude-opus-5-5': [4, 20, 0.2], 'claude-sonnet-5-5': [2, 10, 0.1], 'claude-haiku-5-5': [0.1, 0.5, 0.01], 'claude-fable-5-2': [8, 40, 0.2],
};
export const BUDGET = Number(process.env.APEX_AI_DAILY_BUDGET || 5);
const day = () => new Date().toISOString().slice(0, 10);

export function cost(model: string, u: any) {
  const p = PRICE[model] ?? PRICE['claude-opus-5-5'];
  const inTok = (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0) * 1.25, out = u?.output_tokens ?? 0, cache = u?.cache_read_input_tokens ?? 0;
  const searches = u?.server_tool_use?.web_search_requests ?? 0;
  return (inTok * p[0] + out * p[1] + cache * p[2]) / 1e6 + searches * 0.01;
}

export type Day = { date: string; usd: number; calls: number; inTok: number; outTok: number; byFeature: Record<string, number>; alerted?: boolean };

export async function record(feature: string, model: string, u: any) {
  const k = `usage:${day()}`;
  const d = await getJSON<Day>(k, { date: day(), usd: 0, calls: 0, inTok: 0, outTok: 0, byFeature: {} });
  const c = cost(model, u);
  d.usd += c; d.calls++; d.inTok += u?.input_tokens ?? 0; d.outTok += u?.output_tokens ?? 0; d.byFeature[feature] = (d.byFeature[feature] ?? 0) + c;
  if (!d.alerted && d.usd >= BUDGET) {
    d.alerted = true;
    await sendTelegram(`Apex AI spend alert: about $${d.usd.toFixed(2)} today (budget $${BUDGET}). Biggest: ${Object.entries(d.byFeature).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, v]) => `${f} $${v.toFixed(2)}`).join(', ')}. AI calls stop at $${(2 * BUDGET).toFixed(2)} until tomorrow.`);
  }
  await setJSON(k, d);
  return d;
}

/** Throws when today's estimated spend is past twice the budget, so a runaway loop can't keep billing. */
export async function guard() {
  const d = await getJSON<Day | null>(`usage:${day()}`, null);
  if (d && d.usd >= 2 * BUDGET) throw new Error(`AI paused for today: estimated spend $${d.usd.toFixed(2)} is past 2x the $${BUDGET} daily budget (APEX_AI_DAILY_BUDGET).`);
}

export async function recentUsage(days = 14) {
  const out: Day[] = [];
  for (let i = 0; i < days; i++) { const dt = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); const d = await getJSON<Day | null>(`usage:${dt}`, null); if (d) out.push(d); }
  return { budget: BUDGET, days: out };
}
