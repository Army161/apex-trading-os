import { getJSON, setJSON, push, list } from './store';
import { botCommand, type Cord } from './andon';
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
// A dashboard command for one bot. It stays queued, and is handed out on every poll by that bot, until the bot acknowledges
// it by its ref or a newer command replaces it. Nothing else reads it away: a heartbeat or trade report never touches it.
export type BotCmd = 'pause' | 'resume' | 'kill';
export type BotControl = { command: BotCmd; ref: string; at: number };
export type CommandReply = { command: string | null; ref: string | null; halted: boolean; why: string | null };
/** The catalog row a bot id belongs to: the same mapping upsertBot uses, so a command reaches the bot the dashboard row shows. */
export const botKey = (id: string) => CATALOG.find(c => id === c.id || id.startsWith(c.id))?.id ?? id;
const CMDS: readonly string[] = ['pause', 'resume', 'kill'];
/** What a polling bot is told. Pure. A halt (kill switch or andon) wins and leaves the queued command in place for after release.
 *  `halted` is true while the last dashboard command for this bot is pause or kill, acknowledged or not. */
export function commandReply(killswitch: boolean, cord: Cord, ctl: BotControl | null, ackedRef: string | null): CommandReply {
  const pending = ctl && ctl.ref !== ackedRef ? ctl : null, halt = killswitch || cord.on;
  return { command: botCommand(killswitch, cord, pending?.command ?? null), ref: halt ? null : pending?.ref ?? null,
    halted: halt || ctl?.command === 'pause' || ctl?.command === 'kill',
    why: killswitch ? 'kill switch is on' : cord.on ? `andon cord: ${cord.reason ?? 'pulled'}` : ctl && ctl.command !== 'resume' ? `${ctl.command} from the dashboard` : null };
}
/** The last command for a bot. An older stored shape (no ref) still reads as pending; anything unreadable reads as pause. */
export async function botControl(id: string): Promise<BotControl | null> {
  const c = await getJSON<any>(`cmd:${botKey(id)}`, null);
  if (!c) return null;
  return { command: CMDS.includes(c.command) ? c.command : 'pause', ref: typeof c.ref === 'string' && c.ref ? c.ref : `c${Number(c.at) || 0}`, at: Number(c.at) || 0 };
}
export const ackedRef = (id: string) => getJSON<string | null>(`cmdack:${botKey(id)}`, null);
export async function setCommand(id: string, command: string) {
  const k = botKey(id), ref = globalThis.crypto.randomUUID();
  await setJSON(`cmd:${k}`, { command, ref, at: Date.now() });
  await push('events', { ts: Date.now(), bot: k, level: 'control', message: `command ${command} queued` });
  return ref;
}
/** The bot says it has the command with this ref. A ref that is not the current one changes nothing. The ack is kept apart from
 *  the command, so an ack racing a newer command can never overwrite or clear that newer command. */
export async function ackCommand(id: string, ref: string): Promise<'acked' | 'stale'> {
  const k = botKey(id), c = await botControl(k);
  if (!c || !ref || c.ref !== ref) return 'stale';
  if ((await ackedRef(k)) !== ref) { await setJSON(`cmdack:${k}`, ref); await push('events', { ts: Date.now(), bot: k, level: 'control', message: `command ${c.command} received by the bot` }); }
  return 'acked';
}
export const events = (n = 100) => list<any>('events', n);
export const trades = (n = 200) => list<any>('trades', n);
