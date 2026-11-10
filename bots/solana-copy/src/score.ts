// Score wallets before copying them: npm run score -- <wallet> [<wallet> ...]
// Applies the video's rules (long hold time, more sells than buys) plus a fast-flip check and sample-size guard.
import { Connection } from '@solana/web3.js';
import { config } from './config.js';
import { Watcher } from './solana.js';
import { scoreWallet } from './rules.js';

const wallets = process.argv.slice(2);
if (!wallets.length) { console.log('usage: npm run score -- <wallet> [...]'); process.exit(1); }
const w = new Watcher(new Connection(config.rpcUrl, 'confirmed'));
for (const addr of wallets) {
  const evs = await w.history(addr, Number(process.env.SCORE_TXS ?? 300));
  const r = scoreWallet(evs, config.pvp.flipSeconds);
  console.log(`\n${addr}\n  ${r.pass ? 'PASS' : 'FAIL'}  tokens ${r.tokens}, closed ${r.closed}, buys ${r.buys}, sells ${r.sells} (sell/buy ${r.sellBuyRatio.toFixed(2)})`);
  console.log(`  median hold ${(r.medianHoldSec / 60).toFixed(1)} min, fast flips ${r.flips} (${(r.flipRate * 100).toFixed(0)}%), win rate ${(r.winRate * 100).toFixed(0)}%, net ${r.pnlSol.toFixed(3)} SOL`);
  for (const why of r.reasons) console.log(`  - ${why}`);
}
