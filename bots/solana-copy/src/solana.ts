// Watches target wallets over plain Solana RPC and turns each transaction into a swap event from balance changes.
// Works for any DEX/launchpad (pump.fun, bonk, Raydium, Jupiter routes) because it reads net balance deltas, not program logs.
import { Connection, PublicKey, type ParsedTransactionWithMeta } from '@solana/web3.js';
import type { SwapEvent } from './types.js';

export const WSOL = 'So11111111111111111111111111111111111111112';
const STABLES = new Set(['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB']);

export function decodeSwap(wallet: string, signature: string, tx: ParsedTransactionWithMeta): SwapEvent | null {
  const meta = tx.meta; if (!meta || meta.err) return null;
  const keys = tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58());
  const wi = keys.indexOf(wallet); if (wi < 0) return null;
  const fee = keys[0] === wallet ? meta.fee : 0;
  let solDelta = (meta.postBalances[wi] - meta.preBalances[wi] + fee) / 1e9;
  const deltas = new Map<string, number>();
  const add = (bals: typeof meta.preTokenBalances, sign: number) => { for (const b of bals ?? []) if (b.owner === wallet) deltas.set(b.mint, (deltas.get(b.mint) ?? 0) + sign * (b.uiTokenAmount.uiAmount ?? 0)); };
  add(meta.preTokenBalances, -1); add(meta.postTokenBalances, 1);
  solDelta += deltas.get(WSOL) ?? 0; deltas.delete(WSOL);
  let mint = '', amt = 0;
  for (const [m, d] of deltas) if (!STABLES.has(m) && Math.abs(d) > Math.abs(amt)) { mint = m; amt = d; }
  if (!mint || amt === 0) return null;
  const side = amt > 0 ? 'buy' : 'sell';
  if ((side === 'buy' && solDelta >= 0) || (side === 'sell' && solDelta <= 0)) return null; // transfer/airdrop, not a SOL swap
  return { wallet, signature, ts: (tx.blockTime ?? Date.now() / 1000) * 1000, mint, side, sol: Math.abs(solDelta), tokens: Math.abs(amt) };
}

export class Watcher {
  private last = new Map<string, string | undefined>();
  constructor(private conn: Connection) {}

  /** New swaps since the last call (oldest first). The first call only records the cursor so we never copy stale trades. */
  async poll(wallet: string): Promise<SwapEvent[]> {
    const pk = new PublicKey(wallet); const until = this.last.get(wallet);
    const sigs = await this.conn.getSignaturesForAddress(pk, { limit: 25, until }, 'confirmed');
    if (!this.last.has(wallet)) { this.last.set(wallet, sigs[0]?.signature); return []; }
    if (sigs.length) this.last.set(wallet, sigs[0].signature);
    return this.decodeMany(wallet, sigs.filter(s => !s.err).map(s => s.signature).reverse());
  }

  /** History for wallet scoring: up to `limit` recent transactions decoded into swaps. */
  async history(wallet: string, limit = 300): Promise<SwapEvent[]> {
    const pk = new PublicKey(wallet); const out: string[] = []; let before: string | undefined;
    while (out.length < limit) {
      const sigs = await this.conn.getSignaturesForAddress(pk, { limit: Math.min(1000, limit - out.length), before }, 'confirmed');
      if (!sigs.length) break; out.push(...sigs.filter(s => !s.err).map(s => s.signature)); before = sigs[sigs.length - 1].signature;
    }
    return this.decodeMany(wallet, out.reverse());
  }

  private async decodeMany(wallet: string, sigs: string[]) {
    const evs: SwapEvent[] = [];
    for (let i = 0; i < sigs.length; i += 10) {
      const txs = await Promise.all(sigs.slice(i, i + 10).map(s => this.conn.getParsedTransaction(s, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }).catch(() => null)));
      txs.forEach((tx, j) => { const e = tx && decodeSwap(wallet, sigs[i + j], tx); if (e) evs.push(e); });
    }
    return evs;
  }

  async tokenBalance(owner: string, mint: string) {
    const r = await this.conn.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(mint) });
    return r.value.reduce((s, a) => s + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
  }
}
