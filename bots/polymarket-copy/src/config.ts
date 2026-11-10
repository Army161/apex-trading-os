import 'dotenv/config';

const num = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);
const bool = (k: string, d: boolean) => (process.env[k] ? process.env[k] === 'true' : d);

export const config = {
  mode: (process.env.MODE ?? 'paper') as 'paper' | 'live',
  allowLive: process.env.APEX_ALLOW_LIVE === 'yes', // second switch Jeremy sets himself (same rule as the other bots)
  targetWallet: (process.env.TARGET_WALLET ?? '').toLowerCase(),
  privateKey: process.env.PRIVATE_KEY ?? '',
  rpcUrl: process.env.RPC_URL ?? 'https://polygon-rpc.com',
  geoToken: process.env.POLYMARKET_GEO_TOKEN || undefined,
  multiplier: num('POSITION_MULTIPLIER', 0.1),
  maxTrade: num('MAX_TRADE_SIZE', 5),
  minTrade: num('MIN_TRADE_SIZE', 1),
  slippage: num('SLIPPAGE_TOLERANCE', 0.02),
  orderType: (process.env.ORDER_TYPE ?? 'FOK') as 'FOK' | 'FAK' | 'GTC',
  copySells: bool('COPY_SELLS', false),
  risk: {
    maxSessionNotional: num('MAX_SESSION_NOTIONAL', 50),
    maxPerMarketNotional: num('MAX_PER_MARKET_NOTIONAL', 10),
    minPrice: num('MIN_PRICE', 0.05),
    maxPrice: num('MAX_PRICE', 0.95),
  },
  pollMs: num('POLL_INTERVAL', 2000),
  useWebsocket: bool('USE_WEBSOCKET', true),
  paperBankroll: num('PAPER_BANKROLL', 500),
  dashboardUrl: (process.env.APEX_DASHBOARD_URL ?? '').replace(/\/$/, ''),
  ingestToken: process.env.APEX_INGEST_TOKEN ?? '',
};

export function validate() {
  if (!/^0x[0-9a-f]{40}$/.test(config.targetWallet)) throw new Error('TARGET_WALLET must be a 0x address');
  if (config.mode === 'live' && !config.allowLive) throw new Error('MODE=live also needs APEX_ALLOW_LIVE=yes. Staying safe: run MODE=paper first.');
  if (config.mode === 'live' && !config.privateKey) throw new Error('MODE=live requires PRIVATE_KEY in .env');
  if (config.mode === 'live' && (config.risk.maxSessionNotional <= 0 || config.risk.maxPerMarketNotional <= 0))
    throw new Error('MODE=live requires non-zero MAX_SESSION_NOTIONAL and MAX_PER_MARKET_NOTIONAL caps');
}
