// One schema for configuration (docs/design/01 s8). The environment is passed in: nothing in the kernel reads process.env.
// A missing or malformed value fails closed: the feature is off and `problems` says what is missing.
import { limitsFromEnv, type Limits } from './guard';

export type ApexConfig = { limits: Limits; paperCapital: number; trialsPerWeek: number; ledgerAnchor: 'git' | 'git+ots' | 'off'; validatorSource: string | null;
  receiptsPublic: boolean; production: boolean; problems: string[]; warnings: string[] };
const num = (s: string | undefined, d: number, lo: number, hi: number) => { const v = Number(s); return s === undefined || s.trim() === '' || !Number.isFinite(v) ? d : Math.min(hi, Math.max(lo, v)); };

export function loadConfig(env: Record<string, string | undefined>, where: 'web' | 'cli' | 'executor' = 'cli'): ApexConfig {
  const problems: string[] = [], warnings: string[] = [], production = env.NODE_ENV === 'production';
  // S4: no key that can trade is ever on Vercel or in GitHub. A live flag next to a broker secret in the web app is refused.
  const liveFlag = env.ALPACA_LIVE === 'yes' || env.APEX_ALLOW_LIVE === 'yes';
  const brokerSecret = Object.keys(env).some(k => /(_SECRET_KEY|PRIVATE_KEY)$/.test(k) && env[k]);
  if (where === 'web' && liveFlag) problems.push('A live flag is set in the web app. Live trading is only possible from the executor on Jeremy’s machine.');
  if (where === 'web' && liveFlag && brokerSecret) problems.push('A broker secret and a live flag are both set in the web app. Remove them: no key that can trade belongs here.');
  if (where !== 'executor' && env.APEX_SIGNOFF_KEY) problems.push('APEX_SIGNOFF_KEY is set here. It belongs only on Jeremy’s own machine.');
  if (production && where === 'web') {
    if (!env.APEX_ADMIN_PASSWORD) problems.push('APEX_ADMIN_PASSWORD is not set: admin actions are refused.');
    if (!env.APEX_INGEST_TOKEN) problems.push('APEX_INGEST_TOKEN is not set: bot ingest is refused.');
    if (!env.CRON_SECRET) problems.push('CRON_SECRET is not set: scheduled runs are refused.');
    if (!env.DATABASE_URL) warnings.push('DATABASE_URL is not set: there is no durable ledger, so the autopilot will not open paper orders.');
  }
  const anchor = env.APEX_LEDGER_ANCHOR;
  return { limits: limitsFromEnv(env), paperCapital: num(env.APEX_PAPER_CAPITAL, 10000, 100, 1e9), trialsPerWeek: Math.floor(num(env.APEX_TRIALS_PER_WEEK, 25, 0, 1000)),
    ledgerAnchor: anchor === 'git+ots' || anchor === 'off' ? anchor : 'git', validatorSource: env.APEX_VALIDATOR_SOURCE?.trim() || null,
    receiptsPublic: env.APEX_RECEIPTS_PUBLIC === 'yes', production, problems, warnings };
}

/** P0.6: a door whose secret is not set is open only in local development. In production it is closed. */
export const openWithoutSecret = (production: boolean) => !production;
