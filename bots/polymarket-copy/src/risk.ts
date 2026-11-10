import { config } from './config.js';
import type { Positions } from './positions.js';
import type { Trade } from './types.js';

/** Session + per-market notional caps (guide step 7) plus price-band and kill-switch checks added by Apex. */
export class RiskManager {
  sessionNotional = 0;
  paused = false;
  constructor(private positions: Positions) {}
  check(trade: Trade, copyNotional: number): { allowed: boolean; reason?: string } {
    if (this.paused) return { allowed: false, reason: 'bot paused from dashboard' };
    if (copyNotional <= 0) return { allowed: false, reason: 'Copy notional is <= 0' };
    if (trade.price < config.risk.minPrice || trade.price > config.risk.maxPrice)
      return { allowed: false, reason: `price ${trade.price} outside band ${config.risk.minPrice}-${config.risk.maxPrice} (near-certain outcomes have no edge left)` };
    const r = config.risk;
    if (r.maxSessionNotional > 0 && this.sessionNotional + copyNotional > r.maxSessionNotional)
      return { allowed: false, reason: `Session notional cap exceeded (${(this.sessionNotional + copyNotional).toFixed(2)} > ${r.maxSessionNotional})` };
    if (r.maxPerMarketNotional > 0 && this.positions.notional(trade.tokenId) + copyNotional > r.maxPerMarketNotional)
      return { allowed: false, reason: `Per-market notional cap exceeded` };
    return { allowed: true };
  }
  onFill(notional: number, side: 'BUY' | 'SELL') { if (side === 'BUY') this.sessionNotional += notional; }
}
