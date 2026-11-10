import WebSocket from 'ws';
import { config, validate } from './config.js';
import { TradeMonitor } from './monitor.js';
import { Positions } from './positions.js';
import { RiskManager } from './risk.js';
import { Executor, copySize, isRetryable } from './executor.js';
import { report, pollCommand } from './reporter.js';
import type { Trade } from './types.js';

validate();
const monitor = new TradeMonitor();
const positions = new Positions();
const risk = new RiskManager(positions);
const exec = new Executor();
const stats = { detected: 0, copied: 0, failed: 0, blocked: 0, volume: 0, paperCash: config.paperBankroll };
const prices = new Map<string, number>();

async function handle(trade: Trade) {
  stats.detected++;
  console.log(`🎯 ${trade.side} ${trade.usdc.toFixed(2)} USDC @ ${trade.price} | ${trade.title} [${trade.outcome}]`);
  if (trade.side === 'SELL' && !config.copySells) { console.log('⚠️  Skipping SELL trade (BUY-only safeguard enabled)'); return; }
  if (trade.side === 'SELL' && positions.shares(trade.tokenId) <= 0) return;
  subscribe(trade.tokenId);
  const notional = trade.side === 'BUY' ? copySize(trade.usdc) : positions.shares(trade.tokenId) * trade.price;
  if (trade.side === 'BUY' && notional < config.minTrade) { stats.blocked++; return; }
  if (trade.side === 'BUY') {
    const rc = risk.check(trade, notional);
    if (!rc.allowed) { stats.blocked++; await report({ type: 'event', level: 'blocked', message: rc.reason }); return; }
    if (config.mode === 'paper' && notional > stats.paperCash) { stats.blocked++; return; }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const f = await exec.execute(trade, notional, trade.side, trade.side === 'SELL' ? positions.shares(trade.tokenId) : undefined);
      positions.record(trade.tokenId, trade.market, trade.outcome, f.side, f.shares, f.notional);
      risk.onFill(f.notional, f.side);
      stats.copied++; stats.volume += f.notional;
      if (f.paper) stats.paperCash += f.side === 'BUY' ? -f.notional : f.notional;
      await report({ type: 'trade', trade: { ...f, market: trade.market, title: trade.title, outcome: trade.outcome, status: 'filled', source_trade: trade.id } });
      console.log(`✅ ${f.paper ? 'PAPER ' : ''}copied: ${f.shares.toFixed(2)} sh @ ${f.price.toFixed(3)} = ${f.notional.toFixed(2)} USDC`);
      return;
    } catch (e: any) {
      if (!isRetryable(e) || attempt === 2) { stats.failed++; console.log(`❌ Failed to copy trade: ${e.message}`); await report({ type: 'event', level: 'error', message: e.message }); return; }
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

// Market websocket: live prices for mark-to-market of copied positions (guide step 5).
let ws: WebSocket | null = null;
const assets = new Set<string>();
function subscribe(tokenId: string) {
  if (!config.useWebsocket || assets.has(tokenId)) return;
  assets.add(tokenId);
  if (!ws) {
    ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
    ws.on('open', () => ws!.send(JSON.stringify({ type: 'market', assets_ids: [...assets] })));
    ws.on('message', (m) => {
      try {
        for (const ev of [].concat(JSON.parse(m.toString()))) {
          const e: any = ev;
          if (e.asset_id && e.price) prices.set(e.asset_id, Number(e.price));
        }
      } catch { /* ignore keepalives */ }
    });
    ws.on('close', () => { ws = null; setTimeout(() => [...assets].forEach(a => { assets.delete(a); subscribe(a); }), 3000); });
  } else if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'market', assets_ids: [tokenId], operation: 'subscribe' }));
}

async function main() {
  console.log(`🤖 Apex Polymarket Copy Bot | mode=${config.mode.toUpperCase()} | target=${config.targetWallet}`);
  await exec.init();
  setInterval(async () => {
    const cmd = await pollCommand();
    if (cmd === 'pause') risk.paused = true;
    if (cmd === 'resume') risk.paused = false;
    if (cmd === 'kill') { await report({ type: 'event', level: 'info', message: 'killed from dashboard' }); process.exit(0); }
    const open = positions.all().map(p => ({ ...p, mark: prices.get(p.tokenId) ?? p.avgPrice, upnl: ((prices.get(p.tokenId) ?? p.avgPrice) - p.avgPrice) * p.shares }));
    await report({ type: 'heartbeat', status: { ...stats, paused: risk.paused, sessionNotional: risk.sessionNotional, positions: open,
      equity: stats.paperCash + open.reduce((s, p) => s + p.mark * p.shares, 0) } });
  }, 30_000);
  for (;;) {
    try { for (const t of await monitor.poll()) await handle(t); }
    catch (e: any) { console.log(`poll error: ${e.message}`); }
    await new Promise(r => setTimeout(r, config.pollMs));
  }
}
main();
