// The product's settings, and the only file in apps/proof that reads the environment (docs/design/12 s4 and s13).
// Proof is a separate business from Jeremy's own trading: its own Vercel project, database, model key and data licence.
// So this schema does two things. It names the variables Proof uses, and it refuses to run when any variable of the
// personal app is present, because that would mean the two deployments were wired together by mistake.
// It never returns or prints a value: only names, and whether each is set.

export type Stage = 'internal' | 'beta' | 'paid';
export const STAGES: Stage[] = ['internal', 'beta', 'paid'];

/** Every variable Proof reads. `from` is the work package that first needs it: nothing here is required by the skeleton. */
export const VARS: { name: string; secret: boolean; from: string; about: string }[] = [
  { name: 'PROOF_STAGE', secret: false, from: 'P5.1', about: 'internal (default), beta or paid. Moving to paid is Jeremy\'s decision' },
  { name: 'PROOF_BASE_URL', secret: false, from: 'P5.1', about: 'The public address of this deployment, https only' },
  { name: 'SUPABASE_URL', secret: false, from: 'P5.2', about: 'Proof\'s own Supabase project. Never the personal app\'s database' },
  { name: 'SUPABASE_ANON_KEY', secret: false, from: 'P5.2', about: 'Public key for sign-in. Row-level security is what protects the rows' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', secret: true, from: 'P5.2', about: 'Used only by the billing webhook and the workers' },
  { name: 'PROOF_DATABASE_URL', secret: true, from: 'P5.3', about: 'A Postgres connection to Proof\'s own Supabase database, for the server and the workers. Every statement takes a role first' },
  { name: 'ANTHROPIC_API_KEY', secret: true, from: 'P5.3', about: 'Proof\'s own model key. The one name both apps use: it must be a different key' },
  { name: 'PROOF_AI_ACCOUNT_DAILY_USD', secret: false, from: 'P5.3', about: 'Model spend cap for one account in a day' },
  { name: 'PROOF_AI_GLOBAL_DAILY_USD', secret: false, from: 'P5.3', about: 'Model spend cap for the whole service in a day. The free plan pauses first' },
  { name: 'PROOF_DATA_API_KEY', secret: true, from: 'P5.3', about: 'Market data under a commercial licence (DATA_LICENCE.md). Never the personal data key' },
  { name: 'PROOF_REDIS_REST_URL', secret: false, from: 'P5.3', about: 'Proof\'s own Redis: rate limits, queues, locks' },
  { name: 'PROOF_REDIS_REST_TOKEN', secret: true, from: 'P5.3', about: 'Its token' },
  { name: 'STRIPE_SECRET_KEY', secret: true, from: 'P5.4', about: 'A test-mode key until the stage is paid' },
  { name: 'STRIPE_WEBHOOK_SECRET', secret: true, from: 'P5.4', about: 'Verifies each webhook\'s signature' },
];

/** The personal app's variables, by exact name or by prefix. A test holds this to the root .env.example: every name there
 *  must be refused here, except the model key, whose name the two apps share. */
export const SHARED_NAME = 'ANTHROPIC_API_KEY';
const PERSONAL_PREFIX = /^(APEX_|ALPACA_|TELEGRAM_|UPSTASH_)/;
const PERSONAL = new Set(['DATABASE_URL', 'CRON_SECRET', 'MASSIVE_API_KEY', 'TIINGO_API_KEY', 'FRED_API_KEY', 'SEC_USER_AGENT', 'DISCORD_WEBHOOK_URL', 'BINANCE_BASE',
  'ETH_RPC_URL', 'RPC_URL', 'PRIVATE_KEY', 'KEEPER_PRIVATE_KEY', 'TARGET_WALLET', 'POLYMARKET_GEO_TOKEN', 'ORDER_TYPE', 'MODE']);
export const isPersonal = (name: string) => name !== SHARED_NAME && (PERSONAL_PREFIX.test(name) || PERSONAL.has(name));

export type Env = { stage: Stage; ok: boolean; problems: string[]; has: Record<string, boolean> };

export function readEnv(env: Record<string, string | undefined> = process.env): Env {
  const problems: string[] = [], set = (n: string) => typeof env[n] === 'string' && env[n]!.trim() !== '';
  const personal = Object.keys(env).filter(n => isPersonal(n) && set(n)).sort();
  if (personal.length) problems.push(`This deployment has ${personal.length === 1 ? 'a setting' : 'settings'} that belong to the personal Apex app: ${personal.join(', ')}. Proof must not share a project with it. Remove ${personal.length === 1 ? 'it' : 'them'}.`);
  const raw = (env.PROOF_STAGE ?? '').trim() || 'internal', stage = (STAGES as string[]).includes(raw) ? raw as Stage : 'internal';
  if (stage !== raw) problems.push('PROOF_STAGE must be internal, beta or paid.');
  const stripe = (env.STRIPE_SECRET_KEY ?? '').trim();
  if (stripe && !/^(sk|rk)_test_/.test(stripe) && stage !== 'paid') problems.push('STRIPE_SECRET_KEY is not a test-mode key. A live key is refused until the stage is paid.');
  if (stripe && /^(sk|rk)_test_/.test(stripe) && stage === 'paid') problems.push('The stage is paid but STRIPE_SECRET_KEY is a test-mode key.');
  const base = (env.PROOF_BASE_URL ?? '').trim();
  if (base && !/^https:\/\//.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(base)) problems.push('PROOF_BASE_URL must be https (or localhost).');
  for (const n of ['PROOF_AI_ACCOUNT_DAILY_USD', 'PROOF_AI_GLOBAL_DAILY_USD']) if (set(n) && !(Number(env[n]) > 0)) problems.push(`${n} must be a number above zero.`);
  return { stage, ok: problems.length === 0, problems, has: Object.fromEntries(VARS.map(v => [v.name, set(v.name)])) };
}

/** The layout calls this, behind the middleware that already refuses every request. A deployment wired to the personal app, or holding a live payment key too early, serves nothing. */
export function guard(env: Record<string, string | undefined> = process.env): Env {
  const e = readEnv(env); if (!e.ok) throw new Error(`Proof will not run with these settings. ${e.problems.join(' ')}`); return e;
}
