import axios from 'axios';
import { config } from './config.js';
import type { Fill, Trade } from './types.js';

const CLOB = 'https://clob.polymarket.com';

export function copySize(targetUsdc: number) {
  return Math.min(config.maxTrade, Math.max(0, targetUsdc * config.multiplier));
}

/** Walks the live order book to estimate the fill we would get. Used for PAPER fills and as a live pre-check. */
export async function simulateFill(tokenId: string, side: 'BUY' | 'SELL', notional: number, ref: number) {
  const { data } = await axios.get(`${CLOB}/book`, { params: { token_id: tokenId }, timeout: 8000 });
  const levels: { price: string; size: string }[] = side === 'BUY' ? data.asks ?? [] : data.bids ?? [];
  levels.sort((a, b) => (side === 'BUY' ? +a.price - +b.price : +b.price - +a.price));
  let spent = 0, shares = 0;
  for (const l of levels) {
    const p = +l.price, s = +l.size;
    const limit = side === 'BUY' ? ref * (1 + config.slippage) : ref * (1 - config.slippage);
    if (side === 'BUY' ? p > limit : p < limit) break;
    const take = Math.min(s, (notional - spent) / p);
    spent += take * p; shares += take;
    if (spent >= notional - 1e-9) break;
  }
  return { shares, spent, avg: shares ? spent / shares : 0, complete: spent >= notional * 0.999 };
}

export class Executor {
  private client: any = null;

  async init() {
    if (config.mode !== 'live') return;
    // Lazy import so paper mode never needs a key or the signing stack.
    const { ClobClient, Side, OrderType } = await import('@polymarket/clob-client');
    const { Wallet } = await import('ethers');
    const wallet = new Wallet(config.privateKey);
    const base = new ClobClient(CLOB, 137, wallet as any);
    let creds: any = await base.deriveApiKey().catch(() => null);
    if (!creds?.secret) creds = await base.createApiKey();
    const key = creds.apiKey ?? creds.key;
    if (!key || !creds.secret || !creds.passphrase) throw new Error('Could not create/derive Polymarket API key');
    this.client = new ClobClient(CLOB, 137, wallet as any, { key, secret: creds.secret, passphrase: creds.passphrase }, 0, wallet.address, config.geoToken);
    this.client._Side = Side; this.client._OrderType = OrderType;
  }

  async execute(trade: Trade, notional: number, side: 'BUY' | 'SELL', shares?: number): Promise<Fill> {
    const sim = await simulateFill(trade.tokenId, side, notional, trade.price);
    if (!sim.complete && config.orderType === 'FOK') throw new Error(`book too thin within ${config.slippage * 100}% slippage (FOK would fail)`);
    if (config.mode === 'paper') {
      return { tokenId: trade.tokenId, side, shares: shares ?? sim.shares, price: sim.avg, notional: sim.spent, orderId: `paper-${Date.now()}`, paper: true };
    }
    const c = this.client;
    const limit = side === 'BUY' ? Math.min(0.99, trade.price * (1 + config.slippage)) : Math.max(0.01, trade.price * (1 - config.slippage));
    const order = await c.createMarketOrder({ tokenID: trade.tokenId, side: side === 'BUY' ? c._Side.BUY : c._Side.SELL, amount: side === 'BUY' ? notional : (shares ?? sim.shares), price: limit });
    const res = await c.postOrder(order, c._OrderType[config.orderType]);
    if (!res?.success) throw new Error(res?.errorMsg || 'order rejected');
    return { tokenId: trade.tokenId, side, shares: shares ?? sim.shares, price: sim.avg, notional: sim.spent, orderId: res.orderID, paper: false };
  }
}

/** Retry policy from the guide: retry network/rate-limit/5xx, never auth, geo, allowance, invalid or duplicate errors. */
export function isRetryable(e: any) {
  const m = String(e?.message ?? '').toLowerCase();
  const s = e?.response?.status;
  if (s === 401 || s === 403 || /unauthorized|cloudflare|blocked|insufficient|allowance|invalid|duplicate/.test(m)) return false;
  return /network|timeout|econnreset|rate limit|502|503|504/.test(m);
}
