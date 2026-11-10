// Apex Solana copy bot. Copies buys (and optionally sells) of chosen wallets on pump.fun / bonk tokens, with the Trade Wiz
// settings from archive/chat/23 plus hard caps. PAPER mode by default: real quotes, simulated fills, no transactions sent.
import { Connection, PublicKey } from '@solana/web3.js';
import { config, validate, isLive } from './config.js';
import { Watcher } from './solana.js';
import { tokenInfo } from './market.js';
import { Executor } from './executor.js';
import { entryBlock, exitDecision, openPosition, pvpMuted, sizeSol, copySellFraction } from './rules.js';
import { load, save, stats, rollDay, type State } from './state.js';
import { report, pollCommand, event } from './reporter.js';
import type { SwapEvent, Position } from './types.js';

validate();
const conn = new Connection(config.rpcUrl, 'confirmed');
const watcher = new Watcher(conn), ex = new Executor(conn);
const s: State = load(config.paperBankrollSol);
const recent: SwapEvent[] = [];
let stopping = false;

async function sellPart(p: Position, frac: number, reason: string) {
  const qty = frac >= 1 ? p.tokens : p.tokens * frac; if (qty <= 0) return;
  const f = await ex.sell(p.mint, qty);
  if (!f.ok) { await event('error', `sell ${p.symbol ?? p.mint.slice(0, 6)} failed: ${f.error}`); return; }
  p.tokens -= qty; p.realizedSol += f.sol; if (!isLive()) s.cashSol += f.sol;
  await report({ type: 'trade', trade: { symbol: p.symbol ?? p.mint.slice(0, 8), side: 'sell', price: f.sol / qty, qty, reason, status: p.tokens <= 1e-9 ? 'closed' : 'partial', sig: f.sig,
    pnl: p.tokens <= 1e-9 ? +(p.realizedSol - p.costSol).toFixed(5) : undefined } });
  if (p.tokens <= 1e-9) {
    const pnl = p.realizedSol - p.costSol; s.dayPnlSol += pnl;
    s.closed.push({ mint: p.mint, symbol: p.symbol, source: p.source, openedAt: p.openedAt, closedAt: Date.now(), costSol: p.costSol, proceedsSol: p.realizedSol, pnlSol: pnl, reason });
    delete s.positions[p.mint];
    if (s.dayPnlSol <= -config.maxDailyLossSol) { s.paused = true; await event('risk', `daily loss limit hit (${s.dayPnlSol.toFixed(3)} SOL). New buys paused until tomorrow or a resume.`); }
  }
}

async function onSwap(e: SwapEvent) {
  recent.push(e); while (recent.length > 2000) recent.shift();
  const pvp = pvpMuted(recent.filter(r => r.wallet === e.wallet), Date.now(), config.pvp);
  if (pvp.muted && !s.muted[e.wallet]) { s.muted[e.wallet] = Date.now(); await event('risk', `anti-PVP: muted ${e.wallet.slice(0, 6)} after ${pvp.flips} fast flips (likely farming copy traders)`); }
  const mine = s.positions[e.mint];
  if (e.side === 'sell') {
    if (mine && config.copySells && mine.source === e.wallet) {
      const held = await watcher.tokenBalance(e.wallet, e.mint).catch(() => 0);
      await sellPart(mine, copySellFraction(e.tokens, held + e.tokens), 'copied target sell');
    }
    return;
  }
  if (s.paused || s.muted[e.wallet]) return;
  if (Object.keys(s.positions).length >= config.maxOpen) return void event('skip', `max ${config.maxOpen} open positions`);
  const t = await tokenInfo(e.mint).catch(() => null); if (!t) return;
  const block = entryBlock(t, config.filters, Date.now(), s.bought.includes(e.mint));
  if (block) return void console.log(`[skip] ${t.symbol ?? e.mint.slice(0, 6)}: ${block}`);
  const cash = isLive() ? (await conn.getBalance(new PublicKey(ex.pubkey!))) / 1e9 : s.cashSol;
  const sol = sizeSol(e.sol, config.sizing, cash, config.priorityFeeSol + config.tipSol + 0.01);
  if (sol < 0.001) return void event('skip', 'size too small or no cash left');
  const f = await ex.buy(e.mint, sol);
  if (!f.ok) return void event('error', `buy ${t.symbol ?? e.mint.slice(0, 6)} failed: ${f.error}`);
  if (!isLive()) s.cashSol -= f.sol;
  s.positions[e.mint] = openPosition(e.mint, e.wallet, f.sol, f.tokens, Date.now(), config.exits, t.symbol); s.bought.push(e.mint);
  await report({ type: 'trade', trade: { symbol: t.symbol ?? e.mint.slice(0, 8), side: 'buy', price: f.sol / f.tokens, qty: f.tokens, status: 'open', mcap_usd: Math.round(t.mcapUsd), impact_pct: +f.impactPct.toFixed(2), copied: e.wallet, sig: f.sig } });
}

async function manageExits() {
  for (const p of Object.values(s.positions)) {
    const t = await tokenInfo(p.mint).catch(() => null); if (!t?.priceSol) continue;
    const a = exitDecision(p, t.priceSol, config.exits); if (a) await sellPart(p, a.frac, a.reason);
  }
}

async function tick() {
  rollDay(s);
  const cmd = await pollCommand();
  if (cmd === 'pause') s.paused = true; else if (cmd === 'resume') s.paused = false; else if (cmd === 'kill') stopping = true;
  for (const w of config.targets) { try { for (const e of await watcher.poll(w)) await onSwap(e); } catch (err: any) { console.log(`[watch ${w.slice(0, 6)}] ${err.message}`); } }
  await manageExits(); save(s);
}

console.log(`Apex Solana copy bot: ${isLive() ? 'LIVE' : 'PAPER'} mode, copying ${config.targets.length} wallet(s)`);
await event('info', `started in ${isLive() ? 'LIVE' : 'PAPER'} mode, ${config.targets.length} target wallet(s)`);
let beat = 0;
while (!stopping) {
  try { await tick(); } catch (e: any) { await event('error', e.message); }
  if (Date.now() - beat > 60_000) { beat = Date.now(); await report({ type: 'heartbeat', status: { ...stats(s), mode: isLive() ? 'live' : 'paper', wallet: ex.pubkey } }); }
  await new Promise(r => setTimeout(r, config.pollMs));
}
save(s); await event('control', 'stopped by kill command');
