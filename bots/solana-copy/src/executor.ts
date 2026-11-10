// Fills. PAPER (default) prices every buy and sell against a real Jupiter quote for that exact size, so price impact on thin
// memecoin pools is counted, then charges the priority fee and tip. LIVE builds the same Jupiter swap and signs it locally.
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { config, isLive } from './config.js';
import { WSOL } from './solana.js';

const JUP = 'https://lite-api.jup.ag/swap/v1';
export type Fill = { ok: boolean; tokens: number; sol: number; feesSol: number; impactPct: number; sig?: string; error?: string };

async function quote(inputMint: string, outputMint: string, amountRaw: bigint) {
  const u = `${JUP}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=${Math.round(config.slippagePct * 100)}&restrictIntermediateTokens=true`;
  const r = await fetch(u, { signal: AbortSignal.timeout(8000) }); const j: any = await r.json(); if (!r.ok || j.error) throw new Error(j.error ?? `quote ${r.status}`); return j;
}

const decimalsCache = new Map<string, number>();
async function decimals(conn: Connection, mint: string) {
  if (decimalsCache.has(mint)) return decimalsCache.get(mint)!;
  const { PublicKey } = await import('@solana/web3.js');
  const s = await conn.getTokenSupply(new PublicKey(mint)); decimalsCache.set(mint, s.value.decimals); return s.value.decimals;
}

export class Executor {
  private kp?: Keypair;
  constructor(private conn: Connection) { if (isLive()) this.kp = Keypair.fromSecretKey(bs58.decode(config.privateKey)); }
  get pubkey() { return this.kp?.publicKey.toBase58(); }
  private feeSol() { return config.priorityFeeSol + config.tipSol; }

  async buy(mint: string, sol: number): Promise<Fill> {
    try {
      const q = await quote(WSOL, mint, BigInt(Math.floor(sol * 1e9)));
      const dec = await decimals(this.conn, mint);
      const worst = Number(q.otherAmountThreshold) / 10 ** dec, expected = Number(q.outAmount) / 10 ** dec;
      if (!isLive()) return { ok: true, tokens: (expected + worst) / 2, sol: sol + this.feeSol(), feesSol: this.feeSol(), impactPct: Number(q.priceImpactPct) * 100 };
      const sig = await this.send(q); return { ok: true, tokens: expected, sol: sol + this.feeSol(), feesSol: this.feeSol(), impactPct: Number(q.priceImpactPct) * 100, sig };
    } catch (e: any) { return { ok: false, tokens: 0, sol: 0, feesSol: 0, impactPct: 0, error: e.message }; }
  }

  async sell(mint: string, tokens: number): Promise<Fill> {
    try {
      const dec = await decimals(this.conn, mint);
      const q = await quote(mint, WSOL, BigInt(Math.floor(tokens * 10 ** dec)));
      const expected = Number(q.outAmount) / 1e9, worst = Number(q.otherAmountThreshold) / 1e9;
      const got = (isLive() ? expected : (expected + worst) / 2) - this.feeSol();
      if (!isLive()) return { ok: true, tokens, sol: got, feesSol: this.feeSol(), impactPct: Number(q.priceImpactPct) * 100 };
      const sig = await this.send(q); return { ok: true, tokens, sol: got, feesSol: this.feeSol(), impactPct: Number(q.priceImpactPct) * 100, sig };
    } catch (e: any) { return { ok: false, tokens: 0, sol: 0, feesSol: 0, impactPct: 0, error: e.message }; }
  }

  private async send(q: any) {
    if (!this.kp) throw new Error('live mode not enabled');
    const r = await fetch(`${JUP}/swap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      quoteResponse: q, userPublicKey: this.kp.publicKey.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: Math.round(config.priorityFeeSol * 1e9), priorityLevel: 'veryHigh' } },
    }) });
    const j: any = await r.json(); if (!j.swapTransaction) throw new Error(j.error ?? 'no swap transaction');
    const tx = VersionedTransaction.deserialize(Buffer.from(j.swapTransaction, 'base64')); tx.sign([this.kp]);
    const sig = await this.conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
    const bh = await this.conn.getLatestBlockhash();
    const c = await this.conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed'); if (c.value.err) throw new Error(`tx failed ${sig}`);
    return sig;
  }
}
