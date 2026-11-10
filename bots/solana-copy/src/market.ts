// Token price, market cap, age and launchpad from public APIs (DexScreener first, Jupiter price as a fallback).
import type { TokenInfo } from './types.js';
import { WSOL } from './solana.js';

const get = async (u: string) => { const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json() as Promise<any>; };

let solUsd = 0, solAt = 0;
export async function solPriceUsd() {
  if (Date.now() - solAt < 60_000 && solUsd) return solUsd;
  const j = await get(`https://lite-api.jup.ag/price/v3?ids=${WSOL}`); solUsd = Number(j[WSOL]?.usdPrice) || solUsd; solAt = Date.now(); return solUsd;
}

export async function tokenInfo(mint: string): Promise<TokenInfo> {
  const sol = await solPriceUsd();
  try {
    const pairs: any[] = await get(`https://api.dexscreener.com/tokens/v1/solana/${mint}`);
    const p = pairs.filter(x => x.baseToken?.address === mint).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    if (p) {
      const usd = Number(p.priceUsd);
      return { mint, priceUsd: usd, priceSol: sol ? usd / sol : Number(p.priceNative), mcapUsd: Number(p.marketCap ?? p.fdv ?? 0), createdAt: p.pairCreatedAt, dexId: p.dexId, symbol: p.baseToken?.symbol };
    }
  } catch { /* fall through */ }
  const j = await get(`https://lite-api.jup.ag/price/v3?ids=${mint}`); const usd = Number(j[mint]?.usdPrice) || 0;
  return { mint, priceUsd: usd, priceSol: sol ? usd / sol : 0, mcapUsd: 0 };
}
