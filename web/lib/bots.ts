import { getJSON, setJSON, push, list } from './store';
export type BotInfo = { id: string; kind: string; name: string; mode: string; source: string; run: string; lastSeen?: number; status?: any };
// Every bot Apex ships. They show as "not connected" until they send their first heartbeat to /api/ingest.
export const CATALOG: BotInfo[] = [
  { id: 'freqtrade', kind: 'crypto', name: 'Freqtrade (Turtle / Confluence)', mode: 'dry-run', source: 'chat/20, chat/03, chat/17', run: 'cd bots/freqtrade && docker compose up -d' },
  { id: 'solana-copy', kind: 'solana', name: 'Solana Copy Bot (pump/bonk)', mode: 'paper', source: 'chat/23', run: 'cd bots/solana-copy && npm i && npm start' },
  { id: 'polymarket-copy', kind: 'polymarket', name: 'Polymarket Copy Bot', mode: 'paper', source: 'chat/02', run: 'cd bots/polymarket-copy && npm i && npm start' },
  { id: 'maker-clip-keeper', kind: 'keeper', name: 'Maker/Sky Clip Keeper', mode: 'watch', source: 'chat/01 (modernised)', run: 'cd bots/maker-clip-keeper && python keeper.py' },
  { id: 'alpaca-core-sleeves', kind: 'alpaca', name: 'ETF Core + Sleeves', mode: 'paper', source: 'uploads/01', run: 'cd bots/alpaca && python nightly.py --send' },
  { id: 'day-trader', kind: 'alpaca', name: 'Day Trader Desk (11 skills)', mode: 'paper', source: 'chat/22', run: 'cd bots/alpaca/daytrader && python desk.py scan' },
  { id: 'research-council', kind: 'research', name: 'AI Research Council', mode: 'proposal', source: 'chat/20 (TradingAgents style)', run: 'cd bots/research-council && python council.py BTCUSDT' },
  { id: 'tv-signals', kind: 'tradingview', name: 'TradingView Signals', mode: 'alerts', source: 'chat/03-05, uploads/15', run: 'Pine scripts in bots/tradingview-bridge/pine' },
  { id: 'engine-paper', kind: 'engine', name: 'Engine Paper Trader', mode: 'paper', source: 'all strategy courses', run: 'cd engine && python -m apex_engine paper turtle_55_20' },
];
export async function bots(): Promise<BotInfo[]> {
  const seen = await getJSON<Record<string, BotInfo>>('bots', {});
  const ids = new Set(CATALOG.map(b => b.id));
  const merged = CATALOG.map(b => ({ ...b, ...(seen[b.id] ?? {}), name: b.name, source: b.source, run: b.run }));
  for (const [id, b] of Object.entries(seen)) if (!ids.has(id) && !CATALOG.some(c => id.startsWith(c.id))) merged.push(b);
  return merged;
}
export async function upsertBot(b: Partial<BotInfo> & { id: string }) {
  const seen = await getJSON<Record<string, BotInfo>>('bots', {});
  const key = CATALOG.find(c => b.id === c.id || b.id.startsWith(c.id))?.id ?? b.id;
  seen[key] = { ...(seen[key] ?? {} as BotInfo), ...b, id: key, lastSeen: Date.now() } as BotInfo;
  await setJSON('bots', seen);
  return key;
}
export async function setCommand(id: string, command: string) { await setJSON(`cmd:${id}`, { command, at: Date.now() }); await push('events', { ts: Date.now(), bot: id, level: 'control', message: `command ${command} queued` }); }
export async function takeCommand(id: string) { const c = await getJSON<any>(`cmd:${id}`, null); if (c) await setJSON(`cmd:${id}`, null); return c?.command ?? null; }
export const events = (n = 100) => list<any>('events', n);
export const trades = (n = 200) => list<any>('trades', n);
