/** One swap by a watched wallet, decoded from its on-chain balance changes. */
export type SwapEvent = { wallet: string; signature: string; ts: number; mint: string; side: 'buy' | 'sell'; sol: number; tokens: number };

export type TokenInfo = { mint: string; priceUsd: number; priceSol: number; mcapUsd: number; createdAt?: number; dexId?: string; symbol?: string };

export type Position = {
  mint: string; symbol?: string; source: string; openedAt: number;
  entryPriceSol: number; tokens: number; costSol: number; // remaining tokens and total SOL spent (incl. fees)
  peakPriceSol: number; stopPriceSol: number; ladderDone: number; trailing: boolean; realizedSol: number;
};

export type ClosedTrade = { mint: string; symbol?: string; source: string; openedAt: number; closedAt: number; costSol: number; proceedsSol: number; pnlSol: number; reason: string };

export type ExitAction = { frac: number; reason: string };
