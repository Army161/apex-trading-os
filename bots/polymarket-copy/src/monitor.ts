import axios from 'axios';
import { config } from './config.js';
import type { Trade } from './types.js';

const DATA = 'https://data-api.polymarket.com';

/** Discovery layer: polls the Data API /activity endpoint for the target wallet's TRADE events. */
export class TradeMonitor {
  private seen = new Set<string>();
  private since = Math.floor(Date.now() / 1000) - 60;

  async poll(): Promise<Trade[]> {
    const { data } = await axios.get(`${DATA}/activity`, {
      params: { user: config.targetWallet, type: 'TRADE', limit: 100, sortBy: 'TIMESTAMP', sortDirection: 'DESC', start: this.since },
      headers: { Accept: 'application/json' }, timeout: 10_000,
    });
    const out: Trade[] = [];
    for (const a of (data as any[]).reverse()) {
      const id = `${a.transactionHash}:${a.asset}:${a.side}:${a.size}`;
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      this.since = Math.max(this.since, Number(a.timestamp));
      out.push({ id, timestamp: Number(a.timestamp) * 1000, market: a.conditionId, tokenId: a.asset, outcome: a.outcome,
        title: a.title ?? '', side: a.side, size: Number(a.size), price: Number(a.price), usdc: Number(a.usdcSize ?? a.size * a.price) });
    }
    return out;
  }
}
