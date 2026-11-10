import 'dotenv/config';

const num = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);
const bool = (k: string, d: boolean) => (process.env[k] ? process.env[k] === 'true' : d);
const list = (k: string, d: string) => (process.env[k] ?? d).split(',').map(s => s.trim()).filter(Boolean);

export type Ladder = { x: number; frac: number }[];
export const parseLadder = (s: string): Ladder =>
  s.split(',').map(p => p.trim()).filter(Boolean).map(p => { const [x, f] = p.split(':').map(Number); return { x, frac: f }; })
    .filter(r => r.x > 1 && r.frac > 0 && r.frac <= 1).sort((a, b) => a.x - b.x);

export const config = {
  mode: (process.env.MODE ?? 'paper') as 'paper' | 'live',
  allowLive: process.env.APEX_ALLOW_LIVE === 'yes',
  targets: list('TARGET_WALLETS', ''),
  rpcUrl: process.env.RPC_URL ?? 'https://api.mainnet-beta.solana.com',
  privateKey: process.env.PRIVATE_KEY ?? '',
  sizing: { mode: (process.env.SIZE_MODE ?? 'fixed') as 'fixed' | 'ratio', fixedSol: num('FIXED_SOL', 0.05), ratio: num('RATIO', 0.5), maxSol: num('MAX_SOL_PER_TRADE', 0.1) },
  maxOpen: num('MAX_OPEN_POSITIONS', 5),
  maxDailyLossSol: num('MAX_DAILY_LOSS_SOL', 0.25),
  paperBankrollSol: num('PAPER_BANKROLL_SOL', 2),
  slippagePct: num('SLIPPAGE_PCT', 35),
  priorityFeeSol: num('PRIORITY_FEE_SOL', 0.001),
  tipSol: num('JITO_TIP_SOL', 0.001),
  copySells: bool('COPY_SELLS', true),
  filters: {
    launchpads: list('LAUNCHPADS', 'pump,bonk').map(s => s.toLowerCase()),
    minMcap: num('MIN_MCAP_USD', 10_000), maxMcap: num('MAX_MCAP_USD', 0),
    minAgeMin: num('MIN_TOKEN_AGE_MIN', 0), maxAgeMin: num('MAX_TOKEN_AGE_MIN', 0),
    noDuplicateBuys: bool('NO_DUPLICATE_BUYS', true),
  },
  exits: {
    ladder: parseLadder(process.env.TP_LADDER ?? '2:0.8'),
    trailTriggerX: num('TRAIL_TRIGGER_X', 2), trailLockPct: num('TRAIL_LOCK_PCT', 20), trailPct: num('TRAIL_PCT', 35),
    stopLossPct: num('STOP_LOSS_PCT', 50),
  },
  pvp: { flipSeconds: num('PVP_FLIP_SECONDS', 60), maxFlips: num('PVP_MAX_FLIPS', 3), windowMin: num('PVP_WINDOW_MIN', 30) },
  pollMs: num('POLL_MS', 3000),
  dashboardUrl: (process.env.APEX_DASHBOARD_URL ?? '').replace(/\/$/, ''),
  ingestToken: process.env.APEX_INGEST_TOKEN ?? '',
};
export type Config = typeof config;

export const isLive = () => config.mode === 'live' && config.allowLive;

export function validate() {
  if (!config.targets.length) throw new Error('Set TARGET_WALLETS (comma separated). Score them first with: npm run score -- <wallet>');
  for (const t of config.targets) if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t)) throw new Error(`Not a Solana address: ${t}`);
  if (config.mode === 'live' && !config.allowLive) throw new Error('MODE=live also needs APEX_ALLOW_LIVE=yes. Staying safe: run MODE=paper first.');
  if (isLive() && !config.privateKey) throw new Error('Live mode needs PRIVATE_KEY in your local .env');
  if (isLive() && (config.sizing.maxSol <= 0 || config.maxDailyLossSol <= 0)) throw new Error('Live mode needs MAX_SOL_PER_TRADE and MAX_DAILY_LOSS_SOL caps above zero');
}
