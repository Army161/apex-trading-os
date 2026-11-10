export interface PositionState { tokenId: string; market: string; outcome: string; shares: number; notional: number; avgPrice: number; lastUpdated: number }

/** Average-cost position book, updated from our own fills (guide step 6). */
export class Positions {
  private m = new Map<string, PositionState>();
  record(tokenId: string, market: string, outcome: string, side: 'BUY' | 'SELL', shares: number, notional: number) {
    const ex = this.m.get(tokenId);
    const sign = side === 'BUY' ? 1 : -1;
    const ns = (ex?.shares ?? 0) + sign * shares;
    const nn = side === 'BUY' ? (ex?.notional ?? 0) + notional : (ex?.avgPrice ?? 0) * Math.max(0, ns);
    this.m.set(tokenId, { tokenId, market, outcome, shares: Math.max(0, ns), notional: Math.max(0, nn), avgPrice: ns > 0 ? nn / ns : 0, lastUpdated: Date.now() });
  }
  notional(tokenId: string) { return this.m.get(tokenId)?.notional ?? 0; }
  shares(tokenId: string) { return this.m.get(tokenId)?.shares ?? 0; }
  all() { return [...this.m.values()].filter(p => p.shares > 0); }
}
